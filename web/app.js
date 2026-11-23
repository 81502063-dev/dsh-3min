/**
 * 新闻三分钟 · 编稿台（纯前端，无构建）
 * 三栏：候选池 → 稿件 → 成稿预览
 */

const S = {
  day: '',
  today: '',
  data: null,
  tab: 'draft',
  q: '',
  q2: '',
  section: '',
  sort: 'total',
  drawer: false,
  metaOpen: false,
  srcDraft: null, // 稿源编辑草稿 { enabled, removed, custom }，保存后置空
  srcForm: { name: '', url: '', category: '都市', weight: 1 },
  job: null,
  preview: '',
  showSections: false,
  hits: [],
  saveTimer: 0,
  previewTimer: 0,
  metaTimer: 0,
  pollTimer: 0,
}

let searchTimer = 0
let complianceTimer = 0

const $ = (sel, root = document) => root.querySelector(sel)

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cjkLen(text) {
  return (String(text || '').match(/[\u4e00-\u9fa5]/g) || []).length
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return hm
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayStr(offset = 0) {
  return ymd(new Date(Date.now() + offset * 86400000))
}

function shiftDay(delta) {
  const [y, m, d] = (S.day || S.today).split('-').map(Number)
  return ymd(new Date(y, m - 1, d + delta))
}

function toast(message) {
  let node = $('.toast')
  if (!node) {
    node = document.createElement('div')
    node.className = 'toast'
    document.body.appendChild(node)
  }
  node.textContent = message
  node.classList.add('show')
  clearTimeout(toast._t)
  toast._t = setTimeout(() => node.classList.remove('show'), 2200)
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.top = '-9999px'
    document.body.appendChild(area)
    area.select()
    try {
      document.execCommand('copy')
    } catch {
      /* 忽略 */
    }
    area.remove()
    return true
  }
}

