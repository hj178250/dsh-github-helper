// DSH GitHub 助手 —— 登录 / 建仓 / 上传 / 小白解释 核心模块。
// 上传链路移植自 slowhiring/dsh-github-ops 的 github_repo + github_git；
// 设备码登录为纯 JS 实现（移植自 Noob-stupid/dsh-github-login 的网络逻辑，无独立 exe）。
// 所有面向用户的文字均为中文。

import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

// Windows 上 PATH 里的 git 常是 git.cmd 垫片，execFile 无法直接执行 .cmd。
// 解析出真实的 git.exe：优先环境变量，其次读垫片里的引用路径，再退回常见安装位置。
let _gitBin
async function gitBin() {
  if (_gitBin) return _gitBin
  const override = (process.env.DSH_GIT_BIN || '').trim()
  if (override) return (_gitBin = override)
  if (process.platform !== 'win32') return (_gitBin = 'git')
  try {
    const probe = await run('where', ['git'], { windowsHide: true })
    const lines = String(probe.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    for (const line of lines) {
      if (/\.exe$/i.test(line)) return (_gitBin = line)
      if (/\.(cmd|bat)$/i.test(line)) {
        try {
          const text = await readFile(line, 'utf8')
          const m = text.match(/"([^"]+?\.exe)"/i) || text.match(/([^\s"]+?\.exe)/i)
          if (m && existsSync(m[1])) return (_gitBin = m[1])
        } catch { /* 继续找下一个 */ }
      }
    }
  } catch { /* 继续走兜底 */ }
  const fallbacks = [
    join(process.env.LOCALAPPDATA || '', 'mingit', 'cmd', 'git.exe'),
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  ]
  for (const f of fallbacks) {
    if (f && existsSync(f)) return (_gitBin = f)
  }
  return (_gitBin = 'git')
}

export const CLIENT_ID = '178c6fc778ccc68e1d6a' // GitHub CLI 公开客户端标识
export const SCOPES = 'repo workflow gist read:org'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'
const VERIFY_URL = 'https://github.com/login/device'
const DEFAULT_API = 'https://api.github.com'
const MAX_TEXT = 20000

const L = (...xs) => xs.filter((x) => x !== undefined && x !== null && x !== '').join('\n')
const cap = (s, max = MAX_TEXT) => (String(s ?? '').length <= max ? String(s ?? '') : `${String(s).slice(0, max)}\n…（内容过长，已截断）`)
const short = (s, max = 300) => (String(s ?? '').length <= max ? String(s ?? '') : `${String(s ?? '').slice(0, max)}…`)

/* ---------------- 令牌文件（~/.dsh/github-auth.json） ---------------- */

function authFile() {
  const base = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
  return join(base, 'github-auth.json')
}

export async function readAuth() {
  try {
    const raw = await readFile(authFile(), 'utf8')
    const data = JSON.parse(raw)
    if (data && typeof data.token === 'string' && data.token) return data
  } catch {
    /* 没有就是没有 */
  }
  return undefined
}

export async function saveAuthFile(token, login, scopes) {
  const payload = {
    login: login || null,
    token,
    scopes: Array.isArray(scopes) ? scopes : String(scopes || '').split(/\s+/).filter(Boolean),
    savedAt: new Date().toISOString(),
  }
  await mkdir(dirname(authFile()), { recursive: true })
  await writeFile(authFile(), JSON.stringify(payload, null, 2), 'utf8')
  return payload
}

export async function tokenFromAnywhere(ctx) {
  const file = await readAuth()
  if (file && file.token) return { token: file.token, source: '本地登录文件', login: file.login }
  try {
    const svc = typeof ctx?.get === 'function' ? ctx.get('credentials') : undefined
    if (svc && typeof svc.readRecord === 'function') {
      const rec = await svc.readRecord('dsh-github/token')
      const key = rec && rec.kind === 'api-key' ? rec.key : ''
      if (key) return { token: key, source: '凭据库', login: undefined }
    }
  } catch {
    /* 忽略 */
  }
  const env = (process.env.GITHUB_TOKEN || '').trim() || (process.env.GH_TOKEN || '').trim()
  if (env) return { token: env, source: '环境变量', login: undefined }
  return undefined
}

/* ---------------- 设备码登录（纯 JS） ---------------- */

const LOGIN_SESSIONS = new Map()

async function postForm(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(20000),
  })
  return res.json()
}

/** 第一步：申请设备码，返回给用户去浏览器授权。 */
export async function loginStart() {
  const body = `client_id=${CLIENT_ID}&scope=${encodeURIComponent(SCOPES)}`
  const data = await postForm(DEVICE_CODE_URL, body)
  if (!data || !data.device_code || !data.user_code) {
    throw new Error(`申请授权码失败：${data && data.error_description ? data.error_description : '没有拿到授权码'}`)
  }
  const intervalMs = Math.max(Number(data.interval) || 5, 3) * 1000 // 下限 3 秒，避免 slow_down
  const expiresAt = Date.now() + (Number(data.expires_in) || 900) * 1000
  const session = {
    deviceCode: data.device_code,
    userCode: data.user_code,
    intervalMs,
    expiresAt,
    status: '等待授权',
    token: undefined,
    login: undefined,
  }
  LOGIN_SESSIONS.set(data.user_code, session)

  // 后台轮询，不占用工具调用时间；拿到令牌就写入本地文件。
  pollDeviceCode(session).catch(() => {
    session.status = '轮询出错'
  })

  return L(
    '已经向 GitHub 申请好授权码，请按下面两步完成登录（全程不用输入密码）：',
    '',
    `第一步：打开授权页面 ${VERIFY_URL}`,
    `第二步：在页面里填入这个码：${data.user_code}`,
    '',
    `这个码 ${Math.round((Number(data.expires_in) || 900) / 60)} 分钟内有效。授权完成后回来点「检查登录状态」即可，令牌会自动保存。`,
  )
}

async function pollDeviceCode(session) {
  while (Date.now() < session.expiresAt) {
    await new Promise((r) => setTimeout(r, session.intervalMs))
    const body =
      `client_id=${CLIENT_ID}&device_code=${encodeURIComponent(session.deviceCode)}` +
      `&grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code')}`
    let data
    try {
      data = await postForm(ACCESS_TOKEN_URL, body)
    } catch {
      continue // 网络抖动继续重试
    }
    const err = data && data.error ? String(data.error) : ''
    if (data && data.access_token) {
      session.token = data.access_token
      session.status = '已登录'
      let login = null
      let scopes = data.scope
      try {
        const res = await fetch(USER_URL, {
          headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${data.access_token}`, 'user-agent': 'dsh-github-helper' },
          signal: AbortSignal.timeout(15000),
        })
        if (res.ok) {
          const me = await res.json()
          login = me && me.login
        }
      } catch {
        /* 用户名拿不到不影响登录 */
      }
      await saveAuthFile(data.access_token, login, scopes)
      if (login) session.login = login
      return
    }
    if (err === 'authorization_pending') {
      session.status = '等待你在浏览器里授权…'
      continue
    }
    if (err === 'slow_down') {
      session.intervalMs += 5000
      continue
    }
    if (err === 'expired_token') {
      session.status = '授权码已过期，请重新发起登录'
      return
    }
    if (err === 'access_denied') {
      session.status = '你在浏览器里拒绝了授权'
      return
    }
    // 其它未知错误：短暂等待再试
  }
  session.status = '授权码已过期，请重新发起登录'
}

/** 是否已登录（供面板判断该显示登录按钮还是上传表单）。 */
export async function isLoggedIn(ctx) {
  return Boolean(await tokenFromAnywhere(ctx))
}

/** 检查登录状态：读本地令牌文件，并（若可用）向 GitHub 确认用户名。 */
export async function loginStatus(ctx) {
  const found = await tokenFromAnywhere(ctx)
  if (!found) {
    return L(
      '当前还没有登录 GitHub。',
      '调用登录工具（action=start）会给出授权码，按提示去浏览器授权一次即可，全程不用输入密码。',
    )
  }
  let login = found.login
  if (!login) {
    try {
      const res = await fetch(USER_URL, {
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${found.token}`, 'user-agent': 'dsh-github-helper' },
        signal: AbortSignal.timeout(12000),
      })
      if (res.ok) {
        const me = await res.json()
        login = me && me.login
      }
    } catch {
      /* 忽略 */
    }
  }
  const active = [...LOGIN_SESSIONS.values()].find((s) => s.status.includes('等待'))
  return L(
    `已经登录${login ? `，账号是 ${login}` : ''}。`,
    `令牌来源：${found.source}。`,
    active ? `另有一个待授权的码 ${active.userCode}，当前状态：${active.status}。` : '',
    '现在可以直接使用「传到我的 GitHub」了。',
  )
}

/* ---------------- GitHub REST ---------------- */

class GhError extends Error {
  constructor(message, status = 0, extra = {}) {
    super(message)
    this.name = 'GhError'
    this.status = status
    Object.assign(this, extra)
  }
}

function apiBase() {
  return (process.env.GITHUB_API_URL || DEFAULT_API).replace(/\/+$/, '')
}

async function request(ctx, spec) {
  const { method = 'GET', path, query, body } = spec
  const found = await tokenFromAnywhere(ctx)
  if (!found) throw new GhError('还没有登录 GitHub。请先调用登录工具完成设备码授权。', 0, { code: 'no-token' })
  const url = new URL(apiBase() + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-github-helper',
    'x-github-api-version': '2022-11-28',
    authorization: `Bearer ${found.token}`,
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  let res
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000) })
  } catch (e) {
    throw new GhError(`连接 GitHub 时网络出错：${e && e.message ? e.message : e}`, 0, { code: 'network' })
  }
  const text = await res.text()
  let data = text
  if (text && (res.headers.get('content-type') || '').includes('json')) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!res.ok) {
    let message = (data && data.message) || short(text, 300) || `HTTP ${res.status}`
    // GitHub 建仓等接口把真正原因放在 errors[].message 里，拼进来便于判断和提示。
    if (data && Array.isArray(data.errors) && data.errors.length) {
      const details = data.errors.map((item) => item && (item.message || item.code)).filter(Boolean).join('；')
      if (details) message = `${message}：${details}`
    }
    throw new GhError(message, res.status, { body: data })
  }
  return { data }
}

