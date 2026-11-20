/** 农历/日期文案（Intl 中文历法，ICU 内置，无需外部数据） */

const DAY_CN = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']

function lunarParts(date) {
  try {
    const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' })
    const parts = fmt.formatToParts(date)
    const get = (type) => parts.find((p) => p.type === type)?.value || ''
    return { yearName: get('yearName'), month: get('month'), day: Number(get('day') || 0) }
  } catch {
    return { yearName: '', month: '', day: 0 }
  }
}

/** 「十月十二」（不含年） */
export function lunarMonthDay(date = new Date()) {
  const { month, day } = lunarParts(date)
  if (!month || !day) return ''
  return `${month}${DAY_CN[day - 1] || day}`
}

/** 「丙午年十月十二」 */
export function lunarText(date = new Date()) {
  const { yearName } = lunarParts(date)
  const md = lunarMonthDay(date)
  return md ? `${yearName}年${md}` : ''
}

export function solarYmd(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

export function weekdayCn(date = new Date()) {
  const map = { 周日: '星期日', 周一: '星期一', 周二: '星期二', 周三: '星期三', 周四: '星期四', 周五: '星期五', 周六: '星期六' }
  try {
    const wd = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'Asia/Shanghai' }).format(date)
    return map[wd] || wd
  } catch {
    return map[`周${'日一二三四五六'[date.getDay()]}`] || ''
  }
}

function utcNoonOf(day) {
  const [y, m, d] = String(day).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0)) // 北京时间 12:00，避开跨日
}

/** 参照栏目的首行：2026年11月20日 农历十月十二  星期五 */
export function dateLineOf(day) {
  const date = utcNoonOf(day)
  const [y, m, d] = String(day).split('-').map(Number)
  return `${y}年${m}月${d}日 农历${lunarMonthDay(date)}  ${weekdayCn(date)}`
}

export function dateLine(date = new Date()) {
  return dateLineOf(solarYmd(date))
}
