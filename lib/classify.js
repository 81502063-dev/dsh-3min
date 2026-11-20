/** 分节判定 + 「有趣 / 有用 / 有共鸣」三轴启发式打分 + 跨源去重。 */

const SECTION_RULES = [
  ['zhengzhou', /郑州|郑东|二七区|金水区|中原区|管城|惠济|航空港|新郑|荥阳|巩义|登封|新密|中牟|郑州东站|少林|黄河风景|只有河南/],
  ['henan', /河南|洛阳|开封|新乡|许昌|南阳|信阳|驻马店|周口|商丘|平顶山|安阳|焦作|濮阳|漯河|三门峡|鹤壁|济源|豫/],
  ['weather', /天气|气温|降雨|降雪|暴雨|大雪|寒潮|大风|台风|气象|℃|雾霾|沙尘|高温|低温|冰冻|霜冻/],
  ['world', /美国|俄罗斯|日本|韩国|朝鲜|欧洲|欧盟|英国|法国|德国|乌克兰|以色列|伊朗|特朗普|普京|联合国|北约|海外|国际社会|外媒|全球市场/],
  ['finance', /股市|A股|港股|美股|基金|债券|央行|汇率|人民币|楼市|房价|地产|IPO|上市|财报|营收|利润|裁员|就业|工资|消费|出口|进口|关税|物价|CPI|GDP|存款|利率|黄金|油价/],
  ['tech', /人工智能|大模型|AI|芯片|半导体|航天|卫星|火箭|空间站|登月|量子|机器人|自动驾驶|无人机|5G|6G|算力|数据中心|科研|论文|实验|基因|疫苗研发|新发现|科学家|天文|望远镜|深海|化石|新物种/],
  ['culture', /电影|票房|电视剧|综艺|演唱会|音乐|图书|新书|文学|作家|博物馆|展览|非遗|考古|文物|球员|联赛|世界杯|奥运|全运会|夺冠|比赛|冠军|戏曲|汉服|国潮/],
  ['life', /医保|社保|公积金|养老金|退休|教育|学校|招生|高考|中考|地铁|公交|限行|水电|燃气|供暖|快递|外卖|食品|抽检|维权|诈骗|消防|安全提示|健康|医院|疾病|流感|睡眠|减肥|血压|癌症/],
  ['headline', /习近平|李强|中央|国务院|两办|决定|部署|全会|重要讲话|签署|发布|白皮书|十五五/],
]

const LEX = {
  qu: [
    [/奇|罕见|首例|首次|第一个|破纪录|刷新|之最|最冷|最热|最长|最大|最小|竟然|没想到|意外|反转/, 16],
    [/萌|可爱|暖心|治愈|萌宠|熊猫|大象|海豚|猫|狗|鸟|鹤|猴/, 12],
    [/发现|科学家|考古|化石|新物种|遗址|出土|星空|宇宙|深海|极地|月球|火星/, 14],
    [/机器人|黑科技|自动驾驶|无人机|AI|人工智能|大模型|量子|脑机|实验/, 12],
    [/网友|热搜|走红|爆火|刷屏|围观|评论|段子|手艺人|非遗|汉服|村超|村BA/, 11],
    [/为什么|如何|原来|真相|揭秘|冷知识|一图|视频/, 9],
  ],
  you: [
    [/新规|新政策|通知|公告|征求意见|今天起|明起|下月起|本月起|正式实施|开始执行/, 18],
    [/医保|社保|公积金|养老金|个税|补贴|消费券|以旧换新|降价|免费|收费|涨价|退费|报销/, 17],
    [/放假|调休|假期|限行|油价|电价|水价|气价|停车|摇号|落户|居住证|学位|招生|招聘|考试|报名|查分|录取/, 16],
    [/天气|降温|升温|降雨|降雪|暴雨|寒潮|大风|预警|空气质量|出行|航班|列车|高铁|地铁|公交|高速|封路/, 15],
    [/提醒|注意|警惕|当心|警惕|谨防|防范|安全|急救|第一时间|别忘|务必/, 12],
    [/健康|养生|睡眠|饮食|减肥|血压|血糖|体检|疫苗|流感|支原体|近视|脊柱|心理/, 11],
    [/房价|租金|贷款利率|存款|理财|基金|养老金|工资|最低工资|年终奖|公积金/, 12],
  ],
  gong: [
    [/老人|父亲|母亲|爷爷|奶奶|孩子|女儿|儿子|夫妻|一家人|全家/, 15],
    [/团圆|回家|返乡|离别|重逢|最后一课|毕业|婚礼|生日|年夜饭|一碗|家常/, 15],
    [/坚守|致敬|逆行|守护|接力|传承|一辈子|十年|二十年|三十年|四十年|半生/, 15],
    [/救人|捐助|志愿|公益|义举|善举|帮助|温暖|感动|泪目|破防|谢谢你/, 15],
    [/外卖|快递|环卫|农民工|矿工|护士|乡村教师|老兵|消防员|警察|司机|摊主|小店/, 12],
    [/乡愁|老屋|老街|老照片|手写|书信|遗物|怀念|纪念|告别|记忆里的/, 13],
  ],
}