/* ---------------- 本地 git ---------------- */

function gitEnv() {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', GCM_INTERACTIVE: 'never' }
}

// 有些网络 github.com 直连不通、需走代理。这里一次性探测并缓存决定：
// 直连可用就原样返回；不可用则用 gh-proxy 代理（或用户自定义的 DSH_GITHUB_GIT_PROXY）。
let _gitProxyPrefix
async function gitTransportUrl(githubUrl) {
  let prefix
  const custom = process.env.DSH_GITHUB_GIT_PROXY
  if (custom !== undefined && custom.trim() !== '') {
    prefix = custom.trim()
  } else if (custom !== undefined) {
    prefix = '' // 显式设为空 = 强制直连
  } else {
    if (_gitProxyPrefix === undefined) {
      let reachable = false
      try {
        await fetch('https://github.com', { signal: AbortSignal.timeout(6000) })
        reachable = true
      } catch { /* 直连不通 */ }
      _gitProxyPrefix = reachable ? '' : 'https://gh-proxy.com/'
    }
    prefix = _gitProxyPrefix
  }
  if (!prefix) return githubUrl
  return prefix.replace(/\/+$/, '') + '/' + String(githubUrl).replace(/^https?:\/\//, '')
}

function authConfigArgs(token, targetUrl) {
  if (!token) return []
  const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64')
  let host = 'github.com'
  try { if (targetUrl) host = new URL(targetUrl).host } catch { /* 用默认 */ }
  return ['-c', `http.https://${host}/.extraheader=Authorization: Basic ${basic}`]
}

// 代理转发的主机未必接受 extraheader（push 时会要求输入用户名）。
// 用一次性带令牌的 URL 直接推送，令牌只在进程参数里出现，错误信息统一脱敏。
function withToken(url, token) {
  const u = new URL(url)
  if (token) { u.username = 'x-access-token'; u.password = token }
  return u.toString()
}

/* ---------------- 通过仓库接口推送（github.com 直连不通、代理只读时的可靠写通道） ---------------- */

// 递归收集要上传的文件，排除临时/敏感目录与凭证文件。
function collectFiles(root) {
  const out = []
  const skipDirs = new Set(['.git', '_refs', 'node_modules', 'dist', '.cache', '_smoke_upload'])
  const skipNames = new Set(['.DS_Store', 'Thumbs.db', 'github-auth.json', 'github-token', '_smoke.mjs'])
  const walk = (dir, rel) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (skipDirs.has(e.name) || skipNames.has(e.name)) continue
      // 排除下划线开头的本地临时文件（_preview* / _smoke* / _publish* 等）与凭证文件
      if (/^_/.test(e.name) || /^github-auth.*\.json$/.test(e.name) || /\.(pem|pfx)$/i.test(e.name)) continue
      const full = join(dir, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(full, r)
      else if (e.isFile()) out.push({ path: r, full })
    }
  }
  walk(root, '')
  return out
}

// GitHub Git Database API：建 blob → 建 tree → 建 commit → 更新分支引用。
async function apiPush(ctx, { owner, repo, files, branch, message, token }) {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  let parentSha = null
  let baseTreeSha = null
  let head = branch
  try {
    // 先用仓库元数据拿到默认分支名，再取该分支的引用；空仓库会报 409 Git Repository is empty。
    const meta = (await request(ctx, { path: base })).data
    head = meta.default_branch || branch
    const ref = (await request(ctx, { path: `${base}/git/ref/heads/${encodeURIComponent(head)}` })).data
    parentSha = ref.object && ref.object.sha
    if (parentSha) {
      const commit = (await request(ctx, { path: `${base}/git/commits/${parentSha}` })).data
      baseTreeSha = commit.tree && commit.tree.sha
    }
  } catch { /* 空仓库还没有分支，走新建 */ }

  const tree = []
  for (const f of files) {
    const content = readFileSync(f.full).toString('base64')
    let blob
    try {
      blob = (await request(ctx, { method: 'POST', path: `${base}/git/blobs`, body: { content, encoding: 'base64' } })).data
    } catch (e) {
      throw new GhError(`上传「${f.path}」失败：${e && e.message ? e.message : e}`, e && e.status || 0)
    }
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha })
  }

  const treeBody = { tree }
  if (baseTreeSha) treeBody.base_tree = baseTreeSha
  const newTree = (await request(ctx, { method: 'POST', path: `${base}/git/trees`, body: treeBody })).data

  const commitBody = { message: message || 'DSH GitHub 助手上传', tree: newTree.sha }
  if (parentSha) commitBody.parents = [parentSha]
  const newCommit = (await request(ctx, { method: 'POST', path: `${base}/git/commits`, body: commitBody })).data

  if (parentSha) {
    await request(ctx, { method: 'PATCH', path: `${base}/git/refs/heads/${encodeURIComponent(head)}`, body: { sha: newCommit.sha, force: true } })
  } else {
    await request(ctx, { method: 'POST', path: `${base}/git/refs`, body: { ref: `refs/heads/${head}`, sha: newCommit.sha } })
  }
  return head
}

function redact(text, token) {
  const s = String(text || '')
  return token ? s.split(token).join('***') : s
}

async function git(dir, argv, options = {}) {
  const { token, timeout = 180000 } = options
  try {
    const bin = await gitBin()
    const { stdout, stderr } = await run(bin, argv, { cwd: dir, env: gitEnv(), timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
    return { ok: true, stdout: redact(stdout, token), stderr: redact(stderr, token) }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ok: false, message: '这台机器上找不到 git 命令。' }
    if (error && error.code === 'EPERM') return { ok: false, message: '当前环境不允许启动 git 子进程。' }
    const killed = error && (error.killed || error.signal)
    return {
      ok: false,
      code: error && error.code,
      stdout: redact(error && error.stdout, token),
      stderr: redact(error && error.stderr, token),
      message: killed ? 'git 超时或被中断。' : short(redact(error && error.stderr, token) || (error && error.message) || String(error), 1200),
    }
  }
}

function reposRoot() {
  const raw = (process.env.DSH_GITHUB_DIR || '').trim()
  return raw ? resolve(raw) : join(homedir(), 'dsh-github')
}

/* ---------------- 一键上传（建仓 + 克隆 + 拷贝 + 提交 + 推送） ---------------- */

import { cp } from 'node:fs/promises'

/**
 * 一步到位把本地项目传到自己 GitHub。
 * 链路完全照搬 slowhiring/dsh-github-ops：建仓 → clone → 拷贝文件 → commit → push。
 */
export async function uploadProject(ctx, args) {
  const localPath = resolve(String(args.localPath || '').trim() || '.')
  if (!existsSync(localPath)) throw new GhError(`本地项目路径不存在：${localPath}`, 0)

  const name = String(args.repoName || '').trim() || basename(localPath)
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new GhError('仓库名只能用字母、数字、点、下划线、短横线。', 0)
  }
  const isPrivate = args.private === true
  const description = String(args.description || '').trim() || `由 DSH GitHub 助手上传：${name}`

  // 1) 建仓（auto_init=true 生成初始提交，保证空仓库也能走仓库接口追加文件）
  let created
  try {
    created = (await request(ctx, {
      method: 'POST',
      path: '/user/repos',
      body: { name, description, private: isPrivate, auto_init: true },
    })).data
  } catch (e) {
    if (isAlreadyExists(e)) {
      // 仓库已存在则复用，继续走推送链路
      created = (await request(ctx, { method: 'GET', path: `/repos/${encodeURIComponent((await currentLogin(ctx)) || '')}/${encodeURIComponent(name)}` })).data
    } else {
      throw e
    }
  }

  const full = created.full_name
  const found = await tokenFromAnywhere(ctx)
  const token = found && found.token

  // 收集本地项目文件（排除 .git / _refs / 依赖目录 / 凭证文件）。
  const files = collectFiles(localPath)
  if (!files.length) throw new GhError('本地目录里没有可上传的文件。', 0)

  const [owner, repoName] = full.split('/')

  // 上传通道抽成可插拔策略：按顺序尝试，任一成功即返回。仓库接口直传优先（只依赖
  // api.github.com，最快最稳、不经过对话模型、不耗 Token），失败再退回本地 git 链路。
  // 将来要加新通道（例如 SSH、Git LFS、第三方托管）只需往数组里加一项，不动主流程。
  const uploadStrategies = [
    {
      mode: '仓库接口上传',
      async run() {
        return await apiPush(ctx, { owner, repo: repoName, files, branch, message: 'DSH GitHub 助手首次上传', token })
      },
    },
    {
      mode: '本地 git 上传',
      async run() {
        const rawCloneUrl = created.clone_url || `https://github.com/${full}.git`
        const cloneUrl = await gitTransportUrl(rawCloneUrl)
        const cfg = authConfigArgs(token, cloneUrl)
        const workRoot = join(reposRoot(), '_upload_' + Date.now())
        await mkdir(dirname(workRoot), { recursive: true })
        const cloned = await git(dirname(workRoot), [...cfg, 'clone', '--origin', 'origin', cloneUrl, workRoot], { token })
        if (!cloned.ok) throw new GhError(`克隆新仓库失败：${cloned.message}`, 0)
        await cp(localPath, workRoot, { recursive: true, force: true })
        const staged = await git(workRoot, ['add', '-A'], { token })
        if (!staged.ok) throw new GhError(`暂存文件失败：${staged.message}`, 0)
        const committed = await git(workRoot, ['commit', '-m', 'DSH GitHub 助手首次上传'], { token })
        if (!committed.ok && !/nothing to commit/i.test(committed.message || '')) throw new GhError(`提交失败：${committed.message}`, 0)
        const cur = await git(workRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], { token })
        if (cur.ok && cur.stdout.trim() && cur.stdout.trim() !== 'HEAD') branch = cur.stdout.trim()
        const pushUrl = withToken(cloneUrl, token)
        const pushed = await git(workRoot, ['push', pushUrl, `HEAD:refs/heads/${branch}`], { token })
        if (!pushed.ok) throw new GhError(`推送失败：${pushed.message}`, 0)
        return branch
      },
    },
  ]

  let pushMode = ''
  let branch = 'main'
  let lastError
  for (const strategy of uploadStrategies) {
    try {
      const pushedBranch = await strategy.run()
      branch = pushedBranch || branch
      pushMode = strategy.mode
      break
    } catch (e) {
      lastError = e
      if (process.env.DSH_DEBUG_UPLOAD) console.error(`[upload ${strategy.mode} failed]`, e && e.message ? e.message : String(e))
    }
  }
  if (!pushMode) throw new GhError(`上传失败：${lastError && lastError.message ? lastError.message : '所有上传通道都不可用。'}`, 0)

  return L(
    `上传完成！仓库已经出现在你的 GitHub 账号下。`,
    '',
    `仓库全名：${full}`,
    `仓库链接：${created.html_url || `https://github.com/${full}`}`,
    `公开/私有：${created.private ? '私有' : '公开'}`,
    `推送分支：${branch}`,
    `上传方式：${pushMode}`,
  )
}

