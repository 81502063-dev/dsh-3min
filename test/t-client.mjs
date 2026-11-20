/** 用假的 __ModuleLoader__ / React / ctx 跑一遍 lib/client.js，确认左侧栏注册不抛错。 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

const registrations = []
const injected = []
let factory = null

const fakeRequire = (name) => {
  if (name === 'react') {
    return {
      createElement: (type, props, ...children) => ({ type, props, children }),
      useRef: (v) => ({ current: v }),
      useEffect: () => {},
    }
  }
  throw new Error(`unexpected require: ${name}`)
}

globalThis.window = {
  __ModuleLoader__: {
    load({ id, factory: f }) {
      console.log('load id =', id)
      factory = f
    },
  },
}
globalThis.document = { body: { hasAttribute: () => false } }
globalThis.MutationObserver = class { observe() {} disconnect() {} }

// eslint-disable-next-line no-new-func
new Function(src)()

const mod = factory(fakeRequire)
console.log('inject =', JSON.stringify(mod.inject))

const slots = {
  register(spec, comp) {
    registrations.push({ name: spec.name, key: spec.key || spec.id, isFn: typeof comp === 'function' })
    return () => {}
  },
  inject(name, cb) {
    injected.push(name)
    cb()
  },
}

const ctx = {
  logger: (scope) => ({ info: (m) => console.log(`[${scope}] ${m}`), warn: (m) => console.log(`[${scope}] WARN ${m}`) }),
  slots,
  inject(deps, cb) {
    if (deps.includes('webServer')) return cb({ webServer: { rootURL: 'http://127.0.0.1:64242' } })
    return cb({ slots })
  },
}

mod.apply(ctx)

console.log('registrations:', JSON.stringify(registrations))
console.log('injected slots:', JSON.stringify(injected))
const hasMain = registrations.some((r) => r.name === 'main' && r.key === 'news-3min')
const hasNav = registrations.some((r) => r.name === 'sidebar.panellist' && r.key === 'news-3min')
const hasSettings = registrations.some((r) => r.name === 'settings.plugins.tab')
console.log(`main=${hasMain} nav=${hasNav} settings=${hasSettings}`)
if (!hasMain || !hasNav) {
  console.error('FAIL: 左侧栏入口未注册')
  process.exit(1)
}
console.log('OK')
