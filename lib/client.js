/**
 * 客户端半体（classic script！宿主经 window.__ModuleLoader__.load 加载，
 * 不能用 ESM export——SyntaxError 会拖垮同 combo 的全部插件）。
 *
 * 在左侧工作区导航挂一行「新闻三分钟」，点开是整屏编稿台（iframe → /dsh-news-3min/）。
 * 每一步都包 try/catch：任何失败不得拖垮 dsh 启动。
 */
;(() => {
  'use strict'

  const TAB_ID = 'news-3min'
  const PANEL_TITLE = '新闻三分钟'
  const READER_URL = '/dsh-news-3min/'

  window.__ModuleLoader__.load({
    id: 'dsh-news-3min',
    factory: (require) => {
      const React = require('react')
      const h = React.createElement

      const inject = ['slots']

      function apply(ctx) {
        const log = ctx && typeof ctx.logger === 'function' ? ctx.logger('news-3min') : console

        // dsh-app:// 下 iframe 内 fetch 会被挂起；必须用 webServer 的
        // http://127.0.0.1:port 绝对地址，页面才落在 http origin（fetch 同源放行）。
        let readerUrl = READER_URL
        ctx.inject(['webServer'], (scoped) => {
          try {
            const root = scoped && scoped.webServer && scoped.webServer.rootURL
            if (root) readerUrl = String(root).replace(/\/+$/, '') + READER_URL
          } catch (e) {
            log.warn(`webServer.rootURL 不可用，iframe 用相对路径：${String(e)}`)
          }
        })

        const themeName = () => (document.body && document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light')

        const EditorBody = () => {
          const ref = React.useRef(null)
          React.useEffect(() => {
            const push = () => {
              try {
                if (ref.current && ref.current.contentWindow) {
                  ref.current.contentWindow.postMessage({ type: 'n3-theme', theme: themeName() }, '*')
                }
              } catch { /* iframe 未就绪，等下次 mutation */ }
            }
            push()
            const mo = new MutationObserver(push)
            if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
            return () => mo.disconnect()
          }, [])
          return h('iframe', {
            ref,
            src: `${readerUrl}?theme=${themeName()}`,
            style: { width: '100%', height: '100%', border: 'none', background: 'transparent' },
            title: PANEL_TITLE,
          })
        }

        const NavIcon = (owner = {}) => h('svg', {
          width: owner.size ?? 16,
          height: owner.size ?? 16,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
          h('path', { d: 'M2 3.2h12v9.6H2z' }),
          h('path', { d: 'M4.4 6.2h4.6M4.4 8.4h4.6M4.4 10.6h3' }),
          h('path', { d: 'M11.2 6.2h1.2M11.2 8.4h1.2M11.2 10.6h1.2' }))

        ctx.inject(['slots'], (scoped) => {
          try {
            const slotsSvc = (ctx && ctx.slots) || (scoped && scoped.slots)
            if (!slotsSvc || typeof slotsSvc.register !== 'function') {
              log.warn('slots 服务不可用，左侧栏入口未注册')
              return
            }
            let registered = false
            const registerAll = () => {
              if (registered) return
              registered = true
              // 主面板：点左侧栏这一行时占满工作区
              slotsSvc.register({ name: 'main', key: TAB_ID }, EditorBody)
              // 左侧工作区导航行（真实契约，不是 sidebarRightTabs.guide）
              slotsSvc.register(
                { name: 'sidebar.panellist', id: TAB_ID, order: 58, label: () => PANEL_TITLE },
                NavIcon,
              )
              log.info('左侧栏入口已注册：新闻三分钟')
            }
            // 槽位就绪后再注册（注册必须落在 inject 的同步窗口内，异步回调会被宿主丢弃）
            if (typeof slotsSvc.inject === 'function') slotsSvc.inject('sidebar.panellist', registerAll)
            registerAll()
          } catch (e) {
            log.warn(`左侧栏入口注册失败（不影响其他功能）：${String(e)}`)
          }
        })

        // 设置 → 插件 里给一张小卡片，说明入口与数据位置
        ctx.inject(['slots'], (scoped) => {
          try {
            const slotsSvc = (ctx && ctx.slots) || (scoped && scoped.slots)
            if (!slotsSvc || typeof slotsSvc.register !== 'function') return
            const Card = () => h('div', { style: { padding: 12, lineHeight: 1.7 } }, [
              h('h4', { key: 't', style: { margin: '0 0 6px' } }, PANEL_TITLE),
              h('p', { key: 'd', style: { color: '#888', margin: '0 0 8px' } },
                '按中原网「每天3分钟 尽览天下事」栏目形式，工作区内抓取、打分、成稿。稿源限定在 2025 版《互联网新闻信息稿源单位名单》内。'),
              h('a', { key: 'l', href: `${readerUrl}`, target: '_blank', rel: 'noopener' }, '在浏览器里打开编稿台 →'),
            ])
            scoped.slots.inject('settings.plugins.tab', () =>
              slotsSvc.register({ name: 'settings.plugins.tab', key: TAB_ID }, Card))
          } catch (e) {
            log.warn(`设置卡片注册失败（不影响其他功能）：${String(e)}`)
          }
        })
      }

      return { inject, apply }
    },
  })
})()
