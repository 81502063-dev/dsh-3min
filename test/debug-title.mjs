import { fetchText } from '../lib/http.js'
import { parseList, parseArticle } from '../lib/extract.js'

const r = await fetchText('https://www.chinanews.com.cn/')
const list = parseList(r.html, r.finalUrl, { limit: 3 })
const a = await fetchText(list[0].url)
const art = parseArticle(a.html, a.finalUrl)
console.log('TITLE:', JSON.stringify(art.title))
console.log('URL:', art.url)
console.log('<title>:', /<title[^>]*>([\s\S]*?)<\/title>/i.exec(a.html)?.[1])
console.log('og:title:', /og:title[^>]*content="([^"]*)"/i.exec(a.html)?.[1])
console.log('h1:', /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(a.html)?.[1]?.slice(0, 80))
console.log('PARAS:')
art.paragraphs.slice(0, 6).forEach((p, i) => console.log(` ${i}: ${p.slice(0, 90)}`))
