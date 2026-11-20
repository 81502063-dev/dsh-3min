import { fetchText } from '../lib/http.js'
import { parseList, parseArticle } from '../lib/extract.js'

const urls = process.argv.slice(2)
for (const url of urls) {
  try {
    const page = await fetchText(url, { timeout: 15000 })
    const links = parseList(page.html, page.finalUrl, { limit: 6 })
    console.log(`\n== ${url} → ${page.status} ${page.bytes}b, ${links.length} links`)
    for (const link of links.slice(0, 6)) console.log(`   ${link.title.slice(0, 40)} | ${link.url}`)
    if (links[0]) {
      const art = await fetchText(links[0].url, { timeout: 15000, referer: url })
      const parsed = parseArticle(art.html, art.finalUrl)
      console.log(`   [article] ${parsed.title.slice(0, 40)} | ${parsed.paragraphs.length}p | ${parsed.text.length}字 | ${parsed.publishedAt ? new Date(parsed.publishedAt).toISOString() : 'no-date'}`)
    }
  } catch (error) {
    console.log(`\n== ${url} → ERR ${String(error?.message || error).slice(0, 120)}`)
  }
}
