import { stripToSummary, leadFromSummary, guessSection } from '../lib/classify.js'

const A = stripToSummary(
  [
    '彭丽媛同…主题展-中新网',
    '2026年11月19日 18:56 来源：新华网',
    '11月19日上午，国家主席习近平夫人彭丽媛同配偶在深圳湾文化广场举行集体活动。彭丽媛热情迎接来宾。',
  ],
  200,
  '彭丽媛同配偶参观主题展',
)
console.log('A:', A)

const B = stripToSummary(
  ['发布时间：2026-11-20近日，内蒙古呼和浩特市玉泉区石东路小学校园科学节活动现场，学生在与智能机器狗互动。'],
  200,
  'AI时代，学校治理如何转型升级',
)
console.log('B:', B)

const C = stripToSummary(
  ['前述内容由第一财经“星翼大模型”智能生成，相关AI内容力求但不保证准确性、时效性、完整性等。', '11月19日，老挝青年在云南西双版纳学习织锦技艺。'],
  200,
  '老挝织女',
)
console.log('C:', C)

console.log('D:', leadFromSummary(B, 'AI时代，学校治理如何转型升级'))
console.log('E:', guessSection({ title: '11月18日，国家主席习近平在深圳会见俄罗斯总统普京', summary: '' }, { category: '央媒' }))
console.log('F:', leadFromSummary('张毅飞摄“豫荐未来青春启航”。11月18日，全国人力资源市场高校毕业生就业服务专项行动拉开序幕。', '郑州科技学院双选会'))