/** 判断建仓失败是否因为仓库已存在（GitHub 会把细节放在 body.errors 里）。 */
function isAlreadyExists(error) {
  if (!(error instanceof GhError)) return false
  if (/already exists|name already exists|repository creation failed/i.test(error.message || '')) return true
  const errors = error.body && error.body.errors
  if (Array.isArray(errors)) {
    return errors.some((item) => /already exists|already taken/i.test(String(item && (item.message || item.code || ''))))
  }
  return false
}

async function currentLogin(ctx) {
  try {
    return (await request(ctx, { path: '/user' })).data.login
  } catch {
    return undefined
  }
}

/* ---------------- 应用下载（把 GitHub 项目源码包下载并解压到本地） ---------------- */

// 解压 zip：Windows 自带 tar.exe（libarchive 内核，支持 zip）；失败再退 PowerShell Expand-Archive。
async function extractZip(zipPath, destDir, token) {
  if (process.platform === 'win32') {
    const tarRes = await git(destDir, ['-xf', zipPath, '-C', destDir], { token, timeout: 300000 })
    if (tarRes.ok) return
    // tar.exe 不可用时退回 PowerShell 解压
    const ps = [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
    ]
    try {
      await run('powershell.exe', ps, { cwd: destDir, timeout: 300000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
      return
    } catch (e) {
      throw new GhError(`解压源码包失败：${short(redact((e && e.message) || String(e), token), 600)}`, 0)
    }
  }
  const res = await git(destDir, ['unzip', '-o', zipPath, '-d', destDir], { token, timeout: 300000 })
  if (!res.ok) throw new GhError(`解压源码包失败：${res.message}`, 0)
}

/**
 * 应用下载：把一个 GitHub 项目的源码包（zipball）下载并解压到本地文件夹。
 * 下载走 api.github.com 的 zipball 接口（带令牌可下私有仓库），自动跟随 302 到
 * codeload.github.com 的签名地址（直连网络下唯一稳定的下载通道）。
 * 解压用本机自带工具，不经过对话模型、不消耗 Token。
 */
export async function downloadRepo(ctx, args) {
  const repoInput = String((args && (args.repo || args.fullName)) || '')
    .trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
  if (!/^[^/\s]+\/[^/\s]+$/.test(repoInput)) throw new GhError('请给出仓库，格式为「账号/仓库名」。', 0)
  const [owner, name] = repoInput.split('/')
  const found = await tokenFromAnywhere(ctx)
  const token = found && found.token

  // 1) 仓库元数据：拿默认分支与展示信息
  let branch = String((args && args.branch) || '').trim()
  let meta = null
  try {
    meta = (await request(ctx, { path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` })).data
    if (!branch) branch = meta.default_branch || 'main'
  } catch (e) {
    if (!branch) branch = 'main'
    meta = null
  }

  // 2) 下载目录（默认当前用户的「下载」文件夹）
  const dest = resolve(String((args && args.dest) || '').trim() || join(homedir(), 'Downloads'))
  await mkdir(dest, { recursive: true })

  // 3) 下载 zip（跟随重定向到 codeload 的签名地址；令牌只在请求头里，不写进任何文件）
  const url = `${apiBase()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/zipball/${encodeURIComponent(branch)}`
  const headers = { 'user-agent': 'dsh-github-helper' }
  if (token) headers.authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(600000) })
  } catch (e) {
    throw new GhError(`下载源码包时网络出错：${e && e.message ? e.message : e}`, 0, { code: 'network' })
  }
  if (!res.ok) {
    let detail = ''
    try {
      const t = await res.text()
      const j = t ? JSON.parse(t) : null
      detail = (j && j.message) || short(t, 200)
    } catch { /* 保留空详情 */ }
    throw new GhError(`下载失败：HTTP ${res.status}${detail ? `（${detail}）` : ''}`, res.status)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) throw new GhError('下载到的源码包是空的，请稍后再试。', 0)

  const zipPath = join(dest, `${name}-${branch}.zip`)
  await writeFile(zipPath, buf)

  // 4) 解压并清掉临时 zip
  await extractZip(zipPath, dest, token)
  try { await writeFile(zipPath, ''); await unlink(zipPath) } catch { /* 删除失败不影响结果 */ }

  // 5) 找出解压出来的顶层文件夹（codeload 的 zip 顶层是「仓库名-分支」）
  let folder = `${name}-${branch}`
  try {
    const entries = readdirSync(dest, { withFileTypes: true })
    const hits = entries.filter((e) => e.isDirectory() && (e.name === `${name}-${branch}` || e.name.startsWith(`${name}-`)))
    if (hits.length) folder = hits[0].name
  } catch { /* 用默认名字 */ }

  return L(
    '下载完成！项目源码已经解压到本地文件夹。',
    '',
    `项目：${meta && meta.full_name ? meta.full_name : repoInput}`,
    `分支：${branch}`,
    `保存位置：${join(dest, folder)}`,
    `文件大小：${(buf.length / 1024 / 1024).toFixed(1)} MB`,
    `打开方式：用资源管理器进入上面的文件夹即可查看全部源码。`,
  )
}

/* ---------------- 后台下载任务（进度条 + 不卡面板） ---------------- */

/** 下载任务注册表：id -> {id, repo, status, received, total, folder, error, startedAt, finishedAt}。 */
const DOWNLOAD_TASKS = new Map()
let DOWNLOAD_SEQ = 0

/** 发起一次后台下载：立即返回任务 id，下载在后台进行，前端轮询 /download/status/:id。 */
export function startDownloadTask(ctx, args) {
  const id = `dl_${Date.now()}_${++DOWNLOAD_SEQ}`
  const repoInput = String((args && (args.repo || args.fullName)) || '')
    .trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
  if (!/^[^/\s]+\/[^/\s]+$/.test(repoInput)) throw new GhError('请给出仓库，格式为「账号/仓库名」。', 0)
  const task = {
    id,
    repo: repoInput,
    dest: String((args && args.dest) || '').trim() || join(homedir(), 'Downloads'),
    status: 'downloading',
    received: 0,
    total: 0,
    folder: '',
    error: '',
    startedAt: Date.now(),
    finishedAt: 0,
  }
  DOWNLOAD_TASKS.set(id, task)
  // 超过 50 个任务清理最旧的已完成项，防止注册表无限增长。
  if (DOWNLOAD_TASKS.size > 50) {
    const done = [...DOWNLOAD_TASKS.values()].filter((t) => t.status === 'done' || t.status === 'failed').sort((a, b) => a.finishedAt - b.finishedAt)
    for (const t of done.slice(0, DOWNLOAD_TASKS.size - 50)) DOWNLOAD_TASKS.delete(t.id)
  }
  runDownloadTask(ctx, task).catch(() => { /* 状态已记录在 task */ })
  return { id, repo: task.repo, status: task.status }
}

/** 真正的下载执行体：写 task 状态供前端轮询。复用 downloadRepo 的网络与解压链路。 */
async function runDownloadTask(ctx, task) {
  try {
    const [owner, name] = task.repo.split('/')
    const found = await tokenFromAnywhere(ctx)
    const token = found && found.token

    // 元数据：默认分支
    let branch = ''
    try {
      const meta = (await request(ctx, { path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` })).data
      branch = meta && meta.default_branch ? meta.default_branch : 'main'
    } catch { branch = 'main' }

    const dest = resolve(task.dest)
    await mkdir(dest, { recursive: true })
    const url = `${apiBase()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/zipball/${encodeURIComponent(branch)}`
    const headers = { 'user-agent': 'dsh-github-helper' }
    if (token) headers.authorization = `Bearer ${token}`
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(600000) })
    if (!res.ok) throw new GhError(`下载失败：HTTP ${res.status}`, res.status)
    task.total = Number(res.headers.get('content-length')) || 0

    // 流式读取：每收到一段就更新 received，前端进度条实时可读。
    const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null
    const chunks = []
    let received = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(Buffer.from(value))
        received += value.length
        task.received = received
        if (task.cancelled) { try { await reader.cancel() } catch { /* 释放 */ } throw new GhError('下载已取消。', 0) }
      }
    } else {
      const buf = Buffer.from(await res.arrayBuffer())
      chunks.push(buf)
      received = buf.length
      task.received = received
    }
    const zipBuf = Buffer.concat(chunks)
    if (!zipBuf.length) throw new GhError('下载到的源码包是空的，请稍后再试。', 0)

    task.status = 'extracting'
    const zipPath = join(dest, `${name}-${branch}.zip`)
    await writeFile(zipPath, zipBuf)
    await extractZip(zipPath, dest, token)
    try { await unlink(zipPath) } catch { /* 删除失败不影响结果 */ }

    let folder = `${name}-${branch}`
    try {
      const entries = readdirSync(dest, { withFileTypes: true })
      const hits = entries.filter((e) => e.isDirectory() && (e.name === `${name}-${branch}` || e.name.startsWith(`${name}-`)))
      if (hits.length) folder = hits[0].name
    } catch { /* 用默认名字 */ }
    task.folder = join(dest, folder)
    task.total = task.total || received
    task.status = 'done'
    task.finishedAt = Date.now()
  } catch (e) {
    task.status = 'failed'
    task.error = e instanceof GhError ? e.message : (e && e.message ? e.message : String(e))
    task.finishedAt = Date.now()
  }
}

