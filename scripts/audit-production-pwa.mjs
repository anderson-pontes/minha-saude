// Read-only check. HTTP 200 with a SPA fallback is not a valid PWA asset.
import assert from 'node:assert/strict'
import sharp from 'sharp'

const origin = new URL(process.argv[2] || 'https://minha-saude-cyan.vercel.app').origin
let failures = 0
async function check(path, mime, inspect = async () => {}) {
  try {
    const response = await fetch(new URL(path, origin), { redirect: 'follow', signal: AbortSignal.timeout(20000) })
    assert.equal(response.status, 200, `HTTP ${response.status}`)
    assert.match(response.headers.get('content-type') || '', mime, 'Content-Type inesperado')
    const body = Buffer.from(await response.arrayBuffer())
    if (!mime.test('text/html')) assert.doesNotMatch(body.toString('utf8', 0, 100).trimStart(), /^<!doctype html|^<html/i, 'Fallback HTML no lugar do recurso')
    await inspect(body, response)
    console.log(`PASS ${path}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${path}: ${error.message}`)
  }
}

await check('/login', /text\/html/)
await check('/estabelecimentos/00000000-0000-4000-8000-000000000000', /text\/html/)
await check('/manifest.webmanifest', /application\/(manifest\+json|json)/, body => {
  const manifest = JSON.parse(body.toString())
  assert.equal(manifest.name, 'Minha Saúde')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  for (const size of ['192x192', '512x512']) assert(manifest.icons?.some(icon => icon.sizes === size), `Ícone ${size} ausente`)
  assert(manifest.icons.some(icon => icon.purpose?.split(' ').includes('maskable')), 'Ícone maskable ausente')
})
await check('/sw.js', /(?:application|text)\/javascript/, (body, response) => {
  assert.equal(response.headers.get('service-worker-allowed'), '/')
  assert.match(response.headers.get('cache-control') || '', /no-cache|no-store/, 'Service worker precisa revalidar sem cache persistente')
  assert.match(body.toString(), /precacheAndRoute/, 'Precache do Workbox ausente')
})
for (const [path, size] of [['/icons/pwa-192.png', 192], ['/icons/pwa-512.png', 512], ['/icons/pwa-maskable-512.png', 512], ['/icons/apple-touch-icon.png', 180]]) {
  await check(path, /image\/png/, async body => {
    const metadata = await sharp(body).metadata()
    assert.equal(metadata.width, size)
    assert.equal(metadata.height, size)
  })
}
console.log(`${failures ? 'FAIL' : 'PASS'} PWA em ${origin}: ${failures} falha(s)`)
process.exitCode = failures ? 1 : 0
