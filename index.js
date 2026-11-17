// Generated from src/index.ts - do not edit by hand; run `node build.mjs`.
/**
 * dsh-github-trending-plus — Host half.
 *
 * Registers:
 *   - tool `github_trending`      : fetch + analyse + digest for the model
 *   - command `/github-trending`  : user-facing one-shot report
 *   - HTTP `GET /dsh-github-trending/report` : JSON feed for the Web panel
 *   - HTTP `POST /dsh-github-trending/ai`    : natural-language filter + search fallback
 *   - HTTP `GET /dsh-github-trending/ai/info`: host/model/weights for the panel
 *
 * The Web panel lives in client.ts and reads the JSON feed over the same origin.
 */

import { getReport, normalizeCustomBoards, normalizeInstallQuality, reportQuery } from './lib/report.js'
import { helperToolDefinitions, loginStart, loginStatus, isLoggedIn, uploadProject, explainContext, aiExplain, aiScoreRepos, aiTranslateIntros, listMyRepos, mineToText, downloadRepo, startDownloadTask, getDownloadTask, cancelDownloadTask, listDownloadTasks, isDshPlugin, installToDsh, listProfiles, loadPluginCatalog, DSH_PLUGIN_CATALOG } from './lib/github-ops.js'
                                                                                  
import { MAX_README_CHARS, firstParagraph } from './lib/translate.js'
                                                                        
import { sortByWeights } from './lib/ai.js'
                                                                      
import { searchRepos } from './lib/search.js'
                                                 
import { githubToken } from './lib/enrich.js'
import {
  DEFAULT_TOTAL_BUDGET_MS,
  MAX_TOTAL_BUDGET_MS,
  MIN_TOTAL_BUDGET_MS,
  configureNetwork,
  registerTextBackend,
} from './lib/http.js'
import { DEFAULT_DOH_ENDPOINTS } from './lib/net.js'
                                               
import { PERIOD_EN, PERIOD_ZH, POPULAR_LANGUAGES } from './lib/trending.js'
                                                      

/**
 * Hard dependency: the tool registry. Commands and the HTTP server are optional
 * capabilities resolved through `ctx.get()` so the plugin still loads in hosts
 * that do not expose them.
 */
export const inject = ['tools']

                                   
                                                                              
                
                                                             
                       
                                                    
                       
                                                                
                    
                                                            
                       
                                                                                
                           
                                                                      
                   
                                                     
                         
                                                                                  
                                         
                                                                                              
                       
                                                                                                             
                 
                                                                                                  
                        
                                                                          
                        
                                                                                                
                         
                                                                                     
                                                   
                                                                                             
                          
                                                                         
                          
                                                                    
                       
                                                                                           
                    
                                                         
                  
                                                                                                           
                   
 

                      
          
 

                           
                                                       
                             
                                        
                                                                                                               
 

const ROUTE_BASE = '/dsh-github-trending'
const RISK_ICON                         = { high: '🔴', medium: '🟠', low: '🟢' }

const SETTINGS = {
  token: null                 ,
  defaultLimit: 50,
  deepCount: 10,
  defaultFocus: 3,
  defaultSince: 'daily'                 ,
  customBoards: []                 ,
  installQuality: 'pass'                  ,
  sortWeights: { match: 0.6, growth: 0.4 },
  searchFallback: true,
  searchThreshold: 5,
  readmeBadge: true,
  aiBaseURL: '',
  aiModel: '',
  aiKeyEnv: 'DSH_GITHUB_TRENDING_AI_KEY',
}

/**
 * Most recent reports, keyed by the normalized request. The translate route
 * reuses the panel's already-fetched report instead of triggering a scrape, so
 * a translation never makes the user wait for GitHub again.
 */
                        
            
                        
 

const RECENT_REPORTS = new Map                      ()
const MAX_RECENT_REPORTS = 16

function recentKey(query                                                           )         {
  return `${query.since}|${query.language ?? '*'}|${query.limit}`
}

function rememberReport(report                , limit         )       {
  // Snapshot-tier reports (no enrichment) must never displace a full report:
  // translate/AI reuse is expected to see the enriched payload only.
  if (!(report.enrichedCount > 0)) return
  const normalized = reportQuery({
    since: report.since,
    language: report.language,
    limit,
    focusCount: report.focusCount,
  })
  const key = recentKey(normalized)
  RECENT_REPORTS.delete(key)
  RECENT_REPORTS.set(key, { at: Date.now(), report })
  while (RECENT_REPORTS.size > MAX_RECENT_REPORTS) {
    const oldest = RECENT_REPORTS.keys().next().value
    if (oldest === undefined) break
    RECENT_REPORTS.delete(oldest)
  }
}

/**
 * Test-only seam: seed the recent-report cache so offline route tests do not
 * scrape GitHub. Production code never calls this.
 */
export function rememberReportForTest(report                , limit         )       {
  rememberReport(report, limit)
}

/**
 * Test-only seam: read back the recent report a route would reuse. Production
 * code never calls this; it exists so offline route tests can prove that a
 * snapshot did not overwrite a full report.
 */
export function recentReportForTest(since         , language         , limit         )                             {
  const normalized = reportQuery({ since, language, limit, focusCount: 1 })
  return RECENT_REPORTS.get(recentKey(normalized))?.report
}

const AI_RATE_WINDOW_MS = 60 * 1000
const AI_RATE_MAX = 10
const AI_RATE = new Map                                          ()

/** Test-only seam: clear the per-IP `/ai` rate-limit window. */
export function resetAiRateLimitForTest()       {
  AI_RATE.clear()
}

