/** LLM 侧：三轴打分（有趣/有用/有共鸣）、头条四问、单条改写。全部 fail-soft。 */

import { guessSection } from './classify.js'

const SECTION_ENUM = ['headline', 'china', 'henan', 'zhengzhou', 'finance', 'tech', 'culture', 'world', 'life', 'weather']

const SYSTEM = `你是《新闻三分钟》栏目的资深编辑。这个栏目每天早晨 5 点发布，把前一天的新闻压缩成约 20 条、每条 1-2 句，读者用 3 分钟看完。
选稿标准只有三条：有趣（让人想读下去、有新知或反差）、有用（与读者的钱袋子、出行、健康、办事直接相关）、有共鸣（普通人的处境与情感，读者会说"这就是我们"）。
写作要求：客观陈述、给足信息量（谁、做了什么、数字、结果）；不加评论、不喊口号；不用"据悉""记者了解到""引发热议"这类空话；每条不超过 80 字；不用感叹号堆砌。
只输出 JSON，不要 markdown 代码块，不要解释。`

function extractJson(text) {
  if (!text) return null
  const cleaned = String(text).replace(/^```(?:json)?/i, '').replace(/```$/g, '').trim()
  const start = cleaned.search(/[[{]/)
  if (start < 0) return null
  const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'))
  const slice = cleaned.slice(start, end + 1)
  try {
    return JSON.parse(slice)
  } catch {
    try {
      return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'))
    } catch {
      return null
    }
  }
}

/** 内置人设 + 用户在设置里手写的「新闻筛选机制」（留空则只用内置三轴标准） */
export function buildSystem(base, rule) {
  const text = String(rule || '').trim()
  if (!text) return base
  return `${base}

【本期人工指定的筛选机制】（由栏目编辑手写，与上面通用标准冲突时以这里为准）
${text.slice(0, 4000)}`
}

export function createAI(ctx, opts = {}) {
  const log = opts.logger || console
  const state = { provider: opts.provider || '', model: opts.model || '', ready: null }
  const getRule = typeof opts.getRule === 'function' ? opts.getRule : () => ''

  function systemPrompt() {
    let rule = ''
    try {
      rule = getRule()
    } catch {
      rule = ''
    }
    return buildSystem(SYSTEM, rule)
  }

  // 不能直接写 ctx.llm：cordis 对未 inject 的服务抛
  // `cannot get property "llm" without inject`，只能走 ctx.get（拿不到就返回 undefined）
  function llmService() {
    try {
      if (ctx && typeof ctx.get === 'function') return ctx.get('llm') || null
    } catch {
      /* 服务未就绪 */
    }
    return null
  }

  async function loadSdk() {
    if (!state.ready) {
      state.ready = import('@deepseek-ai/dsh-llm').catch((error) => {
        log.warn?.(`dsh-llm unavailable: ${String(error?.message || error)}`)
        return null
      })
    }
    return state.ready
  }

  /** provider 条目可能是字符串，也可能是 { id, name, ... } 对象；统一取 id */
  function providerId(entry) {
    if (!entry) return ''
    if (typeof entry === 'string') return entry
    return String(entry.id || entry.name || entry.provider || entry.providerId || '')
  }

  /** 选路由：任何一步出错都返回 null，绝不把异常抛给调用方（曾因 provider 传对象导致宿主崩溃）
   *  注意 listModels 在 DSH 里是异步的：必须 await，否则拿到的是 Promise。
   *  逐个 provider 试，第一个能列出模型且被 adapter 支持的才算数。 */
  async function pickRoute() {
    try {
      const llm = llmService()
      if (!llm) {
        state.info = { ...(state.info || {}), reason: 'llm 服务不可用' }
        return null
      }
      if (state.provider && state.model) return { provider: state.provider, model: state.model }
      const raw = typeof llm.listProviders === 'function' ? llm.listProviders() : []
      const providers = (Array.isArray(raw) ? raw : []).map(providerId).filter(Boolean)
      state.info = { ...(state.info || {}), providers }
      if (!providers.length) return null
      // 优先 deepseek，其它 provider 依次兜底；避免「第一个 provider 没有可用 adapter」时全盘不可用
      const ordered = [...providers.filter((p) => /deep/i.test(p)), ...providers.filter((p) => !/deep/i.test(p))]
      for (const provider of ordered) {
        let models = []
        try {
          const got = await Promise.resolve(llm.listModels(provider))
          if (Array.isArray(got)) models = got
        } catch (error) {
          state.info = { ...(state.info || {}), lastError: `${provider}: ${String(error?.message || error)}` }
          continue
        }
        const names = models.map((m) => (typeof m === 'string' ? m : String(m?.id || m?.model || ''))).filter(Boolean)
        if (!names.length) {
          state.info = { ...(state.info || {}), lastError: `${provider}: 无模型` }
          continue
        }
        const chat = names.find((n) => /flash|chat|pro|reason/i.test(n)) || names[0]
        state.info = { ...(state.info || {}), route: { provider, model: chat }, models: names.slice(0, 6) }
        return { provider, model: chat }
      }
      return null
    } catch (error) {
      state.info = { ...(state.info || {}), lastError: String(error?.message || error) }
      return null
    }
  }

  async function chat({ system, prompt, maxTokens = 2400, temperature = 0.35, timeoutMs = 180000 }) {
    const sdk = await loadSdk()
    const route = await pickRoute()
    if (!sdk || !route) throw new Error('LLM 不可用（未注册 provider 或 dsh-llm 缺失）')
    const message = sdk.createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })
    const llm = llmService()
    if (!llm) throw new Error('LLM 服务不可用')
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      messages: [message],
      system,
      maxTokens,
      temperature,
      signal: AbortSignal.timeout(timeoutMs),
    })
    let text = ''
    let failure = ''
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish' && (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted')) {
        failure = chunk.reason?.failure?.message || chunk.reason.kind
      }
    }
    if (failure) throw new Error(`LLM 调用失败：${failure}`)
    return { text, route }
  }

  return {
    async available() {
      try {
        return llmService() !== null && (await pickRoute()) !== null
      } catch {
        return false
      }
    },
    /** 诊断信息：为什么可用/不可用（暴露在 /api/state 的 aiInfo） */
    info() {
      return { ...(state.info || {}) }
    },
    route: pickRoute,

    /** 批量三轴打分：返回 Map<id, {qu,you,gong,section,note}> */
    async rank(items) {
      const lines = items.map((item, i) =>
        `${i + 1}. [${item.id}] ${item.title}｜${(item.summary || '').slice(0, 70)}｜${item.sourceName}`).join('\n')
      const prompt = `下面是今天抓到的候选新闻（格式：序号. [id] 标题｜摘要｜来源）。请从中挑出最值得放进《新闻三分钟》的 45 条，逐条打三轴分（0-100）并归到栏目分节。

分节只能取：${SECTION_ENUM.join(' / ')}（headline=当天最该先说的要闻，china=国内综合，henan=河南，zhengzhou=郑州本地，finance=财经，tech=科技科普，culture=文体，world=国际，life=民生服务，weather=天气）。

输出 JSON 数组，每项：
{"id":"原始id","qu":0-100,"you":0-100,"gong":0-100,"section":"上面某一个","note":"不超过30字，说清为什么值得选"}

只需要这 45 条，按三轴综合从高到低排列。候选：
${lines}`
      const { text } = await chat({ system: systemPrompt(), prompt, maxTokens: 4000, temperature: 0.3 })
      const parsed = extractJson(text)
      const map = new Map()
      if (!Array.isArray(parsed)) return map
      for (const row of parsed) {
        if (!row || typeof row !== 'object') continue
        const id = String(row.id || '').trim()
        if (!id) continue
        const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))
        map.set(id, {
          qu: clamp(row.qu),
          you: clamp(row.you),
          gong: clamp(row.gong),
          section: SECTION_ENUM.includes(row.section) ? row.section : '',
          note: String(row.note || '').slice(0, 60),
        })
      }
      return map
    },

    /** 头条四问 + 栏目标题 */
    async headline(day) {
      const items = (day.draft?.items || []).slice(0, 8)
      const body = items.map((item, i) => `${i + 1}. ${item.lead || item.note || ''}`).join('\n')
      const prompt = `这是今天已经选定的稿件开头几条：
${body}

请为今天这一期拟 4 个"头条短语"（会拼成标题：每天3分钟 尽览天下事（A、B、C、D））。
要求：每条 4-10 个字，动宾或主谓结构，指向具体事件，彼此不重复，按重要性排序。
输出 JSON：{"a":"","b":"","c":"","d":""}`
      const { text } = await chat({ system: systemPrompt(), prompt, maxTokens: 600, temperature: 0.6 })
      const parsed = extractJson(text)
      if (!parsed || typeof parsed !== 'object') throw new Error('头条生成失败：返回不是 JSON')
      const pick = (k) => String(parsed[k] || '').replace(/[（(].*?[)）]/g, '').trim().slice(0, 14)
      return { a: pick('a'), b: pick('b'), c: pick('c'), d: pick('d') }
    },

    /** 把一条新闻改写成栏目文案 */
    async rewrite(item) {
      const paragraphs = (item.paragraphs || []).slice(0, 4).join('\n').slice(0, 1400)
      const prompt = `请把下面这条新闻改写成《新闻三分钟》的一条，1-2 句、不超过 80 字。

标题：${item.title}
来源：${item.sourceName}
正文：
${paragraphs}

只输出 JSON：{"lead":"改写后的这一条","note":"如果正文里还有值得补一句的关键信息，写在这里（可为空）"}`
      const { text } = await chat({ system: systemPrompt(), prompt, maxTokens: 500, temperature: 0.45 })
      const parsed = extractJson(text)
      if (!parsed || typeof parsed !== 'object') throw new Error('改写失败：返回不是 JSON')
      return {
        lead: String(parsed.lead || '').trim().slice(0, 120),
        note: String(parsed.note || '').trim().slice(0, 120),
      }
    },

    /** 给没有分数的新条目补一个粗略分节（模型不可用时的兜底在 classify 里） */
    fallbackSection(item, source) {
      return guessSection(item, source)
    },
  }
}
