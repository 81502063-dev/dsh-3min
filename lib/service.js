/** 主服务：抓取一轮 → 抽取 → 去重 → 打分 → 落盘；以及对稿件的一切编辑操作。 */

import { fetchText, mapLimit } from './http.js'
import { parseList, parseArticle } from './extract.js'
import { SOURCES, SECTIONS, WHITELIST } from './sources.js'
import { dedupe, guessSection, scoreItem, stripToSummary, totalScore, chineseLength, leadFromSummary, looksLikeCatalog } from './classify.js'
import { defaultMeta, autoSelect, renderText, renderMarkdown, renderHtml, issueTitle, statsOf } from './render.js'
import { solarYmd } from './lunar.js'

const SECTION_ORDER = new Map(SECTIONS.map((s, i) => [s.id, i]))
const FRESH_MS = 1000 * 60 * 60 * 60 // 60 小时，覆盖昨天傍晚
const MIN_TEXT = 90

/** 候选池分节/分源上限：保证 20 条成稿时各节都有货可选，不至于被财经稿灌满 */
const SECTION_CAP = { headline: 20, china: 30, finance: 16, tech: 16, henan: 18, zhengzhou: 16, culture: 14, world: 14, life: 14, weather: 8 }

function capPool(sorted, max) {
  const perSource = new Map()
  const perSection = new Map()
  const out = []
  for (const item of sorted) {
    if (out.length >= max) break
    const srcCount = perSource.get(item.sourceId) || 0
    const secCount = perSection.get(item.section) || 0
    if (srcCount >= 12) continue
    if (secCount >= (SECTION_CAP[item.section] ?? 16)) continue
    out.push(item)
    perSource.set(item.sourceId, srcCount + 1)
    perSection.set(item.section, secCount + 1)
  }
  return out
}