/** Count one `/ai` call for the socket address; the 11th call in a window is limited. */
function recordAiCall(req     )                                           {
  const ip = String(req?.socket?.remoteAddress ?? req?.connection?.remoteAddress ?? 'unknown')
  const now = Date.now()
  let entry = AI_RATE.get(ip)
  if (!entry || now - entry.start >= AI_RATE_WINDOW_MS) {
    entry = { start: now, count: 0 }
    AI_RATE.set(ip, entry)
  }
  entry.count += 1
  if (entry.count > AI_RATE_MAX) {
    return { limited: true, retryAfter: Math.max(1, Math.ceil((entry.start + AI_RATE_WINDOW_MS - now) / 1000)) }
  }
  if (AI_RATE.size > 512) {
    for (const [key, value] of AI_RATE) {
      if (now - value.start >= AI_RATE_WINDOW_MS) AI_RATE.delete(key)
    }
  }
  return { limited: false, retryAfter: 0 }
}

/** First README paragraph, capped to the 400-character payload budget. */
function readmeExcerpt(repo                                 )         {
  const text = firstParagraph(repo.readmeSnippet)
  const chars = Array.from(text)
  return chars.length > MAX_README_CHARS ? chars.slice(0, MAX_README_CHARS).join('') : text
}

function clampInt(value         , fallback        , min        , max        )         {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function normalizeNetworkMode(value         )              {
  const mode = String(value ?? '').trim().toLowerCase()
  return mode === 'manual' || mode === 'off' ? mode : 'auto'
}

function normalizeDohEndpoints(value         )           {
  if (!Array.isArray(value)) return [...DEFAULT_DOH_ENDPOINTS]
  const endpoints = value.map((item) => String(item ?? '').trim()).filter(Boolean)
  return endpoints.length > 0 ? endpoints : [...DEFAULT_DOH_ENDPOINTS]
}

function normalizeCandidateIPs(value         )                           {
  const out                           = {}
  if (!value || typeof value !== 'object') return out
  for (const [host, ips] of Object.entries(value                           )) {
    const key = String(host ?? '').trim().toLowerCase()
    if (!key || !Array.isArray(ips)) continue
    const list = ips.map((ip) => String(ip ?? '').trim()).filter(Boolean)
    if (list.length > 0) out[key] = list
  }
  return out
}

function compact(value        )         {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

function range(value        )         {
  const pct = value * 100
  if (pct >= 10) return `${pct.toFixed(0)}%`
  if (pct >= 1) return `${pct.toFixed(1)}%`
  return `${pct.toFixed(2)}%`
}

function safeGet(ctx                 , name        )      {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

function logInfo(ctx                 , message        )       {
  try {
    ctx.logger?.info?.(`[github-trending] ${message}`)
  } catch {
    /* logging must never break the feature */
  }
}

function reportPath(options                                                                       )         {
  const { since, language, limit, focusCount } = reportQuery({
    since: options.since,
    language: options.language,
    limit: options.limit,
    focusCount: options.focus,
  })
  const params = new URLSearchParams({ since, limit: String(limit), focus: String(focusCount) })
  if (language) params.set('language', language)
  return `${ROUTE_BASE}/report?${params.toString()}`
}

/** Public JSON payload: the report as the panel and scripts consume it. */
function toPublicReport(report                )                          {
  return { ...report }
}

function digestText(report                )         {
  const { summary, repos, since } = report
  const periodZh = PERIOD_ZH[since]
  const lines           = []
  lines.push(
    `GitHub Trending · ${periodZh}榜 · ${report.language ?? '全部语言'} · 收录 ${summary.repoCount} 个仓库` +
      `（生成于 ${report.generatedAt.replace('T', ' ').slice(0, 16)} UTC，耗时 ${(report.durationMs / 1000).toFixed(1)}s，${report.cache === 'hit' ? '缓存命中' : '实时抓取'}）`,
  )
  lines.push(
    `周期 star 增量 +${compact(summary.totalDelta)} ｜ 累计 star ${compact(summary.totalStars)} ｜ 最热语言 ${summary.topLanguage} ｜ 平均增长率 ${range(summary.avgGrowth)}`,
  )
  lines.push(
    `风险分布：高 ${summary.riskCount.high} / 中 ${summary.riskCount.medium} / 低 ${summary.riskCount.low} ｜ 结构化增强 ${summary.enrichedCount}/${summary.repoCount}（GitHub API）`,
  )
  lines.push('')
  for (const repo of repos.slice(0, 8)) {
    lines.push(
      `${repo.rank}. ${repo.fullName} +${compact(repo.delta)} star（累计 ${compact(repo.stars)}）· ${repo.categoryZh} · ${RISK_ICON[repo.riskLevel]} ${range(repo.growthRatio)}`,
    )
  }
  if (repos.length > 8) lines.push(`… 其余 ${repos.length - 8} 个仓库见报告`)
  lines.push('')
  lines.push(`交互式卡片报告：Harness 侧边栏「GitHub 趋势」面板（数据源 ${reportPath({ since, language: report.language, limit: repos.length, focus: report.focusCount })}）`)
  return lines.join('\n')
}

function toolDefinition()          {
  return {
    name: 'github_trending',
    description:
      'Fetch the GitHub Trending board (daily / weekly / monthly, optionally filtered by programming language), analyse every repository ' +
      '(summary, star gain, tech stack, highlights, risks) and render an interactive card report in the Harness Web UI sidebar panel. ' +
      'Returns a compact digest: totals, top repositories and the path of the JSON feed. Results are cached for 10 minutes.',
    parameters: {
      type: 'object',
      properties: {
        since: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly'],
          description: 'Board period. daily = stars today, weekly = stars this week, monthly = stars this month. Defaults to daily.',
        },
        language: {
          type: 'string',
          description: 'Programming language filter, e.g. "python", "rust", "typescript". Omit or leave empty for all languages.',
        },
        limit: {
          type: 'integer',
          minimum: 3,
          maximum: 50,
          description: 'How many repositories to include in the report (default 50).',
        },
        focus: {
          type: 'integer',
          minimum: 1,
          maximum: 6,
          description: 'How many top repositories get a deep-dive breakdown (default 3).',
        },
        refresh: {
          type: 'boolean',
          description: 'Bypass the 10 minute cache and re-scrape now.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          since: { type: 'string' },
          language: { type: 'string' },
          generatedAt: { type: 'string' },
          cache: { type: 'string' },
          repoCount: { type: 'integer' },
          totalDelta: { type: 'integer' },
          totalStars: { type: 'integer' },
          repos: { type: 'array', items: { type: 'object', additionalProperties: true } },
          reportPath: { type: 'string' },
        },
        additionalProperties: true,
      },
      render(_args         , value         )                                        {
        const record = (value ?? {})                       
        const repos        = Array.isArray(record.repos) ? record.repos : []
        const lines           = []
        lines.push(
          `GitHub Trending · ${PERIOD_ZH[record.since                 ] ?? record.since}榜 · ${record.language || '全部语言'} · 收录 ${record.repoCount ?? repos.length} 个仓库`,
        )
        lines.push(
          `周期 star 增量 +${compact(Number(record.totalDelta) || 0)} ｜ 累计 star ${compact(Number(record.totalStars) || 0)} ｜ ${record.cache === 'hit' ? '缓存命中' : '实时抓取'}`,
        )
        lines.push('')
        for (const repo of repos.slice(0, 8)) {
          lines.push(
            `${repo.rank}. ${repo.fullName} +${compact(Number(repo.delta) || 0)} star（累计 ${compact(Number(repo.stars) || 0)}）· ${repo.category ?? ''} · ${RISK_ICON[String(repo.riskLevel)] ?? ''}`,
          )
        }
        lines.push('')
        lines.push(`交互式报告：Harness 侧边栏「GitHub 趋势」面板`)
        if (record.reportPath) lines.push(`JSON 数据：${record.reportPath}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    timeoutMs: 60000,
    isConcurrencySafe: true,
    async execute(args         , exec         )                   {
      const input = (args ?? {})                           
      const signal = (exec                                        )?.signal
      const report = await getReport({
        since: input.since ?? SETTINGS.defaultSince,
        language: input.language,
        limit: input.limit ?? SETTINGS.defaultLimit,
        focusCount: input.focus ?? SETTINGS.defaultFocus,
        deepCount: SETTINGS.deepCount,
        refresh: input.refresh,
        token: SETTINGS.token,
        customBoards: SETTINGS.customBoards,
        installQuality: SETTINGS.installQuality,
        signal,
      })
      rememberReport(report, input.limit ?? SETTINGS.defaultLimit)
      return {
        since: report.since,
        language: report.language ?? '',
        generatedAt: report.generatedAt,
        cache: report.cache,
        repoCount: report.summary.repoCount,
        totalDelta: report.summary.totalDelta,
        totalStars: report.summary.totalStars,
        summary: report.summary,
        repos: report.repos.map((repo) => ({
          rank: repo.rank,
          fullName: repo.fullName,
          url: repo.url,
          stars: repo.stars,
          delta: repo.delta,
          growthRatio: repo.growthRatio,
          language: repo.language,
          category: repo.categoryZh,
          riskLevel: repo.riskLevel,
          risk: repo.risks,
          highlights: repo.highlights,
          stack: repo.stack,
          tldr: repo.tldr,
        })),
        reportPath: reportPath({ since: report.since, language: report.language, limit: report.summary.repoCount, focus: report.focusCount }),
      }
    },
  }
}

function commandDefinition(ctx                 )          {
  return {
    name: 'github-trending',
    description: '抓取 GitHub Trending（日/周/月 + 语言筛选）并生成交互式趋势报告',
    input: { hint: '[daily|weekly|monthly] [language]', attachments: false },
    async handler(invocation                                             )                                                       {
      const raw = String(invocation.rawInput ?? '').trim()
      const tokens = raw.split(/\s+/).filter(Boolean)
      let since         = SETTINGS.defaultSince
      let language = ''
      for (const token of tokens) {
        const lower = token.toLowerCase()
        if (/^(daily|weekly|monthly|day|week|month)$/.test(lower)) since = lower.startsWith('w') ? 'weekly' : lower.startsWith('m') ? 'monthly' : 'daily'
        else if (!language) language = token
      }
      try {
        const report = await getReport({
          since,
          language,
          limit: SETTINGS.defaultLimit,
          focusCount: SETTINGS.defaultFocus,
          deepCount: SETTINGS.deepCount,
          token: SETTINGS.token,
          customBoards: SETTINGS.customBoards,
          installQuality: SETTINGS.installQuality,
          signal: invocation.signal,
        })
        rememberReport(report, SETTINGS.defaultLimit)
        logInfo(ctx, `command report ${report.since}/${report.language ?? '*'} in ${report.durationMs}ms`)
        return { kind: 'success', text: digestText(report) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { kind: 'error', text: `GitHub Trending 抓取失败：${message}` }
      }
    },
  }
}

function sendJson(res     , status        , payload         )       {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

/** Reject a wrong HTTP verb with 405 before the handler does any work. */
function methodRejected(req     , res     , allowed          )          {
  const method = String(req && req.method ? req.method : 'GET').toUpperCase()
  if (allowed.includes(method)) return false
  sendJson(res, 405, { error: `method ${method} not allowed`, allowed })
  return true
}

function queryOf(req     )                         {
  try {
    const url = new URL(String(req.url ?? '/'), 'http://localhost')
    const out                         = {}
    url.searchParams.forEach((value, key) => {
      out[key] = value
    })
    return out
  } catch {
    return {}
  }
}

function reportRoute(ctx                 )          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/report`,
    methods: ['GET'],
    async handler(req     , res     )                {
      if (methodRejected(req, res, ['GET'])) return
      const query = queryOf(req)
      // `enrich` defaults to 1. Only the literal '0' asks for the snapshot
      // tier, which skips enrichment entirely and is cached separately.
      const snapshot = (query.enrich ?? '1') === '0'
      try {
        const report = await getReport({
          since: query.since,
          language: query.language,
          limit: query.limit ?? SETTINGS.defaultLimit,
          focusCount: query.focus ?? SETTINGS.defaultFocus,
          deepCount: SETTINGS.deepCount,
          refresh: query.refresh,
          token: SETTINGS.token,
          customBoards: SETTINGS.customBoards,
          installQuality: SETTINGS.installQuality,
          ...(snapshot ? { enrichCount: 0, readmeCount: 0 } : {}),
        })
        // A network failure is a valid 200 payload: the panel renders the
        // error state with retry instead of treating the whole feed as 5xx.
        if (!report.error) rememberReport(report, query.limit ?? SETTINGS.defaultLimit)
        sendJson(res, 200, toPublicReport(report))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        sendJson(res, 502, { error: message, since: query.since ?? SETTINGS.defaultSince, language: query.language ?? null })
      }
    },
  }
}

/** Loopback hostnames the panel is allowed to talk to. */
function isLoopbackHostname(hostname        )          {
  const value = String(hostname ?? '').toLowerCase()
  return value === '127.0.0.1' || value === 'localhost' || value === '::1' || value === '[::1]'
}

/**
 * Fallback access check when the host does not expose
 * `connection.requestRejection`: the request must be loopback and, when an
 * Origin is present, its host:port must equal the Host header exactly.
 */
function isLoopbackSameOrigin(req     )          {
  const headers = (req && req.headers) || {}
  let hostUrl     
  try {
    hostUrl = new URL(`http://${String(headers.host ?? '')}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  const origin = headers.origin
  if (origin === undefined || origin === null || origin === '') return true
  let originUrl     
  try {
    originUrl = new URL(String(origin))
  } catch {
    return false
  }
  if (!isLoopbackHostname(originUrl.hostname)) return false
  return originUrl.host.toLowerCase() === hostUrl.host.toLowerCase()
}

/**
 * Prefer the host's own rejection hook (same-origin policy + CSRF), fall back
 * to the explicit loopback check when the connection service is unavailable.
 */
function requestRejected(ctx                 , req     )          {
  try {
    const connection = safeGet(ctx, 'connection')
    const hook = connection && typeof connection.requestRejection === 'function' ? connection.requestRejection : null
    if (hook) return Boolean(hook.call(connection, req))
  } catch {
    /* fall through to the loopback check */
  }
  return !isLoopbackSameOrigin(req)
}

/** Read and parse a small JSON request body without touching disk. */
function readJsonBody(req     , maxBytes = 64 * 1024)               {
  return new Promise((resolve, reject) => {
    let settled = false
    let size = 0
    const chunks        = []
    const fail = (error         )       => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk     ) => {
      if (settled) return
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      size += buffer.length
      if (size > maxBytes) {
        fail(new Error('body too large'))
        try {
          req.destroy?.()
        } catch {
          /* already closed */
        }
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      if (settled) return
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        const body = text ? JSON.parse(text) : {}
        settled = true
        resolve(body)
      } catch (error) {
        fail(error)
      }
    })
    req.on('error', fail)
  })
}

/**
 * Response row for the translate route. `translateIntros` now returns
 * `{intro, onboarding}`; a bare string is still accepted as the intro so older
 * callers/tests keep working. An empty onboarding is a valid value: the client
 * then keeps the rule-based 上手门槛 sentence.
 */
export function translatePayloadItem(
  fullName        ,
  value                          ,
)                                                          {
  if (typeof value === 'string') return { fullName, intro: value, onboarding: '' }
  return {
    fullName,
    intro: typeof value?.intro === 'string' ? value.intro : '',
    onboarding: typeof value?.onboarding === 'string' ? value.onboarding : '',
  }
}

/** POST /dsh-github-trending/translate — model-written intros for the deep cards. */
function translateRoute(ctx                 )          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/translate`,
    methods: ['POST'],
    async handler(req     , res     )                {
      if (methodRejected(req, res, ['POST'])) return
      if (requestRejected(ctx, req)) {
        sendJson(res, 403, { error: 'cross-origin request rejected' })
        return
      }
      let body     
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, 400, { error: 'invalid JSON body' })
        return
      }
      const started = Date.now()
      const query = reportQuery({
        since: body && body.since,
        language: body && body.language,
        limit: body && body.limit != null ? body.limit : SETTINGS.defaultLimit,
        focusCount: SETTINGS.defaultFocus,
      })
      const recent = RECENT_REPORTS.get(recentKey(query))
      if (!recent) {
        sendJson(res, 200, { configured: true, model: 'built-in', translated: 0, ms: Date.now() - started, items: [] })
        return
      }
      const report = recent.report
      const configuredDeep = Number(report.deepCount)
      const deepCount = Math.min(
        report.repos.length,
        Math.max(1, Number.isFinite(configuredDeep) ? configuredDeep : SETTINGS.deepCount),
      )
      const allowed =
        Array.isArray(body && body.fullNames) && body.fullNames.length > 0
          ? new Set(body.fullNames.map((name         ) => String(name ?? '').trim()).filter(Boolean))
          : null
      const items                  = report.repos
        .slice(0, deepCount)
        .filter((repo) => !allowed || allowed.has(repo.fullName))
        .map((repo) => ({
          fullName: repo.fullName,
          name: repo.name,
          description: repo.description ?? '',
          topics: Array.isArray(repo.topics) ? repo.topics : [],
          readmeSnippet: readmeExcerpt(repo),
        }))
      let translated                                  = {}
      try {
        translated = await aiTranslateIntros(ctx, items)
      } catch {
        translated = {}
      }
      sendJson(res, 200, {
        configured: true,
        model: 'built-in',
        translated: Object.keys(translated).length,
        ms: Date.now() - started,
        items: Object.entries(translated).map(([fullName, value]) =>
          translatePayloadItem(fullName, value),
        ),
      })
    },
  }
}

/**
 * POST /dsh-github-trending/ai — natural-language filter over the cached report.
 * 内置大模型打分，无需任何 API key；模型失败时得分为空，走兜底排序 + 搜索。
 * Guard order: verb → same-origin → per-IP rate limit → body/prompt validation.
 */
function aiRoute(ctx                 )          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/ai`,
    methods: ['POST'],
    async handler(req     , res     )                {
      if (methodRejected(req, res, ['POST'])) return
      if (requestRejected(ctx, req)) {
        sendJson(res, 403, { error: 'cross-origin request rejected' })
        return
      }
      const rate = recordAiCall(req)
      if (rate.limited) {
        try {
          res.setHeader('retry-after', String(rate.retryAfter))
        } catch {
          /* headers already sent */
        }
        sendJson(res, 429, { error: 'too many requests', retryAfter: rate.retryAfter })
        return
      }
      let body     
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, 400, { error: 'invalid JSON body' })
        return
      }
      const prompt = typeof (body && body.prompt) === 'string' ? body.prompt.trim() : ''
      if (!prompt || Array.from(prompt).length > 2000) {
        sendJson(res, 400, { error: 'prompt must be 1-2000 characters' })
        return
      }

      const started = Date.now()
      const query = reportQuery({
        since: body && body.since,
        language: body && body.language,
        limit: body && body.limit != null ? body.limit : SETTINGS.defaultLimit,
        focusCount: SETTINGS.defaultFocus,
      })
      const recent = RECENT_REPORTS.get(recentKey(query))
      if (!recent) {
        sendJson(res, 200, {
          prompt,
          model: 'built-in',
          scored: 0,
          elapsedMs: Date.now() - started,
          items: [],
          search: { used: false, count: 0 },
        })
        return
      }

      const repos = recent.report.repos
      const inputs                   = repos.map((repo) => ({
        fullName: repo.fullName,
        name: repo.name,
        description: repo.description ?? '',
        topics: Array.isArray(repo.topics) ? repo.topics : [],
      }))
      // 内置大模型打分（无需任何 API key）；失败时得分为空，走兜底排序。
      let scores                            = {}
      try {
        scores = await aiScoreRepos(ctx, prompt, inputs)
      } catch {
        scores = {}
      }
      const scored = Object.keys(scores).length
      const trending = repos.map((repo) => {
        const match = scores[repo.fullName]
        return {
          ...repo,
          matchScore: match ? match.score : 0,
          matchReason: match ? match.reason : '',
          origin: 'trending'         ,
        }
      })
      const hitCount = trending.filter((item) => item.matchScore >= 1).length
      const ordered = sortByWeights(trending, SETTINGS.sortWeights)

      let searchItems               = []
      let searchUsed = false
      if (SETTINGS.searchFallback && hitCount < SETTINGS.searchThreshold) {
        searchUsed = true
        const existing = new Set(repos.map((repo) => repo.fullName))
        try {
          const found = await searchRepos({ query: prompt, limit: 5, token: SETTINGS.token })
          searchItems = found.filter((item) => !existing.has(item.fullName))
        } catch {
          searchItems = []
        }
      }

      sendJson(res, 200, {
        prompt,
        model: 'built-in',
        scored,
        elapsedMs: Date.now() - started,
        items: [...ordered, ...searchItems],
        search: { used: searchUsed, count: searchItems.length },
      })
    },
  }
}

/** GET /dsh-github-trending/ai/info — 内置大模型链路，永远可用。 */
function aiInfoRoute()          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/ai/info`,
    methods: ['GET'],
    handler(_req     , res     )       {
      if (methodRejected(_req, res, ['GET'])) return
      sendJson(res, 200, {
        configured: true,
        aiConfigured: true,
        model: 'built-in',
        searchThreshold: SETTINGS.searchThreshold,
        sortWeights: SETTINGS.sortWeights,
      })
    },
  }
}

/** GET /dsh-github-trending/status — 面板状态（AI 走内置大模型，永远可用）。 */
function statusRoute()          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/status`,
    methods: ['GET'],
    handler(_req     , res     )       {
      if (methodRejected(_req, res, ['GET'])) return
      sendJson(res, 200, {
        configured: true,
        aiConfigured: true,
        model: 'built-in',
        githubTokenConfigured: Boolean(SETTINGS.token),
      })
    },
  }
}

/** POST /dsh-github-trending/login/start — 发起设备码登录（纯 JS，无密码）。 */
function helperLoginStartRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/login/start`,
    methods: ['POST'],
    async handler(_req     , res     )       {
      if (methodRejected(_req, res, ['POST'])) return
      try {
        const text = await loginStart()
        sendJson(res, 200, { ok: true, text })
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `发起登录失败：${error instanceof Error ? error.message : String(error)}` })
      }
    },
  }
}

