/** 轻量 HTTP：浏览器 UA、超时、体积上限、GBK/GB18030 自动解码、并发闸门。 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

let iconv = null
try {
  iconv = await import('iconv-lite').catch(() => null)
} catch {
  iconv = null
}

function decode(buf, contentType) {
  const probe = buf.subarray(0, 4096).toString('latin1')
  const charset =
    /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '')?.[1] ||
    /charset\s*=\s*["']?([\w-]+)/i.exec(probe)?.[1] ||
    'utf-8'
  const cs = charset.toLowerCase()
  if (/gb2312|gbk|gb18030|gb18030-2000/.test(cs)) {
    try {
      if (iconv && iconv.default) return iconv.default.decode(buf, 'gb18030')
    } catch {
      /* 落到 TextDecoder */
    }
    try {
      return new TextDecoder('gb18030').decode(buf)
    } catch {
      /* 落回 utf-8 */
    }
  }
  return new TextDecoder('utf-8').decode(buf)
}

export class HttpError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function fetchText(url, opts = {}) {
  const { timeout = 16000, maxBytes = 4_000_000, referer, headers = {} } = opts
  const init = {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
      'cache-control': 'no-cache',
      ...(referer ? { referer } : {}),
      ...headers,
    },
  }
  const res = await fetch(url, init)
  if (!res.ok) throw new HttpError(`HTTP ${res.status} ${res.statusText}`, res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  const clipped = buf.subarray(0, maxBytes)
  return {
    status: res.status,
    finalUrl: res.url || url,
    html: decode(clipped, res.headers.get('content-type') || ''),
    bytes: buf.length,
  }
}

/** 固定并发上限的任务池：返回按输入顺序的结果数组，单项失败记 {error} 不抛出。 */
export async function mapLimit(items, limit, worker) {
  const out = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      try {
        out[index] = await worker(items[index], index)
      } catch (error) {
        out[index] = { error: String(error?.message || error) }
      }
    }
  })
  await Promise.all(runners)
  return out
}
