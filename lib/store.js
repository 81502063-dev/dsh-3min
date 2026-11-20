/** 按天落盘的本地库：days/<YYYY-MM-DD>.json + settings.json + sources.json（全部原子写）。 */

import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, data, 'utf8')
  await rename(tmp, file)
}

export function createStore(dataDir) {
  const daysDir = join(dataDir, 'days')
  let ready = null

  const ensure = () => {
    if (!ready) ready = mkdir(daysDir, { recursive: true })
    return ready
  }

  async function readJSON(file, fallback) {
    try {
      return JSON.parse(await readFile(file, 'utf8'))
    } catch {
      return fallback
    }
  }

  return {
    dataDir,

    async init() {
      await ensure()
    },

    async readDay(day) {
      await ensure()
      const data = await readJSON(join(daysDir, `${day}.json`), null)
      if (!data) return null
      data.candidates = Array.isArray(data.candidates) ? data.candidates : []
      data.draft = data.draft && typeof data.draft === 'object' ? data.draft : { items: [] }
      data.draft.items = Array.isArray(data.draft.items) ? data.draft.items : []
      return data
    },

    async writeDay(data) {
      await ensure()
      data.updatedAt = Date.now()
      await writeAtomic(join(daysDir, `${data.day}.json`), JSON.stringify(data))
      return data
    },

    async listDays(limit = 60) {
      await ensure()
      const names = (await readdir(daysDir)).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
      names.sort().reverse()
      const out = []
      for (const name of names.slice(0, limit)) {
        const full = join(daysDir, name)
        try {
          const info = await stat(full)
          const data = await readJSON(full, null)
          out.push({
            day: name.replace('.json', ''),
            bytes: info.size,
            candidates: data?.candidates?.length || 0,
            picked: data?.draft?.items?.length || 0,
            fetchedAt: data?.fetchedAt || 0,
          })
        } catch {
          /* 跳过坏文件 */
        }
      }
      return out
    },

    async pruneDays(keep = 120) {
      await ensure()
      const names = (await readdir(daysDir)).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse()
      for (const name of names.slice(keep)) {
        try {
          await unlink(join(daysDir, name))
        } catch {
          /* 忽略 */
        }
      }
    },

    async readSettings(fallback = {}) {
      await ensure()
      return readJSON(join(dataDir, 'settings.json'), fallback)
    },

    async writeSettings(value) {
      await ensure()
      await writeAtomic(join(dataDir, 'settings.json'), JSON.stringify(value, null, 2))
      return value
    },

    async readSources(fallback = {}) {
      await ensure()
      return readJSON(join(dataDir, 'sources.json'), fallback)
    },

    async writeSources(value) {
      await ensure()
      await writeAtomic(join(dataDir, 'sources.json'), JSON.stringify(value, null, 2))
      return value
    },
  }
}