/** 查询下载任务状态（前端进度条轮询用）。 */
export function getDownloadTask(id) {
  const task = DOWNLOAD_TASKS.get(String(id || ''))
  if (!task) return null
  const percent = task.total > 0 ? Math.min(100, Math.round((task.received / task.total) * 100)) : (task.status === 'done' ? 100 : (task.status === 'extracting' ? 99 : 0))
  return {
    id: task.id,
    repo: task.repo,
    status: task.status,
    received: task.received,
    total: task.total,
    percent,
    folder: task.folder,
    error: task.error,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
  }
}

/** 列出全部下载任务（面板任务中心用）。 */
export function listDownloadTasks() {
  return [...DOWNLOAD_TASKS.values()].map((t) => getDownloadTask(t.id)).filter(Boolean)
}

/** 取消一个还在进行的下载任务。 */
export function cancelDownloadTask(id) {
  const task = DOWNLOAD_TASKS.get(String(id || ''))
  if (!task) return { ok: false, text: '没有找到这个下载任务。' }
  if (task.status !== 'downloading' && task.status !== 'extracting') {
    return { ok: false, text: `任务已经是「${task.status === 'done' ? '完成' : task.status === 'failed' ? '失败' : task.status}」状态。` }
  }
  task.cancelled = true
  return { ok: true, text: '正在取消，请稍候刷新状态。' }
}

/* ---------------- DSH 插件识别 ---------------- */

/**
 * 判断一个 GitHub 仓库是否是 DSH 插件（并行查两个标记，命中任一即算）：
 * ① package.json 里带 dsh 字段（dsh.bundle.patch / dsh.client / dsh.profile）
 * ② cordis.patch.yml 存在
 */
export async function isDshPlugin(ctx, repoInput) {
  const full = String(repoInput || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
  if (!/^[^/\s]+\/[^/\s]+$/.test(full)) return false
  const [owner, name] = full.split('/')
  const probes = [
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/package.json`,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/cordis.patch.yml`,
  ]
  const results = await Promise.allSettled(probes.map((p) => request(ctx, { path: p })))
  // package.json：base64 解码后查 dsh 字段
  if (results[0].status === 'fulfilled') {
    try {
      const item = results[0].value.data
      const content = item && item.content ? Buffer.from(item.content, 'base64').toString('utf8') : ''
      const pkg = JSON.parse(content)
      if (pkg && pkg.dsh) return true
    } catch { /* 解析失败看下一个探针 */ }
  }
  if (results[1].status === 'fulfilled') return true
  return false
}

/* ---------------- 浏览自己账号的所有项目 ---------------- */

export async function listMyRepos(ctx, args) {
  const opts = args || {}
  const perPage = Math.min(Math.max(Number(opts.perPage) || 30, 1), 100)
  const maxPages = Math.min(Math.max(Number(opts.maxPages) || 5, 1), 10)
  const sort = ['updated', 'created', 'pushed', 'full_name'].includes(String(opts.sort)) ? String(opts.sort) : 'updated'
  const all = []
  let page = 1
  for (; page <= maxPages; page++) {
    const res = await request(ctx, {
      path: '/user/repos',
      query: { per_page: perPage, page, sort, type: 'owner' },
    })
    const list = Array.isArray(res.data) ? res.data : []
    all.push(...list)
    if (list.length < perPage) break
  }
  const repos = all.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    owner: r.owner && r.owner.login,
    htmlUrl: r.html_url,
    description: r.description || '',
    private: Boolean(r.private),
    language: r.language || '',
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    updatedAt: r.updated_at || '',
    defaultBranch: r.default_branch || 'main',
  }))
  return { total: repos.length, page, repos }
}

export function mineToText(result) {
  if (!result || !Array.isArray(result.repos) || result.repos.length === 0) {
    return '你的 GitHub 账号下还没有任何项目（仓库）。'
  }
  const lines = [`你的 GitHub 账号下共有 ${result.total} 个项目：`]
  for (const r of result.repos) {
    const vis = r.private ? '私有' : '公开'
    const bits = [vis]
    if (r.language) bits.push('语言 ' + r.language)
    if (r.stars) bits.push('⭐' + r.stars)
    lines.push(`- ${r.fullName}（${bits.join('，')}）→ ${r.htmlUrl}`)
  }
  return L(...lines)
}

/* ---------------- 建仓 / Git 工具（可被 DSH 直接调用） ---------------- */

export async function repoCreate(ctx, args) {
  const name = String(args.name || '').trim()
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new GhError('仓库名只能用字母、数字、点、下划线、短横线。', 0)
  const payload = { name, description: args.description, private: args.private === true, auto_init: args.autoInit !== false }
  const created = (await request(ctx, { method: 'POST', path: '/user/repos', body: payload })).data
  return L(
    `已创建仓库 ${created.full_name}（${created.private ? '私有' : '公开'}）。`,
    `仓库链接：${created.html_url}`,
    `克隆地址：${created.clone_url}`,
    `下一步可以用 git 工具把它克隆下来、提交并推送。`,
  )
}

export async function gitAction(ctx, args) {
  const action = String(args.action || 'status')
  const found = await tokenFromAnywhere(ctx)
  const token = found && found.token

  if (action === 'clone') {
    const repo = String(args.repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
    if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new GhError('请给出仓库，格式为「账号/仓库名」。', 0)
    const dest = args.dir ? resolve(String(args.dir)) : join(reposRoot(), ...repo.split('/'))
    await mkdir(dirname(dest), { recursive: true })
    const url = await gitTransportUrl(`https://github.com/${repo}.git`)
    const cfg = authConfigArgs(token, url)
    const res = await git(dirname(dest), [...cfg, 'clone', '--origin', 'origin', url, dest], { token })
    if (!res.ok) throw new GhError(`克隆失败：${res.message}`, 0)
    return `已克隆 ${repo} → ${dest}`
  }

  const dir = resolve(String(args.path || '').trim() || '.')
  if (!existsSync(dir)) throw new GhError(`目录不存在：${dir}`, 0)
  // push 要按远端实际地址挂认证头（可能被代理改写过 host）。
  let pushCfg = []
  if (action === 'push') {
    let remote = ''
    const rr = await git(dir, ['remote', 'get-url', 'origin'], { token })
    if (rr.ok) remote = rr.stdout.trim()
    pushCfg = authConfigArgs(token, remote || undefined)
  }

  if (action === 'commit') {
    const message = String(args.message || '').trim() || 'DSH GitHub 助手提交'
    const staged = await git(dir, ['add', '-A'], { token })
    if (!staged.ok) throw new GhError(`暂存失败：${staged.message}`, 0)
    const res = await git(dir, ['commit', '-m', message], { token })
    if (!res.ok && !/nothing to commit/i.test(res.message || '')) throw new GhError(`提交失败：${res.message}`, 0)
    return `已提交：${message}`
  }

  if (action === 'push') {
    let branch = String(args.branch || '').trim()
    if (!branch) {
      const cur = await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'], { token })
      branch = cur.ok ? cur.stdout.trim() : 'main'
    }
    const res = await git(dir, [...pushCfg, 'push', '-u', 'origin', branch], { token })
    if (!res.ok) throw new GhError(`推送失败：${res.message}`, 0)
    return `已推送 ${branch} → origin`
  }

  if (action === 'status') {
    const res = await git(dir, ['status', '--porcelain=v1', '--branch'], { token })
    return res.ok ? `仓库：${dir}\n${res.stdout.trim() || '工作区干净。'}` : res.message
  }

  throw new GhError(`不认识的操作：${action}`, 0)
}

/* ---------------- 小白解释：内置大模型直接生成三段式解释 ---------------- */

export function explainContext(repo) {
  const r = repo || {}
  const desc = String(r.description || r.tldr || '').trim()
  const readme = String(r.readmeSnippet || '').trim().slice(0, 500)
  return L(
    '请用大白话向完全不懂技术的普通人介绍下面这个开源项目，严格按三段输出：',
    '① 它到底是干什么的（不超过30字）',
    '② 普通人能拿它做什么（1-2个具体场景）',
    '③ 原理大概是怎么回事（用一个生活类比，不要讲代码细节）',
    '',
    `项目名：${r.fullName || r.name || '未知'}`,
    `分类：${r.category || r.categoryZh || '未分类'}`,
    `编程语言：${r.language || '未标注'}`,
    desc ? `项目描述：${desc}` : '',
    readme ? `说明片段：${readme}` : '',
  )
}

/**
 * 「这是什么？」的权威实现：直接调用 DSH Harness 内置大模型（llm 服务，
 * provider=deepseek-account，走账号登录 token，用户无需申请任何 API key），
 * 生成三段式大白话解释，返回给前端小窗展示。完全不往用户当前对话里投递文字。
 * 取不到 llm 服务或流式调用失败时返回 null，调用方回退到 explainContext 模板。
 */
export async function aiExplain(ctx, repo) {
  try {
    const llm = ctx && (ctx.llm || (typeof ctx.get === 'function' && ctx.get('llm')))
      || (ctx && ctx.remote && ctx.remote.llm) || null
    if (!llm || typeof llm.stream !== 'function') return null
    const prompt = explainContext(repo)
    const options = {
      provider: 'deepseek-account',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: '你是面向普通人的开源项目讲解员。只依据提供的材料，用大白话解释，不编造事实，输出纯中文正文，不要 markdown 标题符号。' },
        { role: 'user', content: prompt },
      ],
    }
    const stream = llm.stream(options)
    let answer = ''
    for await (const chunk of stream) {
      if (chunk && typeof chunk === 'object') {
        if (chunk.type === 'text' && typeof chunk.text === 'string') { answer += chunk.text; continue }
        if (chunk.type === 'delta' && typeof chunk.text === 'string') { answer += chunk.text; continue }
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') { answer += chunk.text; continue }
        if (Array.isArray(chunk.content)) {
          for (const part of chunk.content) {
            if (typeof part === 'string') answer += part
            else if (part && typeof part.text === 'string') answer += part.text
          }
          continue
        }
        if (typeof chunk.text === 'string') answer += chunk.text
        if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') return null
      }
    }
    answer = answer.replace(/\s+$/, '')
    if (!answer) return null
    return answer
  } catch {
    return null
  }
}