/** GET /dsh-github-trending/login/status — 检查 GitHub 登录状态。 */
function helperLoginStatusRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/login/status`,
    methods: ['GET'],
    async handler(_req     , res     )       {
      if (methodRejected(_req, res, ['GET'])) return
      try {
        const text = await loginStatus(ctx)
        sendJson(res, 200, { ok: true, text, loggedIn: await isLoggedIn(ctx) })
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `检查登录状态失败：${error instanceof Error ? error.message : String(error)}` })
      }
    },
  }
}

/** POST /dsh-github-trending/upload — 一键上传到自己的 GitHub（不经过对话模型）。 */
function helperUploadRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/upload`,
    methods: ['POST'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['POST'])) return
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `请求内容有误：${error instanceof Error ? error.message : String(error)}` })
        return
      }
      try {
        const text = await uploadProject(ctx, body || {})
        sendJson(res, 200, { ok: true, text })
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `上传失败：${error instanceof Error ? error.message : String(error)}` })
      }
    },
  }
}

/** POST /dsh-github-trending/download — 应用下载：把项目源码包下载并解压到本地。 */
function helperDownloadRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/download`,
    methods: ['POST'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['POST'])) return
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `请求内容有误：${error instanceof Error ? error.message : String(error)}` })
        return
      }
      try {
        const text = await downloadRepo(ctx, body || {})
        sendJson(res, 200, { ok: true, text })
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `下载失败：${error instanceof Error ? error.message : String(error)}` })
      }
    },
  }
}

/** GET /dsh-github-trending/profiles — 列出可安装插件的配置。 */
function helperProfilesRoute()          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/profiles`,
    methods: ['GET'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['GET'])) return
      try {
        sendJson(res, 200, { ok: true, profiles: listProfiles() })
      } catch (error) {
        sendJson(res, 200, { ok: false, profiles: [], text: `读取配置失败：${error instanceof Error ? error.message : String(error)}` })
      }
    },
  }
}

