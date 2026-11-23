/**
 * 稿源登记表 —— 只收录《互联网新闻信息稿源单位名单》（2025-08 版，共 1459 家）内的单位。
 *
 * 名单本身只有「单位名称 / 官方微博 / 官方微信 / 应用程序」四列，没有网址；
 * 这里为每个单位登记了实测可用（2026-11 探针，HTTP 200 且能抽出文章链接）的列表页。
 * listName = 名单里的原文单位名，用于合规校验与成稿「来源」署名。
 *
 * category: 央媒 / 河南 / 郑州 / 都市 / 财经 / 科技 / 文化 / 健康 / 国际 / 政务
 * weight:   选题时的默认权重（0-1），越高越优先进入候选池
 */

export const WHITELIST = {
  version: '2025-08',
  publishedAt: '2025-08-14',
  total: 1459,
  url: 'https://www.cac.gov.cn/2025-08/14/c_1756886951643180.htm',
  pdf: 'https://www.cac.gov.cn/rootimages/uploadimg/1756886952378281/1756886952378281.pdf',
}

/** 栏目分节（成稿顺序） */
export const SECTIONS = [
  { id: 'headline', name: '头条', hint: '当日最值得先说的 1-4 件事' },
  { id: 'china', name: '国内', hint: '全国性政策、民生、社会' },
  { id: 'henan', name: '河南', hint: '河南省内' },
  { id: 'zhengzhou', name: '郑州', hint: '郑州本地、衣食住行' },
  { id: 'finance', name: '财经', hint: '钱袋子、产业、就业' },
  { id: 'tech', name: '科技', hint: '新发现、新应用、科普' },
  { id: 'culture', name: '文体', hint: '文化、体育、影视、读书' },
  { id: 'world', name: '国际', hint: '外部世界' },
  { id: 'life', name: '民生', hint: '服务信息、提醒、健康' },
  { id: 'weather', name: '天气', hint: '河南/郑州天气' },
]