/** 去掉修饰后用于比较的标题 */
export function normalizeTitle(title) {
  return String(title || '')
    .replace(/[【】\[\]（）()《》""''「」·、，,。.！!？?：:；;—–\-\s]/g, '')
    .replace(/^(视频|图集|直播|独家|重磅|最新|快讯|关注|热点)[:：]?/, '')
    .toLowerCase()
}

function bigrams(s) {
  const out = new Set()
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2))
  return out
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const g of a) if (b.has(g)) inter += 1
  return inter / (a.size + b.size - inter)
}

/** 时政硬规则：命中即进头条，不再被「美国/俄罗斯」这类国名拽到国际节 */
const HEADLINE_FIRST = /习近平|总书记|国家主席|李强|中共中央|政治局|国务院|全国人大|全国政协|十五五|政府工作报告|全会/

export function guessSection(item, source) {
  const title = String(item.title || '')
  if (HEADLINE_FIRST.test(title)) return 'headline'
  for (const [id, re] of SECTION_RULES) {
    if (id === 'headline') continue
    if (re.test(title)) return id
  }
  if (/习近平|李强|中央|国务院|全会|部署|重要讲话|十五五/.test(title)) return 'headline'
  // 正文只在「本地」维度上做补充判定：外地媒体正文常提到郑州/河南，其余维度靠标题与源分类
  const body = String(item.summary || '').slice(0, 160)
  if (/郑州/.test(body) && !SOURCE_LOCAL_ONLY.has(source?.category)) return 'zhengzhou'
  if (/河南|洛阳|开封|新乡|许昌|南阳|信阳|安阳|商丘|平顶山|焦作|濮阳|漯河|三门峡|鹤壁|济源/.test(body) && !SOURCE_LOCAL_ONLY.has(source?.category)) {
    return 'henan'
  }
  if (source?.category === '郑州') return 'zhengzhou'
  if (source?.category === '河南') return 'henan'
  if (source?.category === '财经') return 'finance'
  if (source?.category === '科技') return 'tech'
  if (source?.category === '文化') return 'culture'
  if (source?.category === '健康') return 'life'
  if (source?.category === '国际') return 'world'
  return 'china'
}

const SOURCE_LOCAL_ONLY = new Set(['央媒', '都市', '财经', '科技', '文化', '健康', '国际', '政务'])

function lexScore(text, list) {
  let score = 0
  const hits = []
  for (const [re, weight] of list) {
    const m = re.exec(text)
    if (m) {
      score += weight
      hits.push(m[0])
      if (hits.length >= 3) break
    }
  }
  return { score, hits }
}

/** 三轴打分：返回 0-100 的分数 + 命中的词（给编辑解释为什么值得选） */
export function scoreItem(item) {
  const title = item.title || ''
  const body = (item.summary || '').slice(0, 260)
  const text = `${title} ${body}`
  const qu = lexScore(text, LEX.qu)
  const you = lexScore(text, LEX.you)
  const gong = lexScore(text, LEX.gong)

  const bump = (base) => Math.max(0, Math.min(100, Math.round(base)))
  let sQu = qu.score * 2.1 + (/[？?]/.test(title) ? 8 : 0) + (/\d/.test(title) ? 5 : 0) + (/[「」""]/.test(title) ? 3 : 0)
  let sYou = you.score * 2.2 + (/(今天|今日|明起|本周|本月)/.test(title) ? 6 : 0)
  let sGong = gong.score * 2.2 + (/(他|她|他们)/.test(body) ? 4 : 0)

  // 标题质量的公共加成：太短/太长都不利于成稿
  const tlen = title.length
  const titleBonus = tlen >= 12 && tlen <= 34 ? 6 : tlen <= 40 ? 2 : -4

  const scores = {
    qu: bump(18 + sQu + titleBonus),
    you: bump(18 + sYou + titleBonus),
    gong: bump(18 + sGong + titleBonus * 0.6),
  }
  const reasons = []
  if (qu.hits.length) reasons.push(`有趣·${qu.hits.slice(0, 2).join('/')}`)
  if (you.hits.length) reasons.push(`有用·${you.hits.slice(0, 2).join('/')}`)
  if (gong.hits.length) reasons.push(`共鸣·${gong.hits.slice(0, 2).join('/')}`)
  return { scores, reasons }
}

export function totalScore(scores, weight = 0.8) {
  const base = scores.qu * 0.32 + scores.you * 0.36 + scores.gong * 0.32
  return Math.round(base * (0.6 + weight * 0.4) * 10) / 10
}

