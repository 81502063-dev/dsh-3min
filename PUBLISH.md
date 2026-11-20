# 发布清单（GitHub → 插件市场 → npm）

插件市场（`dshmarket`）的收录规则来自 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)：
**一个插件 = 一个公开 GitHub 仓库 + 一个 YAML 条目文件 PR**。npm 发布是锦上添花（让 `dsh plugin add dsh-news-3min` 也能装），不是入市必需。

当前仓库：<https://github.com/81502063-dev/dsh-3min>（public，已推送 `main`，topics 已设 `dsh-plugin` / `dsh` / `deepseek-harness` / `news` / `wechat`）。

## 0. 仓库要求（官方自动检查）

- `package.json` 里有 `dsh.bundle` 清单 ← 本仓库已有 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`
- 仓库**至少满 1 天**才能投稿（新仓库会被打回，隔天重投即可）
- 仓库要打上 **`dsh-plugin`** topic

## 1. 建仓库并推送

```powershell
# 在 GitHub 上新建 public 空仓库 dsh-3min（不要勾选任何初始化文件）
cd "D:\DeepSeek Harness\news-3min-plugin"
git remote add origin https://github.com/81502063-dev/dsh-3min.git
git branch -M main
git config http.sslBackend openssl   # 本机 schannel 报 SEC_E_NO_CREDENTIALS 时的必需项
git push -u origin main
```

推送后在仓库页右上 **About → Topics** 添加 `dsh-plugin`（可再加 `news`、`wechat`、`dsh`）。

> 全自动版本：`$env:GITHUB_TOKEN='github_pat_...'; $env:REPO_OWNER='81502063-dev'; node ..\.tmp\publish-github.mjs`
> 脚本会建仓、设 topics、推送并回读远端 HEAD（注意：脚本内部 spawn git 会被沙箱 EPERM，push 那一步要在 PowerShell 里直接跑）。

## 2. 投稿到插件市场

Fork 并克隆 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
新增**一个文件** `data/plugins/81502063-dev__dsh-3min.yml`：

```yaml
url: https://github.com/81502063-dev/dsh-3min
name: 81502063-dev/dsh-3min
category: workflow
description:
  en: 'News briefing desk for the “3 minutes a day” column: fetches only from China’s official news-source whitelist, scores each story on interesting, useful and resonant, then drafts and exports a 20-item issue.'
  zh: '按「每天3分钟」栏目形式做新闻简报：只从《互联网新闻信息稿源单位名单》内抓取，按有趣/有用/有共鸣打分，一键成稿并导出公众号 HTML。'
icon: https://raw.githubusercontent.com/81502063-dev/dsh-3min/main/docs/screenshot.png
```

然后开 PR。合并后市场卡片（`dshmarket` 的 Discover / 插件页）会自动出现，通常一天内生效。

> 描述里若出现英文冒号加空格（`: `），整行必须加引号，否则 YAML 会解析成嵌套键——上面 `en` 已加单引号。
> 全自动版本（仓库满 1 天后）：`$env:GITHUB_TOKEN='github_pat_...'; node ..\.tmp\open-market-pr.mjs`
> 现成的条目文件也在 `..\.tmp\81502063-dev__dsh-3min.yml`。

## 3. 发布到 npm（可选）

```powershell
cd "D:\DeepSeek Harness\news-3min-plugin"
npm login                 # 浏览器/一次性验证码登录
npm publish               # publishConfig 已设为 registry.npmjs.org + public
# 之后任何人可以：
dsh plugin --profile web add dsh-news-3min
```

发布前自检：

```powershell
npm pack --dry-run        # 应只含 lib/ web/ data/ docs/screenshot.png 等 21 个文件
```

## 4. 版本升级

```powershell
npm version patch         # 1.0.1
git push --follow-tags
npm publish
```
