/** 列表页抽链接 + 正文页抽标题/时间/段落。DOM 用 htmlparser2，缺失时退回正则。 */

let h2p = null
try {
  h2p = await import('htmlparser2').catch(() => null)
} catch {
  h2p = null
}

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'aside', 'form', 'header', 'button', 'select'])
const ARTICLE_HINT = /content|article|detail|text|main|body|zwnr|TRS_Editor|post|entry|story/i
const NOISE =
  /^(责任编辑|责编|编辑|来源|原标题|免责声明|版权声明|未经授权|禁止转载|扫码|二维码|关注|下载|点击|分享到|上一篇|下一篇|相关阅读|相关新闻|热门推荐|广告|举报|违法和不良信息|客服|ICP备|互联网新闻信息服务许可证|本站|返回顶部|打印本页|字体|记者|摄影|校对|监制|审核|统筹)[:：\s]|版权归|转载请注明|长按识别|微信公众号|更多精彩|原标题[:：]/

function textOf(node, buf = []) {
  if (!node) return ''
  if (node.type === 'text') {
    buf.push(node.data)
    return buf.join('')
  }
  if (node.type === 'comment' || node.type === 'directive') return buf.join('')
  if (node.name && SKIP_TAGS.has(node.name.toLowerCase())) return buf.join('')
  for (const child of node.children || []) textOf(child, buf)
  return buf.join('')
}

function attrOf(node, name) {
  return node?.attribs?.[name] || node?.attribs?.[name.toLowerCase()] || ''
}

function walk(node, visit) {
  if (!node) return
  visit(node)
  if (node.name && SKIP_TAGS.has(node.name.toLowerCase())) return
  for (const child of node.children || []) walk(child, visit)
}

function collectMeta(doc) {
  const meta = {}
  walk(doc, (node) => {
    if (node.name !== 'meta') return
    const key = (attrOf(node, 'property') || attrOf(node, 'name') || '').toLowerCase()
    const content = attrOf(node, 'content')
    if (key && content && meta[key] === undefined) meta[key] = content
  })
  return meta
}

function cleanTitle(raw) {
  let title = String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  title = title.split(/\s*[_|｜]\s*(?=[^_|｜]{2,12}$)/)[0]
  title = title.replace(/\s*[-—–]{1,2}\s*[^-—–]{0,14}$/, (m) => (/[省市区县网报台社局委]/.test(m) ? '' : m))
  return title.trim()
}

function isNoise(line) {
  if (NOISE.test(line)) return true
  if (/^(来源|编辑|责编|记者|通讯员|校对|审核|监制)[:：]/.test(line)) return true
  if (line.length <= 14 && /(网|报|台|社)$/.test(line) && !/[，。！？]/.test(line)) return true
  // 站内导航 / 面包屑 / 省份联播条 / 分享引导
  if ((line.match(/[|｜]/g) || []).length >= 3) return true
  if (/(&gt;|»|›|\s>\s)/.test(line) && line.length < 80) return true
  if (/(下载APP|扫一扫|打开微信|分享至|帮助|客服|网站地图|返回顶部|字体[:：]|打印本页)/.test(line)) return true
  if (line.length < 30 && !/[，。！？；：]/.test(line)) return true
  return false
}

/** 句子级清洗：把混进正文的导航句、分享语、图片说明剔掉 */
function cleanSentenceBlock(text) {
  if (!text) return ''
  const parts = text.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean)
  const kept = parts.filter((s) => {
    if (/(&gt;|»|›)/.test(s) && s.length < 60) return false
    if (/(下载APP|扫一扫|打开微信|分享至|点击底部|关注我们|长按识别|微信公众号)/.test(s)) return false
    if (/(责任编辑|来源[:：]|原标题[:：]|未经授权|版权)/.test(s) && s.length < 60) return false
    return true
  })
  return kept.join('')
}

function cleanParagraphs(list) {
  const out = []
  const seen = new Set()
  for (const raw of list) {
    let line = String(raw)
      .replace(/\u00a0|\u3000/g, ' ')
      .replace(/&nbsp;|&emsp;|&amp;|&quot;|&gt;/g, (m) => (m === '&gt;' ? '>' : ' '))
      .replace(/\s+/g, ' ')
      .trim()
    if (!line || line.length < 8) continue
    if (line.length > 1500) line = line.slice(0, 1500)
    if (isNoise(line)) {
      // 导航/分享条直接丢；只有「夹着正文句的段落」才做句子级抢救
      if ((line.match(/[|｜]/g) || []).length >= 3) continue
      const rescued = /[。！？]/.test(line) ? cleanSentenceBlock(line) : ''
      if (rescued.length < 20) continue
      line = rescued
    }
    if (!/[\u4e00-\u9fa5]/.test(line)) continue
    const key = line.replace(/[，。！？、；：""''\s]/g, '').slice(0, 40)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
    if (out.length >= 40) break
  }
  return out
}

