/**
 * 用更贴近真实 cordis 的桩 ctx 调用 apply()：logger 可调用、服务按需注入。
 * 目的：抓出「加载即抛异常 → entry did not activate」的真实位置。
 */
const logs = []
const mkLogger = (scope) => ({
  info: (m) => logs.push(['info', m]),
  warn: (m) => logs.push(['warn', m]),
  error: (m) => logs.push(['error', m]),
  debug: () => {},
  scope,
})

const services = {
  timer: { setTimeout: () => 0, setInterval: () => 0 },
  tools: { register: (tool) => { logs.push(['tool', tool?.name || 'anonymous']); return () => {} } },
  webServer: {
    register: (route) => {
      logs.push(['route', `${route.kind} ${route.path}`])
      return () => {}
    },
    rootURL: 'http://127.0.0.1:7801',
  },
  llm: null,
}

function makeCtx() {
  const ctx = {
    get: (key) => services[key] ?? null,
    on: () => () => {},
    interval: () => () => {},
    inject: (deps, cb) => {
      const scoped = { ...ctx, ...Object.fromEntries(deps.map((d) => [d, services[d]])) }
      try {
        const result = cb(scoped)
        if (result && typeof result.catch === 'function') {
          result.catch((e) => logs.push(['reject', String(e?.message || e)]))
        }
      } catch (e) {
        logs.push(['throw-in-inject', String(e?.stack || e?.message || e)])
      }
      return () => {}
    },
  }
  ctx.logger = (scope) => mkLogger(scope)
  return ctx
}

const { apply, name, inject } = await import('../lib/index.js')
console.log('name:', name, '| inject:', JSON.stringify(inject))

try {
  const ret = apply(makeCtx(), { dataDir: 'D:/DeepSeek Harness/.tmp/news3min/apply-test', autoFetch: false })
  if (ret && typeof ret.catch === 'function') ret.catch((e) => logs.push(['apply-reject', String(e?.message || e)]))
  console.log('apply() returned OK')
} catch (error) {
  console.error('apply() THREW:\n' + (error?.stack || error))
  process.exitCode = 1
}

await new Promise((r) => setTimeout(r, 400))
console.log('--- logs ---')
for (const [level, msg] of logs) console.log(`${level}: ${String(msg).slice(0, 200)}`)
const bad = logs.filter(([l]) => ['error', 'throw-in-inject', 'apply-reject', 'reject'].includes(l))
console.log(bad.length ? `FAIL: ${bad.length} 个异常` : 'OK: 无异常')
process.exit(bad.length || process.exitCode ? 1 : 0)
