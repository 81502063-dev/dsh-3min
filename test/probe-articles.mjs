import { fetchText } from '../lib/http.js'
import { parseList, parseArticle } from '../lib/extract.js'
import { SOURCES } from '../lib/sources.js'

const pick = process.argv.slice(2)
const targets = SOURCES.filter((s) => (pick.length ? pick.includes(s.id) : ['people', 'xinhua', 'chinanews', 'dahe', 'zynews', 'yicai', 'bjnews', 'kepuchina'].includes(s.id)))

for (const src of targets) {
  for (const listUrl of src.list.slice(0, 1)) {
    let list
    try {
      const r = await fetchText(listUrl)
      list = parseList(r.html, r.finalUrl, { limit: 4 })
      console.log(`\n### ${src.name}  list=${listUrl}  status=${r.status}  links=${list.length}`)
    } catch (e) {
      console.log(`\n### ${src.name}  LIST ERR ${e.message}`)
      continue
    }
    for (const link of list.slice(0, 3)) {
      try {
        const art = await fetchText(link.url)
        const a = parseArticle(art.html, art.finalUrl)
        const when = a.publishedAt ? new Date(a.publishedAt).toISOString().slice(0, 16).replace('T', ' ') : 'NO-TIME'
        console.log(`- [${when}] ${a.title.slice(0, 40)} | paras=${a.paragraphs.length} chars=${a.text.length} src=${a.sourceName || '-'}`)
        console.log(`  ${a.text.slice(0, 110)}`)
      } catch (e) {
        console.log(`- ART ERR ${link.url} ${e.message}`)
      }
    }
  }
}