const RAW = [
  // ── 央媒（要闻 + 社会 + 国际） ────────────────────────────────
  { id: 'people', name: '人民网', listName: '人民网', category: '央媒', weight: 1,
    list: ['http://www.people.com.cn/', 'http://society.people.com.cn/'] },
  { id: 'xinhua', name: '新华网', listName: '新华网', category: '央媒', weight: 1,
    list: ['http://www.news.cn/', 'http://www.news.cn/society/'] },
  { id: 'cctv', name: '央视网', listName: '央视网', category: '央媒', weight: 1,
    list: ['https://news.cctv.com/'] },
  { id: 'chinanews', name: '中国新闻网', listName: '中国新闻网', category: '央媒', weight: 1,
    list: ['https://www.chinanews.com.cn/', 'https://www.chinanews.com.cn/society/'] },
  { id: 'gmw', name: '光明网', listName: '光明网', category: '央媒', weight: 0.9,
    list: ['https://www.gmw.cn/'] },
  { id: 'cnr', name: '央广网', listName: '央广网', category: '央媒', weight: 0.85,
    list: ['https://www.cnr.cn/'] },
  { id: 'cri', name: '国际在线', listName: '国际在线', category: '国际', weight: 0.7,
    list: ['https://www.cri.cn/'] },
  { id: 'china', name: '中国网', listName: '中国网', category: '央媒', weight: 0.8,
    list: ['http://www.china.com.cn/'] },
  { id: 'chinadaily', name: '中国日报网', listName: '中国日报网', category: '国际', weight: 0.6,
    list: ['https://www.chinadaily.com.cn/'] },
  { id: 'youth', name: '中国青年网', listName: '中国青年网', category: '央媒', weight: 0.8,
    list: ['https://news.youth.cn/'] },
  { id: 'workercn', name: '工人日报', listName: '工人日报', category: '央媒', weight: 0.7,
    list: ['https://www.workercn.cn/'] },
  { id: 'wenming', name: '中国文明网', listName: '中国文明网', category: '文化', weight: 0.6,
    list: ['https://www.wenming.cn/'] },
  { id: 'qstheory', name: '求是网', listName: '求是网', category: '央媒', weight: 0.5,
    list: ['http://www.qstheory.cn/'] },
  { id: 'banyuetan', name: '半月谈', listName: '半月谈', category: '央媒', weight: 0.7,
    list: ['http://www.banyuetan.org/'] },
  { id: 'inewsweek', name: '中国新闻周刊', listName: '中国新闻周刊', category: '都市', weight: 0.8,
    list: ['https://www.inewsweek.cn/'] },
  { id: 'cnwomen', name: '中国妇女报', listName: '中国妇女报', category: '央媒', weight: 0.6,
    list: ['https://www.cnwomen.com.cn/'] },
  { id: 'farmer', name: '农民日报', listName: '农民日报', category: '央媒', weight: 0.55,
    list: ['https://www.farmer.com.cn/'] },
  { id: 'jyb', name: '中国教育报', listName: '中国教育报', category: '央媒', weight: 0.6,
    list: ['http://www.jyb.cn/'] },

  // ── 河南 / 郑州 ──────────────────────────────────────────────
  { id: 'dahe', name: '大河网', listName: '大河网', category: '河南', weight: 1,
    list: ['https://news.dahe.cn/', 'https://www.dahe.cn/'] },
  { id: 'peoplehn', name: '人民网河南频道', listName: '人民网', category: '河南', weight: 0.95,
    list: ['http://henan.people.com.cn/'] },
  { id: 'xinhuanhn', name: '新华网河南频道', listName: '新华网', category: '河南', weight: 0.95,
    list: ['http://www.ha.xinhuanet.com/'] },
  { id: 'zynews', name: '中原网', listName: '中原网', category: '郑州', weight: 1,
    list: ['https://www.zynews.cn/'] },
  { id: 'hnr', name: '映象网', listName: '映象网', category: '河南', weight: 0.85,
    list: ['https://www.hnr.cn/'] },
  { id: 'heandaily', name: '河南日报', listName: '河南日报', category: '河南', weight: 0.95,
    list: ['https://www.henandaily.cn/'] },
  { id: 'kf', name: '开封网', listName: '开封网', category: '河南', weight: 0.5,
    list: ['http://www.kf.cn/'] },
  { id: 'lyd', name: '洛阳网', listName: '洛阳网', category: '河南', weight: 0.5,
    list: ['http://www.lyd.com.cn/'] },

  // ── 都市 / 深度（共鸣类主力） ────────────────────────────────
  { id: 'bjnews', name: '新京报', listName: '新京报', category: '都市', weight: 0.9,
    list: ['https://www.bjnews.com.cn/'] },
  { id: 'infzm', name: '南方周末', listName: '南方周末', category: '都市', weight: 0.9,
    list: ['http://www.infzm.com/'] },
  { id: 'oeeee', name: '南方都市报', listName: '南方都市报', category: '都市', weight: 0.8,
    list: ['https://www.oeeee.com/'] },
  { id: 'yangtse', name: '扬子晚报', listName: '扬子晚报', category: '都市', weight: 0.7,
    list: ['https://www.yangtse.com/'] },
  { id: 'ynet', name: '北京青年报', listName: '北京青年报', category: '都市', weight: 0.8,
    list: ['https://www.ynet.com/'] },
  { id: 'ctdsb', name: '极目新闻', listName: '极目新闻', category: '都市', weight: 0.8,
    list: ['https://www.ctdsb.net/'] },
  { id: 'cqcb', name: '上游新闻', listName: '上游新闻', category: '都市', weight: 0.8,
    list: ['https://www.cqcb.com/'] },
  { id: 'thecover', name: '封面新闻', listName: '封面新闻', category: '都市', weight: 0.75,
    list: ['https://www.thecover.cn/'] },

  // ── 财经 ────────────────────────────────────────────────────
  { id: 'yicai', name: '第一财经', listName: '第一财经', category: '财经', weight: 0.9,
    list: ['https://www.yicai.com/'] },
  { id: 'jiemian', name: '界面新闻', listName: '界面新闻', category: '财经', weight: 0.85,
    list: ['https://www.jiemian.com/'] },
  { id: 'nbd', name: '每日经济新闻', listName: '每日经济新闻', category: '财经', weight: 0.8,
    list: ['https://www.nbd.com.cn/'] },
  { id: 'stcn', name: '证券时报', listName: '证券时报', category: '财经', weight: 0.7,
    list: ['https://www.stcn.com/'] },
  { id: 'cs', name: '中国证券报', listName: '中国证券报', category: '财经', weight: 0.7,
    list: ['https://www.cs.com.cn/'] },
  { id: 'ce', name: '中国经济网', listName: '中国经济网', category: '财经', weight: 0.75,
    list: ['http://www.ce.cn/'] },

  // ── 科技 / 科普 / 健康 / 文化 ────────────────────────────────
  { id: 'stdaily', name: '科技日报', listName: '科技日报', category: '科技', weight: 0.85,
    list: ['https://www.stdaily.com/'] },
  { id: 'kepuchina', name: '科普中国', listName: '科普中国', category: '科技', weight: 0.85,
    list: ['https://www.kepuchina.cn/'] },
  { id: 'cas', name: '中国科学报', listName: '中国科学报', category: '科技', weight: 0.7,
    list: ['https://www.cas.cn/'] },
  { id: 'jkb', name: '健康报', listName: '健康报', category: '健康', weight: 0.7,
    list: ['http://www.jkb.com.cn/'] },
  { id: 'ctnews', name: '中国旅游报', listName: '中国旅游报', category: '文化', weight: 0.6,
    list: ['http://www.ctnews.com.cn/'] },
  { id: 'zgqxb', name: '中国气象新闻网', listName: '中国气象新闻网', category: '政务', weight: 0.5,
    list: ['http://www.zgqxb.com.cn/'] },
]