/** GET /dsh-github-trending/catalog — 可直接装到 DSH 的插件目录（已合并本机已装 + 远程清单）。 */
function helperCatalogRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/catalog`,
    methods: ['GET'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['GET'])) return
      try {
        const catalog = await loadPluginCatalog(ctx)
        sendJson(res, 200, { ok: true, catalog })
      } catch (error) {
        // 即使动态合并失败，也退回内置目录，保证前端始终有内容可展示。
        sendJson(res, 200, { ok: true, catalog: DSH_PLUGIN_CATALOG })
      }
    },
  }
}

/** POST /dsh-github-trending/install — 一键装到 DSH。 */
function helperInstallRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/install`,
    methods: ['POST'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['POST'])) return
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `请求内容有误：${error instanceof Error ? error.message : String(error)}` })
        return
      }
      try {
        const text = await installToDsh(ctx, body || {})
        sendJson(res, 200, { ok: true, text })
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `部署失败：${error instanceof Error ? error.message : String(error)}` })
      }
    },
  }
}

/** GET /dsh-github-trending/mine — 浏览自己账号的所有项目（分页）。 */
function helperMineRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/mine`,
    methods: ['GET'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['GET'])) return
      try {
        const q = req && req.query ? req.query : {}
        const result = await listMyRepos(ctx, {
          sort: q.sort || 'updated',
          perPage: Number(q.perPage) || 30,
          maxPages: Number(q.maxPages) || 5,
        })
        sendJson(res, 200, { ok: true, ...result, text: mineToText(result) })
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `浏览项目失败：${error instanceof Error ? error.message : String(error)}`, repos: [] })
      }
    },
  }
}

/** POST /dsh-github-trending/explain — 调 DSH 内置大模型生成三段式大白话解释，返回小窗展示。 */
function helperExplainRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/explain`,
    methods: ['POST'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['POST'])) return
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `请求内容有误：${error instanceof Error ? error.message : String(error)}`, ai: false })
        return
      }
      // 优先用 DSH 内置大模型直接生成解释（用户无需申请任何 API key）。
      let answer = null
      try { answer = await aiExplain(ctx, body || {}) } catch { answer = null }
      if (answer) {
        sendJson(res, 200, { ok: true, ai: true, text: answer })
        return
      }
      // 内置模型不可用时回退三段式提示模板（仍不打扰当前对话）。
      sendJson(res, 200, { ok: true, ai: false, text: explainContext(body || {}) })
    },
  }
}

