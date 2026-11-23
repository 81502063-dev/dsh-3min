/**
 * dsh-news-3min 服务端入口。
 *
 * 职责：
 *  1. 在 webServer 上挂 `/dsh-news-3min/`（编辑台 UI）与 `/dsh-news-3min/api/*`；
 *  2. 每天在设定时间（默认 05:10，参考栏目 05:25 发布）自动抓一轮名单内媒体的新闻；
 *  3. 提供 news3min 工具，让主会话能直接取当日候选/成稿。
 */

import { readFile, mkdir } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createStore } from './store.js'
import { createService } from './service.js'
import { createAI } from './ai.js'
import { bootLog } from './bootlog.js'
import { SOURCES, SECTIONS, CATEGORIES, WHITELIST, effectiveSources, normalizeSourceState } from './sources.js'
import { solarYmd } from './lunar.js'

const BASE = '/dsh-news-3min'
const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = dirname(HERE)
bootLog('module:loaded', { root: PKG_ROOT })

const DEFAULTS = {
  enabled: true,
  dataDir: '',
  fetchTime: '05:10',
  perSource: 8,
  concurrency: 8,
  maxCandidates: 220,
  aiEnabled: true,
  provider: '',
  model: '',
  autoFetch: true,
  showSectionTitles: false,
  screenRule: '',
}

let Config
try {
  const mod = await import('@deepseek-ai/schemastery')
  const Schema = mod.default || mod
  Config = Schema.object({
    enabled: Schema.boolean().default(true).description('启用「新闻三分钟」'),
    dataDir: Schema.string().default('').description('数据目录（留空用 ~/.dsh/news-3min）'),
    fetchTime: Schema.string().default('05:10').description('每日自动抓取时间 HH:MM（北京时间）'),
    perSource: Schema.number().default(8).description('每个来源最多取几条'),
    concurrency: Schema.number().default(8).description('抓取并发数'),
    maxCandidates: Schema.number().default(220).description('当日候选池上限'),
    aiEnabled: Schema.boolean().default(true).description('用模型做「有趣/有用/有共鸣」打分'),
    provider: Schema.string().default('').description('模型 provider（留空自动）'),
    model: Schema.string().default('').description('模型 id（留空自动）'),
    autoFetch: Schema.boolean().default(true).description('每天定时自动抓取'),
    showSectionTitles: Schema.boolean().default(false).description('成稿里显示栏目小标题'),
    screenRule: Schema.string().default('').description('自定义新闻筛选机制（留空用内置三轴标准）'),
  })
} catch {
  Config = undefined
}

export const name = 'news-3min'
export const provide = 'news3min'
export const inject = []
export { Config }

export function apply(ctx, config = {}) {
  bootLog('apply:enter', { hasLogger: typeof ctx?.logger, keys: Object.keys(config || {}) })
  try {
    return boot(ctx, config)
  } catch (error) {
    bootLog('apply:throw', String(error?.stack || error))
    try {
      if (typeof ctx?.logger === 'function') ctx.logger('news-3min').error(`新闻三分钟启动失败：${String(error?.message || error)}`)
    } catch {
      /* ignore */
    }
    // 不抛出：抛出去会让整个条目「did not activate」，用户在插件列表里就看不到它了
    return undefined
  }
}

