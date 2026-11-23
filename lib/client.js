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
            // 槽位必须先「已声明」才能 register，否则 SlotCore 直接抛
            // `slot "<name>" is not declared`；而 inject 的延迟回调只跑一次、
            // 抛错即被永久退役。所以注册只能写在 inject 的回调里，绝不能在
            // 槽位声明之前抢跑（抢跑抛错后 flag 已置位，回调再进来也直接 return，
            // 这一行就永久消失了——这正是「重启后插件栏目里没有它」的原因）。
            const bindSlot = (name, options, component) => {
              if (typeof slotsSvc.inject === 'function') {
                slotsSvc.inject(name, () => slotsSvc.register(options(), component))
                return
              }
              // 极旧宿主没有 inject：只能赌槽位已声明
              slotsSvc.register(options(), component)
            }
            // 主面板：点左侧栏这一行时占满工作区
            bindSlot('main', () => ({ name: 'main', key: TAB_ID }), EditorBody)
            // 左侧工作区导航行（真实契约，不是 sidebarRightTabs.guide）
            bindSlot(
              'sidebar.panellist',
              () => ({ name: 'sidebar.panellist', id: TAB_ID, order: 58, label: () => PANEL_TITLE }),
              NavIcon,
            )
            log.info('左侧栏入口已绑定（槽位声明后注册）：新闻三分钟')
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