/** POST /dsh-github-trending/is-plugin — 检测某个 GitHub 项目是不是 DSH 插件（决定卡片是否显示「装到 DSH」按钮）。 */
function helperIsPluginRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/is-plugin`,
    methods: ['POST'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['POST'])) return
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 200, { ok: false, isPlugin: false, text: `请求内容有误：${error instanceof Error ? error.message : String(error)}` })
        return
      }
      let isPlugin = false
      try { isPlugin = Boolean(await isDshPlugin(ctx, body || {})) } catch { isPlugin = false }
      sendJson(res, 200, { ok: true, isPlugin })
    },
  }
}

/** GET /dsh-github-trending/login/info — 登录状态 + 没有账号时的注册入口。 */
function helperLoginInfoRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/login/info`,
    methods: ['GET'],
    async handler(_req     , res     )       {
      if (methodRejected(_req, res, ['GET'])) return
      let loggedIn = false
      try { loggedIn = await isLoggedIn(ctx) } catch { loggedIn = false }
      sendJson(res, 200, {
        ok: true,
        loggedIn,
        signupUrl: 'https://github.com/signup',
        verifyUrl: 'https://github.com/login/device',
      })
    },
  }
}

/** POST /dsh-github-trending/download/start — 发起后台下载，立即返回任务 id。 */
function helperDownloadStartRoute(ctx)          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/download/start`,
    methods: ['POST'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['POST'])) return
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `请求内容有误：${error instanceof Error ? error.message : String(error)}` })
        return
      }
      try {
        const task = startDownloadTask(ctx, body || {})
        sendJson(res, 200, { ok: true, id: task.id, repo: task.repo, status: task.status, text: `已经开始在后台下载 ${task.repo}。` })
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `发起下载失败：${error instanceof Error ? error.message : String(error)}` })
      }
    },
  }
}

/** GET /dsh-github-trending/download/status/:id — 查询单个下载任务进度。 */
function helperDownloadStatusRoute()          {
  return {
    kind: 'prefix',
    path: `${ROUTE_BASE}/download/status/`,
    methods: ['GET'],
    handler(req     , res     )       {
      if (methodRejected(req, res, ['GET'])) return
      const url = (req && req.url) || ''
      const id = decodeURIComponent(String(url).split('/').pop() || '')
      const task = getDownloadTask(id)
      if (!task) {
        sendJson(res, 200, { ok: false, text: '没有找到这个下载任务。' })
        return
      }
      sendJson(res, 200, { ok: true, task })
    },
  }
}

/** GET /dsh-github-trending/download/list — 列出全部下载任务。 */
function helperDownloadListRoute()          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/download/list`,
    methods: ['GET'],
    handler(_req     , res     )       {
      if (methodRejected(_req, res, ['GET'])) return
      let tasks = []
      try { tasks = listDownloadTasks() } catch { tasks = [] }
      sendJson(res, 200, { ok: true, tasks })
    },
  }
}

