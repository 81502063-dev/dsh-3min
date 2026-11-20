import { createStore } from '../lib/store.js'
import { createService } from '../lib/service.js'
import { SOURCES } from '../lib/sources.js'
import { solarYmd } from '../lib/lunar.js'

const ids = process.argv.slice(2)
const only = ids.length ? new Set(ids) : null
const overrides = {}
if (only) for (const s of SOURCES) if (!only.has(s.id)) overrides[s.id] = false

const dataDir = 'D:/DeepSeek Harness/.tmp/news3min/data'
const store = createStore(dataDir)
await store.init()
const settings = { aiEnabled: false, perSource: 6, concurrency: 8, maxCandidates: 220, fetchTime: '05:10', autoFetch: false, enabled: true }
const service = createService({
  ctx: {},
  store,
  ai: { available: () => false },
  getSettings: () => settings,
  logger: { info: (m) => console.log('·', m), warn: console.log },
})

const day = solarYmd()
const t0 = Date.now()
const started = await service.runFetch({ day, overrides })
console.log('done', started, `${Math.round((Date.now() - t0) / 1000)}s`)

const dayData = await store.readDay(day)
console.log('sources:', dayData.sources.filter((s) => s.items > 0).length + '/' + dayData.sources.length)
const bySection = {}
for (const c of dayData.candidates) bySection[c.section] = (bySection[c.section] || 0) + 1
console.log('sections:', bySection)
console.log('top 20:')
for (const c of dayData.candidates.slice(0, 20)) {
  console.log(`  ${String(c.total).padStart(5)} [${c.section}] qu${c.scores.qu}/you${c.scores.you}/gong${c.scores.gong} ${c.title.slice(0, 34)} — ${c.sourceName} ${c.publishedAt ? new Date(c.publishedAt).toLocaleString('zh-CN', { hour12: false }) : 'no-time'}`)
}