/** 同题去重：保留信息更全、权重更高的一条 */
export function dedupe(items) {
  const byKey = new Map()
  const kept = []
  for (const item of items) {
    const norm = normalizeTitle(item.title)
    if (norm.length < 6) continue
    const grams = bigrams(norm)
    let merged = false
    for (const existing of kept) {
      if (existing._norm === norm) {
        merged = true
        if ((item.wordCount || 0) > (existing.wordCount || 0) + 40) Object.assign(existing, item, { _norm: norm })
        break
      }
      const sim = jaccard(grams, existing._grams)
      if (sim >= 0.72 || (norm.includes(existing._norm) && norm.length - existing._norm.length <= 6)) {
        merged = true
        if ((item.wordCount || 0) > (existing.wordCount || 0) + 40) Object.assign(existing, item, { _norm: norm, _grams: grams })
        break
      }
    }
    if (merged) continue
    item._norm = norm
    item._grams = grams
    kept.push(item)
  }
  return kept.map(({ _norm, _grams, ...rest }) => rest)
}

const SUMMARY_TAIL = /[-—–|｜]\s*[^\s\-—–|｜]{2,14}(?:网|报|新闻|客户端|电视台|广播)\s*$/
const SUMMARY_SOURCE = /(?:来源[：:]|稿源[：:]|编辑[：:])\s*[^，。！？]{0,24}$/
const SUMMARY_BYLINE = /^[（(]?(?:本报讯|本网讯|记者\s*[^）)]{0,12}[）)]?|[\u4e00-\u9fa5]{2,6}\s*通讯员\s*[\u4e00-\u9fa5]{2,4})[）)]?\s*/