function boot(ctx, config = {}) {
  let logger = console
  try {
    if (typeof ctx?.logger === 'function') logger = ctx.logger('news-3min')
  } catch {
    logger = console
  }

  const dataDir = config.dataDir
    ? String(config.dataDir)
    : process.env.DSH_HOME
      ? join(process.env.DSH_HOME, 'data', 'news-3min')
      : join(homedir(), '.dsh', 'news-3min')

  const store = createStore(dataDir)
  const settings = { ...DEFAULTS, ...pickDefined(config) }
  const getSettings = () => settings
  const ai = createAI(ctx, { provider: settings.provider, model: settings.model, logger, getRule: () => settings.screenRule || '' })

  mkdir(dataDir, { recursive: true }).catch(() => {})

  const serviceRef = { sourceState: normalizeSourceState({}) }
  const service = createService({
    ctx,
    store,
    ai,
    getSettings,
    getSourceState: () => serviceRef.sourceState,
    logger,
  })
  serviceRef.service = service

  store
    .readSettings({})
    .then(async (stored) => {
      if (stored && typeof stored === 'object') Object.assign(settings, pickDefined(stored))
      const rawSources = await store.readSources({})
      serviceRef.sourceState = normalizeSourceState(rawSources)
      // 旧版 sources.json 是扁平 map，顺手升级成 v2 落盘
      if (!rawSources || rawSources.version !== 2) await store.writeSources(serviceRef.sourceState)
    })
    .catch(() => {})

  // ── 定时抓取 ───────────────────────────────────────────────
  const guard = { lastRun: 0 }
  function dueNow() {
    if (!settings.autoFetch || !settings.enabled) return false
    const [hh, mm] = String(settings.fetchTime || '05:10').split(':').map(Number)
    const now = new Date()
    const target = new Date(now)
    target.setHours(Number.isFinite(hh) ? hh : 5, Number.isFinite(mm) ? mm : 10, 0, 0)
    if (now < target) return false
    if (Date.now() - guard.lastRun < 1000 * 60 * 30) return false
    return true
  }
  async function tick() {
    try {
      if (!dueNow() || service.job.running) return
      const day = solarYmd()
      const dayData = await service.ensureDay(day)
      if (dayData.fetchedAt && Date.now() - dayData.fetchedAt < 1000 * 60 * 60 * 6) return
      guard.lastRun = Date.now()
      logger.info?.(`[news-3min] 定时抓取 ${day}`)
      await service.runFetch({ day })
    } catch (error) {
      logger.warn?.(`[news-3min] 定时抓取失败：${String(error?.message || error)}`)
    }
  }
  const safeTick = () => {
    tick().catch((error) => logger.warn?.(`[news-3min] tick 异常：${String(error?.message || error)}`))
  }
  // 定时器用 Node 原生实现：不依赖 cordis 的 timer 服务，避免「without inject」类失败
  const timer = setInterval(safeTick, 1000 * 60 * 10)
  timer.unref?.()
  const bootTimer = setTimeout(safeTick, 8000)
  bootTimer.unref?.()

  // ── HTTP 接口 ──────────────────────────────────────────────
  ctx.inject(['webServer'], (scoped) => {
    const ws = scoped?.webServer || scoped
    if (!ws || typeof ws.register !== 'function') {
      logger.warn?.('[news-3min] webServer 不可用，编辑台无法访问')
      return
    }
    const disposers = []

    const json = (res, data, status = 200) => {
      const body = JSON.stringify(data)
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      })
      res.end(body)
    }

    const readBody = (req) =>
      new Promise((resolve) => {
        let raw = ''
        req.on('data', (chunk) => {
          raw += chunk
          if (raw.length > 4_000_000) req.destroy()
        })
        req.on('end', () => {
          try {
            resolve(raw ? JSON.parse(raw) : {})
          } catch {
            resolve({})
          }
        })
        req.on('error', () => resolve({}))
      })

    const STATIC = {
      '/': ['web/index.html', 'text/html; charset=utf-8'],
      '/app.js': ['web/app.js', 'text/javascript; charset=utf-8'],
      '/style.css': ['web/style.css', 'text/css; charset=utf-8'],
    }

    disposers.push(
      ws.register({
        kind: 'prefix',
        path: BASE,
        handler: async (req, res) => {
          const url = new URL(req.url || '/', 'http://127.0.0.1')
          const path = url.pathname.slice(BASE.length) || '/'
          try {
            if (req.method === 'OPTIONS') {
              res.writeHead(204, {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET,POST,OPTIONS',
                'access-control-allow-headers': 'content-type',
              })
              res.end()
              return
            }

            if (path.startsWith('/api/')) {
              await handleApi(path.slice(5), req, res, url)
              return
            }

            const entry = STATIC[path] || STATIC['/']
            const [file, type] = entry
            const content = await readFile(join(PKG_ROOT, file))
            res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' })
            res.end(content)
          } catch (error) {
            if (path.startsWith('/api/')) json(res, { error: String(error?.message || error) }, 500)
            else {
              res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
              res.end(`新闻三分钟加载失败：${String(error?.message || error)}`)
            }
          }
        },
      }),
    )

    async function handleApi(route, req, res, url) {
      const day = url.searchParams.get('day') || solarYmd()

      if (route === 'state') {
        const dayData = await service.ensureDay(day)
        json(res, {
          ...service.publicDay(dayData),
          settings: { ...settings, dataDir },
          sourceList: effectiveSources(serviceRef.sourceState).map((s) => ({
            id: s.id,
            name: s.name,
            listName: s.listName,
            category: s.category,
            weight: s.weight,
            list: s.list,
            builtin: s.builtin,
            enabled: s.enabled,
          })),
          sourceRemoved: serviceRef.sourceState.removed || [],
          builtinSources: SOURCES.map((s) => ({ id: s.id, name: s.name, listName: s.listName, category: s.category })),
          sections: SECTIONS,
          categories: CATEGORIES,
          whitelist: WHITELIST,
          aiAvailable: await ai.available(),
          aiInfo: ai.info ? ai.info() : {},
          job: publicJob(),
          today: solarYmd(),
        })
        return
      }

      if (route === 'job') {
        json(res, publicJob())
        return
      }

      if (route === 'days') {
        json(res, { days: await store.listDays(45) })
        return
      }

      if (route === 'item') {
        const id = url.searchParams.get('id') || ''
        const detail = await service.itemDetail(day, id)
        json(res, detail || { error: 'not found' }, detail ? 200 : 404)
        return
      }

      if (route === 'preview') {
        const format = url.searchParams.get('format') || 'text'
        const opts = { showSectionTitles: url.searchParams.get('sections') === '1' }
        json(res, await service.preview(day, format, opts))
        return
      }

      if (route === 'export') {
        const format = url.searchParams.get('format') || 'text'
        const result = await service.preview(day, format === 'md' ? 'md' : 'text', { showSectionTitles: url.searchParams.get('sections') === '1' })
        const ext = format === 'md' ? 'md' : 'txt'
        res.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'content-disposition': `attachment; filename="news3min-${day}.${ext}"`,
        })
        res.end(result.text)
        return
      }

      if (route === 'compliance') {
        const q = (url.searchParams.get('q') || '').trim()
        try {
          const text = await readFile(join(PKG_ROOT, 'data', 'whitelist-2025.txt'), 'utf8')
          if (!q) {
            json(res, { version: WHITELIST.version, total: WHITELIST.total, hits: [] })
            return
          }
          const hits = []
          for (const line of text.split(/\r?\n/)) {
            const row = line.trim()
            if (!row || row.length > 80) continue
            if (!row.includes(q)) continue
            // 名单行形如「序号 网站名 单位名」，只回单位名与整行
            const parts = row.split(/\s+/)
            hits.push({ name: parts[1] || row, line: row })
            if (hits.length >= 30) break
          }
          json(res, { version: WHITELIST.version, total: WHITELIST.total, hits })
        } catch (error) {
          json(res, { error: `名单检索不可用：${String(error?.message || error)}` })
        }
        return
      }

      if (req.method !== 'POST') {
        json(res, { error: `未知接口 ${route}` }, 404)
        return
      }

      const body = await readBody(req)

      if (route === 'fetch') {
        if (service.job.running) {
          json(res, { started: false, reason: '已有一轮抓取在进行', job: publicJob() })
          return
        }
        service.runFetch({ day: body.day || day }).catch((error) => {
          logger.warn?.(`[news-3min] 抓取失败：${String(error?.message || error)}`)
        })
        json(res, { started: true })
        return
      }

      if (route === 'draft') {
        const dayData = await service.mutateDraft({ day: body.day || day, action: body.action, payload: body.payload || {} })
        json(res, service.publicDay(dayData))
        return
      }

      if (route === 'candidate') {
        const dayData = await service.mutateCandidate({ day: body.day || day, id: body.id, patch: body.patch || {} })
        json(res, service.publicDay(dayData))
        return
      }

      if (route === 'settings') {
        // 这里不能用 pickDefined：筛选机制清空后要能存成空串（回落到内置标准）
        const patch = { ...(body.settings || {}) }
        for (const key of Object.keys(patch)) if (patch[key] === undefined || patch[key] === null) delete patch[key]
        Object.assign(settings, patch)
        await store.writeSettings({ ...pickDefined(settings), screenRule: String(settings.screenRule || '') })
        json(res, { settings: { ...settings, dataDir } })
        return
      }

      if (route === 'sources') {
        const current = serviceRef.sourceState
        const patch = body || {}
        const merged = normalizeSourceState({
          version: 2,
          enabled: patch.enabled && typeof patch.enabled === 'object' ? { ...current.enabled, ...patch.enabled } : current.enabled,
          removed: Array.isArray(patch.removed) ? patch.removed : current.removed,
          custom: Array.isArray(patch.custom) ? patch.custom : current.custom,
        })
        // 兼容旧版前端：{ map: { id: bool } }
        if (patch.map && typeof patch.map === 'object') merged.enabled = { ...merged.enabled, ...patch.map }
        serviceRef.sourceState = merged
        await service.setSources(merged)
        json(res, {
          ok: true,
          sourceList: effectiveSources(merged).map((s) => ({
            id: s.id,
            name: s.name,
            listName: s.listName,
            category: s.category,
            weight: s.weight,
            list: s.list,
            builtin: s.builtin,
            enabled: s.enabled,
          })),
          sourceRemoved: merged.removed,
        })
        return
      }

      if (route === 'ai') {
        const action = body.action
        if (!(await ai.available())) {
          json(res, { error: '模型不可用：请先在设置里选 provider/model' }, 400)
          return
        }
        const dayData = await service.ensureDay(body.day || day)
        if (action === 'headline') {
          const result = await ai.headline(dayData)
          json(res, { result })
          return
        }
        if (action === 'rewrite') {
          const candidate = service.candidateById(dayData, body.cid)
          if (!candidate) {
            json(res, { error: '候选项不存在' }, 404)
            return
          }
          const result = await ai.rewrite(candidate)
          json(res, { result })
          return
        }
        if (action === 'pick') {
          const picked = await service.mutateDraft({ day: dayData.day, action: 'auto', payload: { count: body.count || 20 } })
          json(res, service.publicDay(picked))
          return
        }
        json(res, { error: `未知 AI 动作 ${action}` }, 400)
        return
      }

      json(res, { error: `未知接口 ${route}` }, 404)
    }

    function publicJob() {
      return {
        running: service.job.running,
        day: service.job.day,
        phase: service.job.phase,
        done: service.job.done,
        total: service.job.total,
        error: service.job.error,
        log: service.job.log.slice(-12),
        startedAt: service.job.startedAt,
        finishedAt: service.job.finishedAt,
      }
    }

    ctx.on?.('dispose', () => {
      for (const off of disposers) {
        try {
          if (typeof off === 'function') off()
        } catch {
          /* 忽略 */
        }
      }
    })

    logger.info?.(`[news-3min] 编辑台：${BASE}/  data=${dataDir}`)
  })

  // ── 工具：让主会话直接取当日候选 / 成稿 ─────────────────────
  registerTool().catch((error) => logger.warn?.(`[news-3min] 工具注册异常：${String(error?.message || error)}`))

  async function registerTool() {
    try {
      // 只能用 ctx.get 拿服务：直接读 ctx.tools 会因未 inject 被 cordis 拒绝
      let tools = null
      try {
        tools = typeof ctx.get === 'function' ? ctx.get('tools') : null
      } catch {
        tools = null
      }
      if (!tools || typeof tools.register !== 'function') {
        logger.warn?.('[news-3min] tools 服务不可用，跳过 news3min 工具')
        return
      }
      const { defineTool } = await import('@deepseek-ai/dsh-tools')
      tools.register(
        defineTool({
          name: 'news3min',
          description:
            '读取「新闻三分钟」编稿台的当日数据：候选项（含有趣/有用/有共鸣三轴分与分节）、当前稿件、成稿正文。用于在主会话里帮用户挑新闻、改稿、导出。',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['candidates', 'draft', 'preview'], description: 'candidates=候选池；draft=当前已选；preview=成稿正文' },
              day: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' },
              limit: { type: 'number', description: 'candidates 返回条数，默认 30' },
            },
            required: ['action'],
          },
          output: {
            schema: { type: 'object', properties: { text: { type: 'string' } }, additionalProperties: false },
            render: (_args, value) => [{ type: 'text', text: String(value?.text || '') }],
          },
          async execute(args = {}) {
            const day = args.day || solarYmd()
            const dayData = await service.ensureDay(day)
            if (args.action === 'preview') {
              const { text, stats } = await service.preview(day, 'text', {})
              return { text: `${text}\n\n—— ${stats.items} 条 / ${stats.chars} 字 / 约 ${stats.minutes} 分钟` }
            }
            if (args.action === 'draft') {
              const items = dayData.draft.items.map((it, i) => `${i + 1}. [${it.section}] ${it.lead}`)
              return { text: items.length ? items.join('\n') : '稿件还是空的。' }
            }
            const limit = Math.max(1, Math.min(120, Number(args.limit) || 30))
            const items = dayData.candidates
              .filter((c) => !c.hidden)
              .slice(0, limit)
              .map((c, i) => `${i + 1}. [${c.section}] ${c.title}（${c.sourceName}｜有趣${c.scores?.qu ?? '-'}/有用${c.scores?.you ?? '-'}/共鸣${c.scores?.gong ?? '-'}｜${c.id}）`)
            return {
              text: items.length
                ? `候选 ${dayData.candidates.length} 条（显示前 ${items.length}）\n${items.join('\n')}\n\nid 可直接用于选稿。`
                : `今天（${day}）还没有候选。先在编辑台或让我触发一次抓取。`,
            }
          },
        }),
      )
      logger.info?.('[news-3min] 工具 news3min 已注册')
    } catch (error) {
      logger.warn?.(`[news-3min] 工具注册失败：${String(error?.message || error)}`)
    }
  }

  bootLog('apply:ok', { base: BASE, dataDir })
}

function pickDefined(obj) {
  const out = {}
  for (const [key, value] of Object.entries(obj || {})) {
    if (value === undefined || value === null || value === '') continue
    out[key] = value
  }
  return out
}

// cordis 的插件归一化既接受函数，也接受 { apply }；这里给一个函数形态的 default，
// 同时保留 name / inject / apply / Config 具名导出（与 dsh-rss-news-daily 一致）。
export default function news3min(ctx, config = {}) {
  return apply(ctx, config)
}
