process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GitConnectorError, githubRequest, isSafeRepoPath, parseRepository, selectCandidatePaths, validateChanges } from '../services/gitConnector.service'
import { capabilitiesFor, connectorOf } from '../services/websiteConnections.service'

function withFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>, run: () => Promise<void>) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init ?? {})) as typeof fetch
  return run().finally(() => { globalThis.fetch = original })
}

test('parseRepository entiende las formas habituales de nombrar un repositorio', () => {
  for (const input of ['https://github.com/acme/web', 'https://github.com/acme/web.git', 'github.com/acme/web/', 'git@github.com:acme/web.git', 'acme/web', 'https://www.github.com/acme/web/tree/main']) {
    assert.deepEqual(parseRepository(input), { owner: 'acme', repo: 'web' }, input)
  }
  for (const input of ['https://gitlab.com/acme/web', 'acme', 'https://github.com/acme', '']) {
    assert.throws(() => parseRepository(input), (error: unknown) => error instanceof GitConnectorError && error.code === 'GIT_REPOSITORY_INVALID', input)
  }
})

test('githubRequest manda el token como Bearer y las cabeceras de la API', async () => {
  const seen: { url?: string; headers?: Record<string, string>; method?: string; body?: string } = {}
  await withFetch((url, init) => {
    seen.url = url
    seen.headers = init.headers as Record<string, string>
    seen.method = init.method ?? 'GET'
    seen.body = typeof init.body === 'string' ? init.body : undefined
    return new Response(JSON.stringify({ sha: 'abc' }), { status: 201 })
  }, async () => {
    const result = await githubRequest<{ sha: string }>('ghp_token', '/repos/acme/web/git/blobs', { method: 'POST', body: { content: 'hola', encoding: 'utf-8' } })
    assert.equal(result.status, 201)
    assert.equal(result.data?.sha, 'abc')
  })
  assert.equal(seen.url, 'https://api.github.com/repos/acme/web/git/blobs')
  assert.equal(seen.method, 'POST')
  assert.equal(seen.headers?.Authorization, 'Bearer ghp_token')
  assert.equal(seen.headers?.Accept, 'application/vnd.github+json')
  assert.equal(seen.body, JSON.stringify({ content: 'hola', encoding: 'utf-8' }))
})

test('el agente nunca ve dependencias, binarios, secretos ni la CI del cliente', () => {
  const entries = [
    { path: 'src/pages/index.tsx', type: 'blob', size: 1200, sha: '1' },
    { path: 'node_modules/react/index.js', type: 'blob', size: 100, sha: '2' },
    { path: '.github/workflows/deploy.yml', type: 'blob', size: 100, sha: '3' },
    { path: '.env.production', type: 'blob', size: 50, sha: '4' },
    { path: 'public/logo.png', type: 'blob', size: 5000, sha: '5' },
    { path: 'package-lock.json', type: 'blob', size: 90000, sha: '6' },
    { path: 'src/components/Header.tsx', type: 'blob', size: 800, sha: '7' },
    { path: 'src', type: 'tree', sha: '8' },
    { path: 'src/__tests__/header.test.tsx', type: 'blob', size: 300, sha: '9' },
    { path: 'data/huge.json', type: 'blob', size: 900_000, sha: '10' },
  ]
  const selected = selectCandidatePaths(entries).map(entry => entry.path)
  assert.deepEqual(new Set(selected), new Set(['src/pages/index.tsx', 'src/components/Header.tsx', 'src/__tests__/header.test.tsx']))
  // Lo que suele contener textos y metadatos va antes que los tests.
  assert.ok(selected.indexOf('src/pages/index.tsx') < selected.indexOf('src/__tests__/header.test.tsx'))
  assert.equal(selected[selected.length - 1], 'src/__tests__/header.test.tsx')
})

test('isSafeRepoPath rechaza rutas que salen del repo o tocan zonas protegidas', () => {
  for (const path of ['src/app/layout.tsx', 'index.html', 'content/blog/post.md']) assert.equal(isSafeRepoPath(path), true, path)
  for (const path of ['../etc/passwd', '/abs/file', 'src/../../x', '.github/workflows/ci.yml', '.env', 'node_modules/x.js', 'public/a.png', 'a\\b', '']) {
    assert.equal(isSafeRepoPath(path), false, path)
  }
})

test('validateChanges solo acepta archivos leídos completos y descarta cambios vacíos', () => {
  const read = new Map([
    ['src/pages/index.tsx', { content: 'a\nb\nc\n', editable: true }],
    ['src/big.tsx', { content: 'x'.repeat(50_000), editable: false }],
  ])
  const ok = validateChanges({ summary: '', prTitle: '', commitMessage: '', changes: [
    { path: 'src/pages/index.tsx', content: 'a\nB\nc\nd\n' },
    { path: 'src/pages/index.tsx', content: 'duplicado ignorado' },
    { path: 'src/new/seo.ts', content: 'export const title = "x"\n' },
    { path: 'src/empty.ts', content: '   ' },
  ] }, read)
  assert.deepEqual(ok.map(change => [change.path, change.action, change.additions, change.deletions]), [
    ['src/pages/index.tsx', 'modified', 2, 1],
    ['src/new/seo.ts', 'created', 2, 0],
  ])

  assert.throws(
    () => validateChanges({ summary: '', prTitle: '', commitMessage: '', changes: [{ path: 'src/big.tsx', content: 'recortado' }] }, read),
    (error: unknown) => error instanceof GitConnectorError && error.code === 'GIT_AGENT_EDITED_UNREAD_FILE',
  )
  assert.throws(
    () => validateChanges({ summary: '', prTitle: '', commitMessage: '', changes: [{ path: '.github/workflows/x.yml', content: 'run: rm -rf /' }] }, read),
    (error: unknown) => error instanceof GitConnectorError && error.code === 'GIT_AGENT_UNSAFE_PATH',
  )
  // Contenido idéntico al original no es un cambio.
  assert.deepEqual(validateChanges({ summary: '', prTitle: '', commitMessage: '', changes: [{ path: 'src/pages/index.tsx', content: 'a\nb\nc\n' }] }, read), [])
})

test('el conector git hace verdaderas las capacidades profundas solo con permiso de push', () => {
  const parsed = connectorOf({ detection: { connector: { kind: 'git', owner: 'acme', repo: 'web', defaultBranch: 'main', canPush: true } } })
  assert.equal(parsed?.kind, 'git')
  const caps = capabilitiesFor('nextjs', 'git', parsed)
  assert.equal(caps.find(item => item.id === 'content')?.available, true)
  assert.match(caps.find(item => item.id === 'publish')?.via ?? '', /aprobación/)
  const revoked = capabilitiesFor('nextjs', 'git', { kind: 'git', provider: 'github', owner: 'acme', repo: 'web', defaultBranch: 'main', canPush: false })
  assert.equal(revoked.find(item => item.id === 'content')?.available, false)
  assert.equal(connectorOf({ detection: { connector: { kind: 'git', owner: 'acme' } } }), null)
})