/** 兼容旧名：投递方案已弃用，统一走内置大模型小窗解释。 */
export async function deliverExplain(ctx, repo) {
  return aiExplain(ctx, repo)
}

/**
 * 「AI 助手」自然语言筛选的内置大模型实现：把榜单仓库列表 + 用户一句话交给
 * DSH 内置大模型打分（0-10），返回 {fullName:{score,reason}} 映射。取不到
 * llm 服务、流式失败或输出无法解析时返回空映射，调用方走搜索兜底排序。
 */
export async function aiScoreRepos(ctx, prompt, repos) {
  const empty = {}
  try {
    const llm = ctx && (ctx.llm || (typeof ctx.get === 'function' && ctx.get('llm')))
      || (ctx && ctx.remote && ctx.remote.llm) || null
    if (!llm || typeof llm.stream !== 'function') return empty
    const list = (Array.isArray(repos) ? repos : []).slice(0, 50).map((repo, index) => {
      const topics = Array.isArray(repo && repo.topics) ? repo.topics.slice(0, 6).join(',') : ''
      return `${index + 1}. ${repo && repo.fullName || ''} | ${String((repo && repo.description) || '').slice(0, 120)}${topics ? ` | topics:${topics}` : ''}`
    }).filter(Boolean).join('\n')
    if (!list) return empty
    const options = {
      provider: 'deepseek-account',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: '你是插件筛选助手。用户会用一句话描述想要的插件/项目。根据提供的仓库列表，给每个仓库打 0-10 的匹配分并写一句中文理由。只输出 JSON 数组，格式：[{"fullName":"owner/repo","score":8,"reason":"…"}]，不要输出任何其它文字。' },
        { role: 'user', content: `用户需求：${prompt}\n\n候选仓库：\n${list}` },
      ],
    }
    const stream = llm.stream(options)
    let answer = ''
    for await (const chunk of stream) {
      if (chunk && typeof chunk === 'object') {
        if ((chunk.type === 'text' || chunk.type === 'delta' || chunk.type === 'text-delta') && typeof chunk.text === 'string') { answer += chunk.text; continue }
        if (Array.isArray(chunk.content)) {
          for (const part of chunk.content) {
            if (typeof part === 'string') answer += part
            else if (part && typeof part.text === 'string') answer += part.text
          }
          continue
        }
        if (typeof chunk.text === 'string') answer += chunk.text
        if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') return empty
      }
    }
    const match = answer.match(/\[[\s\S]*\]/)
    if (!match) return empty
    let parsed
    try { parsed = JSON.parse(match[0]) } catch { return empty }
    if (!Array.isArray(parsed)) return empty
    const scores = {}
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || typeof item.fullName !== 'string') continue
      const score = Number(item.score)
      if (!Number.isFinite(score)) continue
      scores[item.fullName] = {
        score: Math.max(0, Math.min(10, Math.round(score))),
        reason: typeof item.reason === 'string' ? item.reason : '',
      }
    }
    return scores
  } catch {
    return empty
  }
}

/**
 * 内置大模型批量中文简介（/translate 路由）：把深卡仓库材料交给 DSH 内置
 * llm 服务，按 translate.js 的 INTRO_SYSTEM_PROMPT 合同生成 {fullName:
 * {intro,onboarding}} 映射。llm 不可用或解析失败返回空映射，前端保留模板文案。
 * 这里自带一套与 translate.js 等价的清洗逻辑，避免循环依赖外部 key 链路。
 */
export async function aiTranslateIntros(ctx, items) {
  const empty = {}
  try {
    const llm = ctx && (ctx.llm || (typeof ctx.get === 'function' && ctx.get('llm')))
      || (ctx && ctx.remote && ctx.remote.llm) || null
    if (!llm || typeof llm.stream !== 'function') return empty
    const input = []
    const seen = new Set()
    for (const raw of Array.isArray(items) ? items : []) {
      if (!raw || typeof raw !== 'object') continue
      const fullName = String(raw.fullName ?? '').trim()
      if (!fullName || seen.has(fullName)) continue
      seen.add(fullName)
      const topics = Array.isArray(raw.topics) ? raw.topics.map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 8) : []
      input.push({
        fullName,
        name: String(raw.name ?? '').trim(),
        description: String(raw.description ?? ''),
        topics,
        readmeSnippet: String(raw.readmeSnippet ?? '').slice(0, 400),
      })
    }
    if (input.length === 0) return empty
    const options = {
      provider: 'deepseek-account',
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: [
          '你是中文技术编辑。只依据用户提供的仓库材料写中文介绍，不得编造材料之外的事实。',
          '要求：',
          '1. 用 1–2 句自然中文说明项目做什么、解决什么问题，整段不超过 60 字。',
          '2. 除专有名词与术语（LLM/RAG/CLI/API/SDK/MCP/GPU/AI/UI）外不得出现英文。',
          '3. 不得出现 star/fork/增长数字或贡献者数量。',
          '4. 材料不足时输出空字符串，不要猜测。',
          '5. 另外为每个仓库写 onboarding（中文，最多两句）：',
          '   第一句「需要先会：……」只写必需的前置知识；',
          '   第二句「第一次能跑到：……」写清按 README 能跑到什么程度，尽量引用 README 里的安装/运行命令原文。',
          '   · 不许写预计耗时（不要出现“小时”“分钟”“天”）',
          '   · 材料不足就输出空字符串',
          '   · 不许编造 README 里没有的命令',
          '6. 只输出 JSON：{"items":[{"fullName":"...","intro":"...","onboarding":"..."}]}',
        ].join('\n') },
        {
          role: 'user',
          content: JSON.stringify({
            items: input.map((item) => ({
              fullName: item.fullName,
              name: item.name,
              description: item.description,
              topics: item.topics,
              readmeSnippet: item.readmeSnippet,
            })),
          }),
        },
      ],
    }
    const stream = llm.stream(options)
    let answer = ''
    for await (const chunk of stream) {
      if (chunk && typeof chunk === 'object') {
        if ((chunk.type === 'text' || chunk.type === 'delta' || chunk.type === 'text-delta') && typeof chunk.text === 'string') { answer += chunk.text; continue }
        if (Array.isArray(chunk.content)) {
          for (const part of chunk.content) {
            if (typeof part === 'string') answer += part
            else if (part && typeof part.text === 'string') answer += part.text
          }
          continue
        }
        if (typeof chunk.text === 'string') answer += chunk.text
        if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') return empty
      }
    }
    const start = answer.indexOf('{')
    const end = answer.lastIndexOf('}')
    if (start < 0 || end <= start) return empty
    let parsed
    try { parsed = JSON.parse(answer.slice(start, end + 1)) } catch { return empty }
    const rows = Array.isArray(parsed && parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : []
    const allowed = new Set(input.map((item) => item.fullName))
    const stripMarkdown = (text) => String(text ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_#~>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const result = {}
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const fullName = String(row.fullName ?? '').trim()
      if (!allowed.has(fullName)) continue
      const intro = stripMarkdown(row.intro).slice(0, 60)
      if (!intro || /^信息不足[。.!！]?$/.test(intro)) continue
      let onboarding = stripMarkdown(row.onboarding).slice(0, 120)
      if (/小时|半天|分钟|天/.test(onboarding)) onboarding = ''
      if (/^信息不足[。.!！]?$/.test(onboarding)) onboarding = ''
      result[fullName] = { intro, onboarding }
    }
    return result
  } catch {
    return empty
  }
}

/* ---------------- 一键装到 DSH：插件目录 + 安装到指定 profile ---------------- */