/** POST /dsh-github-trending/download/cancel — 取消一个下载任务。 */
function helperDownloadCancelRoute()          {
  return {
    kind: 'exact',
    path: `${ROUTE_BASE}/download/cancel`,
    methods: ['POST'],
    async handler(req     , res     )       {
      if (methodRejected(req, res, ['POST'])) return
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `请求内容有误：${error instanceof Error ? error.message : String(error)}` })
        return
      }
      try {
        const result = cancelDownloadTask(body && body.id)
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 200, { ok: false, text: `取消失败：${error instanceof Error ? error.message : String(error)}` })
      }
    },
  }
}

export function apply(ctx                 , config                   = {})       {
  // Resolve the token once at startup: explicit config, then GITHUB_TOKEN,
  // GH_TOKEN and the token file (see githubToken in lib/enrich.ts). The value
  // is never logged.
  SETTINGS.token = githubToken(config.token) || null
  SETTINGS.defaultLimit = clampInt(config.defaultLimit, 25, 3, 50)
  SETTINGS.deepCount = clampInt(config.deepCount, 10, 1, 50)
  SETTINGS.defaultFocus = clampInt(config.defaultFocus, 3, 1, 6)
  SETTINGS.defaultSince = (['daily', 'weekly', 'monthly']            ).includes(String(config.defaultSince))
    ? (String(config.defaultSince)                 )
    : 'daily'
  SETTINGS.customBoards = normalizeCustomBoards(config.customBoards)
  SETTINGS.installQuality = normalizeInstallQuality(config.installQuality)
  const weights = config.sortWeights ?? {}
  const matchWeight = Number(weights.match)
  const growthWeight = Number(weights.growth)
  SETTINGS.sortWeights = {
    match: Number.isFinite(matchWeight) ? matchWeight : 0.6,
    growth: Number.isFinite(growthWeight) ? growthWeight : 0.4,
  }
  SETTINGS.searchFallback = config.searchFallback !== false
  SETTINGS.searchThreshold = clampInt(config.searchThreshold, 5, 0, 50)
  SETTINGS.readmeBadge = config.readmeBadge !== false
  SETTINGS.aiBaseURL = String(config.aiBaseURL ?? '').trim()
  SETTINGS.aiModel = String(config.aiModel ?? '').trim()
  SETTINGS.aiKeyEnv = String(config.aiKeyEnv ?? '').trim() || 'DSH_GITHUB_TRENDING_AI_KEY'

  // Feed the network options into the transport before any route can be used.
  const networkMode = normalizeNetworkMode(config.networkMode)
  const proxyUrl = String(config.proxyUrl ?? '').trim()
  const dohEndpoints = normalizeDohEndpoints(config.dohEndpoints)
  const candidateIPs = normalizeCandidateIPs(config.candidateIPs)
  const forceDirect = config.forceDirect === true
  const caPath = String(config.caPath ?? '').trim()
  const totalBudgetMs = clampInt(config.totalBudgetMs, DEFAULT_TOTAL_BUDGET_MS, MIN_TOTAL_BUDGET_MS, MAX_TOTAL_BUDGET_MS)
  configureNetwork({ networkMode, proxyUrl, dohEndpoints, candidateIPs, forceDirect, caPath, totalBudgetMs })

  const dispose = (() => {
    const cleanups               = []
    return (fn                                )       => {
      if (!fn) return
      try {
        const result = fn()
        if (typeof result === 'function') cleanups.push(result)
      } catch (error) {
        logInfo(ctx, `registration failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  })()

  const effect = (setup                  )       => {
    if (typeof ctx.effect === 'function') {
      ctx.effect(setup)
      return
    }
    dispose(setup)
  }

  // 自我维护：每个工具的注册单独兜底。DSH 升级若改变某个工具的 schema 要求，
  // 只影响那一个工具，不会中断其余工具与整个插件加载。
  effect(() => {
    const tools = ctx.tools
    if (!tools || typeof tools.register !== 'function') return () => undefined
    const disposers = []
    const safeRegister = (def) => {
      if (!def || !def.name) return
      try {
        const d = tools.register(def)
        if (typeof d === 'function') disposers.push(d)
      } catch (error) {
        logInfo(ctx, `tool registration skipped (${def.name}): ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    safeRegister(toolDefinition())
    let defs = []
    try {
      defs = helperToolDefinitions(ctx) || []
    } catch (error) {
      logInfo(ctx, `helper tools unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
    for (const def of defs) safeRegister(def)
    return () => {
      for (const d of disposers) {
        try { if (typeof d === 'function') d() } catch { /* already disposed */ }
      }
    }
  })

  // 自我维护：启动只记录兼容性信息，不读取任何可能随版本变化的内部 API，
  // 也不因读取失败而中断加载。
  try {
    logInfo(ctx, `compatibility: node=${process.version} platform=${process.platform}`)
  } catch { /* 日志不可用也不影响加载 */ }

  // Second transport: some networks block github.com while the harness' own
  // web-fetch route still reaches it. Registering it as a fallback keeps the
  // plugin working there without giving up the direct fetch elsewhere.
  const webService = safeGet(ctx, 'web')
  if (webService && typeof webService.fetch === 'function') {
    effect(() =>
      registerTextBackend('harness-web', async (url, init) => {
        const result = await webService.fetch({ url }, init.signal)
        const body = result && result.body
        const text = typeof body === 'string' ? body : String((body && body.content) ?? '')
        return {
          status: Number((result && result.statusCode) ?? 0),
          text,
          url: String((result && result.url) ?? url),
          via: 'harness-web',
          truncated: Boolean(result && result.truncated),
        }
      }),
    )
  }

  const commands = safeGet(ctx, 'commands')
  if (commands && typeof commands.register === 'function') {
    effect(() => commands.register(commandDefinition(ctx)))
  }

  // The panel is served by the HTTP carrier. It may activate after this plugin
  // (or restart) so mount reactively instead of probing once at apply time.
  const mountRoute = (host     )                         => {
    try {
      const server = (host && typeof host.get === 'function' ? host.get('webServer') : undefined) ?? host?.webServer
      if (!server || typeof server.register !== 'function') return undefined
      const disposers               = []
      const routeFactories = [
        () => reportRoute(ctx), () => translateRoute(ctx), () => aiRoute(ctx), () => aiInfoRoute(), () => statusRoute(),
        () => helperLoginStartRoute(ctx), () => helperLoginStatusRoute(ctx), () => helperLoginInfoRoute(ctx),
        () => helperUploadRoute(ctx), () => helperMineRoute(ctx), () => helperExplainRoute(ctx),
        () => helperDownloadRoute(ctx), () => helperDownloadStartRoute(ctx), () => helperDownloadStatusRoute(),
        () => helperDownloadListRoute(), () => helperDownloadCancelRoute(),
        () => helperProfilesRoute(), () => helperCatalogRoute(ctx), () => helperInstallRoute(ctx),
        () => helperIsPluginRoute(ctx),
      ]
      // 自我维护：逐条构造并注册，单条失败不影响其余路由与面板加载。
      for (const make of routeFactories) {
        try {
          const route = make()
          if (!route) continue
          const disposeRoute = server.register(route)
          if (typeof disposeRoute === 'function') disposers.push(disposeRoute)
        } catch (error) {
          logInfo(ctx, `route skipped: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      logInfo(
        ctx,
        `routes mounted at ${ROUTE_BASE}/report, ${ROUTE_BASE}/translate, ${ROUTE_BASE}/ai, ${ROUTE_BASE}/ai/info, ${ROUTE_BASE}/status, ${ROUTE_BASE}/login/start, ${ROUTE_BASE}/login/status, ${ROUTE_BASE}/login/info, ${ROUTE_BASE}/upload, ${ROUTE_BASE}/mine, ${ROUTE_BASE}/explain, ${ROUTE_BASE}/download, ${ROUTE_BASE}/download/start, ${ROUTE_BASE}/download/status/:id, ${ROUTE_BASE}/download/list, ${ROUTE_BASE}/download/cancel, ${ROUTE_BASE}/profiles, ${ROUTE_BASE}/catalog, ${ROUTE_BASE}/install`,
      )
      return () => {
        for (const disposeRoute of disposers) {
          try {
            disposeRoute()
          } catch {
            /* route already disposed */
          }
        }
      }
    } catch (error) {
      logInfo(ctx, `route mount failed: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }

  const inject                                                                           = (ctx       ).inject
  if (typeof inject === 'function') {
    inject.call(ctx, ['webServer'], (host     ) => {
      effect(() => mountRoute(host) ?? (() => undefined))
    })
  } else {
    let mounted                        
    let tries = 0
    const attempt = ()       => {
      mounted = mounted ?? mountRoute(ctx)
      if (!mounted && tries++ < 40) setTimeout(attempt, 250)
      if (!mounted && tries >= 40) logInfo(ctx, 'webServer service unavailable — the panel feed will not be served')
    }
    attempt()
    effect(() => () => mounted?.())
  }

  logInfo(
    `ready (limit=${SETTINGS.defaultLimit}, focus=${SETTINGS.defaultFocus}, since=${SETTINGS.defaultSince}, token=${SETTINGS.token ? 'yes' : 'no'}, network=${networkMode}${proxyUrl ? ` proxy=${proxyUrl}` : ''}, doh=${dohEndpoints.length}, languages=${POPULAR_LANGUAGES.length - 1}, periods=${Object.keys(PERIOD_EN).length})`,
  )
}