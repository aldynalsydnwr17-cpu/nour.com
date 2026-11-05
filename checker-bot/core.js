'use strict';
// منطق فحص اليوزرات: مفصول عن ديسكورد عشان يتجرّب لوحده
const URL_CHECK = 'https://discord.com/api/v9/unique-username/username-attempt-unauthed';
const L = 'abcdefghijklmnopqrstuvwxyz', D = '0123456789';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// شروط ديسكورد: 2 إلى 32 خانة، حروف صغيرة وأرقام و _ و . بس، ومفيش نقطتين ورا بعض
function validName(s) { return /^[a-z0-9_.]{2,32}$/.test(s) && !s.includes('..'); }

// يوزر عشوائي بنمط x2f2 / 86ac / azj3: حروف وأرقام بس، وفيه حرف ورقم على الأقل
function genName(len = 4, rnd = Math.random) {
  for (;;) {
    let s = '';
    for (let i = 0; i < len; i++) s += (rnd() < 0.5 ? L[Math.floor(rnd() * 26)] : D[Math.floor(rnd() * 10)]);
    if (/[a-z]/.test(s) && /\d/.test(s)) return s;
  }
}

// بيرجّع: 'available' | 'taken' | 'invalid' | 'limited' | 'error'
async function checkName(name, opts = {}) {
  const f = opts.fetch || fetch, maxRetry = opts.maxRetry ?? 3, wait = opts.sleep || sleep;
  if (!validName(name)) return { name, status: 'invalid' };
  for (let t = 0; t <= maxRetry; t++) {
    let res;
    try {
      res = await f(URL_CHECK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name }) });
    } catch (e) { return { name, status: 'error', detail: String(e.message || e) }; }
    if (res.status === 429) {
      let ra = 5; try { ra = Math.min(60, Number((await res.json()).retry_after) || 5); } catch (e) {}
      if (t === maxRetry) return { name, status: 'limited', retryAfter: ra };
      await wait(Math.ceil(ra * 1000) + 300); continue;
    }
    if (res.status === 400) return { name, status: 'invalid' };
    if (!res.ok) return { name, status: 'error', detail: 'HTTP ' + res.status };
    let j; try { j = await res.json(); } catch (e) { return { name, status: 'error', detail: 'bad json' }; }
    return { name, status: j.taken ? 'taken' : 'available' };
  }
  return { name, status: 'error' };
}

// يدوّر على عدد من اليوزرات المتاحة، بتأخير بين كل طلب عشان ديسكورد ما يحظرش
async function findAvailable({ want = 5, len = 4, maxTries = 60, delayMs = 1300, fetch: f, sleep: sl, rnd, onProgress, shouldStop } = {}) {
  const wait = sl || sleep, found = [], seen = new Set(); let tried = 0, limited = false, errors = 0;
  while (found.length < want && tried < maxTries) {
    if (shouldStop && shouldStop()) break;
    const n = genName(len, rnd); if (seen.has(n)) continue; seen.add(n);
    const r = await checkName(n, { fetch: f, sleep: wait }); tried++;
    if (r.status === 'available') found.push(n);
    else if (r.status === 'limited') { limited = true; break; }
    else if (r.status === 'error' && ++errors >= 5) break;
    if (onProgress) onProgress({ tried, found: found.slice(), maxTries });
    await wait(delayMs);
  }
  return { found, tried, limited, errors };
}

module.exports = { validName, genName, checkName, findAvailable, sleep };