// 可直接装进 DeepSeek Harness 的插件目录（npm 包名或 github:仓库）。
// 这是内置兜底清单；运行时 loadPluginCatalog 会合并「本机已装插件」和「远程清单」。
export const DSH_PLUGIN_CATALOG = [
  { name: 'dsh-genspark', spec: 'github:kgmkm/dsh-genspark', desc: 'Genspark 联网搜索集成', tag: '搜索' },
  { name: 'dsh-purge-plus', spec: 'github:luowang-ui/dsh-purge-plus', desc: '指令权威性与清洗增强', tag: '工具' },
  { name: 'dshmarket', spec: 'dshmarket', desc: '插件市场', tag: 'npm' },
  { name: 'dsh-context', spec: 'dsh-context', desc: '上下文管理增强', tag: 'npm' },
  { name: 'dsh-novel-craft', spec: 'dsh-novel-craft', desc: '小说创作助手', tag: 'npm' },
  { name: 'dsh-deeptutor', spec: 'dsh-deeptutor', desc: 'DeepTutor 学习辅导', tag: 'npm' },
  { name: '@anionex/dsh-vision-toolkit', spec: '@anionex/dsh-vision-toolkit', desc: '视觉工具箱', tag: 'npm' },
  { name: 'dsh-vision-router', spec: 'dsh-vision-router', desc: '视觉模型路由', tag: 'npm' },
  { name: 'dsh-camel', spec: 'dsh-camel', desc: '多模型协作', tag: 'npm' },
  { name: 'dsh-browser', spec: 'dsh-browser', desc: '浏览器能力扩展', tag: 'npm' },
  { name: 'dsh-plugin-github', spec: 'dsh-plugin-github', desc: 'GitHub 工具集成', tag: 'npm' },
  { name: 'dsh-cost-meter', spec: 'dsh-cost-meter', desc: '用量与成本统计', tag: 'npm' },
  { name: 'dsh-our-free-model', spec: 'github:Ebony-Vinyl/dsh-our-free-model', desc: '免登录免 API Key 直接用 DeepSeek/Kimi 等前沿模型，完全免费', tag: '模型' },
  { name: 'dsh-plugin-subscriptions', spec: 'github:V1ki/dsh-plugin-subscriptions', desc: '把 ChatGPT / Claude / Grok 订阅接入 DSH 当模型源', tag: '模型' },
  { name: 'dsh-connect-workbuddy', spec: 'github:dingminhua/dsh-connect-workbuddy', desc: '接入本机已登录的 WorkBuddy 模型并管理额度', tag: '模型' },
  { name: 'dsh-routing-suite', spec: 'github:yjh051108/dsh-routing-suite', desc: '任务感知的模型路由套件（注入器 + 路由标准件）', tag: '模型' },
  { name: 'dsh-Go', spec: 'github:ccch1mneyyy/dsh-Go', desc: '把 DSH 装进口袋：手机本机运行并遥控电脑', tag: '移动' },
  { name: 'dsh-desktop (anywhere-labs)', spec: 'github:anywhere-labs/dsh-desktop', desc: '现代化 DSH 桌面端，万物皆插件', tag: '桌面' },
  { name: 'dsh-desktop (dataelement)', spec: 'github:dataelement/dsh-desktop', desc: 'DSHDesktop 桌面版客户端', tag: '桌面' },
  { name: 'DSHA', spec: 'github:DSH-APP/DSHA', desc: '免 ROOT 免 Termux，在安卓手机上跑完整 DSH', tag: '移动' },
  { name: 'DSH-Android', spec: 'github:jackwener/DSH-Android', desc: '一个 APK 在安卓手机上运行 DeepSeek Harness', tag: '移动' },
  { name: 'dsh-mobile-apk', spec: 'github:kelai141/dsh-mobile-apk', desc: '安卓壳 APK：WebView + 内嵌 Termux 运行时快照', tag: '移动' },
  { name: 'dsh-pocket', spec: 'github:shaobeichen/dsh-pocket', desc: '电脑跑 dsh web，手机扫码实时同屏（局域网+公网）', tag: '移动' },
  { name: 'dsh-mobile (saya-ch)', spec: 'github:saya-ch/dsh-mobile', desc: '安全移动访问插件与 Android App，支持远程通道与设备管理', tag: '移动' },
  { name: 'dsh-mobile (Clarklevis1995)', spec: 'github:Clarklevis1995/dsh-mobile', desc: '原生移动端客户端，经 WebSocket 网关连接工作区与会话', tag: '移动' },
  { name: 'dsh-plugin-mobile-gateway', spec: 'github:Clarklevis1995/dsh-plugin-mobile-gateway', desc: 'WebSocket 网关插件，让局域网移动端接入 DSH', tag: '移动' },
  { name: 'DSH-Transparent-UI-Plugin', spec: 'github:WYH66666666/DSH-Transparent-UI-Plugin', desc: '玻璃质感主题：顶栏/侧边栏/输入框全磨砂，可调模糊与壁纸', tag: 'UI' },
  { name: 'dsh-deep-whale', spec: 'github:Small-tailqwq/dsh-deep-whale', desc: '鲸鱼娘系列皮肤', tag: 'UI' },
  { name: 'dsh-wallpaper-engine', spec: 'github:elysia395/dsh-wallpaper-engine', desc: '把 Wallpaper Engine 壁纸搬进 DSH 网页界面（WebGL 渲染）', tag: 'UI' },
  { name: 'DSH-better-sidebar', spec: 'github:omdsh-dev/DSH-better-sidebar', desc: '开放侧边栏底座：文件/终端/侧边对话/Git/子代理页面', tag: 'UI' },
  { name: 'dsh-genui', spec: 'github:omdsh-dev/dsh-genui', desc: '回复内嵌交互式 UI 组件（dsh-ui fence）', tag: 'UI' },
  { name: 'dsh-TUI', spec: 'github:ccch1mneyyy/dsh-TUI', desc: '官方推荐 TUI 插件：高性能像素鲸鱼，流畅鼠标交互', tag: 'UI' },
  { name: 'dsh-startup-screen', spec: 'github:6shenhonghong9/dsh-startup-screen', desc: '自定义启动画面', tag: 'UI' },
  { name: 'dsh-ops', spec: 'github:T-Auto/dsh-ops', desc: 'DSH 底层操作工具箱，省 Token 省时间', tag: '工具' },
  { name: 'dsh-mnemon', spec: 'github:omdsh-dev/dsh-mnemon', desc: '可组合分层记忆与自进化上下文', tag: '工具' },
  { name: 'dsh-memory-evolve', spec: 'github:csyangwen/dsh-memory-evolve', desc: '跨会话长期记忆 + 后台自我进化（五轨记忆/技能进化）', tag: '工具' },
  { name: 'dsh-agent-teams', spec: 'github:NanmiCoder/dsh-agent-teams', desc: '多智能体团队协作：任务分配/并行执行/成员通信', tag: '工具' },
  { name: 'dsh-plugin-agent-workflow', spec: 'github:xuanyuanzhifeng/dsh-plugin-agent-workflow', desc: 'Agent 工作流编排', tag: '工具' },
  { name: 'dsh-synapse', spec: 'github:liangmianya/dsh-synapse', desc: '会话画布', tag: '工具' },
  { name: 'dsh-worktable', spec: 'github:Aisland-SJL/dsh-worktable', desc: 'Agent 项目工作台：应用抽屉 + 可停靠分屏工作区', tag: '工具' },
  { name: 'dsh-plugin-session-delete', spec: 'github:lsz-asd/dsh-plugin-session-delete', desc: '从 UI 直接删除会话（头部危险按钮 + 侧边栏菜单）', tag: '工具' },
  { name: 'dsh-recall-plugin', spec: 'github:limbo947/dsh-recall-plugin', desc: '消息撤回：回到消息发送前的状态', tag: '工具' },
  { name: 'dsh-plugin-bridge', spec: 'github:Totoro-qaq/dsh-plugin-bridge', desc: '可预览的跨预设会话迁移', tag: '工具' },
  { name: 'dsh-plugin-upgrade-skill', spec: 'github:oh-my-dsh/dsh-plugin-upgrade-skill', desc: '帮插件随 dsh 版本升级自动适配的 skill', tag: '工具' },
  { name: 'dsh-plugin-gating-hub', spec: 'github:Noob-stupid/dsh-plugin-gating-hub', desc: '框架升级安全与插件门控：预检/回滚点/自动回滚', tag: '工具' },
  { name: 'dsh-tavern', spec: 'github:flizzywine/dsh-tavern', desc: 'Agent 酒馆：类 SillyTavern 文字游戏，人物卡直接导入', tag: '创作' },
  { name: 'oh-story-dsh', spec: 'github:zenstory-ai/oh-story-dsh', desc: '故事创作一站式工作台：网文连载/短剧漫剧/小说改游戏/视频解说', tag: '创作' },
  { name: 'dsh-media-desk', spec: 'github:woniuniuniu/dsh-media-desk', desc: '自媒体工作台：一句话生成脚本、封面、配图和分镜', tag: '创作' },
  { name: 'dsh-image-gen', spec: 'github:shanliuling/dsh-image-gen', desc: '对话内生成/编辑/对比图像，500+ 提示词，支持 ComfyUI', tag: '创作' },
  { name: 'dsh-voice-ai-girlfriend', spec: 'github:beiyege-01/dsh-voice-ai-girlfriend', desc: '语音 AI 女友：Whisper 输入 + TTS 声音克隆 + 数字人动画', tag: '娱乐' },
  { name: 'dsh-plugin-tts', spec: 'github:1624318455/dsh-plugin-tts', desc: 'Edge TTS 免费语音朗读助手回复', tag: '创作' },
  { name: 'dsh-pet', spec: 'github:PC2005-cloud/dsh-pet', desc: '透明动画桌宠，多开/大小/位置随心配，可 AI 自造宠物', tag: '娱乐' },
  { name: 'dsh-pet-indesktop', spec: 'github:MerZlin/dsh-pet-indesktop', desc: '把桌宠移植到 Windows/Linux/MacOS，蓝色大肥鱼常驻桌面', tag: '娱乐' },
  { name: 'dsh-bili-scroll', spec: 'github:c1overzz/dsh-bili-scroll', desc: '每天替你刷 B 站，挑出值得看的写日报并 @ 你', tag: '娱乐' },
  { name: 'dsh-bili-whale', spec: 'github:Alterssss/dsh-bili-whale', desc: '按作息刷 B 站、真看懂视频、写日记的鲸鱼', tag: '娱乐' },
  { name: 'dsh-aurabot-qq', spec: 'github:aureth-labs/dsh-aurabot-qq', desc: 'AI 以大肥鱼住进 QQ：聊天/表情/语音/空间/B站，模块化可扩展', tag: '娱乐' },
  { name: 'dsh-im', spec: 'github:xmanrui/dsh-im', desc: '把飞书/微信/钉钉/QQ/Telegram 等 IM 机器人接入 DSH', tag: '娱乐' },
  { name: 'dsh-blender-plugin', spec: 'github:sixtysevenlf/dsh-blender-plugin', desc: 'DSH × Blender 直连：AI 驱动 GUI Blender 建模渲染', tag: '创作' },
  { name: 'agentero-dsh-plugin', spec: 'github:poco-ai/agentero-dsh-plugin', desc: '科研文献库：搜论文、带出处、审批入库', tag: '研究' },
  { name: 'dsh-plugin-rea', spec: 'github:czcdr/dsh-plugin-rea', desc: '把 REA 逆向工程 MCP 服务接入 DSH（自动备齐 Ghidra/JDK）', tag: '研究' },
  { name: 'dsh-pentest', spec: 'github:howmp/dsh-pentest', desc: '渗透测试模式（授权安全研究）', tag: '研究' },
  { name: 'dsh-redteam-model', spec: 'github:SeaOf0/dsh-redteam-model', desc: '红队多模式：渗透测试/红队评估/代码审计（授权研究）', tag: '研究' },
  { name: 'dsh-market', spec: 'github:dsh-market/dsh-market', desc: 'DSH 内可视化插件市场：浏览/搜索/一键安装', tag: '市场' },
  { name: 'dsh-web', spec: 'github:zhu1090093659/dsh-web', desc: 'Web 插件聚合生态，创意工坊分发', tag: '市场' },
  { name: 'dsh-plugin-shop', spec: 'github:LivXue/dsh-plugin-shop', desc: '每日更新的综合插件商店，全网采集+上架审核', tag: '市场' },
  { name: 'dsh-plugin-hub', spec: 'github:dshplugin/dsh-plugin-hub', desc: 'DSH 插件市场：下载安装与插件大全', tag: '市场' },
  { name: 'dsh-plugin-index', spec: 'github:polang233/dsh-plugin-index', desc: '照顾小开发者的开放插件索引/市场', tag: '市场' },
  { name: 'DSH-Plugins-Marketplace', spec: 'github:bradeGithub/DSH-Plugins-Marketplace', desc: 'Web GUI 内一键浏览安装全部 dsh-plugin 话题插件', tag: '市场' },
  { name: 'dsh-find-plugin', spec: 'github:awesome-dsh-plugin/dsh-find-plugin', desc: '会话内实时搜索发现 DSH 插件（按星标排序）', tag: '市场' },
  { name: 'dsh-plugin-radar', spec: 'github:AdamPlatin123/dsh-plugin-radar', desc: '插件生态雷达：持续发现 21k+ 候选插件', tag: '市场' },
  { name: 'dsh-plugins (Mt-Youya)', spec: 'github:Mt-Youya/dsh-plugins', desc: '插件合集包：装一个 bundle 得到全部子插件', tag: '市场' },
  { name: 'dsh-plugin-bundle', spec: 'github:lili-luo/dsh-plugin-bundle', desc: '插件组合包，每个插件可用 path: 单独安装', tag: '市场' },
  { name: 'dsh-plugin-kit', spec: 'github:hyzyn/dsh-plugin-kit', desc: 'Web GUI 插件家族：模板 + 开发套件 + 一键添加', tag: '市场' },
]