export function createService({ ctx, store, ai, getSettings, logger }) {
  const log = logger || console
  const job = { running: false, day: '', phase: '', done: 0, total: 0, log: [], startedAt: 0, finishedAt: 0, error: '' }

  function pushLog(msg) {
    job.log.push({ at: Date.now(), msg })
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200)
    log.info?.(`[news-3min] ${msg}`)
  }

  function enabledSources(overrides = {}) {
    return SOURCES.map((s) => ({ ...s, enabled: overrides[s.id] !== false })).filter((s) => s.enabled)
  }

  function blankDay(day) {
    return {
      day,
      fetchedAt: 0,
      sources: [],
      candidates: [],
      draft: { items: [], meta: defaultMeta(day), headline: { a: '', b: '', c: '', d: '' }, updatedAt: 0 },
    }
  }

  async function ensureDay(day = solarYmd()) {
    const existing = await store.readDay(day)
    if (existing) {
      existing.draft.meta = { ...defaultMeta(day), ...(existing.draft.meta || {}) }
      return existing
    }
    const fresh = blankDay(day)
    await store.writeDay(fresh)
    return fresh
  }

  function looksFresh(url, publishedAt) {
    if (publishedAt && Date.now() - publishedAt < FRESH_MS) return true
    if (publishedAt && publishedAt > Date.now() + 1000 * 60 * 60 * 6) return true
    const today = solarYmd().replace(/-/g, '')
    const y = solarYmd(new Date(Date.now() - 86400000)).replace(/-/g, '')
    return url.includes(today) || url.includes(y) || url.includes(`${today.slice(0, 4)}-${today.slice(4, 6)}`) || url.includes(`${today.slice(0, 4)}/${today.slice(4, 6)}/${today.slice(6)}`)
  }

  async function collectLinks(source, perSource) {
    const links = new Map()
    const errors = []
    for (const listUrl of source.list.slice(0, 2)) {
      try {
        const page = await fetchText(listUrl, { timeout: 14000 })
        const found = parseList(page.html, page.finalUrl, { limit: perSource })
        for (const item of found) if (!links.has(item.url)) links.set(item.url, item)
      } catch (error) {
        errors.push(`${listUrl}: ${String(error?.message || error).slice(0, 60)}`)
      }
      if (links.size >= perSource) break
    }
    return { links: [...links.values()].slice(0, perSource), errors }
  }

  async function fetchArticle(source, link) {
    const page = await fetchText(link.url, { timeout: 15000, referer: source.list[0] })
    const art = parseArticle(page.html, page.finalUrl)
    const title = (art.title || link.title || '').trim()
    if (!title || title.length < 8) return null
    if (/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(title)) return null
    if (/^(首页|视频|直播|专题|图片|滚动|更多)$/.test(title)) return null
    // 手机报 / 晚报合集这类多条目聚合页，不能当单条新闻用
    if (/手机报|日报丨|晚报丨|早报丨|周报丨|速览丨|丨.*丨/.test(title)) return null
    const cjkCount = (title.match(/[\u4e00-\u9fa5]/g) || []).length
    if (cjkCount < 6) return null
    const text = art.text || ''
    if (chineseLength(text) < MIN_TEXT) return null
    if (!looksFresh(link.url, art.publishedAt)) return null
    const summary = stripToSummary(art.paragraphs, 200, title)
    // 目录页、摘要过短的内容不成条目
    if (looksLikeCatalog(`${title} ${summary}`)) return null
    if (chineseLength(summary) < 48) return null
    const item = {
      id: `${source.id}-${Buffer.from(link.url).toString('base64url').slice(-12)}`,
      title: title.slice(0, 80),
      url: link.url,
      sourceId: source.id,
      sourceName: source.name,
      listName: source.listName,
      category: source.category,
      weight: source.weight,
      publishedAt: art.publishedAt || 0,
      fetchedAt: Date.now(),
      summary,
      paragraphs: (art.paragraphs || []).slice(0, 8),
      image: art.image || '',
      wordCount: chineseLength(text),
      hidden: false,
      star: false,
    }
    item.section = guessSection(item, source)
    const { scores, reasons } = scoreItem(item)
    item.scores = scores
    item.reasons = reasons
    item.total = totalScore(scores, source.weight)
    // 栏目靠本地新闻落地，河南/郑州稿给一点权重倾斜
    if (source.category === '郑州') item.total += 10
    else if (source.category === '河南') item.total += 6
    return item
  }

  async function runFetch({ day = solarYmd(), overrides = {} } = {}) {
    if (job.running) return { started: false, reason: '已有一轮抓取在进行' }
    const settings = getSettings()
    const perSource = Math.max(2, Math.min(12, Number(settings.perSource) || 8))
    const concurrency = Math.max(2, Math.min(12, Number(settings.concurrency) || 8))
    Object.assign(job, { running: true, day, phase: '列表页', done: 0, total: 0, log: [], startedAt: Date.now(), finishedAt: 0, error: '' })

    const sources = enabledSources(overrides)
    pushLog(`开始抓取 ${day}：${sources.length} 个名单内来源，每源最多 ${perSource} 条`)

    try {
      const listResults = await mapLimit(sources, Math.min(6, concurrency), async (source) => {
        const { links, errors } = await collectLinks(source, perSource)
        return { source, links, errors }
      })
      const queue = []
      const stats = []
      for (const result of listResults) {
        if (!result || result.error) continue
        const { source, links, errors } = result
        stats.push({ id: source.id, name: source.name, category: source.category, links: links.length, ok: links.length > 0, error: errors.join('; ').slice(0, 200), items: 0 })
        for (const link of links) queue.push({ source, link })
      }
      job.total = queue.length
      job.phase = '正文抽取'
      pushLog(`列表页拿到 ${queue.length} 个候选链接`)

      const bySource = new Map(stats.map((s) => [s.id, s]))
      const articles = await mapLimit(queue, concurrency, async ({ source, link }) => {
        try {
          const item = await fetchArticle(source, link)
          job.done += 1
          if (item) {
            const stat = bySource.get(source.id)
            if (stat) stat.items += 1
          }
          return item
        } catch {
          job.done += 1
          return null
        }
      })

      const items = articles.filter((x) => x && !x.error)
      job.phase = '去重与打分'
      const deduped = capPool(
        dedupe(items).sort((a, b) => (b.total || 0) - (a.total || 0)),
        Math.max(60, Number(settings.maxCandidates) || 220),
      )

      let ranked = 0
      // 模型打分是「锦上添花」，任何 LLM 侧异常都只能降级，不能冒泡（曾把宿主 provider 选崩）
      try {
        if (settings.aiEnabled !== false && (await ai?.available()) && deduped.length) {
          job.phase = '模型打分'
          const pool = deduped.slice(0, 90)
          const batches = []
          for (let i = 0; i < pool.length; i += 30) batches.push(pool.slice(i, i + 30))
          const maps = await mapLimit(batches, 2, (batch) => ai.rank(batch))
          for (const map of maps) {
            if (!map || map.error) continue
            for (const [id, value] of map) {
              const item = deduped.find((x) => x.id === id)
              if (!item) continue
              item.scores = { qu: value.qu, you: value.you, gong: value.gong }
              item.total = totalScore(item.scores, item.weight)
              if (value.section) item.section = value.section
              if (value.note) item.aiNote = value.note
              ranked += 1
            }
          }
          deduped.sort((a, b) => (b.total || 0) - (a.total || 0))
          pushLog(`模型完成 ${ranked} 条打分`)
        }
      } catch (error) {
        pushLog(`模型打分跳过：${String(error?.message || error).slice(0, 120)}`)
      }

      const dayData = (await store.readDay(day)) || blankDay(day)
      dayData.fetchedAt = Date.now()
      dayData.sources = stats.sort((a, b) => b.items - a.items)
      dayData.candidates = deduped
      dayData.whitelist = { version: WHITELIST.version, total: WHITELIST.total }
      await store.writeDay(dayData)
      job.phase = '完成'
      job.running = false
      job.finishedAt = Date.now()
      pushLog(`入库 ${deduped.length} 条（${stats.filter((s) => s.items > 0).length}/${stats.length} 个源有产出）`)
      return { started: true, count: deduped.length, sources: stats.length }
    } catch (error) {
      job.running = false
      job.finishedAt = Date.now()
      job.error = String(error?.message || error)
      pushLog(`抓取失败：${job.error}`)
      // 不再向上抛：抓取是后台任务，异常到调用方只会变成未处理拒绝（曾拖崩宿主）
      return { started: false, error: job.error }
    }
  }

  function sortBySection(items) {
    return items.sort((a, b) => (SECTION_ORDER.get(a.section) ?? 99) - (SECTION_ORDER.get(b.section) ?? 99))
  }

  function candidateById(dayData, id) {
    return dayData.candidates.find((c) => c.id === id)
  }

  function firstSentence(text, max = 90, title = '') {
    return leadFromSummary(text, title, { max })
  }

  /** 把候选加入稿件 */
  function addToDraft(dayData, id) {
    const candidate = candidateById(dayData, id)
    if (!candidate) throw new Error('候选项不存在')
    if (dayData.draft.items.some((it) => it.cid === id)) return dayData
    dayData.draft.items.push({
      cid: id,
      section: candidate.section,
      lead: candidate.summary ? firstSentence(candidate.summary, 100) : candidate.title,
      note: '',
      star: false,
      title: candidate.title,
      url: candidate.url,
      sourceName: candidate.sourceName,
    })
    sortBySection(dayData.draft.items)
    dayData.draft.updatedAt = Date.now()
    return dayData
  }

  async function mutateDraft({ day, action, payload = {} }) {
    const dayData = await ensureDay(day)
    const draft = dayData.draft
    switch (action) {
      case 'add': {
        const list = Array.isArray(payload.ids) ? payload.ids : [payload.id]
        for (const id of list) if (id) addToDraft(dayData, id)
        break
      }
      case 'remove': {
        draft.items = draft.items.filter((it) => it.cid !== payload.cid)
        break
      }
      case 'clear':
        draft.items = []
        break
      case 'update': {
        const item = draft.items.find((it) => it.cid === payload.cid)
        if (item) {
          if (typeof payload.lead === 'string') item.lead = payload.lead
          if (typeof payload.note === 'string') item.note = payload.note
          if (typeof payload.section === 'string' && SECTION_ORDER.has(payload.section)) item.section = payload.section
          if (payload.lead !== undefined || payload.section !== undefined) {
            const cand = candidateById(dayData, item.cid)
            if (cand && payload.leadEdited === true) cand.leadEdited = true
          }
        }
        if (payload.sortAfter) sortBySection(draft.items)
        break
      }
      case 'move': {
        const index = draft.items.findIndex((it) => it.cid === payload.cid)
        if (index >= 0) {
          const target = Math.max(0, Math.min(draft.items.length - 1, index + (payload.delta || 0)))
          const [item] = draft.items.splice(index, 1)
          draft.items.splice(target, 0, item)
        }
        break
      }
      case 'meta': {
        draft.meta = { ...defaultMeta(day), ...(draft.meta || {}), ...payload.meta }
        if (payload.meta?.headline) draft.headline = { ...draft.headline, ...payload.meta.headline }
        break
      }
      case 'auto': {
        const picked = autoSelect(dayData.candidates, { count: Number(payload.count) || 20 })
        draft.items = picked.map((candidate) => ({
          cid: candidate.id,
          section: candidate.section,
          lead: candidate.summary ? firstSentence(candidate.summary, 100) : candidate.title,
          note: candidate.aiNote || '',
          star: false,
          title: candidate.title,
          url: candidate.url,
          sourceName: candidate.sourceName,
        }))
        sortBySection(draft.items)
        break
      }
      case 'sort':
        sortBySection(draft.items)
        break
      default:
        throw new Error(`未知操作 ${action}`)
    }
    draft.updatedAt = Date.now()
    await store.writeDay(dayData)
    return dayData
  }

  async function mutateCandidate({ day, id, patch = {} }) {
    const dayData = await ensureDay(day)
    const candidate = candidateById(dayData, id)
    if (!candidate) throw new Error('候选项不存在')
    if (typeof patch.hidden === 'boolean') candidate.hidden = patch.hidden
    if (typeof patch.star === 'boolean') candidate.star = patch.star
    if (typeof patch.section === 'string' && SECTION_ORDER.has(patch.section)) candidate.section = patch.section
    await store.writeDay(dayData)
    return dayData
  }

  function publicDay(dayData) {
    const rendered = renderText(dayData, {})
    return {
      day: dayData.day,
      fetchedAt: dayData.fetchedAt || 0,
      whitelist: dayData.whitelist || { version: WHITELIST.version, total: WHITELIST.total },
      sources: dayData.sources || [],
      stats: rendered.stats,
      items: (dayData.candidates || []).map((c) => ({
        id: c.id,
        title: c.title,
        url: c.url,
        sourceName: c.sourceName,
        listName: c.listName,
        category: c.category,
        section: c.section,
        publishedAt: c.publishedAt,
        summary: c.summary,
        scores: c.scores,
        total: c.total,
        reasons: c.reasons,
        aiNote: c.aiNote || '',
        wordCount: c.wordCount,
        image: c.image,
        hidden: Boolean(c.hidden),
        star: Boolean(c.star),
      })),
      draft: dayData.draft,
      issueTitle: issueTitle(dayData.draft.meta),
    }
  }

  return {
    job,
    ensureDay,
    runFetch,
    mutateDraft,
    mutateCandidate,
    publicDay,
    candidateById,
    async itemDetail(day, id) {
      const dayData = await ensureDay(day)
      const candidate = candidateById(dayData, id)
      if (!candidate) return null
      return {
        ...candidate,
        paragraphs: candidate.paragraphs || [],
      }
    },
    async preview(day, format = 'text', opts = {}) {
      const dayData = await ensureDay(day)
      if (format === 'md') return { text: renderMarkdown(dayData, opts) }
      if (format === 'html') return { html: renderHtml(dayData, opts) }
      return renderText(dayData, opts)
    },
    async setSources(map) {
      await store.writeSources(map)
      return map
    },
  }
}
