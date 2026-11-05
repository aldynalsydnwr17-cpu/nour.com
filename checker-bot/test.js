'use strict';
const assert = require('assert'); const { validName, genName, checkName, findAvailable } = require('./core');
const mkRes = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
(async () => {
  assert(validName('x2f2') && validName('lovx.14') && !validName('a') && !validName('A1b2') && !validName('a..b'));
  for (let i = 0; i < 500; i++) { const s = genName(4); assert(/^[a-z0-9]{4}$/.test(s) && /[a-z]/.test(s) && /\d/.test(s)); }
  assert.strictEqual((await checkName('x2f2', { fetch: async () => mkRes(200, { taken: false }) })).status, 'available');
  assert.strictEqual((await checkName('x2f2', { fetch: async () => mkRes(200, { taken: true }) })).status, 'taken');
  assert.strictEqual((await checkName('BAD!', { fetch: async () => { throw 1; } })).status, 'invalid');
  assert.strictEqual((await checkName('x2f2', { fetch: async () => mkRes(400, {}) })).status, 'invalid');
  assert.strictEqual((await checkName('x2f2', { fetch: async () => { throw new Error('net'); } })).status, 'error');
  let n = 0, slept = 0;
  const r1 = await checkName('x2f2', { sleep: async (ms) => { slept += ms; }, fetch: async () => (++n < 3 ? mkRes(429, { retry_after: 0.5 }) : mkRes(200, { taken: false })) });
  assert.strictEqual(r1.status, 'available'); assert(n === 3 && slept > 0);
  const r2 = await checkName('x2f2', { maxRetry: 1, sleep: async () => {}, fetch: async () => mkRes(429, { retry_after: 2 }) });
  assert.strictEqual(r2.status, 'limited');
  let calls = 0;
  const r3 = await findAvailable({ want: 3, delayMs: 0, sleep: async () => {}, fetch: async () => mkRes(200, { taken: ++calls % 2 === 0 }) });
  assert.strictEqual(r3.found.length, 3); assert.strictEqual(r3.tried, 5);
  const r4 = await findAvailable({ want: 3, maxTries: 4, delayMs: 0, sleep: async () => {}, fetch: async () => mkRes(200, { taken: true }) });
  assert.strictEqual(r4.found.length, 0); assert.strictEqual(r4.tried, 4);
  const r5 = await findAvailable({ want: 3, delayMs: 0, sleep: async () => {}, fetch: async () => mkRes(429, { retry_after: 1 }) });
  assert(r5.limited && r5.found.length === 0);
  console.log('CORE OK');
})().catch((e) => { console.error(e); process.exit(1); });