function pickParagraphs(doc) {
  const groups = new Map()
  walk(doc, (node) => {
    if (node.name !== 'p') return
    const text = textOf(node).replace(/\s+/g, ' ').trim()
    if (text.length < 8) return
    const parent = node.parent
    if (!parent) return
    const bucket = groups.get(parent) || { node: parent, texts: [], sum: 0 }
    bucket.texts.push(text)
    bucket.sum += text.length
    groups.set(parent, bucket)
  })
  let best = null
  for (const bucket of groups.values()) {
    const hint = `${attrOf(bucket.node, 'class')} ${attrOf(bucket.node, 'id')}`
    const bonus = ARTICLE_HINT.test(hint) ? bucket.sum * 0.35 : 0
    const score = bucket.sum + bonus + bucket.texts.length * 18
    if (!best || score > best.score) best = { ...bucket, score }
  }
  if (best && best.sum >= 120) return cleanParagraphs(best.texts)

  // 兜底：找 class/id 像正文的 div，按其 <br>/<p> 切段
  let divBest = null
  walk(doc, (node) => {
    if (node.name !== 'div' && node.name !== 'article' && node.name !== 'section') return
    const hint = `${attrOf(node, 'class')} ${attrOf(node, 'id')}`
    if (!ARTICLE_HINT.test(hint)) return
    const text = textOf(node).replace(/\s+/g, ' ').trim()
    if (text.length < 150) return
    if (!divBest || text.length > divBest.length) divBest = { node, text }
  })
  if (divBest) {
    const pieces = divBest.node.children
      ? []
      : []
    const flat = []
    const visit = (n) => {
      if (n.type === 'text') {
        flat.push(n.data)
        return
      }
      if (n.name === 'br') {
        flat.push('\n')
        return
      }
      if (n.name && /^(p|div|h\d|li|section|article)$/.test(n.name)) {
        flat.push('\n')
        for (const c of n.children || []) visit(c)
        flat.push('\n')
        return
      }
      for (const c of n.children || []) visit(c)
    }
    visit(divBest.node)
    void pieces
    const blocks = flat
      .join('')
      .split(/\n+/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    const cleaned = cleanParagraphs(blocks)
    if (cleaned.join('').length >= 100) return cleaned
  }

  // 最后兜底：全页 <p> 里最长的几条
  const all = []
  walk(doc, (node) => {
    if (node.name !== 'p') return
    const text = textOf(node).replace(/\s+/g, ' ').trim()
    if (text.length >= 20) all.push(text)
  })
  return cleanParagraphs(all.sort((a, b) => b.length - a.length).slice(0, 8))
}

function findTime(doc, html, url) {
  const meta = collectMeta(doc)
  const keys = ['article:published_time', 'og:release_date', 'pubdate', 'publishdate', 'publish_date', 'date', 'dc.date', 'weibo:article:create_at', 'sailthru.date']
  for (const key of keys) {
    const raw = meta[key]
    const parsed = parseDateValue(raw)
    if (parsed) return parsed
  }
  const ld = /"datePublished"\s*:\s*"([^"]+)"/.exec(html)
  if (ld) {
    const parsed = parseDateValue(ld[1])
    if (parsed) return parsed
  }
  const re = /(20\d{2})\s*[-年/.]\s*(\d{1,2})\s*[-月/.]\s*(\d{1,2})\s*日?\s*(?:(\d{1,2})\s*[:：]\s*(\d{2}))?/g
  let m
  while ((m = re.exec(html))) {
    const candidate = parseDateValue(`${m[1]}-${m[2]}-${m[3]} ${m[4] || '00'}:${m[5] || '00'}`)
    if (candidate && candidate > Date.now() - 1000 * 60 * 60 * 24 * 400 && candidate < Date.now() + 1000 * 60 * 60 * 8) return candidate
  }
  const fromUrl = /\/(20\d{2})[-/]?(\d{2})[-/]?(\d{2})\//.exec(new URL(url, 'http://x').pathname)
  if (fromUrl) return parseDateValue(`${fromUrl[1]}-${fromUrl[2]}-${fromUrl[3]}`)
  return 0
}

export function parseDateValue(raw) {
  if (!raw) return 0
  const s = String(raw).trim()
  if (/^\d{10}$/.test(s)) return Number(s) * 1000
  if (/^\d{13}$/.test(s)) return Number(s)
  const m =
    /(20\d{2})\D{0,2}(\d{1,2})\D{0,2}(\d{1,2})(?:\D{1,3}(\d{1,2})\D{1,3}(\d{1,2}))?/.exec(s)
  if (!m) return 0
  const [, y, mo, d, hh, mm] = m
  const stamp = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh || 0), Number(mm || 0)).getTime()
  return Number.isFinite(stamp) ? stamp : 0
}

