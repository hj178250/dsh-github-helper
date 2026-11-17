// Generated from src/client.ts - do not edit by hand; run `node build.mjs`.
/**
 * dsh-github-trending-plus — Web (client) half.
 *
 * Registers a sidebar entry plus its main panel. The panel fetches
 * /dsh-github-trending/report from the host half and renders an interactive
 * card report: period tabs, language select, category chips, search, KPI tiles
 * and paginated repository cards that show the full analysis inline.
 */

window.__ModuleLoader__.load({
  id: 'dsh-github-helper',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect
    const useMemo = React.useMemo

    const NS = 'dsh-github-trending'
    const BASE = '/dsh-github-trending'

/**
 * A 404 here means the HTTP route never mounted (host half not loaded, or the
 * carrier activated after the plugin). Say so instead of printing a bare status.
 */
function describeFailure(status, body) {
  if (status === 404) {
    return '报告接口未挂载（HTTP 404）· 主机端插件未加载，请重启 Harness 或重新启用插件'
  }
  return (body && body.error) || 'HTTP ' + status
}
    const PAGE_SIZE = 6

    /** Filled in apply(); the slot components are rendered by the shell, not by us. */
    let LOCALE = null

    const LANGUAGES = [
      { label: '全部语言', slug: '' },
      { label: 'TypeScript', slug: 'typescript' },
      { label: 'JavaScript', slug: 'javascript' },
      { label: 'Python', slug: 'python' },
      { label: 'Rust', slug: 'rust' },
      { label: 'Go', slug: 'go' },
      { label: 'C++', slug: 'c++' },
      { label: 'C', slug: 'c' },
      { label: 'C#', slug: 'c#' },
      { label: 'Java', slug: 'java' },
      { label: 'Kotlin', slug: 'kotlin' },
      { label: 'Swift', slug: 'swift' },
      { label: 'Dart', slug: 'dart' },
      { label: 'PHP', slug: 'php' },
      { label: 'Ruby', slug: 'ruby' },
      { label: 'Zig', slug: 'zig' },
      { label: 'Lua', slug: 'lua' },
      { label: 'Shell', slug: 'shell' },
      { label: 'Jupyter Notebook', slug: 'jupyter-notebook' },
      { label: 'Vue', slug: 'vue' },
      { label: 'HTML', slug: 'html' },
      { label: 'CSS', slug: 'css' },
      { label: 'Solidity', slug: 'solidity' },
    ]

    const ZH = {
      'nav.title': 'GitHub 趋势',
      'title': 'GitHub 趋势雷达',
      'subtitle': '抓取 Trending 榜单 · 结构化分析 · 交互式卡片报告',
      'refresh': '刷新',
      'period.daily': '日榜',
      'period.weekly': '周榜',
      'period.monthly': '月榜',
      'filter.language': '语言',
      'filter.category': '分类',
      'filter.all': '全部',
      'search.placeholder': '搜索仓库名、作者名、简介、topics、编程语言…',
      'stat.repos': '收录仓库',
      'stat.delta': '周期 star 增量',
      'stat.stars': '累计 star',
      'stat.language': '最热语言',
      'section.overview': '趋势总览',
      'section.repos': '仓库卡片',
      'page.prev': '上一页',
      'page.next': '下一页',
      'page.info': '第 {page} / {total} 页 · 共 {count} 个仓库',
      'loading': '正在抓取 GitHub Trending…',
      'loading.elapsed': '已等待 {seconds} 秒',
      'loading.slow': '网络较慢，仍在尝试…',
      'deep.pending': '完整卡片信息加载中，先显示榜单快照…',
      'deep.failed': '深卡信息未更新，仍显示已有内容',
      'cancel': '取消',
      'error': '报告加载失败',
      'error.network': '网络失败：暂时连不上 GitHub',
      'error.source': '数据源失败：GitHub 返回的数据暂时无法读取，请稍后重试',
      'error.canceled': '已取消等待，可点击重试',
      'error.attempts': '已尝试 {count} 次，共 {seconds} 秒；点「重试」会重新抓一次',
      'error.tried': '已尝试 {count} 次',
      'retry': '重试',
      'risk.high': '风险偏高',
      'risk.medium': '风险中等',
      'risk.low': '风险较低',
      'metric.stars': 'star',
      'metric.forks': 'fork',
      'metric.delta': '本期新增',
      'metric.growth': '周期增长率',
      'empty': '当前筛选下没有匹配的仓库',
      'empty.custom': '当前没有仓库命中，可放宽关键词',
      'shortfall': '数据源不足，仅收录 {count} 个（{reason}）',
      'network.fallback': '本次走了回退后端',
      'network.fail': '网络请求失败',
      'banner.dismiss': '不再显示',
      'banner.hidden': '提示已隐藏',
      'banner.restore': '点此恢复',
      'install.degraded': '安装质量为降级（探针未全过）',
      'updated': '更新于',
      'cache.hit': '缓存',
      'cache.fresh': '实时',
      'risk.summary': '风险分布',
      'view.on.github': '在 GitHub 打开',
      'card.zhReadme': '中文 README',
      'card.sourcePopular': '全语言榜',
      'card.sourceFiller': '其他语言榜补位',
      'ai.entry': 'AI 辅助筛选',
      'ai.needKey': '内置大模型直接可用，无需配置',
      'ai.placeholder': '给我找几个 dsh 的美观性插件',
      'ai.submit': '筛选',
      'ai.loading': '筛选中…',
      'ai.clear': '清除',
      'ai.sorted': '按匹配度排序',
      'ai.match': '匹配度',
      'ai.searchGroup': '来自搜索 · 非本期榜单',
      'ai.searchBadge': '来自搜索',
      'ai.err.412': '内置大模型暂不可用',
      'ai.err.403': '跨源请求被拒',
      'ai.err.429': '请求太频繁，请稍后再试',
      'ai.err.timeout': '请求超时，请稍后重试',
      'ai.err.generic': '筛选失败，请稍后重试',
      'firstRun.title': '要不要配置以下功能（强烈推荐）',
      'firstRun.free.title': '① 什么都不配（默认）',
      'firstRun.free.body': '能看日/周/月趋势榜、13 个固定分类；项目介绍、技术栈、需要留意全在本地算，不发给任何人。限制：每小时只能查 GitHub 60 次，靠后的卡片拿不到热门标签和 README。',
      'firstRun.token.title': '② 配 GitHub token（可选，只读）',
      'firstRun.token.body': '好处：配额 60 → 5000 次/小时，靠后的卡片信息也完整。提醒：它是一把只读钥匙，别贴进公开仓库或聊天里。',
      'firstRun.ai.title': '③ 无需任何配置',
      'firstRun.ai.body': '「这是什么？」的大白话解释直接用 DeepSeek Harness 内置大模型生成，不需要申请任何 API key，不花一分钱。',
      'firstRun.wait': '注：打开后要等一会儿，这是正常的。首屏先出 50 张榜单卡，快的时候 2–3 秒、刚启动最慢约 10 秒。前 10 张的完整信息（README 摘要、许可证、上手门槛）还要十几到二十几秒才补上，卡片上方会有一行提示。AI 写的项目介绍要等完整信息到了才发请求，所以比卡片更晚出现，网络差的时候可能几十秒；它只替换文字，不会让卡片变空或报错。Steam++ 会比一般梯子慢一些。',
      'firstRun.use': '先这样用',
      'firstRun.help': '去看怎么配',
      'firstRun.remember': '下次不再提示',
      'firstRun.note': '（教程在页面末尾）',
      'help.hint': '配置教程在页面最底部，向下滚动即可看到',
      'help.hint.go': '去底部',
      'help.title': '怎么配置（小白也能照着做）',
      'help.copy': '复制命令',
      'help.github.title': 'GitHub token',
      'help.github.file': '文件位置：%USERPROFILE%\\.dsh\\github-token',
      'help.github.steps': '1. 浏览器打开 https://github.com/settings/tokens\n2. 点右上角 Generate new token → Generate new token (classic)\n3. Note 填 github-trending；Expiration 选 90 days（到期后重新生成一次即可；选 No expiration 更省事，但一旦泄露永远有效，不推荐）；下面只勾 public_repo 这一项\n4. 页面底部点绿色 Generate token\n5. 复制页面上出现的 ghp_ 开头那串（只显示这一次，先粘到记事本）\n6. 选一种方式保存：\n   A. 文件方式（推荐）：打开资源管理器，在地址栏粘贴 %USERPROFILE%\\.dsh 回车；\n      如果没有 .dsh 文件夹就先新建；在里面新建文本文件，改名成 github-token（去掉 .txt）；\n      用记事本打开，把 ghp_ 那串粘进去，保存。\n   B. 环境变量方式：Win+R 输入 powershell 回车，粘贴 setx GITHUB_TOKEN "ghp_你的token" 回车；\n      然后彻底退出 DSH（托盘右键退出）再打开。\n7. 回到面板，教程区应显示「GitHub token：已配置」',
      'help.github.faq.title': '常见问题',
      'help.github.faq': '401/403 → token 过期或被吊销，重新生成\n显示未配置 → 文件名多了 .txt 或放错目录\n不想用了 → 删文件或 setx 置空\n· token 过期后：面板会显示「GitHub token：未配置」，重新生成一个换上即可，不用改任何代码',
      'help.builtin.title': '内置大模型（无需配置，无需申请 API）',
      'help.builtin.body': '「这是什么？」的三段式大白话解释由 DeepSeek Harness 自带的大模型直接生成：\n· 不需要注册任何第三方服务\n· 不需要创建、充值、保存任何 API key\n· 点卡片上的「这是什么？」按钮，稍等几秒即可在小窗口看到解释\n· 解释只显示在插件自己的小窗里，不会打扰你正在工作的对话窗口',
      'ai.status.configured': '已配置',
      'ai.status.unconfigured': '未配置',
      'nav.title': 'GitHub 助手',
      'title': 'GitHub 助手 · 中文热门项目',
      'subtitle': '中文热门卡片 · 内置大模型大白话解释 · 一键下载 / 一键安装',
      'action.what': '这是什么？',
      'action.upload': '应用下载',
      'action.login': '登录 GitHub',
      'action.loginStatus': '检查登录状态',
      'explain.title': '大白话解释',
      'explain.loading': '正在用 DSH 内置大模型解释，请稍等几秒…',
      'explain.aiTag': '由 DSH 内置大模型生成，无需申请任何 API',
      'login.title': '登录 GitHub',
      'login.loading': '正在发起登录…',
      'login.deviceHint': '请打开 github.com/login/device，输入上面的授权码完成登录（全程不输密码）。',
      'login.signup': '没有账号？一键注册',
      'login.verify': '去授权',
      'download.title': '应用下载',
      'download.starting': '正在发起后台下载…',
      'download.running': '正在下载…',
      'download.progress': '已下载 {received} / {total}',
      'download.extracting': '下载完成，正在解压…',
      'download.doneTitle': '下载完成',
      'download.folder': '已保存到：',
      'download.cancelled': '已取消',
      'download.failed': '下载失败',
      'download.cancel': '取消下载',
      'download.hint': '会在后台下载项目的源码压缩包并自动解压，不经过对话、不消耗 Token、不卡界面。',
      'upload.title': '传到我的 GitHub',
      'upload.path': '本地项目文件夹路径',
      'upload.name': '仓库名（默认文件夹名）',
      'upload.private': '设为私有仓库',
      'upload.submit': '开始上传',
      'upload.cancel': '取消',
      'upload.hint': '未登录会先弹出授权码，按提示去浏览器授权一次即可，全程不输入密码。',
      'common.copy': '复制解释文字',
      'common.close': '关闭',
      'common.ok': '确定',
      'mine.title': '我的项目',
      'mine.loading': '正在读取你的项目…',
      'mine.empty': '你的账号下还没有项目。',
      'mine.error': '读取失败，请先登录 GitHub。',
      'mine.login': '先登录',
      'mine.refresh': '刷新',
      'mine.private': '私有',
      'mine.public': '公开',
      'mine.count': '共 {count} 个项目',
      'mine.upload': '传项目上去',
      'mine.download': '下载到本地',
      'action.install': '装到 DSH',
      'install.cardTitle': '一键装到 DSH',
      'install.cardBtn': '装到 DSH',
      'catalog.title': '一键装到 DSH',
      'catalog.hint': '下面这些插件可以直接装进 DeepSeek Harness，点一下选好配置就能部署。优先走 DSH 内置插件管理器，装完自动热重载、无需重启。全程不输密码、不消耗对话 Token。',
      'catalog.profile': '装到哪个配置',
      'catalog.custom': '或手动输入插件规格（npm 包名 / 账号/仓库名）',
      'catalog.customHint': '留空则用上面选中的插件',
      'catalog.deploy': '立即部署',
      'catalog.loading': '正在读取插件目录…',
      'catalog.empty': '暂时没有可一键安装的插件。',
      'catalog.installing': '正在部署…',
    }

    const EN = {
      'nav.title': 'GitHub Trending',
      'title': 'GitHub Trending Radar',
      'subtitle': 'Scrape the board · structured analysis · interactive card report',
      'refresh': 'Refresh',
      'period.daily': 'Today',
      'period.weekly': 'This week',
      'period.monthly': 'This month',
      'filter.language': 'Language',
      'filter.category': 'Category',
      'filter.all': 'All',
      'search.placeholder': 'Search repository name, owner, description, topics or language…',
      'stat.repos': 'Repositories',
      'stat.delta': 'Star gain',
      'stat.stars': 'Total stars',
      'stat.language': 'Top language',
      'section.overview': 'Overview',
      'section.repos': 'Repository cards',
      'page.prev': 'Previous',
      'page.next': 'Next',
      'page.info': 'Page {page} / {total} · {count} repositories',
      'loading': 'Fetching GitHub Trending…',
      'loading.elapsed': 'Waited {seconds}s',
      'loading.slow': 'The network is slow, still trying…',
      'deep.pending': 'Loading full card details; showing the trending snapshot first…',
      'deep.failed': 'Full card details were not updated; showing what is already loaded',
      'cancel': 'Cancel',
      'error': 'Failed to load the report',
      'error.network': 'Network failure: cannot reach GitHub',
      'error.source': 'Data source failure: GitHub returned unreadable data. Please retry later.',
      'error.canceled': 'Canceled. You can retry.',
      'error.attempts': 'Tried {count} times in {seconds}s; “Retry” starts a fresh fetch',
      'error.tried': 'Tried {count} times',
      'retry': 'Retry',
      'risk.high': 'High risk',
      'risk.medium': 'Medium risk',
      'risk.low': 'Low risk',
      'metric.stars': 'stars',
      'metric.forks': 'forks',
      'metric.delta': 'gain',
      'metric.growth': 'growth',
      'empty': 'No repository matches the current filters',
      'empty.custom': 'No repository matches this board — try broader keywords',
      'shortfall': 'Source fell short: only {count} collected ({reason})',
      'network.fallback': 'This run used the fallback backend',
      'network.fail': 'Network request failed',
      'banner.dismiss': 'Hide this',
      'banner.hidden': 'Banners hidden',
      'banner.restore': 'Restore',
      'install.degraded': 'Install quality is degraded (probe did not fully pass)',
      'updated': 'Updated',
      'cache.hit': 'cached',
      'cache.fresh': 'live',
      'risk.summary': 'Risk mix',
      'view.on.github': 'Open on GitHub',
      'card.zhReadme': 'Chinese README',
      'card.sourcePopular': 'All languages',
      'card.sourceFiller': 'Other language board',
      'ai.entry': 'AI assist',
      'ai.needKey': 'No configuration needed — uses the built-in model',
      'ai.placeholder': 'Find me a few good-looking dsh plugins',
      'ai.submit': 'Filter',
      'ai.loading': 'Filtering…',
      'ai.clear': 'Clear',
      'ai.sorted': 'Sorted by match score',
      'ai.match': 'Match',
      'ai.searchGroup': 'From search · not in this board',
      'ai.searchBadge': 'From search',
      'ai.err.412': 'Built-in model is temporarily unavailable',
      'ai.err.403': 'Cross-origin request rejected',
      'ai.err.429': 'Too many requests, please try again later',
      'ai.err.timeout': 'Request timed out, please try again later',
      'ai.err.generic': 'AI filter failed, please try again later',
      'firstRun.title': 'Configure these features? (Strongly recommended)',
      'firstRun.free.title': '① Configure nothing (default)',
      'firstRun.free.body': 'You can browse daily/weekly/monthly trending boards and the 13 fixed categories; intros, tech stack and watch-outs are computed locally and sent nowhere. Limit: only 60 GitHub requests per hour, and cards further down miss topics and README.',
      'firstRun.token.title': '② Add a GitHub token (optional, read-only)',
      'firstRun.token.body': 'Benefit: the quota rises from 60 to 5000 requests per hour and later cards get full details. Warning: it is a read-only key; never paste it into a public repository or a chat.',
      'firstRun.ai.title': '③ No configuration needed',
      'firstRun.ai.body': 'The "What is this?" plain-language explanation is generated by the model built into DeepSeek Harness — no API key, no signup, no cost.',
      'firstRun.wait': 'Note: the first load takes a moment, and that is expected. The 50 board cards appear first (2–3 s once warm, up to ~10 s right after start). Full details for the first 10 cards (README excerpt, licence, onboarding) need another ten to twenty-odd seconds, and a line above the list shows that. The model-written intro is only requested once the full details are in, so it lands later than the cards and can take tens of seconds on a slow link; it only swaps text and never blanks a card or shows an error. Steam++ is slower than a normal proxy.',
      'firstRun.use': 'Use as is',
      'firstRun.help': 'Show me how',
      'firstRun.remember': "Don't remind me again",
      'firstRun.note': ' (tutorial at the end of the page)',
      'help.hint': 'The setup tutorial is at the very bottom of the page — scroll down to see it',
      'help.hint.go': 'Go to bottom',
      'help.title': 'How to configure (step by step)',
      'help.copy': 'Copy command',
      'help.github.title': 'GitHub token',
      'help.github.file': 'File location: %USERPROFILE%\\.dsh\\github-token',
      'help.github.steps': '1. Open https://github.com/settings/tokens in a browser\n2. Top right: Generate new token → Generate new token (classic)\n3. Note: github-trending; Expiration: 90 days; tick only public_repo\n4. Click the green Generate token at the bottom\n5. Copy the ghp_ token shown (seen only once; paste it into Notepad first)\n6. Save it one of two ways:\n   A. File (recommended): open Explorer, paste %USERPROFILE%\\.dsh in the address bar and press Enter;\n      create the .dsh folder if missing; create a text file there and rename it to github-token (drop .txt);\n      open it in Notepad, paste the ghp_ token and save.\n   B. Environment variable: Win+R, type powershell, press Enter, then paste setx GITHUB_TOKEN "ghp_your_token";\n      fully quit DSH (tray icon → Quit) and reopen it.\n7. Back in the panel, the tutorial should show "GitHub token: Configured"',
      'help.github.faq.title': 'FAQ',
      'help.github.faq': '401/403 → the token expired or was revoked; generate a new one\nShows not configured → the file name still has .txt or is in the wrong folder\nNo longer needed → delete the file or clear it with setx',
      'help.builtin.title': 'Built-in model (no configuration, no API key required)',
      'help.builtin.body': 'The "What is this?" plain-language explanation is generated by the model built into DeepSeek Harness:\n· No third-party service to sign up for\n· No API key to create, top up, or store\n· Click "What is this?" on a card and wait a few seconds for the answer in a small window\n· The answer only appears in this plugin\u2019s own window and never disturbs the conversation you are working in',
      'ai.status.configured': 'Configured',
      'ai.status.unconfigured': 'Not configured',
    }

    function detectLocale(locale) {
      try {
        if (locale && typeof locale.getLocale === 'function') {
          const active = locale.getLocale()
          if (active && active.active) return String(active.active)
        }
      } catch (error) {
        /* ignore */
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.language) return String(navigator.language)
      } catch (error) {
        /* ignore */
      }
      return 'zh'
    }

    function makeT(locale) {
      const active = detectLocale(locale)
      const table = active.toLowerCase().indexOf('en') === 0 ? EN : ZH
      const fallback = ZH
      return function t(key, params) {
        let text = table[key] !== undefined ? table[key] : fallback[key] !== undefined ? fallback[key] : key
        if (params) {
          for (const name of Object.keys(params)) text = text.split('{' + name + '}').join(String(params[name]))
        }
        return text
      }
    }

    /** Default translator for the exported helpers (tests call them without a locale). */
    function defaultT() {
      return makeT(null)
    }

    function boardLabel(board) {
      return String(board.label || board.zh || board.en || board.key || '')
    }

    /**
     * Chip row: "全部" first, then the fixed 13-bucket catalogue carried by the
     * report, then user-defined boards. No de-duplication from `repos`.
     */
    function buildChips(report, t) {
      const tr = typeof t === 'function' ? t : defaultT()
      const chips = [{ key: 'all', label: tr('filter.all') }]
      const catalog = (report && report.catalog) || []
      for (const rule of catalog) chips.push({ key: rule.key, label: rule.zh || rule.en || rule.key })
      const boards = (report && report.customBoards) || []
      for (const board of boards) chips.push({ key: board.key, label: boardLabel(board), custom: true })
      return chips
    }

    function repoMatchesBoard(repo, board) {
      if (!board) return false
      const blob = [repo.fullName, repo.description, repo.tldr, (repo.stack || []).join(' '), (repo.topics || []).join(' ')]
        .join(' ')
        .toLowerCase()
      return (board.keywords || []).some(function (keyword) {
        const needle = String(keyword || '').trim().toLowerCase()
        return needle !== '' && blob.indexOf(needle) >= 0
      })
    }

    /**
     * Active chip filter. `all` keeps everything (including uncategorised
     * repos); a custom board matches keywords against one merged text blob;
     * every other chip requires the key to be present in `repo.categories`.
     */
    function filterRepos(repos, active, search, customBoards) {
      const list = Array.isArray(repos) ? repos : []
      const boards = Array.isArray(customBoards) ? customBoards : []
      const board = active && active !== 'all' ? boards.find(function (item) { return item.key === active }) || null : null
      const needle = String(search || '').trim().toLowerCase()
      return list.filter(function (repo) {
        if (active && active !== 'all') {
          if (board) {
            if (!repoMatchesBoard(repo, board)) return false
          } else {
            const categories = repo.categories || []
            const hit = categories.some(function (entry) { return (entry && entry.key ? entry.key : entry) === active })
            if (!hit) return false
          }
        }
        if (!needle) return true
        const blob = [
          repo.fullName,
          repo.owner,
          repo.description,
          repo.tldr,
          (repo.stack || []).join(' '),
          (repo.topics || []).join(' '),
          repo.language,
        ]
          .join(' ')
          .toLowerCase()
        return blob.indexOf(needle) >= 0
      })
    }

    function emptyHint(t) {
      const tr = typeof t === 'function' ? t : defaultT()
      return tr('empty.custom')
    }

    function shortfallText(report, t) {
      const tr = typeof t === 'function' ? t : defaultT()
      if (!report || !(Number(report.shortfall) > 0)) return ''
      const count = Array.isArray(report.repos) ? report.repos.length : 0
      return tr('shortfall', { count: count, reason: report.shortfallReason || '' })
    }

    function networkBanner(report, t) {
      const tr = typeof t === 'function' ? t : defaultT()
      if (!report) return ''
      if (report.networkStatus === 'fallback') return tr('network.fallback')
      if (report.networkStatus === 'fail') return tr('network.fail')
      return ''
    }

    function installQualityBanner(report, t) {
      const tr = typeof t === 'function' ? t : defaultT()
      if (!report || report.installQuality !== 'degraded') return ''
      return tr('install.degraded')
    }

    /** Human-readable error headline: network / data source / user cancel. */
    function errorHeadline(error, t) {
      const tr = typeof t === 'function' ? t : defaultT()
      if (!error) return tr('error')
      if (error.class === 'canceled') return tr('error.canceled')
      if (error.class === 'network') return tr('error.network')
      return tr('error.source')
    }

    /**
     * "已尝试 2 次，共 12.4 秒；点「重试」会重新抓一次" — the subtitle of the
     * error state. Empty for payloads without per-attempt data (e.g. a failed
     * panel fetch), which keep the technical detail line instead.
     */
    function errorAttemptLine(error, t) {
      const tr = typeof t === 'function' ? t : defaultT()
      if (!error || !Array.isArray(error.attempts) || error.attempts.length === 0) return ''
      const seconds = (Math.max(0, Number(error.durationMs) || 0) / 1000).toFixed(1)
      return tr('error.attempts', { count: error.attempts.length, seconds: seconds })
    }

    /** One localStorage key holds every dismissed-banner flag for this panel. */
    const UI_MEMORY_KEY = 'dsh-github-trending:ui'

    /**
     * localStorage is unavailable in Node and can throw even in a browser
     * (private mode, disabled storage, quota). Resolve it defensively so every
     * caller degrades to "do not remember" instead of breaking the panel.
     */
    function uiStorage() {
      try {
        if (typeof localStorage === 'undefined' || !localStorage) return null
        return localStorage
      } catch (error) {
        return null
      }
    }

    /**
     * Read the dismissed-banner flags once on the first render. A missing key,
     * an unparsable value or a throwing storage all mean "nothing is hidden".
     */
    function readUiMemory() {
      const store = uiStorage()
      if (!store) return {}
      try {
        const raw = store.getItem(UI_MEMORY_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return {}
        return { fallback: parsed.fallback === true, shortfall: parsed.shortfall === true }
      } catch (error) {
        return {}
      }
    }

    /** Persist only the banners the user actually dismissed. */
    function writeUiMemory(memory) {
      const store = uiStorage()
      if (!store) return
      try {
        const value = {}
        if (memory && memory.fallback === true) value.fallback = true
        if (memory && memory.shortfall === true) value.shortfall = true
        store.setItem(UI_MEMORY_KEY, JSON.stringify(value))
      } catch (error) {
        /* storage is best-effort; the panel keeps working without memory */
      }
    }

    /** Restore entry point: forget every dismissed banner. */
    function clearUiMemory() {
      const store = uiStorage()
      if (!store) return
      try {
        store.removeItem(UI_MEMORY_KEY)
      } catch (error) {
        /* ignore */
      }
    }

    const AI_TIMEOUT_MS = 30000

    /**
     * First-run onboarding. Only the explicit "下次不再提示" checkbox writes the
     * memory key, so closing the dialog without ticking it keeps the reminder
     * for the next open. Missing or throwing storage simply shows it again.
     */
    const FIRST_RUN_KEY = 'dsh-github-trending:first-run'

    function readFirstRunPending() {
      const store = uiStorage()
      if (!store) return true
      try {
        return store.getItem(FIRST_RUN_KEY) !== '1'
      } catch (error) {
        return true
      }
    }

    function writeFirstRunDone() {
      const store = uiStorage()
      if (!store) return
      try {
        store.setItem(FIRST_RUN_KEY, '1')
      } catch (error) {
        /* storage is best-effort; the dialog appears again next time */
      }
    }

    /**
     * Copy only the command template in the tutorial. Credentials never reach
     * the clipboard: the copied strings are the static dictionary entries.
     */
    function copyHelpText(text) {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(String(text))
        }
      } catch (error) {
        /* clipboard can be blocked; the text stays selectable in the block */
      }
    }

    /* ---------- DSH GitHub 助手：解释 / 登录 / 下载 / 上传 交互 ---------- */

    function postJson(path, payload) {
      return fetch(BASE + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
      }).then(function (res) { return res.json() })
    }

    function getJson(path) {
      return fetch(BASE + path, { method: 'GET' }).then(function (res) { return res.json() })
    }

    /** 客户端上下文，在 apply() 中保存，供卡片按钮调用核心服务。 */
    let HOST_CTX = null

    /**
     * 卡片的「这是什么？」入口：弹出插件自己的小窗，由 DSH 内置大模型
     * 在后台生成三段式大白话解释，完全不打扰用户正在工作的对话窗口。
     */
    async function onExplain(repo, t) {
      const payload = {
        fullName: repo.fullName || (repo.owner ? repo.owner + '/' + repo.name : repo.name),
        name: repo.name,
        description: repo.description || repo.tldr || '',
        readmeSnippet: repo.readmeSnippet || '',
        category: repo.categoryZh || repo.category || '',
        language: repo.language || '',
      }
      const box = document.createElement('div')
      box.className = 'gt-dialog-backdrop'
      const panel = document.createElement('div')
      panel.className = 'gt-dialog'
      const head = document.createElement('div')
      head.className = 'gt-dialog-head'
      const titleEl = document.createElement('h3')
      titleEl.className = 'gt-dialog-title'
      titleEl.textContent = t('explain.title') + '：' + (payload.fullName || payload.name || '')
      const close = document.createElement('button')
      close.className = 'gt-btn'
      close.textContent = t('common.close')
      close.onclick = function () { closed = true; if (box.parentNode) document.body.removeChild(box) }
      head.appendChild(titleEl)
      head.appendChild(close)
      const bodyWrap = document.createElement('div')
      bodyWrap.className = 'gt-dialog-body'
      const statusEl = document.createElement('p')
      statusEl.className = 'gt-explain-status'
      statusEl.textContent = t('explain.loading')
      const body = document.createElement('pre')
      body.className = 'gt-explain-text'
      body.style.display = 'none'
      bodyWrap.appendChild(statusEl)
      bodyWrap.appendChild(body)
      const foot = document.createElement('div')
      foot.className = 'gt-dialog-foot'
      const copy = document.createElement('button')
      copy.className = 'gt-btn'
      copy.textContent = t('common.copy')
      copy.style.display = 'none'
      copy.onclick = function () { copyHelpText(body.textContent || '') }
      foot.appendChild(copy)
      panel.appendChild(head)
      panel.appendChild(bodyWrap)
      panel.appendChild(foot)
      box.appendChild(panel)
      box.onclick = function (event) { if (event.target === box) { closed = true; document.body.removeChild(box) } }
      document.body.appendChild(box)
      let closed = false
      const show = function (text, isAi) {
        if (closed) return
        statusEl.textContent = isAi ? '✓ ' + t('explain.aiTag') : ''
        statusEl.style.display = isAi ? '' : 'none'
        body.textContent = text
        body.style.display = ''
        copy.style.display = ''
      }
      try {
        const res = await postJson('/explain', payload)
        if (res && res.ok && res.text) {
          show(res.text, res.ai === true)
        } else {
          show((res && res.text) || '解释内容生成失败，请稍后再试。', false)
        }
      } catch (error) {
        show('解释内容生成失败：' + (error && error.message ? error.message : String(error)), false)
      }
    }

    /** Generic modal used for explanation text, login hints and upload progress. */
    function openInfoDialog(title, text, t) {
      if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
        copyHelpText(text)
        return
      }
      const box = document.createElement('div')
      box.className = 'gt-dialog-backdrop'
      const panel = document.createElement('div')
      panel.className = 'gt-dialog'
      const head = document.createElement('div')
      head.className = 'gt-dialog-head'
      const titleEl = document.createElement('h3')
      titleEl.className = 'gt-dialog-title'
      titleEl.textContent = title || t('explain.title')
      const close = document.createElement('button')
      close.className = 'gt-btn'
      close.textContent = t('common.close')
      close.onclick = function () { document.body.removeChild(box) }
      head.appendChild(titleEl)
      head.appendChild(close)
      const bodyWrap = document.createElement('div')
      bodyWrap.className = 'gt-dialog-body'
      const body = document.createElement('pre')
      body.textContent = text || ''
      bodyWrap.appendChild(body)
      const foot = document.createElement('div')
      foot.className = 'gt-dialog-foot'
      const copy = document.createElement('button')
      copy.className = 'gt-btn'
      copy.textContent = t('common.copy')
      copy.onclick = function () { copyHelpText(text || '') }
      foot.appendChild(copy)
      panel.appendChild(head)
      panel.appendChild(bodyWrap)
      panel.appendChild(foot)
      box.appendChild(panel)
      box.onclick = function (event) { if (event.target === box) document.body.removeChild(box) }
      document.body.appendChild(box)
    }

    /** 卡片的「应用下载」入口：未登录先走设备码登录弹窗，已登录直接开后台下载任务。 */
    async function onUpload(repo, t) {
      let state
      try { state = await getJson('/login/status') } catch (error) { state = { ok: false } }
      if (!state || state.loggedIn !== true) {
        openLoginDialog(t)
        return
      }
      startBackgroundDownload(repo, t)
    }

    /** 登录小窗：设备码授权 + 一键注册入口，全程不输密码。 */
    function openLoginDialog(t) {
      const box = document.createElement('div')
      box.className = 'gt-dialog-backdrop'
      const panel = document.createElement('div')
      panel.className = 'gt-dialog'
      const title = document.createElement('h3')
      title.className = 'gt-dialog-title'
      title.textContent = t('login.title')
      const body = document.createElement('div')
      body.className = 'gt-dialog-body'
      const status = document.createElement('p')
      status.className = 'gt-explain-status'
      status.textContent = t('login.loading')
      const deviceCode = document.createElement('pre')
      deviceCode.className = 'gt-login-code'
      deviceCode.style.display = 'none'
      body.appendChild(status)
      body.appendChild(deviceCode)
      const foot = document.createElement('div')
      foot.className = 'gt-dialog-foot'
      const signup = document.createElement('button')
      signup.className = 'gt-btn'
      signup.textContent = t('login.signup')
      signup.onclick = function () {
        if (typeof window !== 'undefined' && window.open) window.open('https://github.com/signup', '_blank')
      }
      const verify = document.createElement('button')
      verify.className = 'gt-btn'
      verify.setAttribute('data-primary', '1')
      verify.style.display = 'none'
      verify.textContent = t('login.verify')
      verify.onclick = function () {
        if (typeof window !== 'undefined' && window.open) window.open('https://github.com/login/device', '_blank')
      }
      foot.appendChild(signup)
      foot.appendChild(verify)
      panel.appendChild(title)
      panel.appendChild(body)
      panel.appendChild(foot)
      box.appendChild(panel)
      box.onclick = function (event) { if (event.target === box) document.body.removeChild(box) }
      document.body.appendChild(box)
      // 发起设备码登录并轮询状态，直到已登录或用户关闭窗口。
      let closed = false
      let started = false
      const finish = async function (ok) {
        if (closed) return
        closed = true
        if (box.parentNode) document.body.removeChild(box)
        if (!ok) return
        try { openMineDialog(t, await getJson('/mine')) } catch { /* 打开我的项目失败不阻塞 */ }
      }
      const poll = async function () {
        for (let round = 0; round < 200 && !closed; round += 1) {
          let res
          try { res = await getJson('/login/status') } catch { res = null }
          if (res && res.ok && res.loggedIn === true) { finish(true); return }
          if (res && res.text && !started) {
            started = true
            status.textContent = res.text
            deviceCode.style.display = ''
            verify.style.display = ''
            status.textContent = t('login.deviceHint')
          }
          await new Promise(function (resolve) { setTimeout(resolve, 3000) })
        }
        finish(false)
      }
      postJson('/login/start', {}).catch(function () {})
      poll()
    }

    /**
     * 后台下载任务小窗：POST /download/start 拿任务 id，然后轮询进度，
     * 显示实时进度条，不再阻塞面板，也不会让卡片卡死。
     */
    function startBackgroundDownload(repo, t) {
      const repoSpec = repo.fullName || repo.name || ''
      const box = document.createElement('div')
      box.className = 'gt-dialog-backdrop'
      const panel = document.createElement('div')
      panel.className = 'gt-dialog'
      const title = document.createElement('h3')
      title.className = 'gt-dialog-title'
      title.textContent = t('download.title') + '：' + repoSpec
      const body = document.createElement('div')
      body.className = 'gt-dialog-body'
      const status = document.createElement('p')
      status.className = 'gt-explain-status'
      status.textContent = t('download.starting')
      const barWrap = document.createElement('div')
      barWrap.className = 'gt-progress'
      const bar = document.createElement('div')
      bar.className = 'gt-progress-bar'
      bar.style.width = '0%'
      barWrap.appendChild(bar)
      const meta = document.createElement('p')
      meta.className = 'gt-progress-meta'
      meta.textContent = ''
      const result = document.createElement('pre')
      result.className = 'gt-explain-text'
      result.style.display = 'none'
      body.appendChild(status)
      body.appendChild(barWrap)
      body.appendChild(meta)
      body.appendChild(result)
      const foot = document.createElement('div')
      foot.className = 'gt-dialog-foot'
      let taskId = null
      let closed = false
      const closeBtn = document.createElement('button')
      closeBtn.className = 'gt-btn'
      closeBtn.textContent = t('common.close')
      closeBtn.onclick = function () { closed = true; document.body.removeChild(box) }
      const cancelBtn = document.createElement('button')
      cancelBtn.className = 'gt-btn'
      cancelBtn.textContent = t('download.cancel')
      cancelBtn.onclick = async function () {
        if (taskId) { try { await postJson('/download/cancel', { id: taskId }) } catch { /* 取消失败不阻塞 */ } }
        closed = true
        if (box.parentNode) document.body.removeChild(box)
      }
      foot.appendChild(cancelBtn)
      foot.appendChild(closeBtn)
      panel.appendChild(title)
      panel.appendChild(body)
      panel.appendChild(foot)
      box.appendChild(panel)
      box.onclick = function (event) { if (event.target === box) { closed = true; document.body.removeChild(box) } }
      document.body.appendChild(box)
      const fmtBytes = function (n) {
        const v = Number(n) || 0
        if (v >= 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB'
        if (v >= 1024) return (v / 1024).toFixed(0) + ' KB'
        return v + ' B'
      }
      const paint = function (task) {
        if (!task) return
        const pct = Math.max(0, Math.min(100, Math.round(task.percent || 0)))
        bar.style.width = pct + '%'
        if (task.status === 'downloading') {
          status.textContent = t('download.running')
          meta.textContent = t('download.progress')
            .replace('{received}', fmtBytes(task.received))
            .replace('{total}', task.total ? fmtBytes(task.total) : '…')
        } else if (task.status === 'extracting') {
          status.textContent = t('download.extracting')
          meta.textContent = ''
        } else if (task.status === 'done') {
          status.textContent = '✓ ' + t('download.doneTitle')
          meta.textContent = (task.folder ? t('download.folder') + task.folder : '') + (task.cancelled ? '（' + t('download.cancelled') + '）' : '')
          bar.style.width = '100%'
          result.textContent = task.text || ''
          result.style.display = task.text ? '' : 'none'
          cancelBtn.style.display = 'none'
        } else if (task.status === 'failed') {
          status.textContent = t('download.failed')
          meta.textContent = task.error || ''
          cancelBtn.style.display = 'none'
        }
      }
      const poll = async function () {
        try {
          const res = await postJson('/download/start', {
            repo: repoSpec,
            dest: (repo.dest || '').trim() || '',
          })
          if (!res || !res.ok || !res.id) {
            status.textContent = (res && res.text) || '发起下载失败，请稍后再试。'
            barWrap.style.display = 'none'
            cancelBtn.style.display = 'none'
            return
          }
          taskId = res.id
        } catch (error) {
          status.textContent = '发起下载失败：' + (error && error.message ? error.message : String(error))
          barWrap.style.display = 'none'
          cancelBtn.style.display = 'none'
          return
        }
        while (!closed) {
          let st
          try { st = await getJson('/download/status/' + encodeURIComponent(taskId)) } catch { st = null }
          if (st && st.ok && st.task) {
            paint(st.task)
            if (st.task.status === 'done' || st.task.status === 'failed') return
          }
          await new Promise(function (resolve) { setTimeout(resolve, 800) })
        }
      }
      poll()
    }

    /** 「传项目上去」表单：路径、仓库名（默认文件夹名）、公开/私有。 */
    function openUploadDialog(repo, t) {
      const box = document.createElement('div')
      box.className = 'gt-dialog-backdrop'
      const panel = document.createElement('div')
      panel.className = 'gt-dialog'
      const title = document.createElement('h3')
      title.className = 'gt-dialog-title'
      title.textContent = t('upload.title') + '：' + (repo.fullName || repo.name || '')
      const hint = document.createElement('div')
      hint.className = 'gt-field-hint'
      hint.textContent = t('upload.hint')
      const mkField = function (label, placeholder, value) {
        const field = document.createElement('div')
        field.className = 'gt-field'
        const lab = document.createElement('label')
        lab.className = 'gt-field-label'
        lab.textContent = label
        const input = document.createElement('input')
        input.className = 'gt-field-input'
        input.setAttribute('type', 'text')
        input.setAttribute('placeholder', placeholder || '')
        input.value = value || ''
        field.appendChild(lab)
        field.appendChild(input)
        panel.appendChild(field)
        return input
      }
      const pathInput = mkField(t('upload.path'), 'C:\\我的项目', '')
      const nameInput = mkField(t('upload.name'), repo.name || '', repo.name || '')
      const privRow = document.createElement('label')
      privRow.className = 'gt-check-row'
      const priv = document.createElement('input')
      priv.setAttribute('type', 'checkbox')
      const privText = document.createElement('span')
      privText.textContent = t('upload.private')
      privRow.appendChild(priv)
      privRow.appendChild(privText)
      panel.appendChild(privRow)
      const foot = document.createElement('div')
      foot.className = 'gt-dialog-foot'
      const cancel = document.createElement('button')
      cancel.className = 'gt-btn'
      cancel.textContent = t('upload.cancel')
      cancel.onclick = function () { document.body.removeChild(box) }
      const submit = document.createElement('button')
      submit.className = 'gt-btn'
      submit.setAttribute('data-primary', '1')
      submit.textContent = t('upload.submit')
      submit.onclick = async function () {
        const localPath = (pathInput.value || '').trim()
        if (!localPath) { window.alert(t('upload.path')); return }
        submit.disabled = true
        submit.textContent = '上传中…'
        try {
          const res = await postJson('/upload', {
            localPath: localPath,
            repoName: (nameInput.value || '').trim() || repo.name || '',
            private: priv.checked === true,
            description: repo.description || repo.tldr || '',
          })
          openInfoDialog(t('upload.title'), res && res.text ? res.text : '上传完成。', t)
        } catch (error) {
          openInfoDialog(t('upload.title'), '上传失败：' + (error && error.message ? error.message : String(error)), t)
        }
        document.body.removeChild(box)
      }
      foot.appendChild(cancel)
      foot.appendChild(submit)
      panel.appendChild(title)
      panel.appendChild(hint)
      panel.appendChild(foot)
      box.appendChild(panel)
      box.onclick = function (event) { if (event.target === box) document.body.removeChild(box) }
      document.body.appendChild(box)
    }

    /** "我的项目" entry: read the logged-in account's repositories and list them. */
    async function onMine(t) {
      let res
      try { res = await getJson('/mine') } catch (error) { res = { ok: false } }
      openMineDialog(t, res || {})
    }

    function openMineDialog(t, res) {
      const box = document.createElement('div')
      box.className = 'gt-dialog-backdrop'
      const panel = document.createElement('div')
      panel.className = 'gt-dialog'
      const head = document.createElement('div')
      head.className = 'gt-dialog-head'
      const titleEl = document.createElement('h3')
      titleEl.className = 'gt-dialog-title'
      titleEl.textContent = t('mine.title')
      const close = document.createElement('button')
      close.className = 'gt-btn'
      close.textContent = t('common.close')
      close.onclick = function () { document.body.removeChild(box) }
      head.appendChild(titleEl)
      head.appendChild(close)
      const body = document.createElement('div')
      body.className = 'gt-dialog-body'
      const repos = res && Array.isArray(res.repos) ? res.repos : []
      if (res && res.ok && repos.length) {
        const count = document.createElement('div')
        count.className = 'gt-mine-count'
        count.textContent = t('mine.count', { count: repos.length })
        body.appendChild(count)
        repos.forEach(function (r) {
          const row = document.createElement('div')
          row.className = 'gt-mine-row'
          const left = document.createElement('a')
          left.className = 'gt-mine-link'
          left.setAttribute('href', r.htmlUrl || '#')
          left.setAttribute('target', '_blank')
          left.setAttribute('rel', 'noreferrer')
          left.setAttribute('title', r.fullName || r.name)
          left.textContent = r.fullName || r.name
          const right = document.createElement('span')
          right.className = 'gt-mine-meta'
          right.textContent = (r.private ? t('mine.private') : t('mine.public')) + (r.language ? ' · ' + r.language : '') + (r.stars ? ' · ⭐' + r.stars : '')
          row.appendChild(left)
          row.appendChild(right)
          // 每行两个动作：把账号里的项目下载到本地 / 把这个仓库作为上传目标入口
          const actDownload = document.createElement('button')
          actDownload.type = 'button'
          actDownload.className = 'gt-helper-btn'
          actDownload.textContent = t('mine.download')
          actDownload.style.marginLeft = '8px'
          actDownload.onclick = function () { document.body.removeChild(box); startBackgroundDownload({ fullName: r.fullName || r.name, name: r.name }, t) }
          row.appendChild(actDownload)
          const actUpload = document.createElement('button')
          actUpload.type = 'button'
          actUpload.className = 'gt-helper-btn'
          actUpload.textContent = t('mine.upload')
          actUpload.onclick = function () { document.body.removeChild(box); openUploadDialog({ name: r.name || '', fullName: r.fullName || r.name }, t) }
          row.appendChild(actUpload)
          body.appendChild(row)
        })
      } else if (res && res.ok) {
        body.textContent = t('mine.empty')
      } else {
        body.textContent = (res && res.text) || t('mine.error')
      }
      panel.appendChild(head)
      panel.appendChild(body)
      const foot = document.createElement('div')
      foot.className = 'gt-dialog-foot'
      if (!(res && res.ok)) {
        const login = document.createElement('button')
        login.className = 'gt-btn'
        login.setAttribute('data-primary', '1')
        login.textContent = t('mine.login')
        login.onclick = function () { document.body.removeChild(box); openLoginDialog(t) }
        foot.appendChild(login)
      }
      const refresh = document.createElement('button')
      refresh.className = 'gt-btn'
      refresh.textContent = t('mine.refresh')
      refresh.onclick = function () { document.body.removeChild(box); onMine(t) }
      foot.appendChild(refresh)
      panel.appendChild(foot)
      box.appendChild(panel)
      box.onclick = function (event) { if (event.target === box) document.body.removeChild(box) }
      document.body.appendChild(box)
    }

    /** 「装到 DSH」入口：读取插件目录，列出可选插件，点一下就装（免表单）。 */
    async function onInstall(t) {
      let catalog = [], profiles = []
      try {
        const [c, p] = await Promise.all([getJson('/catalog'), getJson('/profiles')])
        catalog = (c && Array.isArray(c.catalog)) ? c.catalog : []
        profiles = (p && Array.isArray(p.profiles)) ? p.profiles : []
      } catch (error) { /* 空数据走兜底提示 */ }
      openInstallDialog(t, catalog, profiles)
    }

    /**
     * 卡片上的「装到 DSH」一键安装：点卡片按钮直接装，不弹表单、不选配置、
     * 不需要用户粘贴任何东西。后端优先走 DSH 内置插件管理器（装完自动热重载）。
     */
    async function onInstallFromCard(repo, t) {
      const spec = 'github:' + (repo.fullName || (repo.owner ? repo.owner + '/' + repo.name : repo.name) || '')
      if (!spec || spec === 'github:') return
      const box = document.createElement('div')
      box.className = 'gt-dialog-backdrop'
      const panel = document.createElement('div')
      panel.className = 'gt-dialog'
      const title = document.createElement('h3')
      title.className = 'gt-dialog-title'
      title.textContent = t('install.cardTitle') + '：' + (repo.name || spec)
      const body = document.createElement('div')
      body.className = 'gt-dialog-body'
      const status = document.createElement('p')
      status.className = 'gt-explain-status'
      status.textContent = t('catalog.installing')
      const result = document.createElement('pre')
      result.className = 'gt-explain-text'
      result.style.display = 'none'
      body.appendChild(status)
      body.appendChild(result)
      const foot = document.createElement('div')
      foot.className = 'gt-dialog-foot'
      const close = document.createElement('button')
      close.className = 'gt-btn'
      close.textContent = t('common.close')
      close.onclick = function () { document.body.removeChild(box) }
      foot.appendChild(close)
      panel.appendChild(title)
      panel.appendChild(body)
      panel.appendChild(foot)
      box.appendChild(panel)
      box.onclick = function (event) { if (event.target === box) document.body.removeChild(box) }
      document.body.appendChild(box)
      try {
        const res = await postJson('/install', { spec: spec })
        status.textContent = ''
        status.style.display = 'none'
        result.textContent = (res && res.text) || '部署完成。'
        result.style.display = ''
      } catch (error) {
        status.textContent = ''
        status.style.display = 'none'
        result.textContent = '部署失败：' + (error && error.message ? error.message : String(error))
        result.style.display = ''
      }
    }

    function openInstallDialog(t, catalog, profiles) {
      const box = document.createElement('div')
      box.className = 'gt-dialog-backdrop'
      const panel = document.createElement('div')
      panel.className = 'gt-dialog'
      const head = document.createElement('div')
      head.className = 'gt-dialog-head'
      const titleEl = document.createElement('h3')
      titleEl.className = 'gt-dialog-title'
      titleEl.textContent = t('catalog.title')
      const close = document.createElement('button')
      close.className = 'gt-btn'
      close.textContent = t('common.close')
      close.onclick = function () { document.body.removeChild(box) }
      head.appendChild(titleEl)
      head.appendChild(close)
      panel.appendChild(head)

      const body = document.createElement('div')
      body.className = 'gt-dialog-body'
      const hint = document.createElement('div')
      hint.className = 'gt-field-hint'
      hint.textContent = t('catalog.hint')
      body.appendChild(hint)

      // 配置下拉
      const profField = document.createElement('div')
      profField.className = 'gt-field'
      const profLab = document.createElement('label')
      profLab.className = 'gt-field-label'
      profLab.textContent = t('catalog.profile')
      const profSel = document.createElement('select')
      profSel.className = 'gt-select'
      const profList = profiles.length ? profiles : ['web']
      for (const p of profList) {
        const opt = document.createElement('option')
        opt.value = p
        opt.textContent = p
        if (p === 'web') opt.selected = true
        profSel.appendChild(opt)
      }
      profField.appendChild(profLab)
      profField.appendChild(profSel)
      body.appendChild(profField)

      // 插件单选列表
      let chosen = catalog.length ? catalog[0].spec : ''
      if (!catalog.length) {
        const empty = document.createElement('div')
        empty.className = 'gt-empty'
        empty.textContent = t('catalog.empty')
        body.appendChild(empty)
      }
      const list = document.createElement('div')
      for (const item of catalog) {
        const row = document.createElement('label')
        row.className = 'gt-check-row'
        const radio = document.createElement('input')
        radio.setAttribute('type', 'radio')
        radio.setAttribute('name', 'gt-install-spec')
        radio.value = item.spec
        if (item.spec === chosen) radio.checked = true
        radio.onchange = function () { chosen = item.spec }
        const txt = document.createElement('span')
        txt.textContent = `${item.name}（${item.tag}）— ${item.desc}`
        row.appendChild(radio)
        row.appendChild(txt)
        list.appendChild(row)
      }
      body.appendChild(list)

      // 手动输入规格
      const customField = document.createElement('div')
      customField.className = 'gt-field'
      const customLab = document.createElement('label')
      customLab.className = 'gt-field-label'
      customLab.textContent = t('catalog.custom')
      const customInput = document.createElement('input')
      customInput.className = 'gt-field-input'
      customInput.setAttribute('type', 'text')
      customInput.setAttribute('placeholder', t('catalog.customHint'))
      customField.appendChild(customLab)
      customField.appendChild(customInput)
      body.appendChild(customField)

      panel.appendChild(body)
      const foot = document.createElement('div')
      foot.className = 'gt-dialog-foot'
      const cancel = document.createElement('button')
      cancel.className = 'gt-btn'
      cancel.textContent = t('upload.cancel')
      cancel.onclick = function () { document.body.removeChild(box) }
      const deploy = document.createElement('button')
      deploy.className = 'gt-btn'
      deploy.setAttribute('data-primary', '1')
      deploy.textContent = t('catalog.deploy')
      deploy.onclick = async function () {
        const spec = (customInput.value || '').trim() || chosen
        if (!spec) { window.alert(t('catalog.customHint')); return }
        deploy.disabled = true
        deploy.textContent = t('catalog.installing')
        try {
          const res = await postJson('/install', { spec: spec, profile: profSel.value })
          openInfoDialog(t('catalog.title'), res && res.text ? res.text : '部署完成。', t)
        } catch (error) {
          openInfoDialog(t('catalog.title'), '部署失败：' + (error && error.message ? error.message : String(error)), t)
        }
        document.body.removeChild(box)
      }
      foot.appendChild(cancel)
      foot.appendChild(deploy)
      panel.appendChild(foot)
      box.appendChild(panel)
      box.onclick = function (event) { if (event.target === box) document.body.removeChild(box) }
      document.body.appendChild(box)
    }

    function compact(value) {
      const number = Number(value) || 0
      if (Math.abs(number) >= 1000000) return (number / 1000000).toFixed(1) + 'M'
      if (Math.abs(number) >= 10000) return (number / 1000).toFixed(1) + 'k'
      return new Intl.NumberFormat('en-US').format(Math.round(number))
    }

    function percent(value) {
      const raw = (Number(value) || 0) * 100
      if (raw >= 10) return raw.toFixed(0) + '%'
      if (raw >= 1) return raw.toFixed(1) + '%'
      return raw.toFixed(2) + '%'
    }

    /** Local wall-clock time for the report timestamp (browser time zone). */
    function localTime(iso) {
      const time = Date.parse(String(iso || ''))
      if (!Number.isFinite(time)) return ''
      const date = new Date(time)
      const pad = function (value) { return String(value).padStart(2, '0') }
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
    }

    function shortRisk(risk, t) {
      if (!risk) return ''
      return [t('risk.high') + ' ' + risk.high, t('risk.medium') + ' ' + risk.medium, t('risk.low') + ' ' + risk.low].join(' · ')
    }

    /** Owner avatar straight from GitHub so every card carries a recognisable image. */
    function avatarUrl(owner) {
      const login = String(owner || '').trim()
      if (!login) return ''
      return 'https://github.com/' + encodeURIComponent(login) + '.png?size=96'
    }

    function riskTone(level) {
      if (level === 'high') return 'error'
      if (level === 'medium') return 'warn'
      return 'success'
    }

    const CSS = [
      /* ---------- 基础与氛围 ---------- */
      '.gt-root{box-sizing:border-box;height:100%;overflow:auto;padding:24px 28px 64px;background:radial-gradient(1200px 400px at 15% -5%,color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 10%,transparent),transparent),radial-gradient(900px 360px at 90% 0%,color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 7%,transparent),transparent),var(--dsw-alias-bg-base,#0f1117);color:var(--dsw-alias-label-primary,#e6e6e6);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,"PingFang SC","Microsoft YaHei",sans-serif}',
      '.gt-root *{box-sizing:border-box}',
      '.gt-shell{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:18px;animation:gt-fade .35s ease}',
      '@keyframes gt-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      /* ---------- 头部品牌 ---------- */
      '.gt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      '.gt-brand{display:flex;align-items:center;gap:14px;min-width:260px}',
      '.gt-mark{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 22%,transparent),color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 16%,transparent));border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 40%,transparent);box-shadow:0 8px 22px color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 28%,transparent);flex:none}',
      '.gt-h1{margin:0;font-size:21px;font-weight:700;letter-spacing:.2px;background:linear-gradient(90deg,var(--dsw-alias-label-primary,#fff),color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 72%));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
      '.gt-sub{margin:3px 0 0;font-size:12.5px;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      /* ---------- 按钮 ---------- */
      '.gt-btn{display:inline-flex;align-items:center;gap:6px;height:34px;min-width:68px;padding:0 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04));color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:12.5px;font-weight:550;cursor:pointer;text-decoration:none;white-space:nowrap;transition:border-color .18s ease,background .18s ease,transform .12s ease,box-shadow .18s ease}',
      '.gt-btn:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 10%,var(--dsw-alias-bg-layer-2,transparent));box-shadow:0 4px 16px color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 16%,transparent)}',
      '.gt-btn:active{transform:translateY(1px)}',
      '.gt-btn[data-primary="1"]{background:linear-gradient(135deg,#34373f,#13151a);border-color:1px solid rgba(255,255,255,.12);color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.34)}',
      '.gt-btn[data-primary="1"]:hover{filter:brightness(1.12);box-shadow:0 8px 24px rgba(0,0,0,.5)}',
      '.gt-btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none;filter:none}',
      /* ---------- 工具栏 ---------- */
      '.gt-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:16px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04)) 82%,transparent);backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.18)}',
      '.gt-seg{display:inline-flex;padding:3px;gap:2px;border-radius:12px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.05));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}',
      '.gt-seg button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#9aa3b2);font:inherit;font-size:12.5px;font-weight:550;padding:6px 14px;border-radius:9px;cursor:pointer;transition:color .15s ease,background .15s ease,box-shadow .15s ease}',
      '.gt-seg button:hover{color:var(--dsw-alias-label-primary,#e6e6e6)}',
      '.gt-seg button[data-active="1"]{background:var(--dsw-alias-bg-base,rgba(0,0,0,.25));color:var(--dsw-alias-label-primary,#fff);box-shadow:0 2px 8px rgba(0,0,0,.28),inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 30%,transparent)}',
      '.gt-select,.gt-input{height:34px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));background:var(--dsw-alias-bg-base,rgba(0,0,0,.2));color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:12.5px;padding:0 12px;outline:none;transition:border-color .18s ease,box-shadow .18s ease}',
      '.gt-select:focus,.gt-input:focus{border-color:var(--dsw-alias-brand-primary,#4b6bfb);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 20%,transparent)}',
      '.gt-input{flex:1 1 220px;min-width:180px}',
      '.gt-chips{display:flex;gap:6px;flex-wrap:wrap}',
      '.gt-chip{border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));background:transparent;color:var(--dsw-alias-label-secondary,#9aa3b2);border-radius:999px;padding:4px 12px;font:inherit;font-size:12px;cursor:pointer;transition:color .15s ease,border-color .15s ease,background .15s ease}',
      '.gt-chip:hover{color:var(--dsw-alias-label-primary,#e6e6e6);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 45%,transparent)}',
      '.gt-chip[data-active="1"]{color:#fff;border-color:transparent;background:linear-gradient(135deg,#34373f,#13151a);box-shadow:0 3px 10px color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 28%,transparent)}',
      /* ---------- 横幅 ---------- */
      '.gt-banners{display:flex;flex-direction:column;gap:6px}',
      '.gt-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04));font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-banner.gt-shortfall{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 45%,transparent);color:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.gt-banner.gt-install-quality{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 45%,transparent)}',
      '.gt-banner-text{min-width:0}',
      '.gt-banner-dismiss{border:0;background:transparent;color:inherit;font:inherit;font-size:11.5px;cursor:pointer;opacity:.72;white-space:nowrap;text-decoration:underline;padding:0}',
      '.gt-banner-dismiss:hover{opacity:1}',
      '.gt-help-hint{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 45%,transparent)}',
      '.gt-restore-bar{display:flex;justify-content:center;margin-top:-4px}',
      '.gt-restore{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#9aa3b2);font:inherit;font-size:11.5px;cursor:pointer;text-decoration:underline;padding:0}',
      '.gt-restore:hover{color:var(--dsw-alias-brand-primary,#4b6bfb)}',
      /* ---------- 指标卡 ---------- */
      '.gt-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}',
      '.gt-stat{padding:16px 17px;border-radius:16px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));background:linear-gradient(180deg,var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04)),color-mix(in srgb,var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04)) 60%,transparent));display:flex;flex-direction:column;gap:5px;min-width:0;box-shadow:0 8px 22px rgba(0,0,0,.16)}',
      '.gt-stat-label{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-stat-value{font-size:24px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:linear-gradient(90deg,var(--dsw-alias-label-primary,#fff),color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 70%,var(--dsw-alias-label-primary,#fff)));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
      '.gt-stat-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa3b2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.gt-card{border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:18px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04));padding:18px;min-width:0;box-shadow:0 10px 28px rgba(0,0,0,.18)}',
      '.gt-section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;font-size:13.5px;font-weight:650;color:var(--dsw-alias-label-primary,#e6e6e6)}',
      '.gt-section-title small{font-weight:400;font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      /* ---------- 仓库卡片 ---------- */
      '.gt-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
      '.gt-repo{border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:18px;background:linear-gradient(180deg,var(--dsw-alias-bg-layer-1,rgba(255,255,255,.045)),color-mix(in srgb,var(--dsw-alias-bg-layer-1,rgba(255,255,255,.045)) 55%,transparent));padding:16px 17px;display:flex;flex-direction:column;gap:11px;min-width:0;position:relative;overflow:hidden;transition:border-color .2s ease,transform .2s ease,box-shadow .2s ease}',
      '.gt-repo::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,var(--dsw-alias-brand-primary,#4b6bfb),var(--dsw-alias-state-success-primary,#22c55e));opacity:0;transition:opacity .2s ease}',
      '.gt-repo:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 50%,transparent);transform:translateY(-3px);box-shadow:0 18px 40px rgba(0,0,0,.3),0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 18%,transparent)}',
      '.gt-repo:hover::before{opacity:1}',
      '.gt-repo-deep{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 26%,var(--dsw-alias-border-l1,transparent))}',
      '.gt-repo-simple{padding:14px 17px;gap:9px}',
      '.gt-repo-simple .gt-desc{-webkit-line-clamp:2}',
      '.gt-badge-zh{color:var(--dsw-alias-state-success-primary,#22c55e);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 12%,transparent)}',
      '.gt-model{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#e6e6e6)}',
      '.gt-source{align-self:flex-start;font-size:11px;padding:3px 9px;border-radius:8px;border:1px dashed var(--dsw-alias-border-l1,rgba(255,255,255,.14));color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-repo-head{display:flex;align-items:flex-start;gap:11px;min-width:0}',
      '.gt-avatar{position:relative;flex:0 0 auto;width:36px;height:36px;border-radius:11px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));font-size:12px;font-weight:700;color:var(--dsw-alias-label-secondary,#9aa3b2);text-transform:uppercase;user-select:none;box-shadow:0 3px 8px rgba(0,0,0,.2)}',
      '.gt-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06))}',
      '.gt-rank{flex:none;width:28px;height:28px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:650;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06));color:var(--dsw-alias-label-secondary,#9aa3b2);font-variant-numeric:tabular-nums}',
      '.gt-rank[data-top="1"]{background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 24%,transparent),color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 16%,transparent));color:var(--dsw-alias-state-warn-primary,#fbbf24)}',
      '.gt-repo-name{font-size:14.5px;font-weight:650;color:var(--dsw-alias-label-primary,#fff);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;transition:color .15s ease}',
      '.gt-repo-name:hover{color:var(--dsw-alias-brand-primary,#6b8bff)}',
      '.gt-repo-owner{font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa3b2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gt-desc{font-size:12.5px;color:var(--dsw-alias-label-secondary,#b0b8c4);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:34px;line-height:1.65}',
      '.gt-metrics{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2);font-variant-numeric:tabular-nums}',
      '.gt-metrics b{color:var(--dsw-alias-label-primary,#e6e6e6);font-weight:650}',
      '.gt-tags{display:flex;gap:6px;flex-wrap:wrap}',
      '.gt-tag{font-size:11px;padding:3px 9px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06));color:var(--dsw-alias-label-secondary,#b0b8c4);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));white-space:nowrap}',
      '.gt-tag[data-tone="brand"]{color:var(--dsw-alias-brand-primary,#6b8bff);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 12%,transparent)}',
      '.gt-tag[data-tone="error"]{color:var(--dsw-alias-state-error-primary,#f87171);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 12%,transparent)}',
      '.gt-tag[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary,#fbbf24);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 12%,transparent)}',
      '.gt-tag[data-tone="success"]{color:var(--dsw-alias-state-success-primary,#4ade80);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 42%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 12%,transparent)}',
      '.gt-block{margin-top:2px;padding-top:10px;border-top:1px dashed var(--dsw-alias-border-l1,rgba(255,255,255,.1));font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary,#b0b8c4);display:flex;flex-direction:column;gap:7px}',
      '.gt-block b{color:var(--dsw-alias-label-primary,#e6e6e6);font-weight:650}',
      '.gt-bullets{margin:6px 0 0;padding-left:16px;font-size:12px;color:var(--dsw-alias-label-secondary,#b0b8c4)}',
      '.gt-bullets li{margin:3px 0}',
      /* ---------- 卡片交互按钮 ---------- */
      '.gt-helper-actions{display:flex;gap:8px;margin-top:2px;padding-top:11px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}',
      '.gt-helper-btn{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));background:transparent;color:var(--dsw-alias-label-secondary,#b0b8c4);font:inherit;font-size:12px;font-weight:550;cursor:pointer;transition:all .16s ease}',
      '.gt-helper-btn:hover{color:var(--dsw-alias-brand-primary,#6b8bff);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 10%,transparent)}',
      '.gt-helper-btn.gt-helper-upload{color:#fff;border-color:rgba(255,255,255,.12);background:linear-gradient(135deg,#34373f,#13151a);box-shadow:0 4px 12px rgba(0,0,0,.28)}',
      '.gt-helper-btn.gt-helper-upload:hover{filter:brightness(1.06);color:#fff}',
      /* ---------- 分页 ---------- */
      '.gt-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2);flex-wrap:wrap}',
      '.gt-pager-btns{display:flex;gap:6px;align-items:center}',
      '.gt-pager-btns button{width:30px;height:30px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04));color:var(--dsw-alias-label-secondary,#9aa3b2);font:inherit;font-size:12px;cursor:pointer;transition:all .15s ease}',
      '.gt-pager-btns button:hover{border-color:var(--dsw-alias-brand-primary,#4b6bfb);color:var(--dsw-alias-label-primary,#e6e6e6)}',
      '.gt-pager-btns button[data-active="1"]{color:#fff;background:linear-gradient(135deg,#34373f,#13151a);border-color:transparent}',
      '.gt-pager-btns button:disabled{opacity:.4;cursor:not-allowed}',
      '.gt-note{font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa3b2);display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.gt-deep-note{margin:0;padding:10px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04));font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-deep-note-failed{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 45%,transparent);color:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.gt-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-idle-primary,#22d3ee);display:inline-block;flex:none}',
      '.gt-error{border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 10%,transparent);border-radius:14px;padding:15px 17px;font-size:13px}',
      '.gt-error b{display:block;margin-bottom:4px}',
      '.gt-error-detail{color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:12px;word-break:break-word}',
      '.gt-error-attempts{color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:12.5px}',
      '.gt-error-tried{color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:12px}',
      '.gt-loading{display:flex;flex-direction:column;gap:8px}',
      '.gt-slow{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.gt-skeleton{height:110px;border-radius:16px;background:linear-gradient(90deg,var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04)),var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08)),var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04)));background-size:200% 100%;animation:gt-shimmer 1.5s ease-in-out infinite}',
      '@keyframes gt-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '.gt-empty{padding:40px;text-align:center;color:var(--dsw-alias-label-secondary,#9aa3b2);font-size:13px;border:1px dashed var(--dsw-alias-border-l1,rgba(255,255,255,.14));border-radius:16px}',
      '.gt-ai-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-ai-box{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:13px 15px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:16px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04))}',
      '.gt-ai-box .gt-input{flex:1 1 320px;min-width:220px}',
      '.gt-ai-error{color:var(--dsw-alias-state-error-primary,#f87171);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 8%,transparent)}',
      '.gt-match{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-match-reason{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gt-search-group{margin-top:0}',
      /* ---------- 弹窗（DSH 助手） ---------- */
      '.gt-dialog-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.56);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;animation:gt-fade .18s ease}',
      '.gt-dialog{max-width:660px;width:100%;max-height:82vh;overflow:auto;background:var(--dsw-bg-elevated,#161b26);color:var(--dsw-fg-default,#e6e6e6);border-radius:18px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));padding:22px 24px;box-shadow:0 24px 70px rgba(0,0,0,.5);animation:gt-pop .2s ease}',
      '@keyframes gt-pop{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:none}}',
      '.gt-dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:12px}',
      '.gt-dialog-title{margin:0;font-size:16px;font-weight:700;background:linear-gradient(90deg,var(--dsw-fg-default,#fff),var(--dsw-alias-brand-primary,#6b8bff));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
      '.gt-dialog-body{font-size:13px;line-height:1.7;color:var(--dsw-fg-default,#e6e6e6)}',
      '.gt-dialog-body pre{white-space:pre-wrap;word-break:break-word;font:inherit;line-height:1.7;margin:0}',
      '.gt-dialog-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}',
      '.gt-field{margin-bottom:14px}',
      '.gt-field-label{display:block;font-size:12.5px;font-weight:600;margin-bottom:6px;color:var(--dsw-fg-default,#e6e6e6)}',
      '.gt-field-input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));background:var(--dsw-bg-base,rgba(0,0,0,.2));color:inherit;font:inherit;font-size:13px;outline:none;transition:border-color .16s ease,box-shadow .16s ease}',
      '.gt-field-input:focus{border-color:var(--dsw-alias-brand-primary,#4b6bfb);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 20%,transparent)}',
      '.gt-field-hint{font-size:12px;opacity:.72;margin-bottom:14px;line-height:1.6;color:var(--dsw-fg-muted,#9aa3b2)}',
      '.gt-check-row{display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:13px;color:var(--dsw-fg-default,#e6e6e6);cursor:pointer}',
      '.gt-check-row input{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary,#4b6bfb)}',
      '.gt-mine-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));transition:background .15s ease}',
      '.gt-mine-row:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4b6bfb) 6%,transparent)}',
      '.gt-mine-link{color:inherit;text-decoration:none;font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .15s ease}',
      '.gt-mine-link:hover{color:var(--dsw-alias-brand-primary,#6b8bff)}',
      '.gt-mine-meta{font-size:12px;opacity:.72;white-space:nowrap;flex:none}',
      '.gt-mine-count{font-size:12px;opacity:.72;margin-bottom:10px;color:var(--dsw-fg-muted,#9aa3b2)}',
      /* ---------- 旧有 consent / 帮助等保留 ---------- */
      '.gt-consent{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.52);backdrop-filter:blur(6px)}',
      '.gt-consent-card{width:min(460px,100%);border-radius:18px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));background:var(--dsw-alias-bg-base,#0f1117);color:var(--dsw-alias-label-primary,#e6e6e6);padding:20px 22px;display:flex;flex-direction:column;gap:10px;box-shadow:0 20px 60px rgba(0,0,0,.45)}',
      '.gt-consent-title{margin:0;font-size:15px;font-weight:700}',
      '.gt-consent-line{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-consent-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}',
      '.gt-consent-actions .gt-btn{min-width:88px}',
      '.gt-ai-help{padding:0;overflow:hidden}',
      '.gt-flash{outline:2px solid var(--dsw-alias-brand-primary,#4b6bfb);outline-offset:2px;transition:outline-color .3s}',
      '.gt-ai-help-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:13px;font-weight:600;padding:14px 16px;cursor:pointer;text-align:left}',
      '.gt-ai-help-state{font-weight:400;font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-ai-help-caret{font-weight:400;font-size:11.5px;color:var(--dsw-alias-brand-primary,#6b8bff)}',
      '.gt-ai-help-body{display:flex;flex-direction:column;gap:8px;padding:0 16px 16px;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary,#b0b8c4)}',
      '.gt-ai-help-body p{margin:0}',
      '.gt-ai-help-body h4{margin:2px 0 0;font-size:12.5px;font-weight:650;color:var(--dsw-alias-label-primary,#e6e6e6)}',
      '.gt-help-status{display:flex;flex-direction:column;gap:2px;padding:0 16px 12px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-ai-help-code{margin:0;padding:8px 11px;border-radius:9px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-primary,#e6e6e6);white-space:pre-wrap;word-break:break-all}',
      '.gt-help-code-wrap{position:relative}',
      '.gt-help-code-wrap .gt-ai-help-code{padding-right:96px}',
      '.gt-help-copy{position:absolute;top:8px;right:8px;height:26px;min-width:74px;padding:0 8px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));background:var(--dsw-alias-bg-base,rgba(0,0,0,.2));color:var(--dsw-alias-brand-primary,#6b8bff);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}',
      '.gt-firstrun-card{width:min(560px,100%);max-height:calc(100vh - 48px);overflow:auto}',
      '.gt-firstrun-item b{display:block;margin-bottom:2px;color:var(--dsw-alias-label-primary,#e6e6e6)}',
      '.gt-firstrun-remember{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa3b2);cursor:pointer}',
      '.gt-firstrun-note{font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa3b2)}',
      '.gt-firstrun-wait{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#9aa3b2);margin:2px 0 0;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}',
      '.gt-firstrun-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}',
      '.gt-repo-search{border-style:dashed}',
      '@media (max-width:1100px){.gt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media (max-width:900px){.gt-cards{grid-template-columns:1fr}.gt-head{flex-direction:column}.gt-actions{width:100%}}',
    ].join('\n')

    function TrendIcon(props) {
      const size = (props && props.size) || 20
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M3 16.5 9 10l4 3.6L21 6',
          stroke: 'var(--dsw-alias-brand-primary)',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M15.5 6H21v5.5', stroke: 'var(--dsw-alias-state-success-primary)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    function NavIcon() {
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }, title: 'GitHub Trending' },
        h(TrendIcon, { size: 18 }),
      )
    }

    function Tag(props) {
      return h('span', { className: 'gt-tag', 'data-tone': props.tone || 'plain' }, props.children)
    }

    function Stat(props) {
      return h(
        'div',
        { className: 'gt-stat' },
        h('span', { className: 'gt-stat-label' }, props.label),
        h('span', { className: 'gt-stat-value' }, props.value),
        props.hint ? h('span', { className: 'gt-stat-hint' }, props.hint) : null,
      )
    }

    /**
     * One repository card. `mode` is decided by the panel from the global list
     * index and the report's `deepCount`: `deep` renders every deepDive block,
     * the AI model chips and the Chinese-README badge; `simple` renders only
     * name, description, metrics and language/category tags (no `gt-block`).
     * The board-source marker is rendered in both modes.
     */
    /** 已检测过的 DSH 插件缓存：fullName -> true/false，跨卡片复用省 API。 */
    const PLUGIN_CHECKS = {}

    function RepoCard(props) {
      const repo = props.repo
      const t = props.t
      const mode = props.mode === 'simple' ? 'simple' : 'deep'
      const deep = mode === 'deep'
      const isPluginState = useState(PLUGIN_CHECKS[repo.fullName])
      const isPlugin = isPluginState[0]
      const setIsPlugin = isPluginState[1]
      const intros = props.intros || null
      // 懒检测：卡片渲染后异步查这个项目是不是 DSH 插件，只有可安装的才显示「装到 DSH」按钮。
      useEffect(function () {
        if (isPlugin === true || isPlugin === false) return
        const key = repo.fullName
        if (!key || PLUGIN_CHECKS[key] !== undefined) {
          if (PLUGIN_CHECKS[key] !== undefined && PLUGIN_CHECKS[key] !== isPlugin) setIsPlugin(PLUGIN_CHECKS[key])
          return
        }
        PLUGIN_CHECKS[key] = null
        postJson('/is-plugin', { repo: key })
          .then(function (res) {
            const verdict = Boolean(res && res.ok && res.isPlugin)
            PLUGIN_CHECKS[key] = verdict
            setIsPlugin(verdict)
          })
          .catch(function () {
            PLUGIN_CHECKS[key] = false
            setIsPlugin(false)
          })
      }, [repo.fullName])
      // The AI channel replaces 项目介绍 with the model intro and 上手门槛 with the
      // model onboarding (only when non-empty; otherwise the rule sentence stays).
      // Order, labels and every other block stay exactly as the template produced them.
      const blocks = deep
        ? (repo.deepDive || []).map(function (block) {
            const entry = intros && block ? intros[repo.fullName] : null
            if (entry) {
              if (block.label === '项目介绍' && entry.intro) {
                return { label: block.label, text: entry.intro }
              }
              if (block.label === '上手门槛' && entry.onboarding) {
                return { label: block.label, text: entry.onboarding }
              }
            }
            return block
          })
        : []
      const models = deep && Array.isArray(repo.aiModels) ? repo.aiModels.slice(0, 3) : []
      const zhReadme = deep && repo.readmeZh === true
      return h(
        'article',
        { className: 'gt-repo gt-repo-' + mode },
        h(
          'div',
          { className: 'gt-repo-head' },
          h(
            'span',
            { className: 'gt-avatar', title: repo.owner },
            String(repo.owner || '?').slice(0, 2),
            avatarUrl(repo.owner)
              ? h('img', {
                  src: avatarUrl(repo.owner),
                  alt: repo.owner,
                  loading: 'lazy',
                  onError: function (event) {
                    event.currentTarget.style.display = 'none'
                  },
                })
              : null,
          ),
          h('span', { className: 'gt-rank', 'data-top': repo.rank <= 3 ? '1' : '0' }, '#' + repo.rank),
          h(
            'div',
            { style: { minWidth: 0, flex: 1 } },
            h('a', { className: 'gt-repo-name', href: repo.url, target: '_blank', rel: 'noreferrer', title: repo.fullName }, repo.name),
            h('span', { className: 'gt-repo-owner' }, repo.owner),
          ),
          h(Tag, { tone: riskTone(repo.riskLevel) }, t('risk.' + repo.riskLevel)),
        ),
        h('p', { className: 'gt-desc' }, repo.tldr || repo.description || '—'),
        h(
          'div',
          { className: 'gt-metrics' },
          h('span', null, h('b', null, compact(repo.stars)), ' ', t('metric.stars')),
          h('span', null, h('b', null, compact(repo.forks)), ' ', t('metric.forks')),
          h('span', null, h('b', { style: { color: 'var(--dsw-alias-state-success-primary)' } }, '+' + compact(repo.delta)), ' ', t('metric.delta')),
          h('span', null, h('b', null, percent(repo.growthRatio)), ' ', t('metric.growth')),
        ),
        h(
          'div',
          { className: 'gt-tags' },
          repo.language ? h('span', { className: 'gt-tag' }, h('span', { className: 'gt-dot', style: { background: repo.languageColor || 'var(--dsw-alias-state-idle-primary)', marginRight: 5 } }), repo.language) : null,
          h(Tag, { tone: 'brand' }, repo.categoryZh),
          models.map(function (model) {
            return h('span', { className: 'gt-tag gt-model', key: 'model-' + model }, model)
          }),
          zhReadme ? h('span', { className: 'gt-tag gt-badge-zh' }, t('card.zhReadme')) : null,
          (repo.stack || []).filter(function (tech) { return tech !== repo.language }).slice(0, 3).map(function (tech) {
            return h('span', { className: 'gt-tag', key: tech }, tech)
          }),
        ),
        blocks.length
          ? h(
              'div',
              { className: 'gt-block' },
              blocks.map(function (block, index) {
                return h('div', { key: index }, h('b', null, block.label + '：'), block.text)
              }),
            )
          : null,
        repo.source === 'popular' ? h('div', { className: 'gt-source' }, t('card.sourcePopular')) : null,
        repo.source === 'filler' ? h('div', { className: 'gt-source', 'data-source': 'filler' }, t('card.sourceFiller')) : null,
        typeof repo.matchScore === 'number'
          ? h(
              'div',
              { className: 'gt-match', 'data-match-score': String(matchScoreText(repo.matchScore)) },
              h('span', { className: 'gt-tag', 'data-tone': 'brand' }, t('ai.match') + ' ' + matchScoreText(repo.matchScore)),
              repo.matchReason ? h('span', { className: 'gt-match-reason' }, String(repo.matchReason)) : null,
            )
          : null,
        h(
          'div',
          { className: 'gt-helper-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'gt-helper-btn',
              onClick: function () { onExplain(repo, t) },
            },
            t('action.what'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'gt-helper-btn gt-helper-upload',
              onClick: function () { onUpload(repo, t) },
            },
            t('action.upload'),
          ),
          isPlugin === true
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'gt-helper-btn',
                  onClick: function () { onInstallFromCard(repo, t) },
                },
                t('install.cardBtn'),
              )
            : null,
        ),
      )
    }

    /** 0–100 integer for the badge; anything non-numeric is simply hidden. */
    function matchScoreText(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return ''
      return String(Math.max(0, Math.min(100, Math.round(number))))
    }

    /**
     * Search-fallback card. These rows only carry the GitHub Search fields, so
     * they get a compact card of their own and an explicit origin marker.
     */
    function SearchCard(props) {
      const repo = props.repo
      const t = props.t
      return h(
        'article',
        { className: 'gt-repo gt-repo-simple gt-repo-search', 'data-origin': 'search' },
        h(
          'div',
          { className: 'gt-repo-head' },
          h('span', { className: 'gt-avatar', title: repo.owner }, String(repo.owner || '?').slice(0, 2)),
          h(
            'div',
            { style: { minWidth: 0, flex: 1 } },
            h('a', { className: 'gt-repo-name', href: repo.url, target: '_blank', rel: 'noreferrer', title: repo.fullName }, repo.name || repo.fullName),
            h('span', { className: 'gt-repo-owner' }, repo.owner),
          ),
          h(Tag, { tone: 'brand' }, t('ai.searchBadge')),
        ),
        h('p', { className: 'gt-desc' }, repo.description || '—'),
        h(
          'div',
          { className: 'gt-metrics' },
          h('span', null, h('b', null, compact(repo.stars)), ' ', t('metric.stars')),
          repo.language ? h('span', null, h('b', null, String(repo.language))) : null,
        ),
      )
    }

    function useReport(params) {
      const [state, setState] = useState(function () {
        return { status: 'loading', data: null, error: null, startedAt: Date.now() }
      })
      const [nonce, setNonce] = useState(0)
      const [elapsedSeconds, setElapsedSeconds] = useState(0)
      // Mutable ref (the shim has no useRef): cancel() needs the live controller.
      const [abortRef] = useState(function () {
        return { current: null }
      })
      // Monotonic per-effect token. Responses of either phase only apply while
      // their own effect is still the latest one; comparing query strings would
      // misfire because the two phases differ by `enrich`.
      const [requestRef] = useState(function () {
        return { current: 0 }
      })
      // `pending` while the enriched tier is in flight, `failed` when it could
      // not update the snapshot, `idle` once it landed (or was abandoned).
      const [deepState, setDeepState] = useState({ status: 'idle' })
      useEffect(
        function () {
          const controller = new AbortController()
          abortRef.current = controller
          const requestId = requestRef.current + 1
          requestRef.current = requestId
          let alive = true
          const startedAt = Date.now()
          setState(function (prev) {
            return { status: prev.data ? 'refreshing' : 'loading', data: prev.data, error: null, startedAt: startedAt }
          })
          setDeepState({ status: 'pending' })
          const query = new URLSearchParams({ since: params.since, limit: '50', focus: '3' })
          if (params.language) query.set('language', params.language)
          if (nonce > 0) query.set('refresh', '1')
          // Phase 1 asks for the cheap snapshot, phase 2 for the enriched cards.
          // Both carry the same since/language/refresh, so they describe one board.
          const snapshotQuery = new URLSearchParams(query.toString())
          snapshotQuery.set('enrich', '0')
          const fullQuery = new URLSearchParams(query.toString())
          fullQuery.set('enrich', '1')

          function isCurrent() {
            return alive && requestId === requestRef.current
          }

          function readBody(response) {
            return response.json().then(
              function (body) {
                if (!response.ok) throw new Error(describeFailure(response.status, body))
                return body
              },
              function () {
                throw new Error(describeFailure(response.status, null))
              },
            )
          }

          fetch(BASE + '/report?' + snapshotQuery.toString(), {
            signal: controller.signal,
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          })
            .then(readBody)
            .then(function (data) {
              if (!isCurrent()) return
              // A 200 payload may carry `error`: the host reached the route but
              // the upstream fetch failed. Render the error state, keep chips.
              if (data && data.error) {
                const attempts = Array.isArray(data.error.attempts)
                  ? data.error.attempts.map(function (entry, index) {
                      return {
                        attempt: Number(entry && entry.attempt) || index + 1,
                        ms: Number(entry && entry.ms) || 0,
                        reasons: Array.isArray(entry && entry.reasons) ? entry.reasons : [],
                      }
                    })
                  : null
                setState({
                  status: 'error',
                  data: data,
                  error: {
                    class: data.error.class === 'network' ? 'network' : 'source',
                    detail: String(data.error.detail || ''),
                    attempts: attempts,
                    durationMs: Number(data.durationMs) || 0,
                  },
                  startedAt: startedAt,
                })
                setDeepState({ status: 'idle' })
                return
              }
              // The snapshot may render at once only when no board is on screen
              // yet (first load, retry, or a since/language switch). On a
              // refresh the already displayed deep cards must stay put.
              setState(function (prev) {
                const previous = prev && prev.data
                const boardChanged =
                  !previous ||
                  String(previous.since || '') !== String(params.since || '') ||
                  String(previous.language || '') !== String(params.language || '')
                return {
                  status: 'refreshing',
                  data: boardChanged ? data : previous,
                  error: null,
                  startedAt: startedAt,
                }
              })
              fetch(BASE + '/report?' + fullQuery.toString(), {
                signal: controller.signal,
                credentials: 'same-origin',
                headers: { accept: 'application/json' },
              })
                .then(readBody)
                .then(function (full) {
                  if (!isCurrent()) return
                  // The enriched tier failed while the snapshot is already
                  // usable: keep the data, never flip into the error card, and
                  // leave one "not updated" line instead.
                  if (full && full.error) {
                    setDeepState({ status: 'failed' })
                    setState(function (prev) {
                      return {
                        status: 'ready',
                        data: prev && prev.data,
                        error: null,
                        startedAt: (prev && prev.startedAt) || startedAt,
                      }
                    })
                    return
                  }
                  setState({ status: 'ready', data: full, error: null, startedAt: startedAt })
                  setDeepState({ status: 'idle' })
                })
                .catch(function (error) {
                  if (!isCurrent()) return
                  if (error && error.name === 'AbortError') return
                  setDeepState({ status: 'failed' })
                  setState(function (prev) {
                    return {
                      status: 'ready',
                      data: prev && prev.data,
                      error: null,
                      startedAt: (prev && prev.startedAt) || startedAt,
                    }
                  })
                })
            })
            .catch(function (error) {
              if (!isCurrent()) return
              if (error && error.name === 'AbortError') return
              setDeepState({ status: 'idle' })
              setState({
                status: 'error',
                data: null,
                error: {
                  class: 'network',
                  detail: (error && error.message) || String(error),
                },
                startedAt: startedAt,
              })
            })
          return function () {
            alive = false
            controller.abort()
            if (abortRef.current === controller) abortRef.current = null
          }
        },
        [params.since, params.language, nonce],
      )
      // Tick once a second while a request is in flight, so the panel shows how
      // long it has been waiting instead of an apparently frozen skeleton.
      useEffect(
        function () {
          if (state.status !== 'loading' && state.status !== 'refreshing') {
            setElapsedSeconds(0)
            return undefined
          }
          const startedAt = Number(state.startedAt) || Date.now()
          const tick = function () {
            setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
          }
          tick()
          const timer = setInterval(tick, 1000)
          // Node tests must not be kept alive by the panel's ticker.
          if (timer && typeof timer.unref === 'function') timer.unref()
          return function () {
            clearInterval(timer)
          }
        },
        [state.status, state.startedAt],
      )
      function cancel() {
        const controller = abortRef.current
        if (controller) controller.abort()
        abortRef.current = null
        setDeepState({ status: 'idle' })
        setState(function (prev) {
          return {
            status: 'error',
            data: prev.data,
            error: { class: 'canceled', detail: '请求已取消' },
            startedAt: prev.startedAt,
          }
        })
      }
      return [
        state,
        function () {
          // Retry from the error state must visibly enter the loading state at
          // once; waiting for the effect would leave the old error card up.
          setState(function (prev) {
            if (prev && prev.status === 'error') {
              return { status: 'loading', data: null, error: null, startedAt: Date.now() }
            }
            return prev
          })
          setNonce(function (value) {
            return value + 1
          })
        },
        cancel,
        elapsedSeconds,
        deepState,
      ]
    }

    /**
     * AI Chinese intro channel. The template text is already on screen, so this
     * hook only swaps the 项目介绍 and 上手门槛 blocks once a translation arrives
     * (the onboarding half only when the model returned a non-empty value).
     * Requests are deduped per parameter set at module scope; the resolved map
     * lives in component state. Every failure path (412, 5xx, abort, network)
     * returns an empty map and leaves the template untouched.
     */
    const TRANSLATE_CACHE = new Map()
    const TRANSLATE_TIMEOUT_MS = 20000

    function useTranslatedIntros(data, since, language) {
      const [intros, setIntros] = useState(null)

      useEffect(
        function () {
          if (!data) return
          // The snapshot tier renders first and carries no README excerpt; the
          // translate route only ever sees full reports. Asking for a model
          // intro while the snapshot is on screen would cache an empty answer
          // and the deep cards would never get one.
          if (Number(data.enrichedCount) === 0) return
          // useReport always requests limit=50; the translate route keys its
          // recent-report cache by that same normalized request.
          const limit = 50
          const key = since + '|' + (language || '') + '|' + String(limit)
          let entry = TRANSLATE_CACHE.get(key)
          let cancelled = false

          function deliver(map) {
            if (!cancelled && map && typeof map === 'object' && Object.keys(map).length > 0) setIntros(map)
          }

          if (!entry) {
            entry = { intros: null, promise: null }
            TRANSLATE_CACHE.set(key, entry)
            const controller = new AbortController()
            const timer = setTimeout(function () {
              controller.abort()
            }, TRANSLATE_TIMEOUT_MS)
            entry.promise = (async function () {
              try {
                const statusResponse = await fetch(BASE + '/status', {
                  signal: controller.signal,
                  credentials: 'same-origin',
                  headers: { accept: 'application/json' },
                })
                if (!statusResponse.ok) return {}
                const status = await statusResponse.json()
                if (!status || status.configured !== true) return {}
                const response = await fetch(BASE + '/translate', {
                  method: 'POST',
                  signal: controller.signal,
                  credentials: 'same-origin',
                  headers: { accept: 'application/json', 'content-type': 'application/json' },
                  body: JSON.stringify({ since: since, language: language, limit: limit }),
                })
                if (!response.ok) return {}
                const payload = await response.json()
                const map = {}
                const items = payload && Array.isArray(payload.items) ? payload.items : []
                for (const item of items) {
                  if (!item || !item.fullName) continue
                  let intro = ''
                  let onboarding = ''
                  if (typeof item === 'string') {
                    // Backward compatibility: a bare string was the intro.
                    intro = item
                  } else {
                    intro = typeof item.intro === 'string' ? item.intro : ''
                    if (typeof item.onboarding === 'string') {
                      onboarding = item.onboarding
                      // A time estimate must never reach the panel; the rule
                      // sentence is better than a guessed duration.
                      if (/小时|半天|分钟|天/.test(onboarding)) onboarding = ''
                    }
                  }
                  if (intro || onboarding) map[item.fullName] = { intro: intro, onboarding: onboarding }
                }
                return map
              } catch (error) {
                return {}
              } finally {
                clearTimeout(timer)
              }
            })()
            entry.promise = entry.promise.then(function (map) {
              entry.intros = map
              // An empty answer (no cached report on the host, no key, a 4xx)
              // must not be remembered: the full tier may arrive later and ask
              // again. Only a real translation is worth caching.
              if (!map || Object.keys(map).length === 0) TRANSLATE_CACHE.delete(key)
              return map
            })
          }

          if (entry.intros) {
            deliver(entry.intros)
            return function () {
              cancelled = true
            }
          }
          if (entry.promise) {
            entry.promise.then(deliver)
            return function () {
              cancelled = true
            }
          }
        },
        [data, since, language],
      )

      return intros
    }

    function Panel(props) {
      const t = useMemo(function () { return makeT(LOCALE) }, [])
      const [since, setSince] = useState('daily')
      const [language, setLanguage] = useState('')
      const [category, setCategory] = useState((props && props.initialCategory) || 'all')
      const [search, setSearch] = useState('')
      const [page, setPage] = useState((props && Number(props.initialPage)) || 1)
      const [firstRender, setFirstRender] = useState(true)
      // Dismissed banners are read from localStorage exactly once, on the first
      // render; useState keeps later clicks immediate without another read.
      const [hiddenBanners, setHiddenBanners] = useState(readUiMemory)
      // AI filter: 内置大模型链路（provider=deepseek-account），无需用户配置 key。
      // aiConfigured 仅作为「AI 通道是否可用」的软探测，失败也不禁用入口。
      const [aiConfigured, setAiConfigured] = useState(null)
      const [githubConfigured, setGithubConfigured] = useState(null)
      const [aiOpen, setAiOpen] = useState(false)
      const [aiPrompt, setAiPrompt] = useState('')
      const [aiLoading, setAiLoading] = useState(false)
      const [aiError, setAiError] = useState(null)
      const [aiResult, setAiResult] = useState(null)
      const [helpOpen, setHelpOpen] = useState(false)
      // First-run onboarding: shown until the user ticks "下次不再提示" and
      // closes it. The initial value is read lazily from localStorage once.
      const [firstRunOpen, setFirstRunOpen] = useState(readFirstRunPending)
      const [firstRunRemember, setFirstRunRemember] = useState(false)
      // Fallback hint shown at the top of the panel when the bottom tutorial
      // cannot be located (no DOM, or the tutorial card is not mounted).
      const [helpHint, setHelpHint] = useState(false)
      const [state, refresh, cancelLoad, elapsedSeconds, deepState] = useReport({ since: since, language: language })
      const data = state.data
      const intros = useTranslatedIntros(data, since, language)

      // Probe the AI status once; the built-in model chain needs no key, so a
      // failed probe must NOT disable the AI entry — it stays usable and the
      // host falls back to the local template when the model is unavailable.
      useEffect(function () {
        let alive = true
        const run = async function () {
          try {
            const response = await fetch(BASE + '/status', {
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            })
            if (!alive) return
            let body = null
            try {
              body = response && response.ok ? await response.json() : null
            } catch (error) {
              body = null
            }
            if (!alive) return
            setAiConfigured(body ? Boolean(body.aiConfigured !== false) : true)
            setGithubConfigured(Boolean(body && body.githubTokenConfigured === true))
          } catch (error) {
            if (alive) setAiConfigured(null)
          }
        }
        run()
        return function () {
          alive = false
        }
      }, [])

      function toggleAi() {
        // A configured:false status disables the entry, and even a synthetic
        // click on the disabled node must not reach the network.
        if (aiConfigured === false) return
        setAiOpen(function (value) { return !value })
      }

      /** Close the onboarding dialog; only the ticked checkbox writes memory. */
      function closeFirstRun() {
        if (firstRunRemember) writeFirstRunDone()
        setFirstRunOpen(false)
      }

      /**
       * Scroll the bottom tutorial into view and flash it. Returns false when
       * there is no DOM or no `[data-ai-help]` node yet; never throws, so even
       * an exotic host cannot turn the click into a dead key.
       */
      function revealTutorial() {
        try {
          if (typeof document === 'undefined' || !document || typeof document.querySelector !== 'function') return false
          const node = document.querySelector('[data-ai-help]')
          if (!node) return false
          try {
            if (typeof node.scrollIntoView === 'function') {
              node.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          } catch (error) {
            /* scrollIntoView is best-effort; the flash below still marks the spot */
          }
          try {
            if (node.classList && typeof node.classList.add === 'function') node.classList.add('gt-flash')
            else if (typeof node.className === 'string') node.className = node.className + ' gt-flash'
            setTimeout(function () {
              try {
                if (node.classList && typeof node.classList.remove === 'function') node.classList.remove('gt-flash')
                else if (typeof node.className === 'string') node.className = node.className.replace(/\s*gt-flash\b/g, '')
              } catch (error) {
                /* ignore */
              }
            }, 2500)
          } catch (error) {
            /* ignore */
          }
          return true
        } catch (error) {
          return false
        }
      }

      /** "去看怎么配" closes the dialog, opens the tutorial, then reveals it. */
      function firstRunToTutorial() {
        try {
          if (firstRunRemember) writeFirstRunDone()
          setFirstRunOpen(false)
          setHelpOpen(true)
          setHelpHint(false)
        } catch (error) {
          /* never a dead key */
        }
        try {
          // Wait one tick so the tutorial card has been committed/painted
          // before we scroll to it.
          setTimeout(function () {
            try {
              if (!revealTutorial()) setHelpHint(true)
            } catch (error) {
              try {
                setHelpHint(true)
              } catch (inner) {
                /* ignore */
              }
            }
          }, 60)
        } catch (error) {
          /* ignore */
        }
      }

      /** The fallback hint's "去底部" button retries the same reveal. */
      function hintToTutorial() {
        try {
          if (revealTutorial()) setHelpHint(false)
        } catch (error) {
          /* ignore */
        }
      }

      function aiErrorText(status) {
        if (status === 412) return t('ai.err.412')
        if (status === 403) return t('ai.err.403')
        if (status === 429) return t('ai.err.429')
        return t('ai.err.generic')
      }

      async function sendAi(text) {
        setAiLoading(true)
        setAiError(null)
        const controller = new AbortController()
        const timer = setTimeout(function () { controller.abort() }, AI_TIMEOUT_MS)
        try {
          const response = await fetch(BASE + '/ai', {
            method: 'POST',
            signal: controller.signal,
            credentials: 'same-origin',
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: JSON.stringify({ prompt: text, since: since, language: language, limit: 50 }),
          })
          if (!response.ok) {
            setAiError(aiErrorText(response.status))
            return
          }
          const payload = await response.json()
          const items = payload && Array.isArray(payload.items) ? payload.items : []
          const board = []
          const search = []
          // Keep the payload order exactly: the host decides ranking, the panel
          // only splits trending rows from search-fallback rows.
          for (const item of items) {
            if (!item || typeof item !== 'object') continue
            if (item.origin === 'search') search.push(item)
            else board.push(item)
          }
          setAiResult({ board: board, search: search })
          setPage(1)
        } catch (error) {
          const name = error && error.name
          setAiError(name === 'AbortError' || name === 'TimeoutError' ? t('ai.err.timeout') : t('ai.err.generic'))
        } finally {
          clearTimeout(timer)
          setAiLoading(false)
        }
      }

      function submitAi() {
        const text = aiPrompt.trim()
        if (!text) return
        // 内置大模型链路：请求只发往本机 DSH 服务，无需二次确认弹窗。
        sendAi(text)
      }

      function clearAi() {
        setAiResult(null)
        setAiPrompt('')
        setAiError(null)
        setPage(1)
      }

      function dismissBanner(kind) {
        const next = { fallback: hiddenBanners.fallback === true, shortfall: hiddenBanners.shortfall === true }
        next[kind] = true
        writeUiMemory(next)
        setHiddenBanners(next)
      }

      function restoreBanners() {
        clearUiMemory()
        setHiddenBanners({})
      }

      // Reset to page 1 when a filter changes, but keep an explicit initial page
      // on the first render so offline tests can mount page 2 / page 3 directly.
      useEffect(function () {
        if (firstRender) {
          setFirstRender(false)
          return
        }
        setPage(1)
      }, [since, language, category, search])

      const repos = (data && data.repos) || []
      const customBoards = (data && data.customBoards) || []
      const chips = useMemo(function () { return buildChips(data || {}, t) }, [data, t])
      const customActive = customBoards.some(function (board) { return board.key === category })

      const filtered = useMemo(
        function () {
          return filterRepos(repos, category, search, customBoards)
        },
        [repos, category, search, customBoards],
      )

      // When an AI result is active the board is rendered from the response, in
      // the response's own order. Chip/search filters still narrow it, but the
      // panel never sorts: no score comparison happens on the client.
      const aiActive = Boolean(aiResult)
      const displayRepos = useMemo(
        function () {
          if (!aiResult) return filtered
          return filterRepos(aiResult.board, category, search, customBoards)
        },
        [aiResult, filtered, category, search, customBoards],
      )
      const aiSearchItems = aiActive ? aiResult.search : []

      // An `error` payload already renders its own error card; a shortfall or
      // network banner on top of it would duplicate the same failure.
      const reportFailed = Boolean(data && data.error)
      const shortfall = reportFailed ? '' : shortfallText(data, t)
      const networkNote = reportFailed ? '' : networkBanner(data, t)
      const qualityNote = installQualityBanner(data, t)
      const fallbackActive = Boolean(data && data.networkStatus === 'fallback')
      const showShortfall = Boolean(shortfall) && hiddenBanners.shortfall !== true
      const showNetwork = Boolean(networkNote) && !(fallbackActive && hiddenBanners.fallback === true)
      const anyBannerHidden = hiddenBanners.fallback === true || hiddenBanners.shortfall === true

      const totalPages = Math.max(1, Math.ceil(displayRepos.length / PAGE_SIZE))
      const currentPage = Math.min(page, totalPages)
      const pageRepos = displayRepos.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
      // Layering is decided by the GLOBAL list index, never by the page-local one:
      // with deepCount=10, page 2 shows 4 deep + 2 simple instead of 6 deep cards.
      const deepCount = Math.max(1, Number(data && data.deepCount != null ? data.deepCount : 10) || 10)
      const summary = (data && data.summary) || null
      const children = []

      children.push(
        h(
          'header',
          { className: 'gt-head', key: 'head' },
          h(
            'div',
            { className: 'gt-brand' },
            h('div', { className: 'gt-mark' }, h(TrendIcon, { size: 22 })),
            h(
              'div',
              null,
              h('h1', { className: 'gt-h1' }, t('title')),
              h('p', { className: 'gt-sub' }, t('subtitle')),
            ),
          ),
          h(
            'div',
            { className: 'gt-actions' },
            data ? h('span', { className: 'gt-note' }, t('updated') + ' ' + localTime(data.generatedAt) + ' · ' + (data.cache === 'hit' ? t('cache.hit') : t('cache.fresh'))) : null,
            h('button', { type: 'button', className: 'gt-btn', onClick: refresh, disabled: state.status === 'loading' || state.status === 'refreshing' }, t('refresh')),
            h('button', { type: 'button', className: 'gt-btn', onClick: function () { onMine(t) }, title: t('mine.title') }, t('mine.title')),
            h('button', { type: 'button', className: 'gt-btn', onClick: function () { openUploadDialog({ name: '', fullName: '' }, t) }, title: t('upload.title') }, t('mine.upload')),
            h('button', { type: 'button', className: 'gt-btn', 'data-primary': '1', onClick: function () { onInstall(t) }, title: t('catalog.title') }, t('action.install')),
          ),
        ),
      )

      // Fallback for hosts without a reachable tutorial node: say where the
      // tutorial is and offer a button that retries the scroll.
      if (helpHint) {
        children.push(
          h(
            'div',
            { className: 'gt-banner gt-help-hint', key: 'help-hint', 'data-help-hint': '1' },
            h('span', { className: 'gt-banner-text' }, t('help.hint')),
            h(
              'button',
              { type: 'button', className: 'gt-banner-dismiss', 'data-help-hint-go': '1', onClick: hintToTutorial },
              t('help.hint.go'),
            ),
          ),
        )
      }

      children.push(
        h(
          'div',
          { className: 'gt-toolbar', key: 'toolbar' },
          h(
            'div',
            { className: 'gt-seg' },
            ['daily', 'weekly', 'monthly'].map(function (value) {
              return h(
                'button',
                { key: value, type: 'button', 'data-active': since === value ? '1' : '0', onClick: function () { setSince(value) } },
                t('period.' + value),
              )
            }),
          ),
          h(
            'select',
            { className: 'gt-select', value: language, onChange: function (event) { setLanguage(event.target.value) }, 'aria-label': t('filter.language') },
            LANGUAGES.map(function (item) {
              return h('option', { key: item.slug || 'all', value: item.slug }, item.label)
            }),
          ),
          h('input', {
            className: 'gt-input',
            placeholder: t('search.placeholder'),
            value: search,
            onChange: function (event) { setSearch(event.target.value) },
            'aria-label': t('search.placeholder'),
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'gt-btn gt-ai-toggle',
              'data-ai-toggle': '1',
              disabled: aiConfigured === false,
              title: aiConfigured === false ? t('ai.needKey') : t('ai.entry'),
              'aria-expanded': aiOpen ? 'true' : 'false',
              onClick: toggleAi,
            },
            t('ai.entry'),
          ),
          aiConfigured === false ? h('span', { className: 'gt-ai-hint', 'data-ai-hint': '1' }, t('ai.needKey')) : null,
        ),
      )

      if (aiOpen && aiConfigured !== false) {
        children.push(
          h(
            'div',
            { className: 'gt-ai-box', key: 'aibox' },
            h('input', {
              className: 'gt-input gt-ai-input',
              'data-ai-input': '1',
              placeholder: t('ai.placeholder'),
              value: aiPrompt,
              'aria-label': t('ai.entry'),
              onChange: function (event) { setAiPrompt(event.target.value) },
              onKeyDown: function (event) {
                if (event && event.key === 'Enter') submitAi()
              },
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'gt-btn',
                'data-primary': '1',
                'data-ai-submit': '1',
                disabled: aiLoading || aiPrompt.trim() === '',
                onClick: submitAi,
              },
              aiLoading ? t('ai.loading') : t('ai.submit'),
            ),
            h(
              'button',
              { type: 'button', className: 'gt-btn', 'data-ai-clear': '1', disabled: aiLoading, onClick: clearAi },
              t('ai.clear'),
            ),
          ),
        )
      }

      children.push(
        h(
          'div',
          { className: 'gt-chips', key: 'chips' },
          chips.map(function (item) {
            return h(
              'button',
              { key: item.key, type: 'button', className: 'gt-chip', 'data-active': category === item.key ? '1' : '0', onClick: function () { setCategory(item.key) } },
              item.label,
            )
          }),
        ),
      )

      if (showShortfall || showNetwork || qualityNote) {
        children.push(
          h(
            'div',
            { className: 'gt-banners', key: 'banners' },
            showShortfall
              ? h(
                  'div',
                  { className: 'gt-banner gt-shortfall', key: 'shortfall' },
                  h('span', { className: 'gt-banner-text' }, shortfall),
                  h('button', { type: 'button', className: 'gt-banner-dismiss', 'data-dismiss': 'shortfall', onClick: function () { dismissBanner('shortfall') } }, t('banner.dismiss')),
                )
              : null,
            showNetwork
              ? h(
                  'div',
                  { className: 'gt-banner gt-network', key: 'network' },
                  h('span', { className: 'gt-banner-text' }, networkNote),
                  fallbackActive
                    ? h('button', { type: 'button', className: 'gt-banner-dismiss', 'data-dismiss': 'fallback', onClick: function () { dismissBanner('fallback') } }, t('banner.dismiss'))
                    : null,
                )
              : null,
            qualityNote ? h('div', { className: 'gt-banner gt-install-quality', key: 'quality' }, qualityNote) : null,
          ),
        )
      }

      if ((state.status === 'loading' || state.status === 'refreshing') && !data) {
        children.push(h('div', { className: 'gt-skeleton', key: 'sk1' }))
        children.push(h('div', { className: 'gt-skeleton', key: 'sk2', style: { height: 180 } }))
        children.push(
          h(
            'div',
            { className: 'gt-loading', key: 'note' },
            h('p', { className: 'gt-note' }, t('loading')),
            h('p', { className: 'gt-note', 'data-elapsed': '1' }, t('loading.elapsed', { seconds: elapsedSeconds })),
            elapsedSeconds >= 12
              ? h(
                  'div',
                  { className: 'gt-slow', 'data-slow': '1' },
                  h('span', null, t('loading.slow')),
                  h(
                    'button',
                    { type: 'button', className: 'gt-btn', 'data-cancel-load': '1', onClick: cancelLoad },
                    t('cancel'),
                  ),
                )
              : null,
          ),
        )
      } else if (state.status === 'error') {
        const attemptLine = errorAttemptLine(state.error, t)
        const attemptCount = state.error && Array.isArray(state.error.attempts) ? state.error.attempts.length : 0
        children.push(
          h(
            'div',
            { className: 'gt-error', key: 'error', 'data-error-state': '1' },
            h('b', null, errorHeadline(state.error, t)),
            attemptLine
              ? h('div', { className: 'gt-error-attempts', 'data-attempts': String(attemptCount) }, attemptLine)
              : state.error && state.error.detail
                ? h('div', { className: 'gt-error-detail' }, state.error.detail)
                : null,
            h(
              'div',
              { className: 'gt-error-actions', style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 } },
              h(
                'button',
                {
                  type: 'button',
                  className: 'gt-btn',
                  'data-retry': '1',
                  onClick: refresh,
                },
                t('retry'),
              ),
              attemptCount > 0
                ? h('span', { className: 'gt-error-tried', 'data-tried': String(attemptCount) }, t('error.tried', { count: attemptCount }))
                : null,
            ),
          ),
        )
      } else if (data) {
        if (aiError) {
          children.push(h('div', { className: 'gt-banner gt-ai-error', key: 'ai-error', 'data-ai-error': '1' }, aiError))
        }

        // One static line above the list: the snapshot is usable, the enriched
        // tier is either still loading or could not refresh it.
        if (deepState && deepState.status === 'pending') {
          children.push(h('div', { className: 'gt-deep-note', key: 'deep-note', 'data-deep-state': 'pending' }, t('deep.pending')))
        } else if (deepState && deepState.status === 'failed') {
          children.push(h('div', { className: 'gt-deep-note gt-deep-note-failed', key: 'deep-note', 'data-deep-state': 'failed' }, t('deep.failed')))
        }

        children.push(
          h(
            'div',
            { className: 'gt-grid', key: 'stats' },
            h(Stat, { label: t('stat.repos'), value: compact(summary ? summary.repoCount : repos.length), hint: (data.language || t('filter.all')) + ' · ' + t('period.' + data.since) }),
            h(Stat, { label: t('stat.delta'), value: '+' + compact(summary ? summary.totalDelta : 0), hint: summary && summary.topMover ? summary.topMover.fullName : '' }),
            h(Stat, { label: t('stat.stars'), value: compact(summary ? summary.totalStars : 0), hint: summary ? shortRisk(summary.riskCount, t) : '' }),
            h(Stat, { label: t('stat.language'), value: (summary && summary.topLanguage) || '—', hint: percent(summary ? summary.avgGrowth : 0) + ' ' + t('metric.growth') }),
          ),
        )

        children.push(
          h(
            'section',
            { className: 'gt-card', key: 'repos' },
            h(
              'h2',
              { className: 'gt-section-title' },
              t('section.repos'),
              h(
                'small',
                null,
                aiActive
                  ? t('ai.sorted') + ' · ' + String(displayRepos.length) + ' / ' + String(repos.length)
                  : String(displayRepos.length) + ' / ' + String(repos.length),
              ),
            ),
            displayRepos.length === 0
              ? h('div', { className: 'gt-empty' }, customActive ? emptyHint(t) : t('empty'))
              : h('div', { className: 'gt-cards' }, pageRepos.map(function (repo, index) {
                  const globalIndex = (currentPage - 1) * PAGE_SIZE + index
                  return h(RepoCard, { key: repo.fullName, repo: repo, t: t, intros: intros, mode: globalIndex < deepCount ? 'deep' : 'simple' })
                })),
            displayRepos.length > PAGE_SIZE
              ? h(
                  'div',
                  { className: 'gt-pager', style: { marginTop: 12 } },
                  h('span', null, t('page.info', { page: currentPage, total: totalPages, count: displayRepos.length })),
                  h(
                    'div',
                    { className: 'gt-pager-btns' },
                    h('button', { type: 'button', disabled: currentPage <= 1, onClick: function () { setPage(currentPage - 1) }, 'aria-label': t('page.prev') }, '‹'),
                    Array.from({ length: totalPages }, function (_item, index) {
                      const number = index + 1
                      if (totalPages > 7 && Math.abs(number - currentPage) > 2 && number !== 1 && number !== totalPages) return null
                      return h(
                        'button',
                        { key: number, type: 'button', 'data-active': number === currentPage ? '1' : '0', onClick: function () { setPage(number) } },
                        String(number),
                      )
                    }).filter(Boolean),
                    h('button', { type: 'button', disabled: currentPage >= totalPages, onClick: function () { setPage(currentPage + 1) }, 'aria-label': t('page.next') }, '›'),
                  ),
                )
              : null,
          ),
        )

        if (aiSearchItems.length > 0) {
          children.push(
            h(
              'section',
              { className: 'gt-card gt-search-group', key: 'ai-search' },
              h('h2', { className: 'gt-section-title' }, t('ai.searchGroup'), h('small', null, String(aiSearchItems.length))),
              h(
                'div',
                { className: 'gt-cards' },
                aiSearchItems.map(function (repo) {
                  return h(SearchCard, { key: 'search-' + repo.fullName, repo: repo, t: t })
                }),
              ),
            ),
          )
        }

        // Restore entry point, directly below the pager: only rendered while at
        // least one banner is remembered as hidden.
        if (anyBannerHidden) {
          children.push(
            h(
              'div',
              { className: 'gt-restore-bar', key: 'restore' },
              h(
                'button',
                { type: 'button', className: 'gt-restore', 'data-action': 'restore', onClick: restoreBanners },
                t('banner.hidden') + ' · ' + t('banner.restore'),
              ),
            ),
          )
        }

        // Configuration tutorial, collapsed by default and shown at the very
        // bottom of the panel. It never echoes any credential — only status.
        children.push(
          h(
            'section',
            { className: 'gt-card gt-ai-help', key: 'ai-help', 'data-ai-help': '1' },
            h(
              'button',
              {
                type: 'button',
                className: 'gt-ai-help-toggle',
                'data-ai-help-toggle': '1',
                'aria-expanded': helpOpen ? 'true' : 'false',
                onClick: function () { setHelpOpen(function (value) { return !value }) },
              },
              h('span', null, t('help.title')),
              h('span', { className: 'gt-ai-help-caret' }, helpOpen ? '收起' : '展开'),
            ),
            h(
              'div',
              { className: 'gt-ai-help-state gt-help-status', 'data-help-status': '1' },
              h('span', { 'data-help-token-status': '1' }, t('help.github.title') + '：' + (githubConfigured === true ? '已配置' : '未配置（可选）')),
              h('span', { 'data-help-ai-status': '1' }, t('help.builtin.title')),
            ),
            helpOpen
              ? h(
                  'div',
                  { className: 'gt-ai-help-body', 'data-ai-help-body': '1' },
                  h('h4', { className: 'gt-ai-help-title' }, t('help.github.title')),
                  h('p', { className: 'gt-help-path', 'data-help-path': 'github' }, t('help.github.file')),
                  h(
                    'div',
                    { className: 'gt-help-code-wrap' },
                    h('pre', { className: 'gt-ai-help-code', 'data-help-code': 'github' }, t('help.github.steps')),
                    h(
                      'button',
                      { type: 'button', className: 'gt-help-copy', 'data-help-copy': 'github', onClick: function () { copyHelpText(t('help.github.steps')) } },
                      t('help.copy'),
                    ),
                  ),
                  h('h4', { className: 'gt-ai-help-title' }, t('help.github.faq.title')),
                  h('pre', { className: 'gt-ai-help-code', 'data-help-faq': 'github' }, t('help.github.faq')),
                  h('h4', { className: 'gt-ai-help-title' }, t('help.builtin.title')),
                  h('pre', { className: 'gt-ai-help-code', 'data-help-code': 'builtin' }, t('help.builtin.body')),
                )
              : null,
          ),
        )
      }

      // First-run onboarding: a single non-blocking dialog above the panel.
      // "去看怎么配" closes it and opens the tutorial at the bottom.
      if (firstRunOpen) {
        children.push(
          h(
            'div',
            { className: 'gt-consent', key: 'first-run', 'data-first-run': '1', role: 'dialog', 'aria-modal': 'true' },
            h(
              'div',
              { className: 'gt-consent-card gt-firstrun-card' },
              h('h3', { className: 'gt-consent-title' }, t('firstRun.title')),
              h('p', { className: 'gt-consent-line gt-firstrun-item' }, h('b', null, t('firstRun.free.title')), t('firstRun.free.body')),
              h('p', { className: 'gt-consent-line gt-firstrun-item' }, h('b', null, t('firstRun.token.title')), t('firstRun.token.body')),
              h('p', { className: 'gt-consent-line gt-firstrun-item' }, h('b', null, t('firstRun.ai.title')), t('firstRun.ai.body')),
              h('p', { className: 'gt-consent-line gt-firstrun-wait', 'data-first-run-wait': '1' }, t('firstRun.wait')),
              h(
                'label',
                { className: 'gt-firstrun-remember' },
                h('input', {
                  type: 'checkbox',
                  'data-first-run-remember': '1',
                  checked: firstRunRemember,
                  onChange: function (event) { setFirstRunRemember(Boolean(event && event.target && event.target.checked)) },
                }),
                t('firstRun.remember'),
                h('span', { className: 'gt-firstrun-note', 'data-first-run-note': '1' }, t('firstRun.note')),
              ),
              h(
                'div',
                { className: 'gt-firstrun-actions' },
                h('button', { type: 'button', className: 'gt-btn', 'data-first-run-use': '1', onClick: closeFirstRun }, t('firstRun.use')),
                h('button', { type: 'button', className: 'gt-btn', 'data-primary': '1', 'data-first-run-help': '1', onClick: firstRunToTutorial }, t('firstRun.help')),
              ),
            ),
          ),
        )
      }

      return h('div', { className: 'gt-root' }, h('style', null, CSS), h('div', { className: 'gt-shell' }, children))
    }

    return {
      inject: ['slots'],
      /** Exposed for the bundle smoke test: lets it assert every label exists in both languages. */
      dictionaries: { zh: ZH, en: EN },
      /** Offline-test surface for the Task-4 chip/search/banner logic. */
      __test: { buildChips, filterRepos, emptyHint, shortfallText, networkBanner, installQualityBanner, errorHeadline },
      apply(ctx) {
        HOST_CTX = ctx
        let locale = null
        try {
          locale = typeof ctx.get === 'function' ? ctx.get('locale') : null
        } catch (error) {
          locale = null
        }
        if (locale && typeof locale.register === 'function') {
          try {
            locale.register(NS, 'zh', ZH)
            locale.register(NS, 'en', EN)
          } catch (error) {
            /* translations are optional; the built-in dictionary is the fallback */
          }
        }
        LOCALE = locale

        const t = makeT(locale)

        // 自我维护：slots API 在 DSH 升级后可能改名或缺失。
        // 逐块兜底，任何一处失败都不让整个插件加载崩溃。
        try {
          if (ctx.slots && typeof ctx.slots.inject === 'function' && typeof ctx.slots.register === 'function') {
            ctx.slots.inject('sidebar.panellist', function () {
              return ctx.slots.register({ name: 'sidebar.panellist', id: 'github-trending', order: 30, label: t('nav.title') }, NavIcon)
            })
            ctx.slots.inject('main', function () {
              return ctx.slots.register({ name: 'main', key: 'github-trending' }, Panel)
            })
          } else {
            console.warn('[GitHub 助手] 当前 DSH 未提供 slots 接口，面板未挂载（核心功能不受影响）。')
          }
        } catch (error) {
          console.warn('[GitHub 助手] 面板挂载失败，核心功能不受影响：', error && error.message ? error.message : String(error))
        }
      },
    }
  },
})