function profilesRoot() {
  const base = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
  return join(base, 'profiles')
}

// 远程插件清单地址（可被 DSH_PLUGIN_CATALOG_URL 覆盖）。文件需为 JSON 数组，
// 每项 {name, spec, desc, tag}。拉取失败时静默回退到内置清单，不影响使用。
const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/hj178250/dsh-github-helper/main/catalog.json'
let _remoteCatalog = null

/**
 * 运行时插件清单：内置兜底 + 本机已装插件 +（可选）远程清单，按 spec 去重。
 * 这样即使宿主环境没有网络，也始终有内置目录可用；有网络时自动补上最新清单。
 */
export async function loadPluginCatalog(ctx) {
  const seen = new Set()
  const out = []

  const push = (item) => {
    if (!item || !item.name || !item.spec) return
    const key = String(item.spec).trim()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name: String(item.name), spec: key, desc: String(item.desc || ''), tag: String(item.tag || 'npm') })
  }

  // 1) 本机已装插件（最真实、最优先）：扫所有 profile 的 dependencies 里带 dsh 字段的包。
  try {
    for (const profile of listProfiles()) {
      const pkgPath = join(profilesRoot(), profile, 'package.json')
      let pkg
      try { pkg = JSON.parse(await readFile(pkgPath, 'utf8')) } catch { continue }
      const deps = pkg.dependencies || {}
      const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || []
      for (const name of Object.keys(deps)) {
        // 只收录「看起来是 DSH 插件」的包：名字含 dsh，或出现在 bundles 里。
        const looksDsh = /dsh/i.test(name) || bundles.includes(name)
        if (!looksDsh) continue
        const spec = String(deps[name]).trim()
        push({ name, spec: /^github:/.test(spec) ? spec : name, desc: '本机已安装（' + profile + '）', tag: '已装' })
      }
    }
  } catch { /* 扫描失败不影响内置清单 */ }

  // 2) 远程清单（带短超时，失败静默忽略）。
  const remoteUrl = (process.env.DSH_PLUGIN_CATALOG_URL || DEFAULT_CATALOG_URL).trim()
  if (_remoteCatalog !== null) {
    _remoteCatalog.forEach(push)
  } else {
    try {
      const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'dsh-github-helper' } })
      if (res.ok) {
        const json = await res.json()
        if (Array.isArray(json)) {
          _remoteCatalog = json
          json.forEach(push)
        } else {
          _remoteCatalog = []
        }
      } else {
        _remoteCatalog = []
      }
    } catch { _remoteCatalog = [] }
  }

  // 3) GitHub 实时搜索：按 dsh-plugin 话题动态发现生态里的插件，不限于任何固定清单。
  try {
    const found = await searchDshPlugins(ctx)
    found.forEach(push)
  } catch { /* 搜索失败不影响其余清单 */ }

  // 4) 内置兜底清单最后合并，确保最坏情况下仍有目录可用。
  DSH_PLUGIN_CATALOG.forEach(push)

  return out
}

let _dshPluginSearch = null
let _dshPluginSearchAt = 0
const DSH_PLUGIN_SEARCH_TTL = 10 * 60 * 1000

/**
 * 用 GitHub 搜索 API 实时发现 DSH 插件仓库（话题 dsh-plugin / dsh-plugins / 仓库名含 dsh-plugin），
 * 按 star 数排序，取前 120 个。结果缓存 10 分钟；未登录时走匿名限额。
 */
export async function searchDshPlugins(ctx) {
  if (_dshPluginSearch && Date.now() - _dshPluginSearchAt < DSH_PLUGIN_SEARCH_TTL) return _dshPluginSearch
  const queries = ['topic:dsh-plugin', 'topic:dsh-plugins', 'dsh-plugin in:name']
  const seen = new Set()
  const found = []
  for (const q of queries) {
    try {
      const spec = { path: '/search/repositories', query: { q, sort: 'stars', order: 'desc', per_page: 60, page: 1 } }
      const data = (await request(ctx, spec)).data
      for (const item of (data && data.items) || []) {
        if (!item || !item.full_name) continue
        const specId = 'github:' + item.full_name
        if (seen.has(specId)) continue
        seen.add(specId)
        found.push({
          name: item.name || item.full_name,
          spec: specId,
          desc: String(item.description || '').slice(0, 120) || 'GitHub 上的 DSH 插件仓库',
          tag: '实时',
          stars: item.stargazers_count || 0,
        })
        if (found.length >= 120) break
      }
    } catch { /* 单个查询失败继续下一个 */ }
    if (found.length >= 120) break
  }
  found.sort((a, b) => (b.stars || 0) - (a.stars || 0))
  _dshPluginSearch = found
  _dshPluginSearchAt = Date.now()
  return found
}

/** 列出可安装的 profile（profiles 目录下带 package.json 的子目录）。 */
export function listProfiles() {
  const root = profilesRoot()
  const out = []
  try {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue
      if (existsSync(join(root, e.name, 'package.json'))) out.push(e.name)
    }
  } catch { /* 目录不存在 */ }
  out.sort()
  if (!out.includes('web') && existsSync(join(root, 'web', 'package.json'))) out.unshift('web')
  return out
}