function findSourceName(html) {
  const m = /来源[:：]\s*([^\s<>|｜，,。]{2,16})/.exec(html)
  if (m) return m[1].replace(/(网|报|台|客户端)$/, (s) => s).trim()
  return ''
}

function findImage(doc, meta) {
  const og = meta['og:image']
  if (og) return og
  let found = ''
  walk(doc, (node) => {
    if (found || node.name !== 'img') return
    const src = attrOf(node, 'src') || attrOf(node, 'data-src')
    if (!src) return
    if (/logo|icon|avatar|qrcode|copyright|blank|1x1/i.test(src)) return
    if (/^https?:\/\//i.test(src)) found = src
  })
  return found
}

/** 解析正文页 */
export function parseArticle(html, url) {
  if (!h2p) return parseArticleFallback(html, url)
  const doc = h2p.parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true })
  const meta = collectMeta(doc)
  let h1 = ''
  let docTitle = ''
  walk(doc, (node) => {
    if (node.name === 'h1' && !h1) h1 = textOf(node).trim()
    if (node.name === 'title' && !docTitle) docTitle = textOf(node).trim()
  })
  const rawTitle = cleanTitle(meta['og:title'] || meta['twitter:title'] || h1 || docTitle || '')
  const paragraphs = pickParagraphs(doc)
  return {
    title: rawTitle,
    paragraphs,
    text: paragraphs.join(''),
    publishedAt: findTime(doc, html, url),
    sourceName: findSourceName(html),
    image: findImage(doc, meta),
    url,
  }
}

function parseArticleFallback(html, url) {
  const meta = {}
  const reMeta = /<meta\b[^>]*(?:property|name)=["']([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi
  let m
  while ((m = reMeta.exec(html))) meta[m[1].toLowerCase()] = m[2]
  const title =
    cleanTitle(meta['og:title'] || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '')
  const body = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const paragraphs = cleanParagraphs(body.split(/\n+/))
  return { title, paragraphs, text: paragraphs.join(''), publishedAt: findTime({}, html, url), sourceName: findSourceName(html), image: meta['og:image'] || '', url }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

const LIST_SKIP = /\.(jpg|jpeg|png|gif|webp|pdf|zip|docx?|xlsx?|mp4|mp3)(\?|$)/i
const LIST_BAD_TITLE = /^(首页|登录|注册|更多|查看更多|下一页|上一页|下载|客户端|广告|视频|图片|直播|专题|关于我们|联系方式|网站地图|RSS)/

/** 解析列表页：返回 [{url,title,order}]，按页面出现顺序（多为新→旧） */
export function parseList(html, baseUrl, { limit = 12, maxTokens = 60 } = {}) {
  const baseHost = hostOf(baseUrl)
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#<>]+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const out = []
  const seen = new Set()
  let m
  let order = 0
  while ((m = re.exec(html))) {
    order += 1
    const href = m[1].trim()
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) continue
    if (LIST_SKIP.test(href)) continue
    const title = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&amp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (title.length < 8 || title.length > 70) continue
    if (LIST_BAD_TITLE.test(title)) continue
    let abs
    try {
      abs = new URL(href, baseUrl)
    } catch {
      continue
    }
    if (!/^https?:$/.test(abs.protocol)) continue
    if (hostOf(abs.href) !== baseHost) continue
    const path = abs.pathname
    if (path.length < 6) continue
    const digits = (path.match(/\d/g) || []).length
    const looksArticle =
      /\/\d{4}[-/]?\d{0,2}[-/]?\d{0,2}\//.test(path) ||
      /\.(s?html?|htm)$/i.test(path) ||
      /\/detail|\/article|\/content|\/a\/\d+/i.test(path)
    if (!looksArticle) continue
    if (digits < 5 && !/\/(detail|article|content)\//i.test(path)) continue
    if (seen.has(abs.href)) continue
    seen.add(abs.href)
    out.push({ url: abs.href, title, order })
  }
  // 同域同路径前缀的「列表页/栏目页」噪音：标题重复度高、URL 极短的会被上面规则挡掉
  const dedup = []
  const titleSeen = new Set()
  for (const item of out) {
    const key = item.title.replace(/\s/g, '')
    if (titleSeen.has(key)) continue
    titleSeen.add(key)
    dedup.push(item)
    if (dedup.length >= limit) break
  }
  void maxTokens
  return dedup
}
