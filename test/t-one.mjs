import { fetchText } from '../lib/http.js'
import { parseArticle } from '../lib/extract.js'
import { stripToSummary, leadFromSummary } from '../lib/classify.js'

const url = process.argv[2]
const page = await fetchText(url, { timeout: 15000 })
const art = parseArticle(page.html, page.finalUrl)
console.log('title:', art.title)
console.log('paragraphs:')
art.paragraphs.slice(0, 6).forEach((p, i) => console.log(` ${i}: ${JSON.stringify(p.slice(0, 120))}`))
const summary = stripToSummary(art.paragraphs, 200, art.title)
console.log('summary:', summary)
console.log('lead:', leadFromSummary(summary, art.title))
