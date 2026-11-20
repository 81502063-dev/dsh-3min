import { stripToSummary } from '../lib/classify.js'

const p3 =
  '新华社深圳11月19日电(记者温馨、李思佳)11月19日上午，国家主席习近平夫人彭丽媛同出席亚太经合组织第三十三次领导人非正式会议的经济体领导人或代表配偶在深圳湾文化广场举行集体活动。'

const SUMMARY_BYLINE = /^[（(]?(?:本报讯|本网讯|记者\s*[^）)]{0,12}|新华社[^。]{0,20}|[^\s，。]{2,6}\s*通讯员\s*[^）)]{0,12})[）)]?/
const SUMMARY_SOURCE = /(?:来源[：:]|稿源[：:]|编辑[：:])\s*[^，。！？]{0,24}$/
const SUMMARY_TAIL = /[-—–|｜]\s*[^\s\-—–|｜]{2,14}(?:网|报|新闻|客户端|电视台|广播)\s*$/

let text = p3
console.log('0:', text.slice(0, 30))
text = text.replace(SUMMARY_BYLINE, '')
console.log('1 byline:', text.slice(0, 30))
text = text.replace(SUMMARY_SOURCE, '')
console.log('2 source:', text.slice(0, 30))
text = text.replace(SUMMARY_TAIL, '')
console.log('3 tail:', text.slice(0, 30))

console.log('stripToSummary:', stripToSummary([p3], 200, '彭丽媛同配偶参观主题展').slice(0, 30))
