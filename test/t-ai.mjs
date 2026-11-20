/** 用对象型 provider + 异步 listModels（DSH 真实形态）验证路由解析与可用性判断 */
import { createAI } from '../lib/ai.js'

const ctx = {
  get(name) {
    if (name !== 'llm') return null
    return {
      listProviders: () => [{ id: 'deepseek-account' }, { id: 'llm-pi-ai' }],
      // DSH 里 listModels 是异步的；传非字符串会返回 rejected promise（曾拖崩宿主）
      async listModels(provider) {
        if (typeof provider !== 'string') throw new Error(`no adapter registered for provider "${provider}"`)
        return [{ id: 'deepseek-flash' }, { id: 'deepseek-pro' }]
      },
    }
  },
}

const ai = createAI(ctx, { logger: { warn: console.warn } })
console.log('available:', await ai.available())
console.log('route:', JSON.stringify(await ai.route()))

const ctx2 = {
  get: (n) =>
    n === 'llm'
      ? {
          listProviders() {
            throw new Error('boom')
          },
        }
      : null,
}
const ai2 = createAI(ctx2, { logger: { warn: () => {} } })
console.log('available(broken):', await ai2.available())

if (!(await ai.available()) || (await ai.route())?.provider !== 'deepseek-account') {
  console.error('FAIL: 没选出正确 provider')
  process.exit(1)
}
if ((await ai2.available()) !== false) {
  console.error('FAIL: 坏 provider 时应返回 false')
  process.exit(1)
}
console.log('OK')