async function api(path, body) {
  const res = await fetch(`api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text.slice(0, 300) }
  }
  if (!res.ok && !data.error) data.error = `HTTP ${res.status}`
  return data
}

/* ── 装载 ─────────────────────────────────────────── */

async function load(day) {
  if (day) S.day = day
  const data = await api(`state?day=${encodeURIComponent(S.day || '')}`)
  if (data.error) {
    $('#app').innerHTML = `<div class="loading">加载失败：${esc(data.error)}</div>`
    return
  }
  S.data = data
  S.day = data.day
  S.today = data.today
  S.job = data.job
  S.showSections = Boolean(data.settings && data.settings.showSectionTitles)
  render()
  refreshPreview()
}

function dayData() {
  return S.data || { items: [], draft: { items: [], meta: {}, headline: {} }, sections: [], stats: {} }
}

/* ── 渲染 ─────────────────────────────────────────── */

function render() {
  const keep = captureFocus()
  $('#app').innerHTML = shell()
  restoreFocus(keep)
}

function captureFocus() {
  const active = document.activeElement
  if (!active || !active.dataset || !active.dataset.fk) return null
  return { fk: active.dataset.fk, start: active.selectionStart, end: active.selectionEnd }
}

function restoreFocus(keep) {
  if (!keep) return
  const node = $(`[data-fk="${keep.fk}"]`)
  if (!node) return
  node.focus()
  try {
    if (keep.start != null && node.setSelectionRange) node.setSelectionRange(keep.start, keep.end)
  } catch {
    /* 元素已重建 */
  }
}

function shell() {
  const d = dayData()
  return `
    <div class="topbar">
      <div class="brand"><em>新闻三分钟</em><small>中原网栏目 · 编稿台</small></div>
      <div class="datepicker">
        <button data-act="day-prev" title="前一天">‹</button>
        <input type="date" data-fk="day" data-act="day-pick" value="${esc(S.day)}" max="${esc(S.today)}" />
        <button data-act="day-next" title="后一天">›</button>
      </div>
      <button class="btn primary" data-act="fetch" ${S.job && S.job.running ? 'disabled' : ''}>${S.job && S.job.running ? '抓取中…' : '抓取今日新闻'}</button>
      <button class="btn" data-act="auto">一键成稿</button>
      <div class="spacer"></div>
      ${chipsHtml(d.stats || {})}
      <button class="btn ghost" data-act="toggle-meta">${S.metaOpen ? '收起元信息' : '元信息'}</button>
      <button class="btn ghost" data-act="drawer">设置</button>
    </div>
    ${jobBar()}
    ${S.metaOpen ? metaBar() : ''}
    <div class="tabs">
      <button data-act="tab" data-tab="candidates" class="${S.tab === 'candidates' ? 'on' : ''}">候选 ${(d.items || []).filter((i) => !i.hidden).length}</button>
      <button data-act="tab" data-tab="draft" class="${S.tab === 'draft' ? 'on' : ''}">稿件 ${(d.draft && d.draft.items ? d.draft.items.length : 0)}</button>
      <button data-act="tab" data-tab="preview" class="${S.tab === 'preview' ? 'on' : ''}">成稿</button>
    </div>
    <div class="main">
      ${pane('candidates', candidatePane())}
      ${pane('draft', draftPane())}
      ${pane('preview', previewPane())}
    </div>
    ${S.drawer ? drawer() : ''}
  `
}

function pane(id, inner) {
  return `<section class="pane ${S.tab === id ? 'active' : ''}" data-pane="${id}">${inner}</section>`
}

function chipsHtml(stats) {
  const d = dayData()
  const picked = d.draft && d.draft.items ? d.draft.items.length : 0
  const items = (d.items || []).length
  return `<div class="chips">
    <span class="chip">候选 <b>${items}</b></span>
    <span class="chip ${picked >= 18 ? 'good' : picked ? 'warn' : ''}">已选 <b>${picked}</b>/20</span>
    <span class="chip ${(stats.percent || 0) >= 100 ? 'good' : ''}">字 <b>${stats.chars || 0}</b></span>
    <span class="chip">≈ <b>${stats.minutes || 0}</b> 分钟</span>
  </div>`
}

function jobBar() {
  const job = S.job || {}
  if (!job.running && !job.error) return '<div class="progress"><i style="width:0"></i></div>'
  const total = Math.max(1, job.total || 1)
  const pct = job.running ? Math.round(((job.done || 0) / total) * 100) : 100
  const label = job.running ? `${job.phase || ''} ${job.done || 0}/${job.total || 0}` : job.error ? `失败：${job.error}` : '完成'
  return `<div class="progress" title="${esc(label)}"><i style="width:${pct}%"></i></div>`
}

function metaBar() {
  const draft = dayData().draft || {}
  const meta = draft.meta || {}
  const h = draft.headline || meta.headline || {}
  return `
    <div class="meta">
      <div class="field wide"><span>日期行</span><input data-fk="meta-dateLine" data-meta="dateLine" value="${esc(meta.dateLine)}" /></div>
      <div class="field wide"><span>天气</span><input data-fk="meta-weather" data-meta="weather" placeholder="今日郑州：晴，4 到 14℃…" value="${esc(meta.weather)}" /></div>
      <div class="field"><span>限行</span><input data-fk="meta-traffic" data-meta="traffic" placeholder="尾号 5 和 0" value="${esc(meta.traffic)}" /></div>
      <div class="field"><span>头条A</span><input data-fk="hl-a" data-hl="a" value="${esc(h.a)}" /></div>
      <div class="field"><span>头条B</span><input data-fk="hl-b" data-hl="b" value="${esc(h.b)}" /></div>
      <div class="field"><span>头条C</span><input data-fk="hl-c" data-hl="c" value="${esc(h.c)}" /></div>
      <div class="field"><span>头条D</span><input data-fk="hl-d" data-hl="d" value="${esc(h.d)}" /></div>
      <div class="field wide"><span>结尾</span><input data-fk="meta-tail" data-meta="tail" placeholder="早安寄语 / 留言互动" value="${esc(meta.tail)}" /></div>
      <div class="field"><span>来源</span><input data-fk="meta-sources" data-meta="sources" placeholder="新华网、人民网…" value="${esc(meta.sources)}" /></div>
      <div class="field"><span>编辑</span><input data-fk="meta-editor" data-meta="editor" value="${esc(meta.editor)}" /></div>
    </div>
  `
}

/* ── 候选池 ───────────────────────────────────────── */

const SORT_NAME = { total: '综合分', qu: '有趣', you: '有用', gong: '共鸣', time: '时间' }

function visibleItems() {
  const d = dayData()
  const q = S.q.trim()
  let list = (d.items || []).filter((item) => !item.hidden)
  if (S.section) list = list.filter((item) => item.section === S.section)
  if (q) list = list.filter((item) => `${item.title}${item.summary}${item.sourceName}`.includes(q))
  const cmp = {
    total: (a, b) => (b.total || 0) - (a.total || 0),
    qu: (a, b) => ((b.scores && b.scores.qu) || 0) - ((a.scores && a.scores.qu) || 0),
    you: (a, b) => ((b.scores && b.scores.you) || 0) - ((a.scores && a.scores.you) || 0),
    gong: (a, b) => ((b.scores && b.scores.gong) || 0) - ((a.scores && a.scores.gong) || 0),
    time: (a, b) => (b.publishedAt || 0) - (a.publishedAt || 0),
  }
  return list.slice().sort(cmp[S.sort] || cmp.total)
}

function candidatePane() {
  const d = dayData()
  const sections = d.sections || []
  const list = visibleItems()
  const picked = new Set(((d.draft && d.draft.items) || []).map((it) => it.cid))
  const shown = list.slice(0, 80)
  const okSources = (d.sources || []).filter((s) => s.items > 0).length
  return `
    <div class="pane-h">
      <h2>候选新闻</h2>
      <span class="count">${list.length} 条</span>
      <div class="spacer"></div>
      <span class="count">${okSources} 源有稿</span>
    </div>
    <div class="filters">
      <input type="search" data-fk="search" placeholder="搜标题 / 来源…" value="${esc(S.q)}" />
      <select data-fk="section" data-filter="section">
        <option value="">全部分节</option>
        ${sections.map((s) => `<option value="${s.id}" ${S.section === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
      <select data-fk="sort" data-filter="sort">
        ${Object.keys(SORT_NAME)
          .map((k) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>按${SORT_NAME[k]}</option>`)
          .join('')}
      </select>
    </div>
    <div class="pane-b tight">
      ${
        shown.length
          ? shown.map((item) => candidateCard(item, picked.has(item.id))).join('')
          : `<div class="empty">${
              (d.items || []).length
                ? '没有符合筛选的新闻'
                : '今天还没抓新闻。<br/>点右上角「抓取今日新闻」，或等每天 05:10 自动抓取。'
            }</div>`
      }
      ${list.length > shown.length ? `<div class="empty">还有 ${list.length - shown.length} 条，用筛选再缩小范围</div>` : ''}
    </div>
  `
}

function candidateCard(item, picked) {
  const scores = item.scores || {}
  const reasons = (item.reasons || []).slice(0, 5).join('、')
  return `
    <article class="card ${picked ? 'picked' : ''}" data-id="${esc(item.id)}">
      <div class="card-h">
        <span class="sec sec-${esc(item.section)}">${esc(sectionName(item.section))}</span>
        <span>${esc(item.sourceName)}</span>
        <span>${esc(fmtTime(item.publishedAt))}</span>
        <span class="total" title="综合分">${Math.round(item.total || 0)}</span>
      </div>
      <h3 title="${esc(reasons)}">${esc(item.title)}</h3>
      ${item.summary ? `<p>${esc(item.summary)}</p>` : ''}
      <div class="axes">
        ${axis('趣', 'qu', scores.qu)}
        ${axis('用', 'you', scores.you)}
        ${axis('鸣', 'gong', scores.gong)}
      </div>
      <div class="card-a">
        <button class="btn sm ${picked ? '' : 'primary'}" data-act="${picked ? 'remove' : 'add'}" data-id="${esc(item.id)}">${picked ? '已选' : '加入'}</button>
        <button class="btn sm ghost" data-act="hide" data-id="${esc(item.id)}" title="不合适，不再显示">略</button>
        <a class="link" href="${esc(item.url)}" target="_blank" rel="noreferrer">原文 ↗</a>
      </div>
    </article>
  `
}

function axis(label, key, value) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return `<span class="ax" title="${label} ${v}"><i>${label}</i><span class="bar ${key}"><i style="width:${v}%"></i></span><b>${v}</b></span>`
}

function sectionName(id) {
  const found = (dayData().sections || []).find((s) => s.id === id)
  return found ? found.name : id || '其他'
}

/* ── 稿件 ─────────────────────────────────────────── */

function draftPane() {
  const d = dayData()
  const items = (d.draft && d.draft.items) || []
  return `
    <div class="pane-h">
      <h2>稿件</h2>
      <span class="count">${items.length} 条</span>
      <div class="spacer"></div>
      <button class="btn sm" data-act="auto">自动配稿</button>
      <button class="btn sm ghost" data-act="clear" ${items.length ? '' : 'disabled'}>清空</button>
    </div>
    <div class="pane-b" id="draftList">
      ${
        items.length
          ? items.map((item, index) => draftItem(item, index)).join('')
          : '<div class="empty">稿件还是空的。<br/>左侧候选里点「加入」，或点上面「自动配稿」先凑一版。</div>'
      }
    </div>
  `
}

function draftItem(item, index) {
  const len = cjkLen(item.lead)
  const tooLong = len > 110
  return `
    <div class="draft-item ${item.star ? 'star' : ''}" data-cid="${esc(item.cid)}">
      <div class="di-h">
        <span class="idx">${String(index + 1).padStart(2, '0')}</span>
        <select data-fk="dsec-${esc(item.cid)}" data-lead-section="${esc(item.cid)}" title="分节">
          ${(dayData().sections || [])
            .map((s) => `<option value="${s.id}" ${item.section === s.id ? 'selected' : ''}>${esc(s.name)}</option>`)
            .join('')}
        </select>
        <div class="tools">
          <button data-act="up" data-cid="${esc(item.cid)}" title="上移">↑</button>
          <button data-act="down" data-cid="${esc(item.cid)}" title="下移">↓</button>
          <button data-act="remove" data-cid="${esc(item.cid)}" title="移出稿件">✕</button>
        </div>
      </div>
      <textarea data-fk="lead-${esc(item.cid)}" data-lead="${esc(item.cid)}" rows="${len > 70 ? 3 : 2}" placeholder="一句话写清这条新闻（1-2 句，60-90 字）">${esc(item.lead)}</textarea>
      <div class="di-f">
        <span class="${tooLong ? 'warn' : ''}">${len} 字${tooLong ? '（偏长，建议 90 字内）' : ''}</span>
        <span>· ${esc(item.sourceName)}</span>
        <a class="link" href="${esc(item.url)}" target="_blank" rel="noreferrer" style="margin-left:auto">原文 ↗</a>
      </div>
    </div>
  `
}

/* ── 预览 ─────────────────────────────────────────── */

function previewPane() {
  const d = dayData()
  return `
    <div class="pane-h">
      <h2>成稿</h2>
      <span class="count">${S.showSections ? '带小标题' : '纯条目'}</span>
      <div class="spacer"></div>
      <button class="btn sm ghost" data-act="toggle-sections">${S.showSections ? '去掉小标题' : '显示小标题'}</button>
      <button class="btn sm" data-act="refresh-preview">刷新</button>
    </div>
    <div class="pane-b" id="previewBody"><pre class="preview-pre">${esc(S.preview || '（还没有内容）')}</pre></div>
    <div class="preview-actions">
      <button class="btn sm primary" data-act="copy">复制正文</button>
      <button class="btn sm" data-act="download" data-fmt="txt">下载 txt</button>
      <button class="btn sm" data-act="download" data-fmt="md">下载 md</button>
      <button class="btn sm ghost" data-act="copy-html">复制公众号 HTML</button>
    </div>
  `
}

async function refreshPreview() {
  clearTimeout(S.previewTimer)
  S.previewTimer = setTimeout(async () => {
    const res = await api(`preview?day=${encodeURIComponent(S.day)}&format=text&sections=${S.showSections ? 1 : 0}`)
    if (res.text != null) {
      S.preview = res.text
      const body = $('#previewBody')
      if (body) body.innerHTML = `<pre class="preview-pre">${esc(res.text || '（还没有内容）')}</pre>`
      const chips = $('.chips')
      if (chips && res.stats) {
        const keep = { ...dayData().stats, ...res.stats }
        chips.outerHTML = chipsHtml(keep)
      }
    }
  }, 220)
}

/* ── 设置抽屉 ─────────────────────────────────────── */

/** 与 lib/sources.js 的 customSourceId 同一算法：名称 + 列表页 → 稳定 id */
function customSourceId(name, url) {
  const seed = `${String(name || '').trim()}|${String(url || '').trim()}`
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return `custom-${h.toString(36)}`
}

/** 从服务端状态生成一份可编辑草稿 */
function buildSourceDraft() {
  const d = dayData()
  const enabled = {}
  const custom = []
  for (const s of d.sourceList || []) {
    enabled[s.id] = s.enabled !== false
    if (s.builtin === false) {
      custom.push({
        id: s.id,
        name: s.name,
        listName: s.listName || s.name,
        category: s.category,
        weight: s.weight,
        list: s.list || [],
      })
    }
  }
  return { enabled, removed: [...(d.sourceRemoved || [])], custom }
}

function srcDraft() {
  if (!S.srcDraft) S.srcDraft = buildSourceDraft()
  return S.srcDraft
}

function drawer() {
  const d = dayData()
  const st = d.settings || {}
  const draft = srcDraft()
  const builtinMeta = new Map((d.builtinSources || []).map((s) => [s.id, s]))
  const rows = []
  for (const s of d.sourceList || []) if (!draft.removed.includes(s.id)) rows.push(s)
  for (const c of draft.custom) if (!rows.some((r) => r.id === c.id)) rows.push({ ...c, builtin: false })
  const removedRows = draft.removed.map((id) => builtinMeta.get(id) || { id, name: id })
  const enabledCount = rows.filter((r) => draft.enabled[r.id] !== false).length
  const hits = S.hits || []
  return `
    <div class="drawer-mask" data-act="drawer-close">
      <aside class="drawer">
        <div class="drawer-h">设置<div class="spacer"></div><button class="btn sm ghost" data-act="drawer-close">关闭</button></div>
        <div class="drawer-b">
          <div class="row"><label>每天自动抓取<small>默认 05:10（参考栏目 05:25 发布）</small></label><input type="time" data-set="fetchTime" value="${esc(st.fetchTime || '05:10')}" /></div>
          <div class="row"><label>每源取几条</label><input type="number" min="2" max="12" data-set="perSource" value="${esc(st.perSource || 8)}" /></div>
          <div class="row"><label>并发数</label><input type="number" min="2" max="12" data-set="concurrency" value="${esc(st.concurrency || 8)}" /></div>
          <div class="row"><label>候选池上限</label><input type="number" min="60" max="400" data-set="maxCandidates" value="${esc(st.maxCandidates || 220)}" /></div>
          <div class="row"><label>模型三轴打分<small>${d.aiAvailable ? '模型可用' : '模型不可用，仅用关键词规则'}</small></label><label class="switch"><input type="checkbox" data-set="aiEnabled" ${st.aiEnabled !== false ? 'checked' : ''} /><span></span></label></div>
          <div class="row"><label>成稿显示小标题</label><label class="switch"><input type="checkbox" data-set="showSectionTitles" ${st.showSectionTitles ? 'checked' : ''} /><span></span></label></div>
          <div class="row"><label>定时自动抓取</label><label class="switch"><input type="checkbox" data-set="autoFetch" ${st.autoFetch !== false ? 'checked' : ''} /><span></span></label></div>
          <div class="sub-h">新闻筛选机制<small>留空 = 用内置「有趣 / 有用 / 有共鸣」三轴；填了就以你写的为准，并随打分、头条、改写一起发给模型</small></div>
          <textarea class="rule-text" data-set="screenRule" rows="6" placeholder="例：优先河南本地；与普通人钱袋子、出行、健康、办事直接相关的先选；国际新闻只留会影响中国的；明星八卦、体育比分、股市行情不要。">${esc(st.screenRule || '')}</textarea>
          <div class="row"><label>数据目录<small>${esc(st.dataDir || '')}</small></label></div>
          <div class="row" style="border:0"><button class="btn primary" data-act="save-settings">保存设置</button></div>

          <div class="sub-h">稿源（${enabledCount}/${rows.length} 启用）<div class="spacer"></div>${
            removedRows.length ? `<button class="btn sm ghost" data-act="src-restore-all">恢复 ${removedRows.length} 个已删来源</button>` : ''
          }</div>
          <div class="src-grid">
            ${rows
              .map(
                (s) => `<div class="src-item">
                  <label title="${esc(s.listName || s.name)} · ${esc(s.category)}${s.builtin === false ? ' · 自定义' : ''}">
                    <input type="checkbox" data-src="${esc(s.id)}" ${draft.enabled[s.id] !== false ? 'checked' : ''} />
                    <span>${esc(s.name)}${s.builtin === false ? '<i class="tag">自建</i>' : ''}</span>
                  </label>
                  <button class="src-del" data-act="src-del" data-id="${esc(s.id)}" title="${
                    s.builtin === false ? '删除这个自定义来源' : '从名单里删掉（可恢复）'
                  }">×</button>
                </div>`,
              )
              .join('')}
          </div>
          ${
            removedRows.length
              ? `<div class="src-removed">已删除：${removedRows
                  .map((s) => `<span>${esc(s.name)}<button class="src-back" data-act="src-restore" data-id="${esc(s.id)}" title="恢复">↺</button></span>`)
                  .join('')}</div>`
              : ''
          }
          <div class="src-add">
            <input type="text" data-add="name" placeholder="来源名称，如 洛阳网" value="${esc(S.srcForm.name)}" />
            <input type="text" data-add="url" placeholder="列表页地址 https://…" value="${esc(S.srcForm.url)}" />
            <select data-add="category">${(d.categories || [])
              .map((c) => `<option value="${esc(c)}" ${S.srcForm.category === c ? 'selected' : ''}>${esc(c)}</option>`)
              .join('')}</select>
            <input type="number" data-add="weight" min="0.4" max="1.6" step="0.2" value="${esc(S.srcForm.weight)}" title="权重 0.4–1.6，越高越容易进候选池" />
            <button class="btn sm" data-act="src-add">添加</button>
          </div>
          <div class="row" style="border:0;margin-top:8px"><button class="btn sm primary" data-act="save-sources">保存稿源设置</button></div>

          <div class="sub-h">合规检索 · ${esc((d.whitelist && d.whitelist.version) || '2025-08')} 版名单（${(d.whitelist && d.whitelist.total) || 1459} 家）</div>
          <input type="search" data-fk="compliance" placeholder="输入媒体名，查是否在名单内…" value="${esc(S.q2)}" class="compliance-input" />
          <div class="hits">${hits.map((h) => {
            const name = typeof h === 'string' ? h : h.name
            const line = typeof h === 'string' ? h : h.line
            return `<div title="${esc(line)}"><b>✓</b> ${esc(name)}</div>`
          }).join('')}${
            !hits.length && S.q2 ? '<div class="miss">名单里没有匹配项 —— 该来源不建议采用。</div>' : ''
          }</div>
          <div class="row" style="border:0"><button class="btn sm ghost" data-act="open-whitelist">打开官方名单</button></div>
        </div>
      </aside>
    </div>
  `
}

/* ── 交互 ─────────────────────────────────────────── */

function scheduleSave() {
  clearTimeout(S.saveTimer)
  S.saveTimer = setTimeout(saveDraftEdits, 700)
}

async function saveDraftEdits() {
  const items = (dayData().draft && dayData().draft.items) || []
  for (const item of items) {
    if (item.dirty) {
      item.dirty = false
      await api('draft', { day: S.day, action: 'update', payload: { cid: item.cid, lead: item.lead } })
    }
  }
  refreshPreview()
}

async function draftAction(action, payload) {
  const res = await api('draft', { day: S.day, action, payload: payload || {} })
  if (res.error) {
    toast(res.error)
    return
  }
  S.data = { ...S.data, ...res, sourceList: S.data.sourceList, settings: S.data.settings, sections: S.data.sections, categories: S.data.categories, whitelist: S.data.whitelist, aiAvailable: S.data.aiAvailable }
  render()
  refreshPreview()
}

function startPolling() {
  clearInterval(S.pollTimer)
  S.pollTimer = setInterval(async () => {
    const job = await api('job')
    S.job = job
    const bar = $('.progress i')
    if (bar) {
      const pct = job.running ? Math.round(((job.done || 0) / Math.max(1, job.total || 1)) * 100) : 100
      bar.style.width = `${pct}%`
    }
    if (!job.running) {
      clearInterval(S.pollTimer)
      S.pollTimer = 0
      const data = await api(`state?day=${encodeURIComponent(S.day)}`)
      if (!data.error) {
        S.data = data
        S.job = data.job
        render()
        refreshPreview()
        toast(`抓取完成：候选 ${(data.items || []).length} 条`)
      }
    }
  }, 1200)
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-act]')
  if (!target) return
  const act = target.dataset.act
  const id = target.dataset.id
  const cid = target.dataset.cid

  switch (act) {
    case 'tab':
      S.tab = target.dataset.tab
      render()
      return
    case 'drawer':
      S.srcDraft = null
      S.srcForm = { name: '', url: '', category: '都市', weight: 1 }
      S.drawer = true
      render()
      return
    case 'drawer-close':
      if (event.target.closest('.drawer') && !event.target.closest('button[data-act="drawer-close"]')) return
      S.drawer = false
      render()
      return
    case 'toggle-meta':
      S.metaOpen = !S.metaOpen
      render()
      return
    case 'day-prev':
      load(shiftDay(-1))
      return
    case 'day-next':
      load(shiftDay(1))
      return
    case 'fetch': {
      const res = await api('fetch', { day: S.day })
      if (res.error) return toast(res.error)
      if (res.started === false) return toast(res.reason || '已有一轮抓取在进行')
      toast('开始抓取…')
      S.job = { running: true, phase: '列表页', done: 0, total: 0 }
      render()
      startPolling()
      return
    }
    case 'auto': {
      const picked = (dayData().draft && dayData().draft.items) || []
      if (picked.length && !confirm('自动配稿会覆盖当前稿件，继续？')) return
      await draftAction('auto', { count: 20 })
      toast('已按分节配额配好初稿')
      return
    }
    case 'clear':
      if (!confirm('清空当前稿件？')) return
      await draftAction('clear')
      return
    case 'add':
      await draftAction('add', { ids: [id] })
      return
    case 'remove':
      await draftAction('remove', { cid: cid || id })
      return
    case 'up':
      await draftAction('move', { cid, delta: -1 })
      return
    case 'down':
      await draftAction('move', { cid, delta: 1 })
      return
    case 'hide': {
      const res = await api('candidate', { day: S.day, id, patch: { hidden: true } })
      if (!res.error) {
        S.data.items = (S.data.items || []).map((it) => (it.id === id ? { ...it, hidden: true } : it))
        render()
      }
      return
    }
    case 'toggle-sections':
      S.showSections = !S.showSections
      await api('settings', { settings: { showSectionTitles: S.showSections } })
      render()
      refreshPreview()
      return
    case 'refresh-preview':
      refreshPreview()
      return
    case 'copy':
      await copyText(S.preview || '')
      toast('正文已复制')
      return
    case 'copy-html': {
      const html = await api(`preview?day=${encodeURIComponent(S.day)}&format=html&sections=${S.showSections ? 1 : 0}`)
      if (html && html.html) {
        await copyText(html.html)
        toast('公众号 HTML 已复制')
      } else {
        toast('HTML 生成失败')
      }
      return
    }
    case 'download': {
      window.open(`api/export?day=${encodeURIComponent(S.day)}&format=${target.dataset.fmt}`, '_blank')
      return
    }
    case 'save-settings': {
      const next = {}
      document.querySelectorAll('[data-set]').forEach((node) => {
        const key = node.dataset.set
        if (node.type === 'checkbox') next[key] = node.checked
        else if (node.type === 'number') next[key] = Number(node.value)
        else next[key] = node.value
      })
      const res = await api('settings', { settings: next })
      if (res.error) return toast(res.error)
      S.data.settings = { ...S.data.settings, ...res.settings }
      S.showSections = Boolean(res.settings && res.settings.showSectionTitles)
      toast('设置已保存')
      render()
      return
    }
    case 'src-del': {
      const id = target.dataset.id
      if (!id) return
      const draft = srcDraft()
      if (draft.custom.some((c) => c.id === id)) {
        draft.custom = draft.custom.filter((c) => c.id !== id)
        delete draft.enabled[id]
      } else if (!draft.removed.includes(id)) {
        draft.removed.push(id)
      }
      render()
      return
    }
    case 'src-restore': {
      const id = target.dataset.id
      const draft = srcDraft()
      draft.removed = draft.removed.filter((x) => x !== id)
      render()
      return
    }
    case 'src-restore-all':
      srcDraft().removed = []
      render()
      return
    case 'src-add': {
      const name = String(S.srcForm.name || '').trim()
      const url = String(S.srcForm.url || '').trim()
      if (!name) return toast('请先填来源名称')
      if (!/^https?:\/\/\S+$/i.test(url)) return toast('列表页地址要以 http(s):// 开头')
      const id = customSourceId(name, url)
      const row = {
        id,
        name,
        listName: name,
        category: S.srcForm.category || '都市',
        weight: Math.max(0.4, Math.min(1.6, Number(S.srcForm.weight) || 1)),
        list: [url],
      }
      const draft = srcDraft()
      const at = draft.custom.findIndex((c) => c.id === id)
      if (at >= 0) draft.custom[at] = row
      else draft.custom.push(row)
      draft.enabled[id] = true
      S.srcForm = { name: '', url: '', category: row.category, weight: 1 }
      toast('已加入列表，点「保存稿源设置」生效')
      render()
      return
    }
    case 'save-sources': {
      const draft = srcDraft()
      // 勾选状态以 DOM 为准（用户可能只改了勾选没触发重绘）
      document.querySelectorAll('[data-src]').forEach((node) => {
        draft.enabled[node.dataset.src] = node.checked
      })
      const res = await api('sources', { enabled: draft.enabled, removed: draft.removed, custom: draft.custom })
      if (res.error) return toast(res.error)
      const list = res.sourceList || S.data.sourceList || []
      S.data.sourceList = list
      S.data.sourceRemoved = res.sourceRemoved || []
      S.srcDraft = null
      toast(`稿源已保存：${list.filter((s) => s.enabled).length}/${list.length} 启用`)
      render()
      return
    }
    case 'open-whitelist':
      window.open('https://www.cac.gov.cn/2025-08/14/c_1756886951643180.htm', '_blank')
      return
    default:
  }
})

/* 输入：筛选 / 编辑（不重绘，避免光标跳） */
document.addEventListener('input', (event) => {
  const node = event.target
  if (node.dataset.fk === 'search') {
    S.q = node.value
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      render()
      const next = $('[data-fk="search"]')
      if (next) {
        next.focus()
        next.setSelectionRange(next.value.length, next.value.length)
      }
    }, 220)
    return
  }
  if (node.dataset.fk === 'compliance') {
    S.q2 = node.value
    clearTimeout(complianceTimer)
    complianceTimer = setTimeout(async () => {
      const res = await api(`compliance?q=${encodeURIComponent(S.q2 || '')}`)
      S.hits = res.hits || []
      render()
      const next = $('[data-fk="compliance"]')
      if (next) {
        next.focus()
        next.setSelectionRange(next.value.length, next.value.length)
      }
    }, 300)
    return
  }
  if (node.dataset.add) {
    S.srcForm[node.dataset.add] = node.value
    return
  }
  if (node.dataset.lead) {
    const items = (dayData().draft && dayData().draft.items) || []
    const item = items.find((it) => it.cid === node.dataset.lead)
    if (item) {
      item.lead = node.value
      item.dirty = true
      const hint = node.parentElement.querySelector('.di-f span')
      if (hint) {
        const len = cjkLen(node.value)
        hint.textContent = `${len} 字${len > 110 ? '（偏长，建议 90 字内）' : ''}`
        hint.className = len > 110 ? 'warn' : ''
      }
      scheduleSave()
    }
  }
})

document.addEventListener('change', async (event) => {
  const node = event.target
  if (node.dataset.src) {
    // 勾选/取消只记进草稿，等「保存稿源设置」一起落盘
    srcDraft().enabled[node.dataset.src] = node.checked
    return
  }
  if (node.dataset.filter === 'section') {
    S.section = node.value
    render()
    return
  }
  if (node.dataset.filter === 'sort') {
    S.sort = node.value
    render()
    return
  }
  if (node.dataset.fk === 'day') {
    load(node.value)
    return
  }
  if (node.dataset.leadSection) {
    await draftAction('update', { cid: node.dataset.leadSection, section: node.value, sortAfter: true })
    return
  }
  if (node.dataset.hl) {
    const key = node.dataset.hl
    const draft = dayData().draft || {}
    const meta = draft.meta || {}
    const headline = { ...(meta.headline || {}), [key]: node.value }
    draft.meta = { ...meta, headline }
    draft.headline = { ...(draft.headline || {}), [key]: node.value }
    clearTimeout(S.metaTimer)
    S.metaTimer = setTimeout(() => api('draft', { day: S.day, action: 'meta', payload: { meta: { headline: { [key]: node.value } } } }), 500)
    refreshPreview()
    return
  }
  if (node.dataset.meta) {
    const key = node.dataset.meta
    const draft = dayData().draft || {}
    const meta = draft.meta || {}
    meta[key] = node.value
    draft.meta = meta
    clearTimeout(S.metaTimer)
    S.metaTimer = setTimeout(() => api('draft', { day: S.day, action: 'meta', payload: { meta: { [key]: node.value } } }), 500)
    refreshPreview()
  }
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && S.drawer) {
    S.drawer = false
    render()
  }
})

/* ── 启动 ─────────────────────────────────────────── */
;(async () => {
  await load()
})()