/** 整段丢弃：时间戳/来源行、AI 免责声明、责任编辑、版权声明、图片署名 */
const DROP_PARAGRAPH = [
  /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?\s*\d{1,2}:\d{2}(:\d{2})?\s*(来源|稿源)?[：:]?.*$/,
  /^(来源|稿源|编辑|责任编辑|作者|发布时间|时间|字号|分享|打印)[：:].{0,40}$/,
  /^(前述内容|本文|本稿).{0,20}(智能生成|AI|机器)/,
  /(智能生成|AI内容力求|不保证准确性|内容仅供参考)/,
  /^[\u4e00-\u9fa5]{2,4}\s*摄$/,
  /^(扫一扫|阅读原文|返回顶部|上一篇|下一篇)/,
  /^[（(]?责编[：:]/,
  /^版权(声明|所有)/,
  /(yicai\.com|@[a-z0-9-]+\.(?:com|cn)|如需转载请联系|更多信息，可以联系我们)/i,
]

/** 段内噪声：图片署名「张毅飞摄」可以是段首也可以是段中 */
const INLINE_NOISE = [
  /[(（]?\s*通讯员\s*[\u4e00-\u9fa5]{2,4}\s*摄\s*[)）]?/g,
  /[(（]?\s*摄影[：:]\s*[\u4e00-\u9fa5]{2,4}\s*[)）]?/g,
  /[\u4e00-\u9fa5]{2,4}\s*摄(?=[，。、“”"]|$)/g,
]

/** 段首噪声：发布时间、图片署名、编辑署名 */
const LEAD_NOISE = [
  /^发布时间[：:]\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*/,
  /^(时间|日期)[：:]\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*/,
  /^[\u4e00-\u9fa5]{2,4}\s*摄[，、]?\s*/,
  /^[\u4e00-\u9fa5]{2,4}\s*摄影报道[，、]?\s*/,
]

export function stripToSummary(paragraphs, max = 180, title = '') {
  const normTitle = String(title || '').replace(/[\s“”"'·、，。！？：；（）()【】\[\]—-]/g, '')
  const cleaned = []
  for (const raw of paragraphs || []) {
    let text = String(raw || '').replace(/\s+/g, '')
    if (!text) continue
    if (DROP_PARAGRAPH.some((re) => re.test(text))) continue
    for (const re of LEAD_NOISE) text = text.replace(re, '')
    for (const re of INLINE_NOISE) text = text.replace(re, '')
    text = text.replace(SUMMARY_BYLINE, '').replace(SUMMARY_SOURCE, '').replace(SUMMARY_TAIL, '').trim()
    text = stripDateline(text).trim()
    if (!text) continue
    const bare = text.replace(/[\s“”"'·、，。！？：；（）()【】\[\]—-]/g, '')
    if (normTitle && Math.abs(bare.length - normTitle.length) <= 12 && (bare === normTitle || normTitle.includes(bare) || bare.includes(normTitle))) continue
    if (chineseLength(text) < 12 && !/[。！？]/.test(text)) continue
    cleaned.push(text)
    if (cleaned.join('').length > max * 2) break
  }
  const text = cleaned.join('')
  if (!text) return ''
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastStop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'))
  return lastStop > 60 ? cut.slice(0, lastStop + 1) : `${cut}…`
}

export function chineseLength(text) {
  return String(text || '').replace(/\s/g, '').length
}

/* ── 电头 / 目录页识别 ─────────────────────────────── */

/** 开头的时间戳、通讯社电头、记者署名 */
const DATELINE = [
  /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?\s*\d{1,2}:\d{2}(:\d{2})?\s*/,
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*\d{1,2}:\d{2}(:\d{2})?\s*/,
  /^(?:新华社|中新社|中新网|人民网|央视新闻|央视网|光明日报|经济日报|中国青年报|科技日报|中国新闻网)[^。]{0,30}电[（(]记者[^）)]{0,30}[）)]?\s*/,
  /^[\u4e00-\u9fa5]{2,8}(?:社|报|台|网)\s*[^\s，。]{0,10}\d{1,2}月\d{1,2}日(?:电|讯)\s*[（(][^）)]{0,30}[）)]?\s*/,
  /^[^\s，。]{0,16}[（(]记者[^）)]{0,30}[）)]\s*/,
  /^[（(]?[^\s，。]{2,6}(?:社|报|台|网)[^\s，。]{0,8}\d{1,2}月\d{1,2}日(?:电|讯)\s*/,
  /^[（(]?[^\s，。]{2,8}社\s*[^\s，。]{0,10}\d{1,2}月\d{1,2}日\s*/,
  /^[（(]记者\s*[^）)]{1,16}[）)]\s*/,
  /^记者\s*[^\s，。]{1,8}\s*[，。]?\s*/,
  /^(本报讯|本网讯|中新网|人民网|新华网|央视网|光明网)\s*[，。：:]?\s*/,
  /^(央视新闻客户端消息|央视新闻消息|新华社消息|据新华社|据央视新闻|北京日报客户端)[，。：:]?\s*/,
  /^[（(][^）)]{2,20}[）)]\s*(?=[\u4e00-\u9fa5])/,
]

export function stripDateline(text) {
  let out = String(text || '').trim()
  for (let guard = 0; guard < 6; guard += 1) {
    const before = out
    for (const re of DATELINE) out = out.replace(re, '')
    out = out.trim()
    if (out === before) break
  }
  return out
}

/** 目录页 / 索引页特征：成串编号、密集时间戳、连续「N.标题」 */
export function looksLikeCatalog(text) {
  const value = String(text || '')
  if (/\d{1,2}:\d{2}:\d{2}\d+\./.test(value)) return true
  if ((value.match(/\d{1,2}\.\s*20\d{2}年/g) || []).length >= 2) return true
  if ((value.match(/20\d{2}-\d{1,2}-\d{1,2}\d{1,2}:\d{2}/g) || []).length >= 2) return true
  const numbered = value.match(/\d{1,2}\.[\u4e00-\u9fa5A-Za-z]/g) || []
  if (numbered.length >= 6) return true
  return false
}

/**
 * 从摘要里切出适合当条目的 lead：剥电头、跳过与标题重复的句子、
 * 攒够 min 字再收尾，最长 max 字。
 */
export function leadFromSummary(summary, title = '', { min = 42, max = 104 } = {}) {
  const normTitle = normalizeTitle(title)
  let body = String(summary || '')
  for (const re of LEAD_NOISE) body = body.replace(re, '')
  for (const re of INLINE_NOISE) body = body.replace(re, '')
  body = stripDateline(body)
  if (!body) return ''
  const sentences = body.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean)
  const picked = []
  let length = 0
  for (const sentence of sentences) {
    if (DROP_PARAGRAPH.some((re) => re.test(sentence))) continue
    const norm = normalizeTitle(sentence)
    if (!norm) continue
    if (normTitle && (norm === normTitle || normTitle.includes(norm) || norm.includes(normTitle))) continue
    if (chineseLength(sentence) < 12) continue
    // 列表页拼接的残句（「A-->B」）、图片说明里的纯引题
    if (/-->|→|＞＞|>>/.test(sentence)) continue
    if (/^[“"][^”"]{0,20}[”"]。?$/.test(sentence)) continue
    // 句子没收尾就补个句号，避免把两段话黏成一句
    picked.push(/[。！？…”]$/.test(sentence) ? sentence : `${sentence}。`)
    length += chineseLength(sentence)
    if (length >= min) break
  }
  let out = picked.join('')
  if (!out) out = sentences[0] || body
  out = stripDateline(out)
  if (out.length > max) {
    const cut = out.slice(0, max)
    const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'))
    out = stop > min * 0.7 ? cut.slice(0, stop + 1) : `${cut.replace(/[，、；]$/, '')}…`
  }
  return out.trim()
}
