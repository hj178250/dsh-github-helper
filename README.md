# DSH GitHub 助手

一个给 DSH（DeepSeek Harness）用的中文 GitHub 插件。装好以后，你在 DSH 的侧边栏就能看到 GitHub 热门项目卡片，点一下就能看懂项目、一键传到自己的 GitHub，还能把别的 DSH 插件一键装进自己的 DSH。**全程中文，不用读英文 README，登录不用输密码。**

## 五个功能

### 功能一：中文热门卡片

打开面板即可看到 GitHub 日榜 / 周榜 / 月榜，渲染成中文卡片。每张卡片显示：

- 用大白话重新组织的中文一句话概括（不是英文直译）
- Star 数、Fork 数、本期新增、增长率
- 编程语言、13 类中文分类标签（AI / 大模型、开发者工具、基础设施 / 云原生、数据 / 数据库……）
- 深卡 / 简卡两种展示：靠前的卡片带完整解读，靠后的显示精简信息

支持语言筛选、分类标签筛选、关键词搜索、分页。

### 功能二：点一下，小白解释

每张卡片上都有「这是什么？」按钮。点击后，插件把项目名称、描述、分类、语言、README 片段组织成一段上下文，交给 DSH 用固定三段式、大白话解释：

1. 它到底是干什么的（不超过 30 字）
2. 普通人能拿它做什么（1–2 个具体场景）
3. 原理大概是怎么回事（用生活类比，不讲代码细节）

解释完全由 DSH 自身完成，不调用任何外部 AI 服务、不消耗额外的接口费用。

也可直接对 DSH 说「解释一下 xxx 项目」触发同名工具 `github_explain`。

### 功能三：一键上传到自己的 GitHub

卡片上有「传到我的 GitHub」按钮。点击后：

1. 未登录 → 自动发起设备码登录：屏幕显示一个授权码，你去浏览器打开授权页面输入一次即可，**全程不输入密码**。
2. 已登录 → 填写本地项目文件夹路径、仓库名（默认用文件夹名）、选择公开 / 私有。
3. 自动完成：建仓 → 克隆 → 拷贝文件 → 提交 → 推送，完成后返回仓库链接。

上传链路移植自 `dsh-github-ops` 的 `github_repo` + `github_git`，走本机真实 git，令牌以一次性请求头传递，不写进仓库地址、不经过对话模型。

登录令牌保存在 `~/.dsh/github-auth.json`（Windows 为 `%USERPROFILE%\.dsh\github-auth.json`）。

### 功能四：应用下载（下载项目到本地）

每张卡片上还有「应用下载」按钮。点击后填写保存目录（默认系统「下载」目录），插件通过 GitHub 接口拉取项目源码包（zipball）并自动解压到本地。下载走 `api.github.com` + `codeload.github.com`，不依赖 git 写通道，国内网络可直接下载。

「我的项目」弹窗里的每一行也有「下载到本地」按钮，可以把你自己账号下的任意仓库下载下来。

### 功能五：一键装到 DSH

面板头部有「装到 DSH」按钮。点击后弹出部署窗口：

1. 选择目标配置（自动列出 `~/.dsh/profiles` 下的所有配置，`web` 置顶）。
2. 从插件清单里点选一个（内置 12 个常用 DSH 插件），或手动填写 npm 包名 / `账号/仓库名` / `github:账号/仓库名`。
3. 点「立即部署」，插件在后台调用 pnpm 安装，并把插件名写进该配置的启动清单，重启 DSH 后生效。

安装自动处理国内网络：git 走 gh-proxy 镜像、注入 git 到 PATH、修正 Windows PATH 大小写冲突，无需手动配置。也可直接对 DSH 说「把 xxx 装到 DSH」触发 `github_install`。

### 自我维护（抗 DSH 更新）

插件按「服务可选、逐项隔离」设计，DSH 升级后不会因为某个服务接口变化而整体崩溃：

- 所有 host 服务（tools / web / slots / commands）获取都带存在性检查，缺失时安全跳过并打日志。
- 工具注册、路由挂载逐项 try-catch，单个失败不影响其它工具与接口。
- 客户端面板注入（slots.inject）失败时降级为控制台告警，不让插件加载中断。
- 启动时打印 `compatibility: node=X platform=Y`，方便排查版本兼容问题。

## 可用工具

| 工具名 | 作用 |
| --- | --- |
| `github_trending` | 拉取并分析热门榜，返回中文卡片数据 |
| `github_login` | `action=start` 发起设备码登录；`action=status` 检查登录状态 |
| `github_explain` | 组织项目的三段式解释上下文，交由 DSH 解释 |
| `github_repo` | 在自己的账号下建仓 |
| `github_git` | 克隆 / 提交 / 推送 / 查看状态 |
| `github_upload` | 一键上传（建仓 + 克隆 + 拷贝 + 提交 + 推送） |
| `github_download` | 应用下载：把 GitHub 项目源码包下载并解压到本地（默认在系统「下载」目录） |
| `github_mine` | 浏览自己账号下的所有项目（仓库列表） |
| `github_install` | 一键装到 DSH：把插件装进指定配置并加入启动清单（`spec` / `repo` / `profile`） |
| `github_profiles` | 列出本机所有可用的 DSH 配置 |
| `github_catalog` | 列出内置的常用 DSH 插件清单 |

## 面板 HTTP 接口

- `GET /dsh-github-trending/report`：榜单数据
- `POST /dsh-github-trending/explain`：生成解释上下文
- `POST /dsh-github-trending/login/start`：发起设备码登录
- `GET /dsh-github-trending/login/status`：检查登录状态
- `POST /dsh-github-trending/upload`：一键上传
- `GET /dsh-github-trending/mine`：浏览自己账号的所有项目
- `POST /dsh-github-trending/download`：应用下载（下载并解压项目源码包）
- `GET /dsh-github-trending/profiles`：列出本机 DSH 配置
- `GET /dsh-github-trending/catalog`：列出常用 DSH 插件清单
- `POST /dsh-github-trending/install`：一键装到 DSH（`spec` + `profile`）

## 来源与致谢

- 趋势抓取、分类体系、中文卡片渲染移植自 [Night-Leaf/dsh-github-trending-plus](https://github.com/Night-Leaf/dsh-github-trending-plus)（原作者 yhm，源自 Royalsan/dsh-github-trending）。
- 上传链路移植自 [slowhiring/dsh-github-ops](https://github.com/slowhiring/dsh-github-ops)。
- 设备码登录网络逻辑移植自 [Noob-stupid/dsh-github-login](https://github.com/Noob-stupid/dsh-github-login)，改为纯 JS 实现，不依赖独立程序。

## 许可

MIT
