/**
 * 启动诊断日志：把插件加载/激活过程中的关键节点写到磁盘，
 * 因为 DSH 桌面端不保留宿主 stdout，插件激活失败时只能靠这个定位。
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DIR = join(homedir(), '.dsh', 'news-3min')

export function bootLog(step, detail) {
  try {
    mkdirSync(DIR, { recursive: true })
    const extra = detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
    appendFileSync(join(DIR, 'boot.log'), `${new Date().toISOString()} pid=${process.pid} ${step}${extra}\n`, 'utf8')
  } catch {
    /* 诊断日志失败不能影响插件 */
  }
}
