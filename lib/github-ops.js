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

  // 先走 GitHub 仓库接口直传（只依赖 api.github.com，最快最稳，不经过对话模型、不耗 Token）。
  let pushMode = '仓库接口上传'
  let branch = 'main'
  try {
    branch = await apiPush(ctx, { owner, repo: repoName, files, branch, message: 'DSH GitHub 助手首次上传', token })
  } catch (apiError) {
    // 仓库接口失败则退回本地 git 链路（clone → 拷贝 → commit → push）。
    pushMode = '本地 git 上传'
    if (process.env.DSH_DEBUG_UPLOAD) console.error('[apiPush fallback]', apiError && apiError.message ? apiError.message : String(apiError))
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
  }

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

/* ---------------- 小白解释：组织三段式上下文递回 DSH ---------------- */

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

/* ---------------- 一键装到 DSH：插件目录 + 安装到指定 profile ---------------- */

// 可直接装进 DeepSeek Harness 的插件目录（npm 包名或 github:仓库）。
// 这些来自本机实际 profile 里已在用的插件，安装规格经过验证。
export const DSH_PLUGIN_CATALOG = [
  { name: 'dsh-genspark', spec: 'github:kgmkm/dsh-genspark', desc: 'Genspark 联网搜索集成', tag: 'GitHub' },
  { name: 'dsh-purge-plus', spec: 'github:luowang-ui/dsh-purge-plus', desc: '指令权威性与清洗增强', tag: 'GitHub' },
  { name: 'dsh-market', spec: 'dshmarket', desc: '插件市场', tag: 'npm' },
  { name: 'dsh-context', spec: 'dsh-context', desc: '上下文管理增强', tag: 'npm' },
  { name: 'dsh-novel-craft', spec: 'dsh-novel-craft', desc: '小说创作助手', tag: 'npm' },
  { name: 'dsh-deeptutor', spec: 'dsh-deeptutor', desc: 'DeepTutor 学习辅导', tag: 'npm' },
  { name: '@anionex/dsh-vision-toolkit', spec: '@anionex/dsh-vision-toolkit', desc: '视觉工具箱', tag: 'npm' },
  { name: 'dsh-vision-router', spec: 'dsh-vision-router', desc: '视觉模型路由', tag: 'npm' },
  { name: 'dsh-camel', spec: 'dsh-camel', desc: '多模型协作', tag: 'npm' },
  { name: 'dsh-browser', spec: 'dsh-browser', desc: '浏览器能力扩展', tag: 'npm' },
  { name: 'dsh-plugin-github', spec: 'dsh-plugin-github', desc: 'GitHub 工具集成', tag: 'npm' },
  { name: 'dsh-cost-meter', spec: 'dsh-cost-meter', desc: '用量与成本统计', tag: 'npm' },
]

function profilesRoot() {
  const base = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
  return join(base, 'profiles')
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
function normalizeInstallSpec(raw) {
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
      description: '一键装到 DSH：把一个插件（npm 包名或「账号/仓库名」）直接安装进指定的 DeepSeek Harness 配置，并自动加入启动清单，重启 DSH 后生效。不输密码、不经过对话模型。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          spec: { type: 'string', description: '插件规格：npm 包名（如 dsh-context）或 GitHub 仓库（账号/仓库名）。' },
          repo: { type: 'string', description: '同 spec，兼容旧参数。' },
          profile: { type: 'string', description: '目标配置名，默认 web。可用 github_profiles 查看全部。' },
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
      description: '列出可以直接一键装到 DeepSeek Harness 的插件目录（名称、安装规格、简介）。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: textOutput(),
      execute: guarded('插件目录', async () => DSH_PLUGIN_CATALOG.map((p) => `- ${p.name}（${p.tag}）：${p.desc}　规格：${p.spec}`).join('\n')),
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