/** 找 pnpm 可执行文件：优先环境变量，其次 dsh.exe 同级目录，再 PATH。 */
async function pnpmBin() {
  const override = (process.env.DSH_PNPM_BIN || '').trim()
  if (override) return override
  if (process.platform === 'win32') {
    const dir = join(process.env.LOCALAPPDATA || '', 'Author Software', 'nvm', '.nodejs')
    for (const f of [join(dir, 'pnpm.exe'), join(dir, 'pnpm.cmd')]) {
      if (existsSync(f)) return f
    }
  }
  try {
    const probe = await run(process.platform === 'win32' ? 'where' : 'which', ['pnpm'], { windowsHide: true })
    const line = String(probe.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    if (line) return line
  } catch { /* 走兜底 */ }
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

/** 构造安装环境：把 git 加进 PATH；github.com 直连不通时用 gh-proxy 改写。 */
async function installEnv() {
  const env = { ...process.env }
  // Windows 上 process.env 的 PATH 键名可能是 Path / PATH。先取出原值并删掉
  // 所有大小写变体，只写一个 PATH，避免重复键导致子进程 PATH 被破坏。
  let origPath = ''
  for (const k of Object.keys(env)) {
    if (k.toLowerCase() === 'path') {
      origPath = env[k] || origPath
      delete env[k]
    }
  }
  const sep = process.platform === 'win32' ? ';' : ':'
  try {
    const git = await gitBin()
    if (/[/\\]/.test(git)) {
      const gitDir = dirname(git)
      if (gitDir && gitDir !== '.') origPath = gitDir + sep + origPath
    }
  } catch { /* git 找不到就沿用原 PATH */ }
  env.PATH = origPath
  const custom = process.env.DSH_GITHUB_GIT_PROXY
  if (custom === undefined || custom.trim() !== '') {
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'url.https://gh-proxy.com/https://github.com/.insteadOf'
    env.GIT_CONFIG_VALUE_0 = 'https://github.com/'
  }
  return env
}

/** 把用户输入规范成 pnpm 可安装的规格（npm 包名原样，GitHub 仓库转 github:）。 */
export function normalizeInstallSpec(raw) {
  let spec = String(raw || '').trim()
  if (!spec) throw new GhError('请给出要安装的插件（npm 包名或「账号/仓库名」）。', 0)
  // 已经带协议/作用域前缀的规格原样返回，避免重复加 github:。
  if (/^(github:|npm:|git\+|file:|link:|@)/.test(spec)) return spec
  if (/^https?:\/\/github\.com\//.test(spec)) {
    spec = 'github:' + spec.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
  } else if (/^[^/\s]+\/[^/\s]+$/.test(spec)) {
    // 裸「账号/仓库名」才转成 github: 规格
    spec = 'github:' + spec.replace(/\.git$/, '')
  }
  return spec
}

/**
 * 一键装到 DSH：用 host 侧 pnpm 把插件装进指定 profile，并把包名写进启动清单 bundles。
 * spec：npm 包名（如 dsh-context）或 GitHub 仓库（账号/仓库名、github:owner/repo）。
 * profile：目标配置名，默认 web。
 */
export async function installToDsh(ctx, args) {
  const spec = normalizeInstallSpec((args && (args.spec || args.repo || args.package)) || '')
  const profiles = listProfiles()
  const requested = String((args && args.profile) || '').trim()

  // 优先走 DSH 内置插件管理器（官方链路）：一次调用完成装依赖+写 bundles+热重载，
  // 不依赖本机 pnpm/git，也不需要重启 DSH。仅在用户没有显式指定 profile 时使用
  // （官方管理器只能装进当前运行中的 profile）。失败时静默退回下面的本机 pnpm 链路。
  if (!requested) {
    const pm = (ctx && (ctx.pluginManager || (typeof ctx.get === 'function' && ctx.get('pluginManager'))))
      || (ctx && ctx.remote && ctx.remote.pluginManager) || null
    if (pm && typeof pm.installBundle === 'function') {
      try {
        const result = await pm.installBundle(spec, { enabled: true })
        const bundleName = result && (result.bundle || (result.bundle && result.bundle.name))
        return L(
          '一键部署完成！插件已经装进你的 DeepSeek Harness（官方插件管理器安装，已热重载，无需重启）。',
          '',
          `安装规格：${spec}`,
          bundleName ? `插件包名：${bundleName}` : '',
        )
      } catch { /* 官方链路失败，退回本机 pnpm 安装 */ }
    }
  }

  let profile = requested || 'web'
  const probePkg = join(profilesRoot(), profile, 'package.json')
  // 显式指定的配置只要目录存在就直接用；否则回退到列举出的有效配置。
  if (!existsSync(probePkg)) {
    profile = profiles.includes('web') ? 'web' : (profiles[0] || profile)
  }
  const finalDir = join(profilesRoot(), profile)
  const finalPkg = join(finalDir, 'package.json')
  if (!existsSync(finalPkg)) throw new GhError(`配置「${profile}」缺少 package.json，无法安装。`, 0)

  // 记录安装前的依赖，安装后 diff 出实际包名（github: 规格的包名来自目标仓库）。
  let before = {}
  try { before = (JSON.parse(await readFile(finalPkg, 'utf8')).dependencies) || {} } catch { /* 空 */ }

  const pnpm = await pnpmBin()
  const env = await installEnv()
  let output = ''
  try {
    const result = await run(pnpm, ['add', spec], {
      cwd: finalDir, env, timeout: 300000, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
    })
    output = String(result.stdout || '') + String(result.stderr || '')
  } catch (e) {
    const detail = short(redact(String((e && e.stderr) || (e && e.message) || e), ''), 800)
    throw new GhError(`安装失败：${detail}`, 0)
  }

  // diff 出新增/变化的包名
  let added = []
  try {
    const after = (JSON.parse(await readFile(finalPkg, 'utf8')).dependencies) || {}
    added = Object.keys(after).filter((k) => !(k in before) || before[k] !== after[k])
  } catch { /* 忽略 */ }
  const pkgName = added[0] || String(spec).replace(/^github:/, '').split('/').pop().replace(/#.*$/, '')

  // 写进 dsh.profile.bundles，让配置启动时真正加载它
  let activated = false
  try {
    const pkg = JSON.parse(await readFile(finalPkg, 'utf8'))
    if (!pkg.dsh) pkg.dsh = {}
    if (!pkg.dsh.profile) pkg.dsh.profile = {}
    const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
    if (!bundles.includes(pkgName)) bundles.push(pkgName)
    pkg.dsh.profile.bundles = bundles
    await writeFile(finalPkg, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    activated = true
  } catch { /* 写 bundles 失败不影响依赖安装 */ }

  return L(
    '一键部署完成！插件已经装进你的 DeepSeek Harness。',
    '',
    `安装规格：${spec}`,
    `目标配置：${profile}`,
    `插件包名：${pkgName}`,
    activated ? '已自动加入启动清单，重启 DSH 后生效。' : '依赖已装好，但启动清单写入失败，请手动把包名加入该配置的 bundles。',
    output && /already up to date|已存在/i.test(output) ? '提示：该插件此前已安装，本次为更新。' : '',
  )
}

/* ---------------- 统一工具注册 ---------------- */

function textOutput() {
  return {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render(_args, value) {
      return [{ type: 'text', text: value && typeof value.text === 'string' ? value.text : '' }]
    },
  }
}

function guarded(label, fn) {
  return async (args, exec) => {
    try {
      return { text: cap(await fn(args || {}, exec)) }
    } catch (e) {
      const msg = e instanceof GhError ? e.message : e && e.message ? e.message : String(e)
      return { text: cap(`${label}失败：${msg}`) }
    }
  }
}

export function helperToolDefinitions(ctx) {
  return [
    {
      name: 'github_mine',
      description: '浏览自己 GitHub 账号下的所有项目（仓库列表），返回仓库名、公开/私有、语言、星标和链接。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sort: { type: 'string', enum: ['updated', 'created', 'pushed', 'full_name'], description: '排序方式，默认按更新时间。' },
          perPage: { type: 'number', description: '每页数量，默认 30，最多 100。' },
          maxPages: { type: 'number', description: '最多抓取页数，默认 5。' },
        },
      },
      output: textOutput(),
      execute: guarded('浏览项目', async (args) => mineToText(await listMyRepos(ctx, args))),
    },
    {
      name: 'github_login',
      description: 'GitHub 设备码登录。action=start 发起授权（返回码和授权网址，用户去浏览器授权一次即可，不输密码）；action=status 检查是否已登录。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['start', 'status'], description: 'start=发起设备码登录，status=检查登录状态。' },
        },
        required: ['action'],
      },
      output: textOutput(),
      execute: guarded('登录', async (args, exec) => {
        if (args.action === 'start') return loginStart()
        return loginStatus(ctx)
      }),
    },
    {
      name: 'github_repo',
      description: '在自己的 GitHub 账号下新建仓库（GitHub REST 建仓）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: '仓库名。' },
          description: { type: 'string', description: '仓库简介。' },
          private: { type: 'boolean', description: '是否私有，默认公开。' },
          autoInit: { type: 'boolean', description: '是否自动生成 README，默认 true。' },
        },
        required: ['name'],
      },
      output: textOutput(),
      execute: guarded('建仓', (args) => repoCreate(ctx, args)),
    },
    {
      name: 'github_git',
      description: '用本机真实 git 克隆、提交、推送仓库（携带一次性令牌认证，不把令牌写进地址）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['clone', 'commit', 'push', 'status'], description: '要执行的操作。' },
          repo: { type: 'string', description: '克隆时的仓库，格式「账号/仓库名」。' },
          path: { type: 'string', description: '本地仓库目录。' },
          dir: { type: 'string', description: '克隆目标目录。' },
          message: { type: 'string', description: '提交信息。' },
          branch: { type: 'string', description: '分支名。' },
        },
        required: ['action'],
      },
      output: textOutput(),
      execute: guarded('Git 操作', (args) => gitAction(ctx, args)),
    },
    {
      name: 'github_upload',
      description: '一键上传：把你指定的本地项目建仓、克隆、拷贝文件、提交并推送到自己的 GitHub，完成后返回仓库链接。上传过程不经过对话模型。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          localPath: { type: 'string', description: '要上传的本地项目文件夹路径。' },
          repoName: { type: 'string', description: '仓库名，默认用项目文件夹名。' },
          private: { type: 'boolean', description: '是否私有，默认公开。' },
          description: { type: 'string', description: '仓库简介。' },
        },
      },
      output: textOutput(),
      execute: guarded('上传', (args) => uploadProject(ctx, args)),
    },
    {
      name: 'github_download',
      description: '应用下载：把 GitHub 上的项目源码包（zip）下载并解压到本地文件夹（默认在系统「下载」目录），不经过对话模型、不消耗 Token。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repo: { type: 'string', description: '要下载的仓库，格式「账号/仓库名」。' },
          branch: { type: 'string', description: '分支名，默认用仓库默认分支。' },
          dest: { type: 'string', description: '保存目录，默认当前用户的「下载」文件夹。' },
        },
        required: ['repo'],
      },
      output: textOutput(),
      execute: guarded('下载', (args) => downloadRepo(ctx, args)),
    },
    {
      name: 'github_install',
      description: '一键装到 DSH：把一个插件（npm 包名或「账号/仓库名」）直接安装进指定的 DeepSeek Harness 配置。优先走 DSH 内置插件管理器（装完热重载，无需重启），失败时退回本机 pnpm 安装并自动加入启动清单。不输密码、不经过对话模型。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          spec: { type: 'string', description: '插件规格：npm 包名（如 dsh-context）或 GitHub 仓库（账号/仓库名）。' },
          repo: { type: 'string', description: '同 spec，兼容旧参数。' },
          profile: { type: 'string', description: '目标配置名。不指定时优先走内置插件管理器（当前运行中的配置）。可用 github_profiles 查看全部。' },
        },
      },
      output: textOutput(),
      execute: guarded('一键部署', (args) => installToDsh(ctx, args)),
    },
    {
      name: 'github_profiles',
      description: '列出当前 DeepSeek Harness 里可安装插件的所有配置（profile）。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: textOutput(),
      execute: guarded('列出配置', async () => {
        const ps = listProfiles()
        return ps.length ? '可安装的配置：\n' + ps.map((p) => '- ' + p).join('\n') : '没有找到可安装的配置。'
      }),
    },
    {
      name: 'github_catalog',
      description: '列出可以直接一键装到 DeepSeek Harness 的插件目录（名称、安装规格、简介），实时合并本机已装插件、GitHub 实时搜索发现的热门插件与内置清单，按热度排序。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: textOutput(),
      execute: guarded('插件目录', async () => (await loadPluginCatalog(ctx)).map((p) => `- ${p.name}（${p.tag}${p.stars ? `·⭐${p.stars}` : ''}）：${p.desc}　规格：${p.spec}`).join('\n')),
    },
    {
      name: 'github_explain',
      description: '小白解释：接收一个热门项目的名称、描述、README 片段，交由 DSH 按固定三段式（是什么/能做什么/什么原理）用大白话解释。不调用外部 AI 服务。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fullName: { type: 'string', description: '项目全名，如 账号/项目。' },
          name: { type: 'string', description: '项目名。' },
          description: { type: 'string', description: '项目描述。' },
          readmeSnippet: { type: 'string', description: 'README 片段。' },
          category: { type: 'string', description: '中文分类。' },
          language: { type: 'string', description: '编程语言。' },
        },
      },
      output: textOutput(),
      execute: async (args) => ({ text: explainContext(args || {}) }),
    },
  ]
}