export const SOURCES = RAW.map((s) => ({
  ...s,
  enabled: true,
  region: '全国',
  kind: 'web-list',
}))

export function sourceById(id) {
  return SOURCES.find((s) => s.id === id)
}

/** 供 UI 展示的分类顺序 */
export const CATEGORIES = ['央媒', '河南', '郑州', '都市', '财经', '科技', '文化', '健康', '国际', '政务']

/* ── 稿源配置状态（dataDir/sources.json v2）────────────────────────────
 * 旧版是扁平 map `{ id: true/false }`，这里统一升级成：
 *   { version: 2, enabled: { [id]: boolean }, removed: [id], custom: [源] }
 * - enabled：勾选状态（不写视为启用）
 * - removed：从内置名单里删掉的来源，可恢复，抓取时跳过
 * - custom ：用户手动添加的来源，与内置源走同一套「列表页 → 正文」抓取
 * 自定义源字段与内置源一致：{ id, name, listName, category, weight, list }
 */

const CUSTOM_ID = /^[a-z0-9][a-z0-9-]{1,39}$/i

function isHttpUrl(value) {
  try {
    const u = new URL(String(value || '').trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** 由「名称 + 首个列表页」派生稳定 id，刷新/重装后不会漂移 */
export function customSourceId(name, url) {
  const seed = `${String(name || '').trim()}|${String(url || '').trim()}`
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return `custom-${h.toString(36)}`
}

function normalizeCustom(row, index) {
  if (!row || typeof row !== 'object') return null
  const name = String(row.name || '').trim().slice(0, 40)
  if (!name) return null
  const raw = Array.isArray(row.list) ? row.list : [row.list]
  const list = [...new Set(raw.map((u) => String(u || '').trim()).filter(isHttpUrl))].slice(0, 3)
  if (!list.length) return null
  const id = CUSTOM_ID.test(String(row.id || '').trim()) ? String(row.id).trim() : customSourceId(name, list[0])
  const category = CATEGORIES.includes(row.category) ? row.category : '都市'
  const weight = Math.max(0.4, Math.min(1.6, Number(row.weight) || 1))
  return { id: id || `custom-${index}`, name, listName: String(row.listName || name).trim().slice(0, 40) || name, category, weight, list }
}

export function normalizeSourceState(raw) {
  const state = { version: 2, enabled: {}, removed: [], custom: [] }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state
  const isV2 = raw.version === 2 || raw.enabled !== undefined || Array.isArray(raw.removed) || Array.isArray(raw.custom)
  if (!isV2) {
    // 兼容旧版扁平 map
    for (const [id, on] of Object.entries(raw)) if (typeof on === 'boolean') state.enabled[id] = on
    return state
  }
  if (raw.enabled && typeof raw.enabled === 'object' && !Array.isArray(raw.enabled)) {
    for (const [id, on] of Object.entries(raw.enabled)) if (typeof on === 'boolean') state.enabled[id] = on
  }
  if (Array.isArray(raw.removed)) {
    state.removed = [...new Set(raw.removed.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))]
  }
  if (Array.isArray(raw.custom)) {
    const seen = new Set()
    raw.custom.forEach((row, index) => {
      const item = normalizeCustom(row, index)
      if (item && !seen.has(item.id)) {
        seen.add(item.id)
        state.custom.push(item)
      }
    })
  }
  // 清掉脏键：已删来源、以及已不存在的自定义源的勾选状态不再保留
  const alive = new Set([...SOURCES.map((s) => s.id), ...state.custom.map((s) => s.id)])
  for (const id of Object.keys(state.enabled)) {
    if (state.removed.includes(id) || !alive.has(id)) delete state.enabled[id]
  }
  return state
}

/** 生效的稿源清单：内置（去掉已删的）+ 自定义，每项带 builtin/enabled */
export function effectiveSources(raw) {
  const state = normalizeSourceState(raw)
  const removed = new Set(state.removed)
  const builtin = SOURCES.filter((s) => !removed.has(s.id)).map((s) => ({
    ...s,
    builtin: true,
    enabled: state.enabled[s.id] !== false,
  }))
  const custom = state.custom.map((s) => ({
    ...s,
    builtin: false,
    enabled: state.enabled[s.id] !== false,
  }))
  return [...builtin, ...custom]
}
