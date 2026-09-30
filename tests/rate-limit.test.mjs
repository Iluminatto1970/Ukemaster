/**
 * Testes unitários do rate-limit adaptativo do scraper (mitigação do 429
 * do CifraClub): circuit-breaker, espaçamento que dobra após 429, honra a
 * Retry-After, decaimento após sucessos e delay efetivo do scrapeArtistPage.
 *
 * Sem rede real: injeta um fetch falso via globalThis.fetch e reseta o
 * estado entre casos com resetRateLimitState().
 *
 * Uso: npm test  |  node tests/rate-limit.test.mjs
 */
import assert from 'node:assert/strict';

const mod = await import('../src/lib/scraper.ts');
const {
  fetchHtml,
  politeDelayMs,
  currentSpacingMs,
  resetRateLimitState,
  scrapeArtistPage,
} = mod;

let passed = 0;
function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

const realFetch = globalThis.fetch;

/** Instala um fetch falso que responde `queue` em ordem. */
function fakeFetch(queue) {
  globalThis.fetch = async () => {
    const item = queue.shift() ?? { status: 200, body: '<html></html>' };
    return {
      ok: item.status === 200,
      status: item.status,
      headers: new Map([['retry-after', item.retryAfter]]).get.bind(
        new Map([['retry-after', item.retryAfter]])
      ),
      text: async () => item.body,
    };
  };
}
// headers.get precisa funcionar — usa Headers real:
function fakeFetch2(queue) {
  globalThis.fetch = async () => {
    const item = queue.shift() ?? { status: 200, body: '<html></html>' };
    const headers = new Headers();
    if (item.retryAfter != null) headers.set('retry-after', String(item.retryAfter));
    return {
      ok: item.status === 200,
      status: item.status,
      headers,
      text: async () => item.body,
    };
  };
}

const UA_OK = { headers: { 'user-agent': 'Mozilla/5.0 Chrome' } };

// ── 1. 429 abre circuit-breaker (cooldown ≥ 30s) ─────────────────────────
resetRateLimitState();
fakeFetch2([{ status: 429 }]);
await fetchHtml('https://www.cifraclub.com.br/teste/a/').catch(() => {});
ok('429 abre cooldown ≥ 30s no host', () => {
  const d = politeDelayMs('https://www.cifraclub.com.br/teste/b/');
  // Margem de 1s: entre o 429 e a leitura passam alguns ms.
  assert.ok(d >= 29_000, `esperado >= ~30000ms, veio ${d}ms`);
});
ok('outro host NÃO é afetado pelo cooldown', () => {
  const d = politeDelayMs('https://www.ufret.jp/some');
  assert.ok(d < 30_000, `esperado < 30000ms, veio ${d}ms`);
});

// ── 2. Retry-After é honrado ──────────────────────────────────────────────
resetRateLimitState();
fakeFetch2([{ status: 429, retryAfter: '90' }]);
await fetchHtml('https://www.cifraclub.com.br/x/y/').catch(() => {});
ok('Retry-After: 90 → cooldown ~90s', () => {
  const d = politeDelayMs('https://www.cifraclub.com.br/x/z/');
  assert.ok(d >= 85_000 && d <= 95_000, `esperado ~90000ms, veio ${d}ms`);
});

// ── 3. Espaçamento dobra após cada 429 (até teto 15s) ────────────────────
resetRateLimitState();
const bursts = Array.from({ length: 6 }, () => ({ status: 429 }));
fakeFetch2(bursts);
for (let i = 0; i < 6; i++) {
  await fetchHtml(`https://a.com/${i}`).catch(() => {});
}
ok('delay dobra a cada 429 e satura no teto de 15s', () => {
  // currentSpacingMs = só o espaçamento (o cooldown de 300s dominaria o politeDelayMs)
  const d = currentSpacingMs('https://a.com/final');
  assert.equal(d, 15_000, `esperado teto 15000ms, veio ${d}ms`);
});

// ── 4. Sucessos decaem o espaçamento (20% a cada 5 OK) ───────────────────
resetRateLimitState();
{
  const mixed = [
    { status: 429 },
    ...Array.from({ length: 10 }, () => ({ status: 200, body: '<html></html>' })),
  ];
  fakeFetch2(mixed);
  await fetchHtml('https://b.com/1').catch(() => {});
  const after429 = currentSpacingMs('https://b.com/probe');
  assert.ok(after429 >= 1000, `pré-condição: espaçamento após 429 >= 1000ms, veio ${after429}`);
  for (let i = 2; i <= 11; i++) await fetchHtml(`https://b.com/${i}`);
  const afterOk = currentSpacingMs('https://b.com/probe');
  ok('10 sucessos seguidos decaem o espaçamento', () => {
    assert.ok(
      afterOk < after429,
      `esperado decaimento (${afterOk} < ${after429})`
    );
  });
}

// ── 5. scrapeArtistPage: delay efetivo após 429 ──────────────────────────
resetRateLimitState();
{
  // 1ª requisição (descoberta do catálogo) devolve 429; o retry espera e
  // tentará de novo — para o teste, devolvemos 429 sempre na descoberta.
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    const headers = new Headers();
    if (calls === 1) headers.set('retry-after', '1');
    return {
      ok: false,
      status: calls === 1 ? 429 : 404,
      headers,
      text: async () => '',
    };
  };
  const t0 = Date.now();
  // 429 na descoberta + 404 no retry → exceção propagada (esperada)
  const res = await scrapeArtistPage('https://www.cifraclub.com.br/artista-teste/', {
    limit: 1,
    delayMs: 0,
    timeoutMs: 30_000,
  }).catch((e) => ({ total: 0, error: e?.message }));
  const elapsed = Date.now() - t0;
  ok(
    'scrapeArtistPage respeita o cooldown do host (não martela o site)',
    () => {
      assert.ok(elapsed >= 900, `esperado >= 900ms de espera, durou ${elapsed}ms`);
      assert.equal(res.total, 0);
    }
  );
}

globalThis.fetch = realFetch;
console.log(
  process.exitCode ? '\n✗ FALHAS no rate-limit' : `\n✔ ${passed} testes do rate-limit OK`
);
