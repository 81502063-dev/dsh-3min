/** 成稿渲染：纯文本（公众号粘贴）/ Markdown / 内联样式 HTML。 */

import { dateLineOf } from './lunar.js'
import { chineseLength } from './classify.js'
import { SECTIONS } from './sources.js'

const SECTION_NAME = new Map(SECTIONS.map((s) => [s.id, s.name]))

export function defaultMeta(day) {
  return {
    headline: { a: '', b: '', c: '', d: '' },
    dateLine: dateLineOf(day),
    weather: '',
    traffic: '',
    tail: '',
    sign: '郑州晚报 中原网',
    editor: '',
    reviewer: '',
    sources: '',
  }
}

export function issueTitle(meta) {
  const parts = [meta?.headline?.a, meta?.headline?.b, meta?.headline?.c, meta?.headline?.d]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  return parts.length ? `每天3分钟 尽览天下事（${parts.join('、')}）` : '每天3分钟 尽览天下事'
}

export function draftLines(day, opts = {}) {
  const { showSectionTitles = false, numbered = false } = opts
  const meta = day.draft?.meta || defaultMeta(day.day)
  const items = [...(day.draft?.items || [])]
  const lines = []
  lines.push(issueTitle(meta))
  lines.push('')
  if (meta.dateLine) lines.push(meta.dateLine)
  if (meta.weather) lines.push(meta.weather)
  if (meta.traffic) lines.push(meta.traffic)
  lines.push('')

  let lastSection = ''
  items.forEach((item, index) => {
    if (showSectionTitles && item.section !== lastSection) {
      lastSection = item.section
      lines.push(`【${SECTION_NAME.get(item.section) || '其他'}】`)
    }
    const body = String(item.lead || item.note || '').trim() || '（待补写）'
    const prefix = numbered ? `${index + 1}. ` : '● '
    lines.push(prefix + body)
  })
  if (items.length && meta.tail) {
    lines.push('')
    lines.push(meta.tail)
  }
  const foot = []
  if (meta.sources) foot.push(`来源：${meta.sources}`)
  const credits = [meta.editor && `编辑：${meta.editor}`, meta.reviewer && `监审：${meta.reviewer}`].filter(Boolean)
  if (credits.length) foot.push(credits.join('　'))
  if (foot.length) {
    lines.push('')
    foot.forEach((line) => lines.push(line))
  }
  return lines
}

export function renderText(day, opts) {
  const lines = draftLines(day, opts)
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text, stats: statsOf(day, text) }
}

export function statsOf(day, text) {
  const items = day.draft?.items || []
  const chars = chineseLength(text)
  const minutes = Math.max(1, Math.round(chars / 300))
  return {
    items: items.length,
    chars,
    minutes,
    budget: { items: 20, chars: 1800 },
    percent: Math.min(100, Math.round((items.length / 20) * 100)),
  }
}

export function renderMarkdown(day, opts) {
  const { text } = renderText(day, opts)
  return text
    .split('\n')
    .map((line, i) => {
      if (i === 0) return `# ${line}`
      if (/^【.+】$/.test(line)) return `\n## ${line.replace(/[【】]/g, '')}`
      if (line.startsWith('● ')) return line
      return line
    })
    .join('\n')
}

const INLINE = 'margin:0 0 14px;font-size:16px;line-height:1.9;color:#2b2b2b;letter-spacing:.3px;'
const TITLE = 'margin:0 0 18px;font-size:22px;line-height:1.5;color:#111;font-weight:700;'
const META = 'margin:0 0 6px;font-size:14px;line-height:1.8;color:#7a7a7a;'

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderHtml(day, opts) {
  const meta = day.draft?.meta || defaultMeta(day.day)
  const items = day.draft?.items || []
  const out = ['<section style="padding:4px 2px;">']
  out.push(`<h1 style="${TITLE}">${esc(issueTitle(meta))}</h1>`)
  if (meta.dateLine) out.push(`<p style="${META}">${esc(meta.dateLine)}</p>`)
  if (meta.weather) out.push(`<p style="${META}">${esc(meta.weather)}</p>`)
  if (meta.traffic) out.push(`<p style="${META}">${esc(meta.traffic)}</p>`)
  if (meta.dateLine || meta.weather || meta.traffic) out.push('<p style="margin:0 0 18px;border-top:1px solid #eee;"></p>')
  let lastSection = ''
  for (const item of items) {
    if (opts?.showSectionTitles && item.section !== lastSection) {
      lastSection = item.section
      out.push(`<h2 style="margin:22px 0 10px;font-size:17px;color:#c0392b;font-weight:700;">${esc(SECTION_NAME.get(item.section) || '其他')}</h2>`)
    }
    out.push(`<p style="${INLINE}"><span style="color:#c0392b;font-weight:700;">●</span> ${esc(item.lead || item.note || '')}</p>`)
  }
  if (meta.tail) out.push(`<p style="${INLINE};color:#555;">${esc(meta.tail)}</p>`)
  const foot = []
  if (meta.sources) foot.push(`来源：${esc(meta.sources)}`)
  if (meta.editor) foot.push(`编辑：${esc(meta.editor)}`)
  if (meta.reviewer) foot.push(`监审：${esc(meta.reviewer)}`)
  if (foot.length) out.push(`<p style="margin:18px 0 0;font-size:13px;line-height:1.8;color:#999;">${foot.join('　')}</p>`)
  out.push('</section>')
  return out.join('\n')
}

/** 从候选里自动凑一版初稿（编辑再改）：按分节配额取高分条目 */
export function autoSelect(candidates, { count = 20 } = {}) {
  const quota = { headline: 3, china: 5, henan: 3, zhengzhou: 3, finance: 2, tech: 2, culture: 2, world: 2, life: 2, weather: 1 }
  const pool = candidates.filter((c) => !c.hidden).slice().sort((a, b) => (b.total || 0) - (a.total || 0))
  const picked = []
  const used = new Set()
  const take = (section, limit) => {
    for (const item of pool) {
      if (picked.length >= count) return
      if (used.has(item.id)) continue
      if (item.section !== section) continue
      picked.push(item)
      used.add(item.id)
      if (--limit <= 0) return
    }
  }
  for (const [section, limit] of Object.entries(quota)) take(section, limit)
  for (const item of pool) {
    if (picked.length >= count) break
    if (used.has(item.id)) continue
    picked.push(item)
    used.add(item.id)
  }
  return picked
}
