/** 本地预览：不起 DSH，直接把插件的 webServer 处理器架在 7801 端口。 */
import { createServer } from 'node:http'
import { apply } from '../lib/index.js'

const routes = []
const fakeWs = {
  rootURL: 'http://127.0.0.1:7801',
  register(spec) {
    routes.push(spec)
    return () => {}
  },
}

const ctx = {
  logger: Object.assign((scope) => console, { info: console.log, warn: console.warn }),
  interval: () => () => {},
  inject: (deps, cb) => cb({ webServer: fakeWs }),
  on: () => {},
  get: () => null,
}

apply(ctx, { dataDir: 'D:/DeepSeek Harness/.tmp/news3min/data', autoFetch: false })

const server = createServer((req, res) => {
  for (const route of routes) {
    const hit = route.kind === 'prefix' ? req.url.startsWith(route.path) : req.url === route.path
    if (hit) return route.handler(req, res)
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('404')
})

server.listen(7801, '127.0.0.1', () => {
  console.log('preview: http://127.0.0.1:7801/dsh-news-3min/')
})
