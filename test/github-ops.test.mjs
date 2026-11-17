// 单元测试：覆盖 lib/github-ops.js 中不依赖网络与外部进程的纯函数。
// 运行：node --test test/github-ops.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import {
  normalizeInstallSpec,
  explainContext,
  mineToText,
  DSH_PLUGIN_CATALOG,
  loadPluginCatalog,
} from '../lib/github-ops.js'

test('normalizeInstallSpec：裸「账号/仓库名」转 github:', () => {
  assert.equal(normalizeInstallSpec('hj178250/dsh-github-helper'), 'github:hj178250/dsh-github-helper')
  assert.equal(normalizeInstallSpec('hj178250/dsh-github-helper.git'), 'github:hj178250/dsh-github-helper')
})

test('normalizeInstallSpec：https 链接转 github:', () => {
  assert.equal(
    normalizeInstallSpec('https://github.com/hj178250/dsh-github-helper'),
    'github:hj178250/dsh-github-helper',
  )
})

test('normalizeInstallSpec：已带前缀原样返回，不重复加 github:', () => {
  assert.equal(normalizeInstallSpec('github:hj178250/dsh-github-helper'), 'github:hj178250/dsh-github-helper')
  assert.equal(normalizeInstallSpec('npm:dsh-context'), 'npm:dsh-context')
  assert.equal(normalizeInstallSpec('@anionex/dsh-vision-toolkit'), '@anionex/dsh-vision-toolkit')
  assert.equal(normalizeInstallSpec('dsh-context'), 'dsh-context')
})

test('normalizeInstallSpec：空输入抛错', () => {
  assert.throws(() => normalizeInstallSpec(''), /插件/)
  assert.throws(() => normalizeInstallSpec('   '), /插件/)
})

test('explainContext：三段式结构完整', () => {
  const text = explainContext({
    fullName: 'dream-num/univer',
    name: 'univer',
    description: '下一代电子表格',
    language: 'TypeScript',
    category: '开发者工具',
    readmeSnippet: 'README 片段内容'.repeat(100),
  })
  assert.match(text, /①/)
  assert.match(text, /②/)
  assert.match(text, /③/)
  assert.match(text, /dream-num\/univer/)
  assert.match(text, /开发者工具/)
  assert.match(text, /TypeScript/)
})

test('explainContext：README 片段截断到 500 字', () => {
  const text = explainContext({ readmeSnippet: 'x'.repeat(2000) })
  assert.ok(!text.includes('x'.repeat(501)))
})

test('mineToText：空列表提示', () => {
  assert.match(mineToText({ total: 0, repos: [] }), /没有任何项目/)
})

test('mineToText：正常列表', () => {
  const text = mineToText({
    total: 2,
    repos: [
      { fullName: 'a/b', language: 'JS', stars: 3, private: false, htmlUrl: 'https://github.com/a/b' },
      { fullName: 'c/d', language: '', stars: 0, private: true, htmlUrl: 'https://github.com/c/d' },
    ],
  })
  assert.match(text, /共有 2 个项目/)
  assert.match(text, /a\/b/)
  assert.match(text, /公开/)
  assert.match(text, /私有/)
  assert.match(text, /⭐3/)
})

test('DSH_PLUGIN_CATALOG：内置目录项结构完整且 spec 唯一', () => {
  assert.ok(DSH_PLUGIN_CATALOG.length >= 5)
  const specs = new Set()
  for (const p of DSH_PLUGIN_CATALOG) {
    assert.ok(p.name, '每项必须有 name')
    assert.ok(p.spec, '每项必须有 spec')
    assert.ok(!specs.has(p.spec), `spec 重复：${p.spec}`)
    specs.add(p.spec)
  }
})

test('loadPluginCatalog：无网络时回退内置目录', async () => {
  // 用不存在的 URL 强制走失败分支，验证最终仍返回内置目录（兜底）。
  const prev = process.env.DSH_PLUGIN_CATALOG_URL
  process.env.DSH_PLUGIN_CATALOG_URL = 'https://127.0.0.1:1/__none__.json'
  try {
    const catalog = await loadPluginCatalog({})
    assert.ok(Array.isArray(catalog))
    assert.ok(catalog.length >= DSH_PLUGIN_CATALOG.length)
    // 内置目录里的项必须全部出现在结果里
    const specSet = new Set(catalog.map((p) => p.spec))
    for (const p of DSH_PLUGIN_CATALOG) assert.ok(specSet.has(p.spec), `缺失兜底项：${p.spec}`)
  } finally {
    if (prev === undefined) delete process.env.DSH_PLUGIN_CATALOG_URL
    else process.env.DSH_PLUGIN_CATALOG_URL = prev
  }
})
