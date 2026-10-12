
const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const beforeImg = document.getElementById('beforeImg');
const afterCanvas = document.getElementById('afterCanvas');
const previewRow = document.getElementById('previewRow');
const dims = document.getElementById('dims');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const squareOpt = document.getElementById('squareOpt');
const roleOpt = document.getElementById('roleOpt');

let resultBlobUrl = null;

drop.addEventListener('click', () => fileInput.click());
['dragover','dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
squareOpt.addEventListener('change', () => { if (beforeImg.src) process(beforeImg.src); });
const outlineOpt = document.getElementById('outlineOpt');
outlineOpt.addEventListener('change', () => { if (beforeImg.getAttribute('src')) process(beforeImg.src); });
let squarePrev = false;
roleOpt.addEventListener('change', () => {
  if (roleOpt.checked) { squarePrev = squareOpt.checked; squareOpt.checked = true; }
  else { squareOpt.checked = squarePrev; }
  squareOpt.disabled = roleOpt.checked;
  if (roleOpt.checked) loadAI();
  if (beforeImg.getAttribute('src')) process(beforeImg.src);
});
resetBtn.addEventListener('click', () => {
  fileInput.value = '';
  beforeImg.removeAttribute('src');
  document.getElementById('rolePrev').style.display = 'none';
  previewRow.style.display = 'none';
  dims.textContent = '';
  downloadBtn.disabled = true;
  resetBtn.style.display = 'none';
});

let holdCmp = false;
function handleFile(file) {
  if (!file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = async e => {
    beforeImg.src = e.target.result;
    previewRow.style.display = 'flex';
    downloadBtn.disabled = true;
    dims.textContent = '';
    setCmp(100);                               // نعرض الصورة الأصلية كاملة أثناء المعالجة
    document.getElementById('workspace').scrollIntoView({behavior: 'smooth', block: 'start'});
    holdCmp = true;
    lastInfo = null;
    const procDone = process(e.target.result);   // المعالجة الفعلية سريعة، والأنيميشن بيعرض اللي لقيته فعلًا خطوة خطوة
    for (let i = 0; i < 40 && !lastInfo; i++) await wait(25);
    const I = lastInfo || {};
    const rgb = I.bg ? `rgb(${I.bg.map(Math.round).join(',')})` : null;
    const steps = [
      {t: `بقرا الصورة… ${I.w || ''}×${I.h || ''}`, ms: 1300},
      I.kind === 'alpha' ? {t: 'لقيت خلفية شفافة أصلًا', ms: 1400}
        : I.kind === 'none' ? {t: 'بدوّر على لون الخلفية…', ms: 1400}
        : {t: 'لقيت لون الخلفية', ms: 1500, color: rgb},
      I.kind === 'removed' ? {t: 'بشيل الخلفية وبنعّم الحواف…', ms: 1900}
        : I.kind === 'none' ? {t: 'مفيش خلفية ثابتة، هكمّل بالأبعاد بس', ms: 1500}
        : {t: 'بكشف الحواف من الجوانب الأربعة…', ms: 1800},
      {t: 'بحدد حدود الموضوع بدقة…', ms: 1500},
      {t: `بظبط الأبعاد على ${I.out || ''}…`, ms: 1300}
    ];
    if (roleOpt.checked) steps.splice(3, 0, {t: aiState === 'off' ? 'بحلل شكل الصورة…' : 'الذكاء الاصطناعي بيحدد الموضوع…', ms: 1800});
    const stage = document.getElementById('stage'), edgeCv = document.getElementById('edgeCv');
    buildEdges(afterCanvas, edgeCv);
    stage.classList.add('scanning');
    await mainBusy.play(steps, v => {
      const pc = v * 100;
      beforeImg.style.clipPath = `inset(${pc}% 0 0 0)`;          // الأصلي بيفضل تحت الشريط بس
      const m = `linear-gradient(to bottom, transparent ${Math.max(0, pc - 16)}%, #000 ${Math.max(0, pc - 1)}%, transparent ${pc}%)`;
      edgeCv.style.webkitMaskImage = edgeCv.style.maskImage = m;   // الحواف بتنوّر ورا الشريط وبتختفي
    });
    stage.classList.remove('scanning');
    await procDone;                                           // لو التحليل لسه شغال نستناه
    holdCmp = false;
    downloadBtn.disabled = !resultBlobUrl;
    setCmp(0);
    sweepCmp(0, 50, 900);
    if (roleOpt.checked) showToast('أداة رولز ديسكورد بتحاول تظبط الصورة على قد ما تقدر، لكن ديسكورد بيعرض أيقونة الرول بحجم ثابت حوالي 20 بكسل.', 7000);
  };
  reader.readAsDataURL(file);
}

let lastInfo = null;
let procRun = 0;
function process(src) {
  const myRun = ++procRun;
  return new Promise(resolve => {
  const img = new Image();
  img.onload = async () => {
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(img, 0, 0);
      const data = tctx.getImageData(0, 0, w, h);
      const data0 = tctx.getImageData(0, 0, w, h); // نسخة أصلية لقراءة لون الخلفية

      let hasAlpha = checkHasAlpha(data);
      showBgRm('bgRmSlot', roleOpt.checked && !hasAlpha);
      let bg = hasAlpha ? null : sampleCorners(data, w, h);
      let srcImg = img, bgNote = '';

      const box = findBounds(data, w, h, hasAlpha, bg);
      lastInfo = {w, h, kind: bgNote.includes('اتشالت') ? 'removed' : bgNote.includes('مفيش') ? 'none' : (hasAlpha ? 'alpha' : 'solid'), bg: (!hasAlpha || bgNote.includes('اتشالت')) ? sampleCorners(data0, w, h) : null, out: roleOpt.checked ? '256×256' : (box.maxX - box.minX + 1) + '×' + (box.maxY - box.minY + 1)};

      let cw = box.maxX - box.minX + 1;
      let ch = box.maxY - box.minY + 1;
      let outCanvas = document.createElement('canvas');

      if (roleOpt.checked) {
        outCanvas = await smartRole(img);
        if (myRun !== procRun) return;                       // اترفعت صورة أو إعداد جديد أثناء التحليل
      } else if (squareOpt.checked) {
        const trim = 0.02; // نسبة التقريب من الفوق ومن التحت
        const cutY = Math.floor(ch * trim);
        const srcY = box.minY + cutY;
        const srcH = ch - cutY * 2;
        const size = Math.max(cw, srcH);
        outCanvas.width = size; outCanvas.height = size;
        const octx = outCanvas.getContext('2d');
        const dx = Math.floor((size - cw) / 2);
        const dy = Math.floor((size - srcH) / 2);
        octx.drawImage(img, box.minX, srcY, cw, srcH, dx, dy, cw, srcH);
      } else {
        outCanvas.width = cw; outCanvas.height = ch;
        const octx = outCanvas.getContext('2d');
        octx.drawImage(img, box.minX, box.minY, cw, ch, 0, 0, cw, ch);
      }

      afterCanvas.width = outCanvas.width;
      afterCanvas.height = outCanvas.height;
      afterCanvas.getContext('2d').drawImage(outCanvas, 0, 0);

      dims.textContent = `الحجم الأصلي: ${w}×${h}  —  بعد التقريب: ${outCanvas.width}×${outCanvas.height}${bgNote}`;
      if (roleOpt.checked && roleInfo) dims.textContent += `  —  ${roleInfo.ai ? 'بالذكاء الاصطناعي · ' : ''}${roleInfo.crop} (الموضوع ${Math.round(roleInfo.fill * 100)}% من الإطار) · تباين ×${roleInfo.con} · تشبع ×${roleInfo.sat} · حدّة ${roleInfo.shp}${roleInfo.md ? ' + حدّة للأحجام الصغيرة ' + roleInfo.md : ''}${roleInfo.lowRes ? ' · الصورة صغيرة وكبّرتها' : ''}${roleInfo.blurry ? ' · الصورة مش حادة وزوّدت الحدّة' : ''} · ${roleInfo.ok ? (roleInfo.tries > 1 ? 'اتحققت بعد ' + roleInfo.tries + ' محاولات' : 'اتحققت من أول محاولة') : 'جرّبت ' + roleInfo.tries + ' محاولات واخترت الأحسن (الصورة نفسها صعبة بالحجم الصغير)'}`;
      previewRow.style.display = 'flex'; renderRolePreview(outCanvas); if (!holdCmp) setCmp(50);
      resetBtn.style.display = 'inline-block';

      await new Promise(done => outCanvas.toBlob(blob => {
        if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
        resultBlobUrl = URL.createObjectURL(blob);
        lastBlobSize = blob.size;
        if (roleOpt.checked && blob.size > 256 * 1024) dims.textContent += '  —  تنبيه: حجم الملف أكبر من 256KB وديسكورد مش هيقبله';
        if (!holdCmp) downloadBtn.disabled = false;
        done();
      }, 'image/png'));
    } catch (err) {
      dims.textContent = 'حصل خطأ أثناء معالجة الصورة، جرب صورة تانية.';
    } finally {
      resolve();
    }
  };
  img.src = src;
  });
}

// معالجة رولز ديسكورد: بتلاقي الموضوع الحقيقي وتتجاهل النقط الشاردة، وبتحسب أصغر دايرة
// تغطي 99.5% من الموضوع (عشان ديسكورد بيعرض الأيقونة في إطار دايري صغير)، وبتحط الموضوع في
// ===== الذكاء الاصطناعي الخفيف: نموذج U²-Netp (حوالي 4.5MB) لتحديد الموضوع الأساسي =====
// بيتحمّل مرة واحدة بس لما تستخدم وضع رولز ديسكورد. لو فشل (النت أو الملف مش موجود) الأداة بتكمّل بالتحليل الحسابي.
const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/';
let aiSession = null, aiLoading = null, aiState = 'idle';
function loadAI() {
  if (aiLoading) return aiLoading;
  aiLoading = (async () => {
    try {
      aiState = 'loading';
      await new Promise((ok, no) => {
        const s = document.createElement('script');
        s.src = ORT_BASE + 'ort.min.js'; s.onload = ok; s.onerror = () => no(new Error('ort'));
        document.head.appendChild(s);
      });
      ort.env.wasm.wasmPaths = ORT_BASE; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
      const r = await fetch('u2netp.onnx');
      if (!r.ok) throw new Error('model');
      aiSession = await ort.InferenceSession.create(await r.arrayBuffer(), { executionProviders: ['wasm'] });
      aiState = 'ready';
    } catch (e) { aiSession = null; aiState = 'off'; }
    return aiSession;
  })();
  return aiLoading;
}
// بيرجّع قناع الموضوع 320×320 (قيم من 0 لـ 1) أو null
async function aiMask(img) {
  const session = await Promise.race([loadAI(), new Promise(r => setTimeout(() => r(null), 25000))]);
  if (!session) return null;
  try {
    const S = 320;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, S, S);
    cx.drawImage(img, 0, 0, S, S);
    const px = cx.getImageData(0, 0, S, S).data;
    let mx = 1;
    for (let i = 0; i < px.length; i += 4) mx = Math.max(mx, px[i], px[i + 1], px[i + 2]);
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    const inp = new Float32Array(3 * S * S);
    for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) inp[k * S * S + i] = (px[i * 4 + k] / mx - mean[k]) / std[k];
    const res = await session.run({ 'input.1': new ort.Tensor('float32', inp, [1, 3, S, S]) });
    const o = res[Object.keys(res)[0]].data;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < S * S; i++) { if (o[i] < lo) lo = o[i]; if (o[i] > hi) hi = o[i]; }
    const m = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) m[i] = (o[i] - lo) / (hi - lo + 1e-8);
    return m;
  } catch (e) { return null; }
}

// ===== معالجة رولز ديسكورد الذكية =====
// 1) تحديد الموضوع الأساسي (مش الوسط بس) 2) أصغر مربع يغطي الموضوع كله 3) تجربة درجات تباين وتشبع وحدّة
// وقياس وضوح الأيقونة بالأحجام الصغير والمتوسط والكبير، واختيار أحسن نتيجة لكل صورة لوحدها
let roleInfo = null;
async function smartRole(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  // ---- أ) خريطة الأهمية على نسخة صغيرة ----
  const k = Math.min(1, 160 / Math.max(w, h));
  const wc = Math.max(8, Math.round(w * k)), hc = Math.max(8, Math.round(h * k));
  const wk = document.createElement('canvas'); wk.width = wc; wk.height = hc;
  const wctx = wk.getContext('2d', { willReadFrequently: true });
  wctx.imageSmoothingQuality = 'high';
  wctx.drawImage(img, 0, 0, wc, hc);
  const d = wctx.getImageData(0, 0, wc, hc).data;
  const n = wc * hc;
  let transparent = 0;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 200) transparent++;
  const alphaMode = transparent > n * 0.02;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let S = new Float32Array(n);
  let mk = null, aiUsed = false;
  if (!alphaMode) mk = await aiMask(img);
  if (mk) {                                                  // الذكاء الاصطناعي: قناع الموضوع هو خريطة الأهمية
    for (let y = 0; y < hc; y++) for (let x = 0; x < wc; x++) {
      const v = mk[Math.min(319, Math.floor(y / hc * 320)) * 320 + Math.min(319, Math.floor(x / wc * 320))];
      S[y * wc + x] = Math.max(0, v - 0.1) / 0.9;
    }
    let tot = 0; for (let i = 0; i < n; i++) tot += S[i];
    if (tot < n * 0.01 || tot > n * 0.97) mk = null; else aiUsed = true;   // قناع فاضي أو كله موضوع: نرجع للتحليل الحسابي
  }
  if (mk) {
    /* S جاهزة من النموذج */
  } else if (alphaMode) {
    for (let i = 0; i < n; i++) S[i] = d[i * 4 + 3] / 255;
  } else {
    const gm = [0, 0, 0], bm = [0, 0, 0]; let bc = 0;
    for (let y = 0; y < hc; y++) for (let x = 0; x < wc; x++) {
      const i = (y * wc + x) * 4;
      for (let c = 0; c < 3; c++) gm[c] += d[i + c];
      if (x < 3 || y < 3 || x >= wc - 3 || y >= hc - 3) { for (let c = 0; c < 3; c++) bm[c] += d[i + c]; bc++; }
    }
    for (let c = 0; c < 3; c++) { gm[c] /= n; bm[c] /= bc; }
    const col = new Float32Array(n), gr = new Float32Array(n);
    for (let y = 0; y < hc; y++) for (let x = 0; x < wc; x++) {
      const p = y * wc + x, i = p * 4;
      const dg = Math.hypot(d[i] - gm[0], d[i + 1] - gm[1], d[i + 2] - gm[2]);
      const db = Math.hypot(d[i] - bm[0], d[i + 1] - bm[1], d[i + 2] - bm[2]);
      col[p] = Math.max(dg, db);
      const xl = L[y * wc + Math.max(0, x - 1)], xr = L[y * wc + Math.min(wc - 1, x + 1)];
      const yu = L[Math.max(0, y - 1) * wc + x], yd = L[Math.min(hc - 1, y + 1) * wc + x];
      gr[p] = Math.abs(xr - xl) + Math.abs(yd - yu);
    }
    const pct = (arr, q) => { const s = Float32Array.from(arr).sort(); return s[Math.min(n - 1, Math.floor(q * n))]; };
    const c95 = pct(col, 0.95) + 1e-6, g95 = pct(gr, 0.95) + 1e-6;
    for (let i = 0; i < n; i++) S[i] = 0.65 * Math.min(1.5, col[i] / c95) + 0.35 * Math.min(1.5, gr[i] / g95);
    const t = pct(S, 0.4);
    for (let i = 0; i < n; i++) S[i] = Math.max(0, S[i] - t);
    const B = new Float32Array(n);                            // تنعيم 3×3
    for (let y = 0; y < hc; y++) for (let x = 0; x < wc; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < wc && yy < hc) { s += S[yy * wc + xx]; c++; }
      }
      B[y * wc + x] = s / c;
    }
    S = B;
  }
  let total = 0; for (let i = 0; i < n; i++) total += S[i];

  // ---- ب) تحليل الموضوع: صندوقه الحقيقي (من أول ولآخر مكان فيه الموضوع) ----
  const m = Math.min(wc, hc);
  const hasSubject = total > n * 0.01;
  let bbx0 = 0, bby0 = 0, bbx1 = wc, bby1 = hc;
  if (hasSubject) {
    const colS = new Float64Array(wc), rowS = new Float64Array(hc);
    for (let y = 0; y < hc; y++) for (let x = 0; x < wc; x++) { const v = S[y * wc + x] > 0.25 ? S[y * wc + x] : 0; colS[x] += v; rowS[y] += v; }
    const span = (arr, len) => {
      let tot = 0; for (let i = 0; i < len; i++) tot += arr[i];
      let acc = 0, lo = 0, hi = len;
      for (let i = 0; i < len; i++) { acc += arr[i]; if (acc >= tot * 0.004) { lo = i; break; } }
      acc = 0;
      for (let i = len - 1; i >= 0; i--) { acc += arr[i]; if (acc >= tot * 0.004) { hi = i + 1; break; } }
      return [lo, Math.max(lo + 1, hi)];
    };
    [bbx0, bbx1] = span(colS, wc); [bby0, bby1] = span(rowS, hc);
  }
  const bw = bbx1 - bbx0, bh = bby1 - bby0, bbcx = (bbx0 + bbx1) / 2, bbcy = (bby0 + bby1) / 2;
  // هل ينفع نوسّع الإطار برا حدود الصورة؟ (الصور الشفافة، أو اللي خلفيتها لون واحد)
  const borderPx = [];
  for (let y = 0; y < hc; y++) for (let x = 0; x < wc; x++) if (x < 3 || y < 3 || x >= wc - 3 || y >= hc - 3) borderPx.push(y * wc + x);
  const bmean = [0, 0, 0];
  for (const p of borderPx) for (let c = 0; c < 3; c++) bmean[c] += d[p * 4 + c] / borderPx.length;
  let bvar = 0;
  for (const p of borderPx) for (let c = 0; c < 3; c++) bvar += (d[p * 4 + c] - bmean[c]) ** 2 / (borderPx.length * 3);
  const padOK = alphaMode || Math.sqrt(bvar) < 22;
  const padColor = `rgb(${bmean.map(Math.round).join(',')})`;
  // تكامل خريطة الأهمية عشان نحسب نسبة التغطية بسرعة
  const W1 = wc + 1;
  const I = new Float64Array(W1 * (hc + 1));
  for (let y = 0; y < hc; y++) { let row = 0; for (let x = 0; x < wc; x++) { row += S[y * wc + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; } }
  const massRect = (x0, y0, s) => {
    const xa = Math.max(0, Math.round(x0)), ya = Math.max(0, Math.round(y0));
    const xb = Math.min(wc, Math.round(x0 + s)), yb = Math.min(hc, Math.round(y0 + s));
    if (xb <= xa || yb <= ya) return 0;
    return I[yb * W1 + xb] - I[ya * W1 + xb] - I[yb * W1 + xa] + I[ya * W1 + xa];
  };
  const OUT = 256, N = OUT * OUT;
  const sc = 1 / k;

  // ---- محاولة واحدة كاملة: إطار ← قص وتصغير ← تجربة التباين ← فحص النتيجة ----
  const attempt = (cfg) => {
    // 1) الإطار: مربع يحتوي الموضوع كله + هامش، ولو الموضوع أكبر من الصورة نوسّع برا حدودها
    let wside, wx0, wy0, padded = false, note;
    const minSide = 0.22 * m;
    if (!hasSubject) {
      wside = 0.85 * m; wx0 = (wc - wside) / 2; wy0 = (hc - wside) / 2; note = 'قص من النص';
    } else {
      const side0 = Math.max(Math.max(bw, bh) * (1 + 2 * cfg.margin), minSide);
      if (side0 <= m) {
        wside = side0; wx0 = Math.min(Math.max(0, bbcx - wside / 2), wc - wside); wy0 = Math.min(Math.max(0, bbcy - wside / 2), hc - wside);
        note = 'قص على الموضوع';
      } else if (padOK) {
        wside = side0; wx0 = bbcx - wside / 2; wy0 = bbcy - wside / 2; padded = true;
        note = 'وسّعت الإطار عشان الموضوع يظهر كله';
      } else {
        wside = m; let best = -1, px = 0, py = 0;
        for (let y0 = 0; y0 <= hc - m; y0++) for (let x0 = 0; x0 <= wc - m; x0++) {
          const ms = massRect(x0, y0, m); if (ms > best) { best = ms; px = x0; py = y0; }
        }
        wx0 = px; wy0 = py; note = 'قص (الموضوع أكبر من الإطار)';
      }
    }
    const cov = hasSubject ? Math.min(1, massRect(wx0, wy0, wside) / total) : 1;
    const fill = hasSubject ? Math.min(1, Math.max(bw, bh) / wside) : 0.85;

    // 2) نقص من الصورة الأصلية ونصغّر على مراحل لـ 256×256
    const sidePx = Math.max(8, Math.round(wside * sc));
    const r = Math.min(1, 1536 / sidePx);
    const S1 = Math.max(8, Math.round(sidePx * r));
    let cur = document.createElement('canvas'); cur.width = S1; cur.height = S1;
    const cc = cur.getContext('2d');
    cc.imageSmoothingEnabled = true; cc.imageSmoothingQuality = 'high';
    if (padded && !alphaMode) { cc.fillStyle = padColor; cc.fillRect(0, 0, S1, S1); }
    cc.drawImage(img, -Math.round(wx0 * sc) * r, -Math.round(wy0 * sc) * r, w * r, h * r);
    let size = S1;
    const lowRes = sidePx < 200;
    while (size / 2 > OUT) {
      const nx = document.createElement('canvas'); const ns = Math.max(OUT, Math.floor(size / 2));
      nx.width = ns; nx.height = ns;
      const c = nx.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(cur, 0, 0, ns, ns); cur = nx; size = ns;
    }
    while (size * 2 < OUT) {                                // صورة صغيرة: نكبّرها على مراحل بدل مرة واحدة
      const nx = document.createElement('canvas'); const ns = size * 2;
      nx.width = ns; nx.height = ns;
      const c = nx.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(cur, 0, 0, ns, ns); cur = nx; size = ns;
    }
    const base = document.createElement('canvas'); base.width = OUT; base.height = OUT;
    const bctx = base.getContext('2d', { willReadFrequently: true });
    bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(cur, 0, 0, OUT, OUT);
    const src = bctx.getImageData(0, 0, OUT, OUT).data;

    // 3) فحص جودة الصورة نفسها: ضبابية؟ صغيرة؟
    const gl = [];
    const lum = (i) => 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2];
    for (let y = 0; y < OUT - 1; y++) for (let x = 0; x < OUT - 1; x++) {
      const i = y * OUT + x;
      if (src[i * 4 + 3] < 40) continue;
      gl.push(Math.abs(lum(i + 1) - lum(i)) + Math.abs(lum(i + OUT) - lum(i)));
    }
    gl.sort((p, q) => p - q);
    const blurry = gl.length > 200 && gl[Math.floor(gl.length * 0.985)] < 16;   // أقوى الحواف في الصورة ضعيفة = صورة مش حادة
    const strong = cfg.ext || lowRes || blurry;

    // 4) تفاصيل الحدّة (الأصلي - تغبيش 3×3)
    const det = new Float32Array(N * 3);
    for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
      const i = y * OUT + x;
      for (let c = 0; c < 3; c++) {
        let s = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < OUT && yy < OUT && src[(yy * OUT + xx) * 4 + 3] > 40) { s += src[(yy * OUT + xx) * 4 + c]; cnt++; }
        }
        det[i * 3 + c] = cnt ? src[i * 4 + c] - s / cnt : 0;
      }
    }
    // تفاصيل متوسطة الحجم (هي اللي بتبان لما ديسكورد يصغّر لـ20/32): unsharp بنصف قطر كبير
    const mdet = new Float32Array(N * 3);
    {
      const R = 5, tmpA = new Float32Array(N * 4), tmpB = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) { const a = src[i * 4 + 3] > 40 ? 1 : 0; tmpA[i * 4] = src[i * 4] * a; tmpA[i * 4 + 1] = src[i * 4 + 1] * a; tmpA[i * 4 + 2] = src[i * 4 + 2] * a; tmpA[i * 4 + 3] = a; }
      const pass = (inp, out, horiz) => {
        for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
          let r = 0, g = 0, b = 0, w = 0;
          for (let k = -R; k <= R; k++) {
            const xx = horiz ? x + k : x, yy = horiz ? y : y + k;
            if (xx < 0 || yy < 0 || xx >= OUT || yy >= OUT) continue;
            const q = (yy * OUT + xx) * 4; r += inp[q]; g += inp[q + 1]; b += inp[q + 2]; w += inp[q + 3];
          }
          const o = (y * OUT + x) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = w;
        }
      };
      pass(tmpA, tmpB, true);
      // نرجّع كل صف لمتوسط مرجّح بعد الباس الأفقي
      for (let i = 0; i < N; i++) { const w = tmpB[i * 4 + 3]; if (w > 0) { tmpB[i * 4] /= w; tmpB[i * 4 + 1] /= w; tmpB[i * 4 + 2] /= w; } tmpB[i * 4 + 3] = w > 0 ? 1 : 0; }
      for (let i = 0; i < N; i++) { const a = tmpB[i * 4 + 3]; tmpB[i * 4] *= a; tmpB[i * 4 + 1] *= a; tmpB[i * 4 + 2] *= a; }
      pass(tmpB, tmpA, false);
      for (let i = 0; i < N; i++) {
        if (src[i * 4 + 3] <= 40) continue;
        const w = tmpA[i * 4 + 3]; if (w <= 0) continue;
        for (let c = 0; c < 3; c++) mdet[i * 3 + c] = src[i * 4 + c] - tmpA[i * 4 + c] / w;
      }
    }
    let sumL = 0, cntL = 0;
    for (let i = 0; i < N; i++) if (src[i * 4 + 3] > 40) { sumL += lum(i); cntL++; }
    let pivot = Math.min(166, Math.max(90, cntL ? sumL / cntL : 128));
    if (aiUsed || hasSubject) {                              // نقطة التباين من الموضوع نفسه مش الخلفية
      let ws = 0, wl = 0;
      for (let yy = 0; yy < OUT; yy++) for (let xx = 0; xx < OUT; xx++) {
        const gx = Math.floor(wx0 + (xx + 0.5) / OUT * wside), gy = Math.floor(wy0 + (yy + 0.5) / OUT * wside);
        if (gx < 0 || gy < 0 || gx >= wc || gy >= hc) continue;
        const wgt = S[gy * wc + gx], p4 = (yy * OUT + xx) * 4;
        if (wgt > 0.2 && src[p4 + 3] > 40) { ws += wgt; wl += wgt * lum(yy * OUT + xx); }
      }
      if (ws > 50) pivot = Math.min(166, Math.max(90, wl / ws));
    }
    const render = (con, sat, shp, target, md = 0) => {
      const o = target || new Uint8ClampedArray(src.length);
      for (let i = 0; i < N; i++) {
        const j4 = i * 4; o[j4 + 3] = src[j4 + 3];
        if (!src[j4 + 3]) { o[j4] = o[j4 + 1] = o[j4 + 2] = 0; continue; }
        const rr = src[j4] + shp * det[i * 3] + md * mdet[i * 3], gg = src[j4 + 1] + shp * det[i * 3 + 1] + md * mdet[i * 3 + 1], bb = src[j4 + 2] + shp * det[i * 3 + 2] + md * mdet[i * 3 + 2];
        const gray = 0.299 * rr + 0.587 * gg + 0.114 * bb;
        o[j4] = (gray + (rr - gray) * sat - pivot) * con + pivot;
        o[j4 + 1] = (gray + (gg - gray) * sat - pivot) * con + pivot;
        o[j4 + 2] = (gray + (bb - gray) * sat - pivot) * con + pivot;
      }
      return o;
    };

    // 5) مقياس الوضوح بالأحجام الحقيقية: 20 (صغير) و32 (متوسط) و64 (كبير)
    const tmp = document.createElement('canvas'); tmp.width = OUT; tmp.height = OUT;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    const sizes = [[20, 0.5], [32, 0.3], [64, 0.2]];
    const bgs = alphaMode || padded ? [[49, 51, 56], [242, 243, 245]] : [[49, 51, 56]];
    const sat1 = v => Math.min(1, Math.max(0, v));
    const legib = (px) => {
      tctx.putImageData(new ImageData(new Uint8ClampedArray(px), OUT, OUT), 0, 0);
      let score = 0, l20 = 0;
      for (const [s, wt] of sizes) {
        const c = document.createElement('canvas'); c.width = s; c.height = s;
        const c2 = c.getContext('2d', { willReadFrequently: true });
        c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'high';
        let worst = 9;
        for (const bgc of bgs) {
          c2.fillStyle = `rgb(${bgc[0]},${bgc[1]},${bgc[2]})`; c2.fillRect(0, 0, s, s);
          c2.drawImage(tmp, 0, 0, s, s);
          const q = c2.getImageData(0, 0, s, s).data;
          const l = new Float32Array(s * s);
          let mean = 0, clip = 0;
          for (let i = 0; i < s * s; i++) {
            l[i] = 0.299 * q[i * 4] + 0.587 * q[i * 4 + 1] + 0.114 * q[i * 4 + 2]; mean += l[i];
            if (l[i] < 4 || l[i] > 251) clip++;
          }
          mean /= s * s; clip /= s * s;
          let v = 0, gs = 0;
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const i = y * s + x; v += (l[i] - mean) * (l[i] - mean);
            if (x + 1 < s) gs += Math.abs(l[i + 1] - l[i]);
            if (y + 1 < s) gs += Math.abs(l[i + s] - l[i]);
          }
          const sd = Math.sqrt(v / (s * s)), gm = gs / (2 * s * s);
          const sc2 = 0.5 * sat1(sd / 42) + 0.5 * sat1(gm / 9) - 4 * Math.max(0, clip - 0.015);
          if (sc2 < worst) worst = sc2;
        }
        score += wt * worst;
        if (s === 20) l20 = worst;
      }
      return [score, l20];
    };

    // 6) نجرّب كل التركيبات ونختار الأحسن
    const CON = [1.0, 1.06, 1.12, 1.18, 1.25, 1.33, 1.42, 1.6, 1.8, 2.1, 2.5];
    const SAT = [1.0, 1.1, 1.2];
    const SHP = blurry ? [1.0, 1.5, 2.0, 2.5] : strong ? [0, 0.5, 1.0, 1.5, 2.0] : [0, 0.5, 1.0];
    const buf = new Uint8ClampedArray(src.length);
    let best = { sc: -9, con: 1, sat: 1, shp: 0, md: 0, l20: 0 };
    const MD = [0, 0.5, 0.9, 1.3, 1.7];
    for (const con of CON) for (const sat of SAT) for (const shp of SHP) {
      render(con, sat, shp, buf, 0);
      const cost = 0.30 * (con - 1) * (con - 1) + 0.05 * (sat - 1) / 0.2 + 0.04 * shp;
      const [lg, l20] = legib(buf);
      if (lg - cost > best.sc) best = { sc: lg - cost, con, sat, shp, md: 0, l20 };
    }
    for (const md of MD) {                                   // مرحلة تانية: حدّة متوسطة لأحجام 20/32
      if (!md) continue;
      render(best.con, best.sat, best.shp, buf, md);
      const cost = 0.30 * (best.con - 1) * (best.con - 1) + 0.05 * (best.sat - 1) / 0.2 + 0.04 * best.shp + 0.05 * md;
      const [lg, l20] = legib(buf);
      if (lg - cost > best.sc) best = Object.assign({}, best, { sc: lg - cost, md, l20 });
    }
    const outPx = render(best.con, best.sat, best.shp, null, best.md);
    const out = document.createElement('canvas'); out.width = OUT; out.height = OUT;
    out.getContext('2d').putImageData(new ImageData(outPx, OUT, OUT), 0, 0);
    // 7) فحص النتيجة: الموضوع كله جوه الإطار؟ حجمه مناسب؟ واضح بالحجم الصغير؟
    const ok = cov >= 0.97 && fill >= 0.42 && best.l20 >= 0.45;
    return { out, ok, score: best.sc + (cov >= 0.97 ? 0.5 : 0) + (fill >= 0.42 ? 0.3 : 0),
      info: { ai: aiUsed, crop: note, con: best.con, sat: best.sat, shp: best.shp, md: best.md, cov, fill, l20: best.l20, lowRes, blurry } };
  };

  // نكرر المحاولة (إطار أضيق وحدّة أقوى) لحد ما النتيجة تعدّي الفحص، وآخرها نختار الأحسن
  const tries = [{ margin: 0.07, ext: false }, { margin: 0.04, ext: true }, { margin: 0.10, ext: true }];
  let bestRun = null, used = 0;
  for (const cfg of tries) {
    const run = attempt(cfg); used++;
    if (!bestRun || (run.ok && !bestRun.ok) || (run.ok === bestRun.ok && run.score > bestRun.score)) bestRun = run;
    if (run.ok) break;
    await new Promise(r => setTimeout(r, 0));               // نسيب المتصفح يتنفس بين المحاولات
  }
  roleInfo = Object.assign({ tries: used, ok: bestRun.ok }, bestRun.info);
  return bestRun.out;
}

// (قديم، مش مستخدم) نفس معالجة أداة البوت لأيقونة الرول: قص مربع من النص، زوم 15% جوه الصورة، تصغير لـ 256×256، وتباين +0.15
function botRoleFit(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const square = Math.min(w, h);
  const crop = Math.max(1, Math.round(square * 0.85));
  const x = Math.round((w - crop) / 2), y = Math.round((h - crop) / 2);
  const OUT = 256;
  let cur = document.createElement('canvas');
  cur.width = crop; cur.height = crop;
  cur.getContext('2d').drawImage(img, x, y, crop, crop, 0, 0, crop, crop);
  let size = crop;
  while (size / 2 > OUT) {                                // تصغير على مراحل عشان الجودة
    const nxt = document.createElement('canvas');
    const ns = Math.max(OUT, Math.floor(size / 2));
    nxt.width = ns; nxt.height = ns;
    const c = nxt.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(cur, 0, 0, ns, ns);
    cur = nxt; size = ns;
  }
  const out = document.createElement('canvas');
  out.width = OUT; out.height = OUT;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, OUT, OUT);
  const id = ctx.getImageData(0, 0, OUT, OUT), p = id.data;
  const f = (0.15 + 1) / (1 - 0.15);                       // نفس معادلة Jimp.contrast(0.15)
  for (let i = 0; i < p.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = ((p[i + k] / 255 - 0.5) * f + 0.5) * 255;
      p[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  ctx.putImageData(id, 0, 0);
  return out;
}

// (قديم، مش مستخدم) نص مربع 256×256 شفاف مع هامش بسيط، وبعدين بتزوّد التباين 10% زي ما اتفقنا
function smartRoleFit(img, data, w, h, hasAlpha, bg) {
  const d = data.data;
  const tol = 28;
  const isFg = (i) => {
    if (hasAlpha) return d[i + 3] >= 24;
    const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) >= tol;
  };

  // 1) عدّ البكسلات الفعلية في كل صف وعمود، والصف أو العمود لازم فيه بكسلين على الأقل
  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isFg((y * w + x) * 4)) { rows[y]++; cols[x]++; }
  }
  const need = 2;
  let minY = 0, maxY = h - 1, minX = 0, maxX = w - 1;
  while (minY < h - 1 && rows[minY] < need) minY++;
  while (maxY > minY && rows[maxY] < need) maxY--;
  while (minX < w - 1 && cols[minX] < need) minX++;
  while (maxX > minX && cols[maxX] < need) maxX--;

  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;

  // 2) المسافة من المركز لكل بكسل فعلي، ونحدد نصف القطر اللي يغطي 99.5% منهم
  const maxDist = Math.hypot(bw, bh) / 2 + 2;
  const BINS = 512;
  const hist = new Uint32Array(BINS);
  let total = 0;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (!isFg((y * w + x) * 4)) continue;
    const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    hist[Math.min(BINS - 1, Math.floor(dist / maxDist * BINS))]++;
    total++;
  }
  let radius = maxDist;
  if (total > 0) {
    let acc = 0;
    for (let b = 0; b < BINS; b++) {
      acc += hist[b];
      if (acc >= total * 0.995) { radius = (b + 1) / BINS * maxDist; break; }
    }
  }

  // 3) نصف المربع: مش أقل من نص أكبر بُعد (عشان ميتقصش من الجنب)، مع هامش 4%
  // الأيقونة بتتعرض صغيرة جداً في ديسكورد، فنملّي المربع بأكبر بُعد تقريباً بدون هامش زيادة
  const half = Math.max(bw, bh) / 2 * 1.015 + 1;

  // 4) نرسم الموضوع في مربع 256×256 شفاف، بتصغير على مراحل عشان الجودة تفضل عالية
  const OUT = 256;
  const outline = document.getElementById('outlineOpt') && document.getElementById('outlineOpt').checked;
  const pad = outline ? 7 : 0;                          // مساحة للحد الخارجي
  const scale = (OUT - 2 * pad) / (2 * half);
  const sx = cx - half, sy = cy - half, sSize = 2 * half;
  let cur = document.createElement('canvas');
  let curSize = Math.max(1, Math.round(sSize));
  cur.width = curSize; cur.height = curSize;
  let cctx = cur.getContext('2d');
  cctx.drawImage(img, -sx, -sy);
  const target = Math.max(1, Math.round(OUT - 2 * pad));
  while (curSize / 2 > target) {                          // نصّف الحجم كل مرة لحد ما نقرب من المطلوب
    const nxt = document.createElement('canvas');
    const ns = Math.max(target, Math.floor(curSize / 2));
    nxt.width = ns; nxt.height = ns;
    const nctx = nxt.getContext('2d');
    nctx.imageSmoothingEnabled = true; nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(cur, 0, 0, ns, ns);
    cur = nxt; curSize = ns;
  }
  const subj = document.createElement('canvas');
  subj.width = OUT; subj.height = OUT;
  const sctx = subj.getContext('2d');
  sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(cur, pad, pad, OUT - 2 * pad, OUT - 2 * pad);

  // 5) تحسين الوضوح: تباين + تشبع + حدّة خفيفة على الألوان بس (الشفافية زي ما هي)
  const id = sctx.getImageData(0, 0, OUT, OUT);
  const p = id.data;
  const orig = new Uint8ClampedArray(p);
  const SH = 0.7;                                         // قوة الحدّة
  const at = (x, y) => (Math.min(OUT - 1, Math.max(0, y)) * OUT + Math.min(OUT - 1, Math.max(0, x))) * 4;
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    const i = (y * OUT + x) * 4;
    if (orig[i + 3] === 0) continue;
    const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
    for (let kk = 0; kk < 3; kk++) {
      let sum = 0, n = 0;
      for (const q of nb) if (orig[q + 3] > 40) { sum += orig[q + kk]; n++; }
      let v = orig[i + kk];
      if (n) v = v + SH * (v - sum / n);                  // unsharp: القيمة + قوة × (القيمة - متوسط الجيران)
      p[i + kk] = v;
    }
    // تشبع +18% ثم تباين +18%
    const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    for (let kk = 0; kk < 3; kk++) {
      let v = g + (p[i + kk] - g) * 1.18;
      v = (v - 128) * 1.18 + 128;
      p[i + kk] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  sctx.putImageData(id, 0, 0);

  const out = document.createElement('canvas');
  out.width = OUT; out.height = OUT;
  const ctx = out.getContext('2d');
  if (outline) {                                          // حد أبيض ناعم حوالين الموضوع عشان يبان على أي خلفية في ديسكورد
    const sil = document.createElement('canvas');
    sil.width = OUT; sil.height = OUT;
    const lctx = sil.getContext('2d');
    lctx.drawImage(subj, 0, 0);
    lctx.globalCompositeOperation = 'source-in';
    lctx.fillStyle = '#ffffff';
    lctx.fillRect(0, 0, OUT, OUT);
    const R = 4;
    for (let a = 0; a < 24; a++) {
      const ang = a / 24 * Math.PI * 2;
      ctx.drawImage(sil, Math.cos(ang) * R, Math.sin(ang) * R);
    }
    ctx.drawImage(sil, 0, 0);
  }
  ctx.drawImage(subj, 0, 0);
  return out;
}

// إزالة الخلفية: بتشتغل بس لو أركان الصورة الأربعة لونها واحد تقريبًا (خلفية ثابتة).
// بتمسح البكسلات المشابهة للون الخلفية والمتصلة بحواف الصورة بس، فالألوان اللي جوه الموضوع بتفضل
function removeBackground(imgData, w, h) {
  const d = imgData.data;
  const px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const cs = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const bg = [0, 1, 2].map(k => (cs[0][k] + cs[1][k] + cs[2][k] + cs[3][k]) / 4);
  const dist = (i) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
  for (const c of cs) if (Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) > 30) return null;

  const TOL = +document.getElementById('sens').value, SOFT = 22;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (seen[p] || dist(p * 4) > TOL) return;
    seen[p] = 1; stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  let removed = 0;
  while (stack.length) {
    const p = stack.pop(); removed++;
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const frac = removed / (w * h);
  if (frac < 0.02 || frac > 0.97) return null;

  const out = new Uint8ClampedArray(d);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (seen[p]) { out[i + 3] = 0; continue; }
    // حافة ناعمة: البكسل اللي جنب الخلفية وقريب من لونها نخلّي شفافيته جزئية
    const x = p % w, y = (p - x) / w;
    const near = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (y > 0 && seen[p - w]) || (y < h - 1 && seen[p + w]);
    if (near) {
      const t = (dist(i) - TOL) / SOFT;
      if (t < 1) out[i + 3] = Math.round(255 * Math.max(0.15, t));
    }
  }
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
  return { canvas: cv, data: out };
}

function checkHasAlpha(data) {
  const d = data.data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) { // أي بكسل شفاف فعلًا (مش عينة) عشان ميفوتناش
    if (d[i] < 250 && ++n > 20) return true;
  }
  return false;
}

function sampleCorners(data, w, h) {
  const d = data.data;
  const get = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i+1], d[i+2]]; };
  const corners = [get(0,0), get(w-1,0), get(0,h-1), get(w-1,h-1)];
  const avg = [0,0,0];
  corners.forEach(c => { avg[0]+=c[0]; avg[1]+=c[1]; avg[2]+=c[2]; });
  return [avg[0]/4, avg[1]/4, avg[2]/4];
}

function findBounds(data, w, h, hasAlpha, bg) {
  const d = data.data;
  const tol = 28;
  const isBackground = (x, y) => {
    const i = (y * w + x) * 4;
    if (hasAlpha) return d[i+3] < 10;
    const dr = d[i]-bg[0], dg = d[i+1]-bg[1], db = d[i+2]-bg[2];
    return Math.sqrt(dr*dr+dg*dg+db*db) < tol;
  };

  let minX = 0, maxX = w-1, minY = 0, maxY = h-1;

  scanTop:
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (!isBackground(x,y)) { minY = y; break scanTop; }
    if (y === h-1) minY = 0;
  }
  scanBottom:
  for (let y = h-1; y >= 0; y--) {
    for (let x = 0; x < w; x++) if (!isBackground(x,y)) { maxY = y; break scanBottom; }
    if (y === 0) maxY = h-1;
  }
  scanLeft:
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) if (!isBackground(x,y)) { minX = x; break scanLeft; }
    if (x === w-1) minX = 0;
  }
  scanRight:
  for (let x = w-1; x >= 0; x--) {
    for (let y = 0; y < h; y++) if (!isBackground(x,y)) { maxX = x; break scanRight; }
    if (x === 0) maxX = w-1;
  }

  if (minX > maxX || minY > maxY) { minX=0; minY=0; maxX=w-1; maxY=h-1; }
  return { minX, minY, maxX, maxY };
}

downloadBtn.addEventListener('click', () => {
  if (!resultBlobUrl) return;
  const a = document.createElement('a');
  a.href = resultBlobUrl;
  a.download = 'صنع-نور-الدين.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});



// ===== أنيميشن المعالجة =====
function busyKit(el) {
  el.innerHTML = '<span class="sl"></span><span class="big">0%</span><div class="lab"><i></i><span class="sw2"></span><span class="t"></span></div><div class="prog"><b></b></div><div class="pct"></div>';
  const sl = el.querySelector('.sl'), big = el.querySelector('.big');
  const t = el.querySelector('.t'), bar = el.querySelector('.prog b'), pct = el.querySelector('.pct'), sw = el.querySelector('.sw2');
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  return {
    // الشريط بينزل بنفس نسبة التقدم، وبيبلّغ onProg بالنسبة عشان الصفحة تكشف النتيجة وراه
    async play(steps, onProg) {
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      bar.style.width = '0%';
      const total = steps.reduce((a, x) => a + x.ms, 0);
      const set = v => {
        bar.style.width = (v * 100) + '%';
        pct.textContent = big.textContent = Math.round(v * 100) + '%';
        sl.style.top = `calc(${v * 100}% - ${v * 3}px)`;
        if (onProg) onProg(v);
      };
      set(0);
      let done = 0;
      for (const st of steps) {
        t.textContent = st.t;
        sw.style.display = st.color ? 'inline-block' : 'none';
        if (st.color) sw.style.background = st.color;
        const from = done / total, to = (done + st.ms) / total;
        const move = st.ms * .8, t0 = performance.now();
        await new Promise(res => (function f(now) {
          const k = Math.min(1, (now - t0) / move);
          set(from + (to - from) * ease(k));
          k < 1 ? requestAnimationFrame(f) : res();
        })(t0));
        await new Promise(r => setTimeout(r, st.ms * .2));
        done += st.ms;
      }
      set(1);
      await new Promise(r => setTimeout(r, 600));
      el.classList.remove('on');
    }
  };
}

// بيرسم خط الحواف اللي الأداة لقتها (من الشفافية، أو من فرق السطوع لو الصورة معتمة)
function buildEdges(src, dst) {
  const w = src.width, h = src.height;
  dst.width = w; dst.height = h;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  let hasA = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { hasA = true; break; }
  const m = i => hasA ? d[i + 3] : (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11);
  const thr = hasA ? 90 : 38;
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    if (Math.abs(m(i) - m(i + 4)) + Math.abs(m(i) - m(i + w * 4)) > thr) edge[y * w + x] = 1;
  }
  const out = dst.getContext('2d'), img = out.createImageData(w, h), o = img.data;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (edge[p] || edge[p - 1] || edge[p - w]) { const j = p * 4; o[j] = 110; o[j + 1] = 231; o[j + 2] = 183; o[j + 3] = 255; }
  }
  out.putImageData(img, 0, 0);
}
const mainBusy = busyKit(document.getElementById('busy'));
const bannerBusy = busyKit(document.getElementById('bBusy'));
const wait = ms => new Promise(r => setTimeout(r, ms));
function sweepCmp(from, to, ms) {
  const t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    setCmp(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

// ===== حساسية إزالة الخلفية =====
const sens = document.getElementById('sens');
let sensTimer;
sens.addEventListener('input', () => {
  document.getElementById('sensOut').textContent = sens.value;
  clearTimeout(sensTimer);
  sensTimer = setTimeout(() => { if (beforeImg.getAttribute('src')) process(beforeImg.src); }, 120);
});

// ===== مقارنة قبل وبعد =====
const cmp = document.getElementById('cmp');
function setCmp(v) {
  cmp.value = v;
  beforeImg.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
  document.getElementById('bar').style.left = v + '%';
}
cmp.addEventListener('input', () => setCmp(cmp.value));

// ===== معاينة الرول =====
let rpSrc = null;
// بيرسم الأيقونة بحجم CSS معيّن وبدقة شاشة الجهاز الحقيقية، وبيصغّر على مراحل ويزوّد حدّة خفيفة
// عشان الأيقونة الصغيرة (20 بكسل) متبانش مبهدلة أو مشوشة
function drawRoleIcon(c, src, cssSize) {
  const dpr = Math.min(4, Math.max(2, window.devicePixelRatio || 1));
  const px = Math.round(cssSize * dpr);
  c.style.width = cssSize + 'px'; c.style.height = cssSize + 'px';
  c.width = px; c.height = px;
  let cur = src, size = src.width;
  while (size / 2 > px) {                                  // تصغير على مراحل: 256 ← 128 ← 64 ...
    const ns = Math.max(px, Math.floor(size / 2));
    const t = document.createElement('canvas'); t.width = ns; t.height = ns;
    const tx = t.getContext('2d');
    tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = 'high';
    tx.drawImage(cur, 0, 0, ns, ns); cur = t; size = ns;
  }
  const x = c.getContext('2d', { willReadFrequently: true });
  x.clearRect(0, 0, px, px);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, px, px);
  if (cssSize <= 40) {                                      // حدّة خفيفة للأحجام الصغيرة
    const id = x.getImageData(0, 0, px, px), d = id.data, o = new Uint8ClampedArray(d);
    const amt = cssSize <= 24 ? 0.55 : 0.35;
    for (let yy = 0; yy < px; yy++) for (let xx = 0; xx < px; xx++) {
      const i = (yy * px + xx) * 4;
      if (o[i + 3] < 8) continue;
      for (let k = 0; k < 3; k++) {
        let s = 0, n = 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const X = xx + dx, Y = yy + dy;
          if (X < 0 || Y < 0 || X >= px || Y >= px) continue;
          const j = (Y * px + X) * 4;
          if (o[j + 3] > 40) { s += o[j + k]; n++; }
        }
        if (n) { const v = o[i + k] + amt * (o[i + k] - s / n); d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v; }
      }
    }
    x.putImageData(id, 0, 0);
  }
}
function renderRolePreview(src) {
  const box = document.getElementById('rolePrev');
  if (!roleOpt.checked) { box.style.display = 'none'; return; }
  rpSrc = src;
  box.style.display = 'block';
  box.querySelectorAll('canvas[data-rp]').forEach(c => drawRoleIcon(c, src, +c.dataset.rp));
}
// تعديل الاسم واليوزر والتاج واللون في المعاينة
(function () {
  const $ = id => document.getElementById(id);
  const COLORS = ['#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63', '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#5865f2', '#11806a', '#1f8b4c', '#206694', '#71368a', '#ad1457', '#c27c0e', '#a84300', '#992d22', '#979c9f', '#99aab5'];
  const sw = $('rpSw');
  COLORS.forEach(col => {
    const b = document.createElement('button');
    b.type = 'button'; b.style.setProperty('--c', col); b.dataset.c = col;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-label', col);
    b.addEventListener('click', () => { $('rpColor').value = col; upd(); });
    sw.appendChild(b);
  });
  const upd = () => {
    const tagIn = $('rpTag');
    // التاج: 4 حروف أو أرقام، عربي أو إنجليزي من أي لغة (الرموز والمسافات بتتشال)
    const cleanTag = Array.from(tagIn.value.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase()).slice(0, 4).join('');
    if (tagIn.value !== cleanTag) tagIn.value = cleanTag;
    const latin = /^[A-Za-z0-9]*$/.test(cleanTag);
    tagIn.classList.toggle('lat', latin);
    document.querySelectorAll('.dc-tag').forEach(t => t.classList.toggle('lat', latin));
    const name = $('rpName').value || 'اسم الرول', user = $('rpUser').value || 'نور', tag = cleanTag || 'TAG', col = $('rpColor').value;
    $('rpNameOut').textContent = name; $('rpUserOut').textContent = user; $('rpTagOut').textContent = tag;
    $('rpAv').textContent = Array.from(user)[0] || '؟';
    $('rpUserOut').style.color = col;
  };
  ['rpName', 'rpUser', 'rpTag', 'rpColor'].forEach(id => $(id).addEventListener('input', upd));
  upd();
})();

// نصائح بتظهر تحت النتيجة، حسب اللي الأداة لقته في الصورة
let lastBlobSize = 0;
function buildRoleTips() {
  const I = roleInfo || {};
  const dyn = [];
  if (I.fill !== undefined && I.fill < 0.5) dyn.push(`الموضوع واخد ${Math.round(I.fill * 100)}% بس من الإطار، فهيبان صغير. جرّب صورة أقرب للموضوع أو اقصّها قبل الرفع.`);
  if (I.crop && I.crop.indexOf('وسّعت') >= 0) dyn.push('الموضوع طويل أو عريض فاتوسّع الإطار حواليه. لو عايزه أكبر، استخدم صورة شكلها أقرب للمربع.');
  if (I.l20 !== undefined && I.l20 < 0.45) dyn.push('تفاصيل الصورة بتضيع بالحجم الصغير (20 بكسل). اختار صورة بشكل واضح وألوان متباينة.');
  if (I.blurry) dyn.push('الصورة مش حادة، فاستخدم نسخة بجودة أعلى لو عندك.');
  if (I.lowRes) dyn.push('الصورة الأصلية صغيرة وكبّرتها، ونسخة أكبر هتدّي نتيجة أنضف.');
  if (lastBlobSize > 200 * 1024) dyn.push(`حجم الملف ${Math.round(lastBlobSize / 1024)}KB وقريب من حد ديسكورد (256KB). استخدم صورة أبسط في ألوانها.`);
  const gen = [
    'بص على الأيقونة في المعاينة بالحجم الصغير جنب الاسم، لأن ده الحجم اللي الناس هتشوفه.',
    'الأيقونة بتتعرض على خلفية داكنة، فالألوان الفاتحة والواضحة بتبان أحسن من الغامقة.',
    'الصورة الشفافة (PNG) بتبان أنضف من الصورة اللي ليها خلفية.',
    'جرّب اسم الرول واليوزر والتاج بتوعك في المعاينة قبل ما ترفع الأيقونة.'
  ];
  if (lastBlobSize && lastBlobSize <= 200 * 1024) gen.unshift(`حجم الملف ${Math.max(1, Math.round(lastBlobSize / 1024))}KB وتحت حد ديسكورد (256KB)، يعني هيترفع من غير مشكلة.`);
  return dyn.concat(gen).slice(0, 3);
}
(function () {
  const btn = document.getElementById('downloadBtn'), box = document.getElementById('roleTips'), ul = document.getElementById('roleTipsList');
  const sync = () => {
    const show = roleOpt.checked && !btn.disabled;
    if (show) { ul.innerHTML = ''; buildRoleTips().forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); }
    box.style.display = show ? 'block' : 'none';
  };
  new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ['disabled'] });
  roleOpt.addEventListener('change', () => setTimeout(sync, 0));
  sync();
})();

// ===== الوضع الفاتح والداكن =====
document.getElementById('themeBtn').addEventListener('click', () => {
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme');
  const next = cur === 'light' ? 'discord' : cur === 'discord' ? 'dark' : 'light';   // داكن ← فاتح ← ديسكورد ← داكن
  root.classList.add('theme-anim'); setTimeout(() => root.classList.remove('theme-anim'), 500);
  const tb = document.getElementById('themeBtn'); tb.classList.remove('spin'); void tb.offsetWidth; tb.classList.add('spin');
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) {}
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = next === 'light' ? '#f5f5fb' : next === 'discord' ? '#313338' : '#0a0a12';
  showToast(next === 'light' ? 'الوضع الفاتح' : next === 'discord' ? 'ثيم ديسكورد' : 'الوضع الداكن', 1200);
});

// ===== نسخ يوزر ديسكورد =====
const toast = document.getElementById('toast');
function showToast(t, ms = 1800) {
  toast.textContent = t; toast.classList.add('show');
  clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.classList.remove('show'), ms);
}
document.getElementById('userBtn').addEventListener('click', async () => {
  const name = 'v6xwlp_';
  try { await navigator.clipboard.writeText(name); }
  catch (e) {
    const t = document.createElement('textarea'); t.value = name; document.body.appendChild(t);
    t.select(); try { document.execCommand('copy'); } catch (_) {} t.remove();
  }
  showToast('اتنسخ اليوزر ✓');
});

// ===== صورة مربعة لبانر =====
const bDrop = document.getElementById('bDrop'), bInput = document.getElementById('bInput');
const bCanvas = document.getElementById('bCanvas'), bWrap = document.getElementById('bWrap');
const bDims = document.getElementById('bDims'), bDownload = document.getElementById('bDownload');
const bScale = document.getElementById('bScale'), bScaleOut = document.getElementById('bScaleOut');
const bColor = document.getElementById('bColor');
let bImg = null, bW = 960, bH = 540, bBg = 'blur', bUrl = null;

let bFit = 'cover', bHold = false;
const bPos = document.getElementById('bPos'), bZoom = document.getElementById('bZoom'), bZoomOut = document.getElementById('bZoomOut');
function drawBanner() {
  if (!bImg) return;
  bCanvas.width = bW; bCanvas.height = bH;
  const ctx = bCanvas.getContext('2d');
  ctx.clearRect(0, 0, bW, bH);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const iw = bImg.naturalWidth, ih = bImg.naturalHeight;
  if (bFit === 'cover') {
    // الصورة تغطي البانر كله: نكبّرها لحد ما تملا العرض والطول، ونقص الزيادة حسب الموضع
    const k = Math.max(bW / iw, bH / ih) * (bZoom.value / 100);
    const w = iw * k, h = ih * k;
    ctx.drawImage(bImg, -(w - bW) * 0.5, -(h - bH) * (bPos.value / 100), w, h);
    // ملحوظة: القص الأفقي بيتوزع على الجانبين، والرأسي حسب شريط الموضع
  } else {
    if (bBg === 'blur') {
      const t = document.createElement('canvas'); t.width = 24; t.height = Math.max(2, Math.round(24 * bH / bW));
      const tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high';
      const kk = Math.max(t.width / iw, t.height / ih);
      tx.drawImage(bImg, (t.width - iw * kk) / 2, (t.height - ih * kk) / 2, iw * kk, ih * kk);
      ctx.drawImage(t, 0, 0, bW, bH);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, 0, bW, bH);
    } else if (bBg === 'color') {
      ctx.fillStyle = bColor.value; ctx.fillRect(0, 0, bW, bH);
    }
    const k = Math.min(bW / iw, bH / ih) * (bScale.value / 100);
    const w = iw * k, h = ih * k;
    ctx.drawImage(bImg, (bW - w) / 2, (bH - h) / 2, w, h);
  }
  bWrap.style.display = 'flex';
  bDims.textContent = 'مقاس البانر: \u2066' + bW + '×' + bH + '\u2069';
  bCanvas.toBlob(bl => { if (bUrl) URL.revokeObjectURL(bUrl); bUrl = URL.createObjectURL(bl); if (!bHold) bDownload.disabled = false; }, 'image/png');
}
function loadBanner(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const r = new FileReader();
  r.onload = e => {
    const im = new Image();
    im.onload = async () => {
      bWrap.style.display = 'flex'; bDownload.disabled = true; bDims.textContent = '';
      bHold = true; bImg = im; drawBanner();
      await bannerBusy.play([
        {t: `بقرا الصورة… ${im.naturalWidth}×${im.naturalHeight}`, ms: 2300},
        {t: bFit === 'cover' ? 'بحسب أحسن قص للبانر…' : 'بجهّز الخلفية…', ms: 3200},
        {t: `برسم البانر ${bW}×${bH}…`, ms: 2500}
      ], v => { bCanvas.style.clipPath = `inset(0 0 ${100 - v * 100}% 0)`; });
      bCanvas.style.clipPath = '';
      bHold = false; bDownload.disabled = !bUrl;

    };
    im.src = e.target.result;
  };
  r.readAsDataURL(file);
}
bInput.addEventListener('change', e => loadBanner(e.target.files[0]));
bDrop.addEventListener('click', () => bInput.click());
bDrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bInput.click(); } });
['dragenter', 'dragover'].forEach(ev => bDrop.addEventListener(ev, e => { e.preventDefault(); bDrop.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => bDrop.addEventListener(ev, e => { e.preventDefault(); bDrop.classList.remove('drag'); }));
bDrop.addEventListener('drop', e => loadBanner(e.dataTransfer.files[0]));
function chipGroup(id, fn) {
  const g = document.getElementById(id);
  g.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    g.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
    c.setAttribute('aria-pressed', 'true'); fn(c); drawBanner();
  }));
}
chipGroup('bSizes', c => { bW = +c.dataset.w; bH = +c.dataset.h; });
chipGroup('bFit', c => {
  bFit = c.dataset.fit;
  document.getElementById('bPosBox').style.display = bFit === 'cover' ? '' : 'none';
  document.getElementById('bBgBox').style.display = bFit === 'cover' ? 'none' : '';
});
bPos.addEventListener('input', drawBanner);
bZoom.addEventListener('input', () => { bZoomOut.textContent = bZoom.value + '%'; drawBanner(); });
chipGroup('bBg', c => { bBg = c.dataset.bg; });
bColor.addEventListener('input', () => {
  bBg = 'color';
  document.querySelectorAll('#bBg .chip').forEach(x => x.setAttribute('aria-pressed', x.dataset.bg === 'color'));
  drawBanner();
});
bScale.addEventListener('input', () => { bScaleOut.textContent = bScale.value + '%'; drawBanner(); });
bDownload.addEventListener('click', () => {
  if (!bUrl) return;
  const a = document.createElement('a'); a.href = bUrl; a.download = `بانر-${bW}x${bH}.png`;
  document.body.appendChild(a); a.click(); a.remove();
});

// ===== تغيير المقاس =====
const rDrop = document.getElementById('rDrop'), rInput = document.getElementById('rInput');
const rCanvas = document.getElementById('rCanvas'), rWrap = document.getElementById('rWrap');
const rDims = document.getElementById('rDims'), rInfo = document.getElementById('rInfo');
const rDownload = document.getElementById('rDownload'), rFields = document.getElementById('rFields');
const rWd = document.getElementById('rWd'), rH = document.getElementById('rH');
const resizeBusy = busyKit(document.getElementById('rBusy'));
let rImg = null, rW = 256, rHt = 256, rFitMode = 'cover', rLimit = 0, rUrl = null, rHold = false;

function drawResize() {
  if (!rImg) return;
  const W = Math.max(16, Math.min(4096, rW | 0)), H = Math.max(16, Math.min(4096, rHt | 0));
  rCanvas.width = W; rCanvas.height = H;
  const ctx = rCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const iw = rImg.naturalWidth, ih = rImg.naturalHeight;
  if (rFitMode === 'stretch') ctx.drawImage(rImg, 0, 0, W, H);
  else {
    const k = rFitMode === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
    const w = iw * k, h = ih * k;
    ctx.drawImage(rImg, (W - w) / 2, (H - h) / 2, w, h);
  }
  rWrap.style.display = 'flex';
  rDims.textContent = 'المقاس: ⁦' + W + '×' + H + '⁩';
  rCanvas.toBlob(bl => {
    if (rUrl) URL.revokeObjectURL(rUrl);
    rUrl = URL.createObjectURL(bl);
    const kb = bl.size / 1024;
    const txt = kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : Math.round(kb) + ' KB';
    if (rLimit) {
      const ok = kb <= rLimit;
      rInfo.className = 'sizeinfo ' + (ok ? 'ok' : 'bad');
      rInfo.innerHTML = 'حجم الملف: <b dir="ltr">' + txt + '</b> — ' + (ok ? 'تمام، تحت حد ديسكورد (' + rLimit + ' KB)' : 'أكبر من حد ديسكورد (' + rLimit + ' KB)، جرّب مقاس أصغر');
    } else { rInfo.className = 'sizeinfo'; rInfo.innerHTML = 'حجم الملف: <b dir="ltr">' + txt + '</b>'; }
    if (!rHold) rDownload.disabled = false;
  }, 'image/png');
}
async function loadResize(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const r = new FileReader();
  r.onload = e => {
    const im = new Image();
    im.onload = async () => {
      rWrap.style.display = 'flex'; rDownload.disabled = true; rInfo.textContent = ''; rDims.textContent = '';
      rHold = true; rImg = im; drawResize();
      await resizeBusy.play([
        {t: `بقرا الصورة… ${im.naturalWidth}×${im.naturalHeight}`, ms: 2200},
        {t: `بحسب المقاس ${rW}×${rHt}…`, ms: 3000},
        {t: 'برسم النتيجة وبقيس حجم الملف…', ms: 2400}
      ], v => { rCanvas.style.clipPath = `inset(0 0 ${100 - v * 100}% 0)`; });
      rCanvas.style.clipPath = '';
      rHold = false; rDownload.disabled = !rUrl;
    };
    im.src = e.target.result;
  };
  r.readAsDataURL(file);
}
rInput.addEventListener('change', e => loadResize(e.target.files[0]));
rDrop.addEventListener('click', () => rInput.click());
rDrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rInput.click(); } });
['dragenter', 'dragover'].forEach(ev => rDrop.addEventListener(ev, e => { e.preventDefault(); rDrop.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => rDrop.addEventListener(ev, e => { e.preventDefault(); rDrop.classList.remove('drag'); }));
rDrop.addEventListener('drop', e => loadResize(e.dataTransfer.files[0]));
function rChips(id, fn) {
  const g = document.getElementById(id);
  g.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    g.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
    c.setAttribute('aria-pressed', 'true'); fn(c); drawResize();
  }));
}
rChips('rSizes', c => {
  const custom = c.dataset.w === '0';
  rFields.classList.toggle('on', custom);
  rLimit = +(c.dataset.limit || 0);
  if (custom) { rW = +rWd.value; rHt = +rH.value; } else { rW = +c.dataset.w; rHt = +c.dataset.h; }
});
rChips('rFit', c => { rFitMode = c.dataset.fit; });
[rWd, rH].forEach(i => i.addEventListener('input', () => { rW = +rWd.value; rHt = +rH.value; drawResize(); }));
rDownload.addEventListener('click', () => {
  if (!rUrl) return;
  const a = document.createElement('a'); a.href = rUrl; a.download = `مقاس-${rCanvas.width}x${rCanvas.height}.png`;
  document.body.appendChild(a); a.click(); a.remove();
});

// ===== دوال مشتركة للأدوات الجديدة =====
function wireDrop(drop, input, cb) {
  input.addEventListener('change', e => cb(e.target.files[0]));
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => cb(e.dataTransfer.files[0]));
}
function readImage(file) {
  return new Promise((res, rej) => {
    if (!file || !file.type.startsWith('image/')) return rej();
    const r = new FileReader();
    r.onload = e => { const im = new Image(); im.onload = () => res({img: im, url: e.target.result}); im.onerror = rej; im.src = e.target.result; };
    r.readAsDataURL(file);
  });
}
function chipsOf(id, fn) {
  const g = document.getElementById(id);
  g.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    g.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
    c.setAttribute('aria-pressed', 'true'); fn(c);
  }));
}
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function dl(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

// ===== تصغير الحجم وتغيير الصيغة =====
const cCanvas = document.getElementById('cCanvas'), cWrap = document.getElementById('cWrap'), cDownload = document.getElementById('cDownload');
const cBusy = busyKit(document.getElementById('cBusy'));
let cImg = null, cSize = 0, cType = 'image/jpeg', cQual = .8, cK = 1, cUrl = null, cExt = 'jpg', cHold = false;
function encodeCompress() {
  if (!cImg) return;
  const W = Math.max(1, Math.round(cImg.naturalWidth * cK)), H = Math.max(1, Math.round(cImg.naturalHeight * cK));
  cCanvas.width = W; cCanvas.height = H;
  const ctx = cCanvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (cType === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }   // JPG مفيهوش شفافية
  ctx.drawImage(cImg, 0, 0, W, H);
  cCanvas.toBlob(bl => {
    if (!bl) return;
    if (cUrl) URL.revokeObjectURL(cUrl);
    cUrl = URL.createObjectURL(bl);
    cExt = bl.type === 'image/jpeg' ? 'jpg' : bl.type === 'image/webp' ? 'webp' : 'png';
    const saved = Math.round((1 - bl.size / cSize) * 100);
    document.getElementById('cBefore').textContent = fmtSize(cSize);
    document.getElementById('cAfter').textContent = fmtSize(bl.size);
    document.getElementById('cSave').textContent = (saved >= 0 ? '-' : '+') + Math.abs(saved) + '%';
    document.getElementById('cSaveBox').classList.toggle('bad', saved < 0);
    document.getElementById('cStats').style.display = 'grid';
    document.getElementById('cDims').textContent = 'المقاس: ⁦' + W + '×' + H + '⁩' + (bl.type !== cType ? ' — متصفحك مدعمش الصيغة دي، اتحفظت ' + cExt.toUpperCase() : '');
    if (!cHold) cDownload.disabled = false;
  }, cType, cQual);
}
const encodeCompressSoon = debounce(encodeCompress, 120);
wireDrop(document.getElementById('cDrop'), document.getElementById('cInput'), async file => {
  let r; try { r = await readImage(file); } catch (e) { return; }
  cImg = r.img; cSize = file.size; cHold = true; cDownload.disabled = true;
  cWrap.style.display = 'flex'; encodeCompress();
  await cBusy.play([
    {t: `بقرا الصورة… ${cImg.naturalWidth}×${cImg.naturalHeight}`, ms: 2000},
    {t: 'بجرّب أحسن ضغط…', ms: 2800},
    {t: 'بقيس الحجم الجديد…', ms: 2000}
  ], v => { cCanvas.style.clipPath = `inset(0 0 ${100 - v * 100}% 0)`; });
  cCanvas.style.clipPath = ''; cHold = false; cDownload.disabled = !cUrl;
});
chipsOf('cFmt', c => {
  cType = c.dataset.t;
  document.getElementById('cQBox').style.display = cType === 'image/png' ? 'none' : '';
  encodeCompress();
});
chipsOf('cScale', c => { cK = +c.dataset.k; encodeCompress(); });
document.getElementById('cQ').addEventListener('input', e => { cQual = e.target.value / 100; document.getElementById('cQOut').textContent = e.target.value + '%'; encodeCompressSoon(); });
cDownload.addEventListener('click', () => { if (cUrl) dl(cUrl, `مصغّرة.${cExt}`); });

// ===== تحسين جودة الصورة =====
function boxBlurRGB(src, w, h, r) {            // تغبيش صندوقي سريع بنافذة متحركة (RGB بس)
  const tmp = new Uint8ClampedArray(src.length), out = new Uint8ClampedArray(src.length);
  const win = r * 2 + 1;
  for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) {
    let sum = 0; const row = y * w * 4 + c;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x)) * 4];
    for (let x = 0; x < w; x++) {
      tmp[row + x * 4] = sum / win;
      sum += src[row + Math.min(w - 1, x + r + 1) * 4] - src[row + Math.max(0, x - r) * 4];
    }
  }
  for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let sum = 0; const col = x * 4 + c;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w * 4 + col];
    for (let y = 0; y < h; y++) {
      out[y * w * 4 + col] = sum / win;
      sum += tmp[Math.min(h - 1, y + r + 1) * w * 4 + col] - tmp[Math.max(0, y - r) * w * 4 + col];
    }
  }
  return out;
}
function enhanceImage(img, scale, sharp, color) {
  const MAX = 3072, iw = img.naturalWidth, ih = img.naturalHeight;
  let eff = Math.min(scale, MAX / Math.max(iw, ih)); if (eff < 1) eff = 1;
  const W = Math.round(iw * eff), H = Math.round(ih * eff);
  let cur = img, cw = iw, ch = ih;
  while (cw < W || ch < H) {                           // تكبير على مراحل عشان الجودة تفضل عالية
    const nw = Math.min(W, Math.round(cw * 2)), nh = Math.min(H, Math.round(ch * 2));
    const c = document.createElement('canvas'); c.width = nw; c.height = nh;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, nw, nh); cur = c; cw = nw; ch = nh;
  }
  if (cur === img) { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0, W, H); cur = c; }
  const ctx = cur.getContext('2d'), id = ctx.getImageData(0, 0, W, H), d = id.data;
  if (sharp > 0) {                                     // unsharp mask: الأصلي + (الأصلي - المغبّش) × القوة
    const amount = sharp / 100 * 1.5, r = Math.max(1, Math.round(eff * 0.7));
    let b = boxBlurRGB(d, W, H, r); b = boxBlurRGB(b, W, H, r);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      for (let k = 0; k < 3; k++) { const diff = d[i + k] - b[i + k]; if (Math.abs(diff) > 2) d[i + k] = d[i + k] + diff * amount; }
    }
  }
  if (color) {
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const g = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
      for (let k = 0; k < 3; k++) { let v = g + (d[i + k] - g) * 1.12; v = (v - 128) * 1.06 + 128; d[i + k] = v; }
    }
  }
  ctx.putImageData(id, 0, 0);
  return cur;
}
const eAft = document.getElementById('eAft'), eBef = document.getElementById('eBef'), eWrap = document.getElementById('eWrap');
const eStage = document.getElementById('eStage'), eZm = document.getElementById('eZm'), eBar = document.getElementById('eBar');
const eCmp = document.getElementById('eCmp'), eDownload = document.getElementById('eDownload');
const eBusy = busyKit(document.getElementById('eBusy'));
let eImg = null, eK = 2, eSharpV = 55, eColorV = false, eUrl = null, eV = 50, eZ = 1, eOx = .5, eOy = .5, eHold = false, eSeq = 0;
function eRender() {
  eZm.style.transformOrigin = `${eOx * 100}% ${eOy * 100}%`;
  eZm.style.transform = `scale(${eZ})`;
  const lx = eZ > 1 ? eOx + (0.5 - eOx) / eZ : eV / 100;       // مكان الفاصل بعد التقريب
  eBef.style.clipPath = `inset(0 ${(1 - lx) * 100}% 0 0)`;
  eBar.style.left = (eZ > 1 ? 50 : eV) + '%';
}
function runEnhance() {
  if (!eImg) return Promise.resolve();
  const my = ++eSeq;
  return new Promise(res => setTimeout(() => {
    const out = enhanceImage(eImg, eK, eSharpV, eColorV);
    if (my !== eSeq) return res();
    eAft.width = out.width; eAft.height = out.height;
    eAft.getContext('2d').drawImage(out, 0, 0);
    document.getElementById('eDims').textContent = `الأصلي: ⁦${eImg.naturalWidth}×${eImg.naturalHeight}⁩ ← بعد التحسين: ⁦${out.width}×${out.height}⁩`;
    out.toBlob(bl => {
      if (eUrl) URL.revokeObjectURL(eUrl); eUrl = URL.createObjectURL(bl);
      document.getElementById('eInfo').innerHTML = 'حجم ملف PNG: <b dir="ltr">' + fmtSize(bl.size) + '</b>';
      if (!eHold) eDownload.disabled = false; res();
    }, 'image/png');
  }, 30));
}
const runEnhanceSoon = debounce(runEnhance, 250);
wireDrop(document.getElementById('eDrop'), document.getElementById('eInput'), async file => {
  let r; try { r = await readImage(file); } catch (e) { return; }
  eImg = r.img; eBef.src = r.url; eHold = true; eDownload.disabled = true;
  eWrap.style.display = 'flex'; eV = 0; eZ = 1; eRender();
  eStage.scrollIntoView({behavior: 'smooth', block: 'center'});
  await runEnhance();
  eStage.classList.add('scanning');
  await eBusy.play([
    {t: `بقرا الصورة… ${eImg.naturalWidth}×${eImg.naturalHeight}`, ms: 1700},
    {t: `بكبّرها ×${eK} على مراحل…`, ms: 2300},
    {t: 'بزوّد الحدة وبوضّح التفاصيل…', ms: 2300},
    {t: 'بظبط الألوان والتباين…', ms: 1600}
  ], v => { eBef.style.clipPath = `inset(${v * 100}% 0 0 0)`; });
  eStage.classList.remove('scanning'); eHold = false; eDownload.disabled = !eUrl;
  eV = 0; eRender();
  const t0 = performance.now();
  (function st(now) { const k = Math.min(1, (now - t0) / 900); eV = 50 * (1 - Math.pow(1 - k, 3)); eCmp.value = eV; eRender(); if (k < 1) requestAnimationFrame(st); })(t0);
});
chipsOf('eScale', c => { eK = +c.dataset.k; runEnhanceSoon(); });
document.getElementById('eSharp').addEventListener('input', e => { eSharpV = +e.target.value; document.getElementById('eSharpOut').textContent = e.target.value; runEnhanceSoon(); });
document.getElementById('eColor').addEventListener('change', e => { eColorV = e.target.checked; runEnhanceSoon(); });
eCmp.addEventListener('input', () => { eV = +eCmp.value; eRender(); });
chipsOf('eZoom', c => {
  eZ = +c.dataset.z; eStage.classList.toggle('zoomed', eZ > 1);
  document.getElementById('eHint').textContent = eZ > 1 ? 'حرّك صباعك أو الماوس على الصورة عشان تتنقل بين الأجزاء' : 'اسحب الشريط عشان تقارن قبل وبعد';
  eRender();
});
function ePan(e) {
  if (eZ <= 1) return;
  const r = eStage.getBoundingClientRect();
  eOx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); eOy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  eRender();
}
eStage.addEventListener('pointermove', ePan);
eStage.addEventListener('pointerdown', ePan);
eStage.addEventListener('touchmove', e => { if (eZ > 1) e.preventDefault(); }, {passive: false});
eDownload.addEventListener('click', () => { if (eUrl) dl(eUrl, `محسّنة-x${eK}.png`); });

// ===== تثبيت التطبيق والمشاركة =====
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function hideInstall() { document.querySelectorAll('[data-act=install]').forEach(b => b.style.display = 'none'); }
window.addEventListener('appinstalled', () => { hideInstall(); showToast('اتثبّت التطبيق ✓'); });
if (isStandalone()) hideInstall();
async function doInstall() {
  if (deferredInstall) {
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (e) {}
    deferredInstall = null; return;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showToast(ios ? 'من زر المشاركة اختار "إضافة إلى الشاشة الرئيسية"' : 'من قايمة المتصفح اختار "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"', 4500);
}
async function doShare() {
  const url = location.href.split('#')[0];
  if (navigator.share) { try { await navigator.share({title: 'صنع نور الدين', text: 'أدوات مجانية للصور: تقريب الحواف، أيقونات رولز ديسكورد، بانرات وأكتر', url}); } catch (e) {} return; }
  try { await navigator.clipboard.writeText(url); } catch (e) {
    const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (_) {} t.remove();
  }
  showToast('اتنسخ رابط الموقع ✓');
}
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
  if (b.closest('#drawer')) { drawer.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  b.dataset.act === 'install' ? doInstall() : doShare();
}));

// ===== شاشة البداية =====
(function () {
  const root = document.documentElement, sp = document.getElementById('splash');
  if (!root.classList.contains('splash-on')) return;
  let done = false;
  const close = () => {
    if (done) return; done = true;
    try { sessionStorage.setItem('sp', '1'); } catch (e) {}
    sp.classList.add('out');
    setTimeout(() => root.classList.remove('splash-on'), 800);
  };
  sp.addEventListener('click', close);
  setTimeout(close, 2300);
})();

// ===== ضبط الألوان =====
const adCanvas = document.getElementById('adCanvas'), adWrap = document.getElementById('adWrap'), adTools = document.getElementById('adTools');
const adDownload = document.getElementById('adDownload'), adReset = document.getElementById('adReset');
const adBusy = busyKit(document.getElementById('adBusy'));
const adIds = {b: 'adB', c: 'adC', s: 'adS', w: 'adW'};
let adImg = null, adBase = null, adPending = false, adHoldOn = false;
const adP = () => ({b: +adB.value, c: +adC.value, s: +adS.value, w: +adW.value});
function applyAdjust(id, p) {
  const d = id.data, B = p.b * 1.2, C = p.c * 2.55, f = (259 * (C + 255)) / (255 * (259 - C)), W = p.w * .35, S = 1 + p.s / 100;
  const cl = v => v < 0 ? 0 : v > 255 ? 255 : v;
  const lr = new Uint8ClampedArray(256), lg = new Uint8ClampedArray(256), lb = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    lr[v] = cl(f * (v + B + W - 128) + 128);
    lg[v] = cl(f * (v + B + W * .1 - 128) + 128);
    lb[v] = cl(f * (v + B - W - 128) + 128);
  }
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = lr[d[i]], g = lg[d[i + 1]], b = lb[d[i + 2]];
    if (S !== 1) { const y = r * .3 + g * .59 + b * .11; r = y + (r - y) * S; g = y + (g - y) * S; b = y + (b - y) * S; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
}
function adRender() {
  adPending = false;
  if (!adBase) return;
  const id = new ImageData(new Uint8ClampedArray(adBase.data), adBase.width, adBase.height);
  if (!adHoldOn) applyAdjust(id, adP());
  adCanvas.getContext('2d').putImageData(id, 0, 0);
}
const adSchedule = () => { if (!adPending) { adPending = true; requestAnimationFrame(adRender); } };
['adB', 'adC', 'adS', 'adW'].forEach(i => document.getElementById(i).addEventListener('input', e => {
  document.getElementById(i + 'Out').textContent = e.target.value; adSchedule(); adReset.style.display = '';
}));
adReset.addEventListener('click', () => {
  ['adB', 'adC', 'adS', 'adW'].forEach(i => { document.getElementById(i).value = 0; document.getElementById(i + 'Out').textContent = '0'; });
  adSchedule(); adReset.style.display = 'none';
});
const adHold = document.getElementById('adHold');
['pointerdown'].forEach(ev => adHold.addEventListener(ev, e => { e.preventDefault(); adHoldOn = true; adRender(); }));
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => adHold.addEventListener(ev, () => { if (adHoldOn) { adHoldOn = false; adRender(); } }));
wireDrop(document.getElementById('adDrop'), document.getElementById('adInput'), async file => {
  let r; try { r = await readImage(file); } catch (e) { return; }
  adImg = r.img;
  const k = Math.min(1, 1200 / Math.max(adImg.naturalWidth, adImg.naturalHeight));
  const w = Math.round(adImg.naturalWidth * k), h = Math.round(adImg.naturalHeight * k);
  adCanvas.width = w; adCanvas.height = h;
  const cx = adCanvas.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(adImg, 0, 0, w, h);
  adBase = cx.getImageData(0, 0, w, h);
  adWrap.style.display = 'flex'; adTools.style.display = 'block'; adDownload.disabled = true;
  document.getElementById('adDims').textContent = 'المقاس الأصلي: ⁦' + adImg.naturalWidth + '×' + adImg.naturalHeight + '⁩';
  await adBusy.play([
    {t: `بقرا الصورة… ${adImg.naturalWidth}×${adImg.naturalHeight}`, ms: 1000},
    {t: 'بحلل الألوان والإضاءة…', ms: 1400},
    {t: 'جاهز للتعديل', ms: 800}
  ], v => { adCanvas.style.clipPath = `inset(0 0 ${100 - v * 100}% 0)`; });
  adCanvas.style.clipPath = ''; adDownload.disabled = false;
});
adDownload.addEventListener('click', () => {
  if (!adImg) return;
  adDownload.disabled = true; adDownload.textContent = 'بجهّز الصورة…';
  setTimeout(() => {
    const k = Math.min(1, 6000 / Math.max(adImg.naturalWidth, adImg.naturalHeight));
    const w = Math.round(adImg.naturalWidth * k), h = Math.round(adImg.naturalHeight * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.drawImage(adImg, 0, 0, w, h);
    const id = x.getImageData(0, 0, w, h); applyAdjust(id, adP()); x.putImageData(id, 0, 0);
    c.toBlob(bl => { const u = URL.createObjectURL(bl); dl(u, 'ألوان-معدّلة.png'); setTimeout(() => URL.revokeObjectURL(u), 5000);
      adDownload.disabled = false; adDownload.textContent = 'تنزيل الصورة'; }, 'image/png');
  }, 40);
});

// ===== طمس أجزاء من الصورة =====
const xCanvas = document.getElementById('xCanvas'), xOver = document.getElementById('xOver'), xWrap = document.getElementById('xWrap');
const xUndo = document.getElementById('xUndo'), xClear = document.getElementById('xClear'), xDownload = document.getElementById('xDownload');
const xBusy = busyKit(document.getElementById('xBusy'));
let xImg = null, xRegions = [], xModeV = 'pixel', xStrV = 60, xDrag = null;
function blurRegion(ctx, x, y, w, h, str) {
  const id = ctx.getImageData(x, y, w, h), r = Math.max(2, Math.round(Math.min(w, h) * (0.03 + str / 100 * 0.14)));
  let b = boxBlurRGB(id.data, w, h, r); b = boxBlurRGB(b, w, h, r);
  for (let i = 3; i < b.length; i += 4) b[i] = 255;
  ctx.putImageData(new ImageData(b, w, h), x, y);
}
function pixelRegion(ctx, x, y, w, h, str) {
  const n = Math.max(3, Math.round(22 - str / 100 * 18)), block = Math.max(2, Math.max(w, h) / n);
  const cw = Math.max(1, Math.ceil(w / block)), ch = Math.max(1, Math.ceil(h / block));
  const t = document.createElement('canvas'); t.width = cw; t.height = ch;
  const tx = t.getContext('2d'); tx.imageSmoothingEnabled = true; tx.drawImage(ctx.canvas, x, y, w, h, 0, 0, cw, ch);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, cw, ch, x, y, w, h); ctx.imageSmoothingEnabled = true;
}
function xRender(cv, maxSide) {
  const k = Math.min(1, maxSide / Math.max(xImg.naturalWidth, xImg.naturalHeight));
  const W = Math.round(xImg.naturalWidth * k), H = Math.round(xImg.naturalHeight * k);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(xImg, 0, 0, W, H);
  for (const g of xRegions) {
    const x = Math.max(0, Math.round(g.x * W)), y = Math.max(0, Math.round(g.y * H));
    const w = Math.min(W - x, Math.round(g.w * W)), h = Math.min(H - y, Math.round(g.h * H));
    if (w < 2 || h < 2) continue;
    if (g.m === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); }
    else if (g.m === 'blur') blurRegion(ctx, x, y, w, h, g.s);
    else pixelRegion(ctx, x, y, w, h, g.s);
  }
}
function xUpdateUi() {
  xCount.textContent = xRegions.length ? 'عدد المناطق: ' + xRegions.length : '';
  xUndo.disabled = xClear.disabled = !xRegions.length;
}
const xCount = document.getElementById('xCount');
function xRedraw() { xRender(xCanvas, 1200); xUpdateUi(); xDownload.disabled = false; }
wireDrop(document.getElementById('xDrop'), document.getElementById('xInput'), async file => {
  let r; try { r = await readImage(file); } catch (e) { return; }
  xImg = r.img; xRegions = [];
  xWrap.style.display = 'flex'; xDownload.disabled = true; xRender(xCanvas, 1200); xUpdateUi();
  xOver.width = xCanvas.width; xOver.height = xCanvas.height; xOver.style.pointerEvents = 'none';
  await xBusy.play([
    {t: `بقرا الصورة… ${xImg.naturalWidth}×${xImg.naturalHeight}`, ms: 1000},
    {t: 'بجهّز أداة التحديد…', ms: 1400},
    {t: 'اسحب على الجزء اللي عايز تخفيه', ms: 800}
  ], v => { xCanvas.style.clipPath = `inset(0 0 ${100 - v * 100}% 0)`; });
  xCanvas.style.clipPath = ''; xOver.style.pointerEvents = 'auto'; xDownload.disabled = false;
});
chipsOf('xMode', c => { xModeV = c.dataset.m; document.getElementById('xStrBox').style.display = xModeV === 'black' ? 'none' : ''; });
document.getElementById('xStr').addEventListener('input', e => { xStrV = +e.target.value; document.getElementById('xStrOut').textContent = e.target.value; });
const xPos = e => {
  const r = xOver.getBoundingClientRect();
  return {x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))};
};
function xDrawRect() {
  const c = xOver.getContext('2d'); c.clearRect(0, 0, xOver.width, xOver.height);
  if (!xDrag) return;
  const x = Math.min(xDrag.a.x, xDrag.b.x) * xOver.width, y = Math.min(xDrag.a.y, xDrag.b.y) * xOver.height;
  const w = Math.abs(xDrag.b.x - xDrag.a.x) * xOver.width, h = Math.abs(xDrag.b.y - xDrag.a.y) * xOver.height;
  c.fillStyle = 'rgba(116,104,255,.25)'; c.fillRect(x, y, w, h);
  c.lineWidth = Math.max(2, xOver.width / 300); c.strokeStyle = '#fff'; c.setLineDash([10, 7]); c.strokeRect(x, y, w, h);
}
xOver.addEventListener('pointerdown', e => { e.preventDefault(); xOver.setPointerCapture(e.pointerId); const p = xPos(e); xDrag = {a: p, b: p}; });
xOver.addEventListener('pointermove', e => { if (!xDrag) return; xDrag.b = xPos(e); xDrawRect(); });
const xEnd = e => {
  if (!xDrag) return;
  xDrag.b = xPos(e);
  const g = {x: Math.min(xDrag.a.x, xDrag.b.x), y: Math.min(xDrag.a.y, xDrag.b.y), w: Math.abs(xDrag.b.x - xDrag.a.x), h: Math.abs(xDrag.b.y - xDrag.a.y), m: xModeV, s: xStrV};
  xDrag = null; xDrawRect();
  if (g.w * xCanvas.width > 6 && g.h * xCanvas.height > 6) { xRegions.push(g); xRedraw(); }
};
xOver.addEventListener('pointerup', xEnd);
xOver.addEventListener('pointercancel', () => { xDrag = null; xDrawRect(); });
xUndo.addEventListener('click', () => { xRegions.pop(); xRedraw(); });
xClear.addEventListener('click', () => { xRegions = []; xRedraw(); });
xDownload.addEventListener('click', () => {
  if (!xImg) return;
  xDownload.disabled = true; xDownload.textContent = 'بجهّز الصورة…';
  setTimeout(() => {
    const c = document.createElement('canvas'); xRender(c, 6000);
    c.toBlob(bl => { const u = URL.createObjectURL(bl); dl(u, 'مطموسة.png'); setTimeout(() => URL.revokeObjectURL(u), 5000);
      xDownload.disabled = false; xDownload.textContent = 'تنزيل الصورة'; }, 'image/png');
  }, 40);
});

// ===== رابط إزالة الخلفية (بيظهر لو الصورة خلفيتها مش شفافة) =====
const BGRM_URL = 'https://www.iloveimg.com/ar/remove-background';
document.querySelectorAll('.bgrm-slot').forEach(s => {
  s.innerHTML = '<div class="bgrm" style="display:none"><span class="bgi"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" stroke-dasharray="3 3"/><circle cx="9" cy="9.5" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/></svg></span><p>الصورة دي خلفيتها مش شفافة. شيل الخلفية الأول من الموقع ده وبعدين ارفعها هنا.</p><a href="' + BGRM_URL + '" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>iLoveIMG</a><small>موقع إزالة خلفية</small></div>';
});
function showBgRm(slotId, on) { const b = document.querySelector('#' + slotId + ' .bgrm'); if (b) b.style.display = on ? 'block' : 'none'; }

// ===== فاحص الأيقونة =====
const ckBusy = busyKit(document.getElementById('ckBusy'));
const ckList = document.getElementById('ckList'), ckVerdict = document.getElementById('ckVerdict');
const ckCanvas = document.getElementById('ckCanvas'), ckOver = document.getElementById('ckOver');
const ckDownload = document.getElementById('ckDownload');
let ckRun = 0, ckFinal = null;
const CK_ICON = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 6v8M12 18h.01"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>'
};
const CK_K = {
  size: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>',
  bg: '<rect x="3" y="3" width="18" height="18" rx="4" stroke-dasharray="3 3"/><circle cx="9" cy="9.5" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/>',
  frame: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3"/>',
  sharp: '<path d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>',
  color: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2.2-.6-1.3.2-2.8 1.7-2.8H17a4 4 0 0 0 4-4c0-4.4-4-9-9-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  small: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>'
};
const ckSvg = k => '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + CK_K[k] + '</svg>';
const ckPct = v => Math.round(Math.max(0, Math.min(1, v)) * 100);

// قياسات الأيقونة: مقاس، شفافية، موضوع وإطار، حدة، ألوان، ووضوح بأحجام ديسكورد
function ckMetrics(src) {
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const k = Math.min(1, 256 / Math.max(sw, sh));
  const w = Math.max(8, Math.round(sw * k)), h = Math.max(8, Math.round(sh * k)), n = w * h;
  const o = document.createElement('canvas'); o.width = w; o.height = h;
  const ox = o.getContext('2d', { willReadFrequently: true });
  ox.imageSmoothingQuality = 'high'; ox.drawImage(src, 0, 0, w, h);
  const d = ox.getImageData(0, 0, w, h).data;
  let tr = 0; for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 250) tr++;
  const hasAlpha = tr > 20;
  const cp = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].map(([x, y]) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; });
  const bg = [0, 1, 2].map(c => (cp[0][c] + cp[1][c] + cp[2][c] + cp[3][c]) / 4);
  let spread = 0; cp.forEach(a => cp.forEach(b => { spread = Math.max(spread, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); }));
  const solidBg = !hasAlpha && spread < 30;
  const mask = new Uint8Array(n); let mc = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  const L = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = i * 4;
    L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    const m = hasAlpha ? d[j + 3] > 40 : solidBg ? Math.hypot(d[j] - bg[0], d[j + 1] - bg[1], d[j + 2] - bg[2]) > 34 : true;
    if (m) { mask[i] = 1; mc++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const fill = Math.max(bw, bh) / Math.max(w, h);
  const full = mc > n * 0.97;
  const edge = (x0 <= 1) + (y0 <= 1) + (x1 >= w - 2) + (y1 >= h - 2);
  const off = Math.hypot((x0 + x1 + 1) / 2 - w / 2, (y0 + y1 + 1) / 2 - h / 2) / Math.max(w, h);
  let sumL = 0, cnt = 0, clip = 0;
  const hist = new Uint32Array(256); let gc = 0;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    sumL += L[i]; cnt++; if (L[i] < 4 || L[i] > 251) clip++;
    hist[Math.min(255, Math.round(Math.abs(L[i + 1] - L[i]) + Math.abs(L[i + w] - L[i])))]++; gc++;
  }
  let p98 = 0; { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= gc * 0.985) { p98 = v; break; } } }
  // نسخة مربعة 256 (الأيقونة كلها جوه مربع) لقياس الوضوح
  const sq = document.createElement('canvas'); sq.width = sq.height = 256;
  const sx = sq.getContext('2d'); sx.imageSmoothingQuality = 'high';
  const kk = 256 / Math.max(sw, sh); sx.drawImage(src, (256 - sw * kk) / 2, (256 - sh * kk) / 2, sw * kk, sh * kk);
  const bgs = (hasAlpha || sw !== sh) ? [[49, 51, 56], [242, 243, 245]] : [[49, 51, 56]];
  const sat1 = v => Math.min(1, Math.max(0, v));
  const leg = {};
  for (const s of [20, 32, 64]) {
    const c = document.createElement('canvas'); c.width = c.height = s;
    const c2 = c.getContext('2d', { willReadFrequently: true }); c2.imageSmoothingQuality = 'high';
    let worst = 9;
    for (const b of bgs) {
      c2.fillStyle = `rgb(${b[0]},${b[1]},${b[2]})`; c2.fillRect(0, 0, s, s); c2.drawImage(sq, 0, 0, s, s);
      const q = c2.getImageData(0, 0, s, s).data, l = new Float32Array(s * s);
      let mean = 0, cl = 0;
      for (let i = 0; i < s * s; i++) { l[i] = 0.299 * q[i * 4] + 0.587 * q[i * 4 + 1] + 0.114 * q[i * 4 + 2]; mean += l[i]; if (l[i] < 4 || l[i] > 251) cl++; }
      mean /= s * s; cl /= s * s;
      let v = 0, gs = 0;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const i = y * s + x; v += (l[i] - mean) * (l[i] - mean);
        if (x + 1 < s) gs += Math.abs(l[i + 1] - l[i]); if (y + 1 < s) gs += Math.abs(l[i + s] - l[i]);
      }
      const sc = 0.5 * sat1(Math.sqrt(v / (s * s)) / 42) + 0.5 * sat1(gs / (2 * s * s) / 9) - 4 * Math.max(0, cl - 0.015);
      if (sc < worst) worst = sc;
    }
    leg[s] = worst;
  }
  return { sw, sh, hasAlpha, solidBg, full, fill, edge, off, meanL: cnt ? sumL / cnt : 128, clip: cnt ? clip / cnt : 0, p98, leg, sq,
    box: { x: x0 / w, y: y0 / h, w: bw / w, h: bh / h } };
}

function ckChecks(m, size) {
  const out = [];
  const mn = Math.min(m.sw, m.sh), square = Math.abs(m.sw - m.sh) / Math.max(m.sw, m.sh) <= 0.02;
  out.push({ k: 'size', t: 'المقاس', lv: mn < 64 ? 'bad' : (!square || mn < 128) ? 'warn' : 'ok',
    d: `\u2066${m.sw}×${m.sh}\u2069` + (mn < 64 ? ' — صغيرة أوي، ديسكورد بيطلب 64×64 على الأقل' : !square ? ' — مش مربعة وديسكورد هيقصها أو يبوّظ شكلها' : mn < 128 ? ' — صغيرة شوية وهتتكبّر' : ' — مقاس كويس') });
  out.push({ k: 'file', t: 'حجم الملف', lv: size > 256 * 1024 ? 'bad' : size > 200 * 1024 ? 'warn' : 'ok',
    d: '\u2066' + fmtSize(size) + '\u2069' + (size > 256 * 1024 ? ' — أكبر من حد ديسكورد (256KB)' : size > 200 * 1024 ? ' — قريب من حد ديسكورد (256KB)' : ' — تحت حد ديسكورد (256KB)') });
  out.push({ k: 'bg', t: 'الخلفية', lv: m.solidBg ? 'warn' : 'ok',
    d: m.hasAlpha ? 'شفافة، ممتاز' : m.solidBg ? 'لون صلب مش شفاف، هتبان مربع حوالين الموضوع' : 'الصورة ملاية الإطار كله' });
  const fr = [];
  if (!m.full) {
    if (m.fill < 0.5) fr.push('الموضوع صغير جوه الإطار (' + ckPct(m.fill) + '%)');
    if (m.fill > 0.97 && m.edge >= 2) fr.push('الموضوع ملزق في الحواف وممكن يكون مقصوص');
    if (m.off > 0.08) fr.push('الموضوع مش في النص');
  }
  out.push({ k: 'frame', t: 'الموضوع والإطار', lv: fr.length ? 'warn' : 'ok',
    d: fr.length ? fr.join(' · ') : m.full ? 'الصورة ملاية الإطار كله' : 'الموضوع ' + ckPct(m.fill) + '% من الإطار ومتوسّط' });
  out.push({ k: 'sharp', t: 'الحدة', lv: m.p98 < 10 ? 'bad' : m.p98 < 16 ? 'warn' : 'ok',
    d: m.p98 < 16 ? 'الصورة مش حادة والتفاصيل ناعمة' : 'حواف واضحة' });
  const cr = [];
  if (m.hasAlpha && !m.full) {
    if (Math.abs(m.meanL - 54) < 30) cr.push('الموضوع غامق وهيضيع على الخلفية الداكنة');
    if (m.meanL > 213) cr.push('الموضوع فاتح وهيضيع على الخلفية الفاتحة');
  }
  if (m.clip > 0.35) cr.push('ألوان محروقة (سواد أو بياض كتير)');
  out.push({ k: 'color', t: 'الألوان', lv: cr.length ? 'warn' : 'ok', d: cr.length ? cr.join(' · ') : 'التباين والألوان كويسين' });
  const l20 = m.leg[20];
  out.push({ k: 'small', t: 'الوضوح بأحجام ديسكورد', lv: l20 < 0.35 ? 'bad' : l20 < 0.5 ? 'warn' : 'ok',
    d: `20px: ${ckPct(l20)}% · 32px: ${ckPct(m.leg[32])}% · 64px: ${ckPct(m.leg[64])}%` });
  return out;
}

function ckRow(c) {
  const li = document.createElement('li'); li.className = c.lv;
  li.innerHTML = '<span class="ci">' + ckSvg(c.k) + '<i class="st">' + CK_ICON[c.lv] + '</i></span><div><b></b><small class="dd"></small></div>';
  li.querySelector('b').textContent = c.t; li.querySelector('.dd').textContent = c.d;
  return li;
}
function ckDrawSizes(boxId, src) {
  document.querySelectorAll('#' + boxId + ' canvas').forEach(c => drawRoleIcon(c, src, c.width > 40 ? 64 : c.width > 24 ? 32 : 20));
}
const ckWait = ms => new Promise(r => setTimeout(r, ms));

wireDrop(document.getElementById('ckDrop'), document.getElementById('ckInput'), async file => {
  let r; try { r = await readImage(file); } catch (e) { return; }
  const my = ++ckRun, img = r.img;
  ckList.innerHTML = ''; ckVerdict.style.display = 'none'; ckDownload.disabled = true;
  document.getElementById('ckCmp').style.display = 'none'; showBgRm('ckBgSlot', false);
  document.getElementById('ckDims').textContent = '';
  const w = img.naturalWidth, h = img.naturalHeight, kv = Math.min(1, 600 / Math.max(w, h));
  ckCanvas.width = Math.round(w * kv); ckCanvas.height = Math.round(h * kv);
  const cx = ckCanvas.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, ckCanvas.width, ckCanvas.height);
  ckOver.width = ckCanvas.width; ckOver.height = ckCanvas.height;
  document.getElementById('ckWrap').style.display = 'flex';
  const p1 = ckBusy.play([{ t: `بقرا الأيقونة… ${w}×${h}`, ms: 900 }, { t: 'بقيس المقاس والخلفية والإطار…', ms: 1300 }, { t: 'بفحص الوضوح بأحجام 20 و32 و64…', ms: 1300 }]);
  const before = ckMetrics(img), bChecks = ckChecks(before, file.size);
  showBgRm('ckBgSlot', !before.hasAlpha);                      // الرابط يظهر فورًا تحت الصورة لو فيها خلفية
  await p1; if (my !== ckRun) return;
  const ox = ckOver.getContext('2d');
  if (!before.full) {                                          // مربع بيبيّن مكان الموضوع اللي الأداة لقته
    ox.strokeStyle = '#5865f2'; ox.lineWidth = 3; ox.setLineDash([8, 6]);
    ox.strokeRect(before.box.x * ckOver.width, before.box.y * ckOver.height, before.box.w * ckOver.width, before.box.h * ckOver.height);
  }
  const rows = [];
  for (const c of bChecks) { const li = ckRow(c); ckList.appendChild(li); rows.push(li); await ckWait(320); if (my !== ckRun) return; }
  const bad = bChecks.filter(c => c.lv !== 'ok' && c.k !== 'file' && c.k !== 'bg');
  let finalCanvas = null, useFixed = false, summary = '', aChecks = null, after = null;
  ckDrawSizes('ckBefore', before.sq);
  if (!bad.length) {
    summary = 'ok';
    ckDrawSizes('ckAfter', before.sq);
  } else {
    const warnLine = document.createElement('li'); warnLine.className = 'run';
    warnLine.innerHTML = '<span class="ci"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/></svg></span><div><b>لقيت ' + bad.length + ' ' + (bad.length > 2 ? 'مشاكل' : 'مشكلة') + '، وبظبطها دلوقتي…</b><small>بحدد الموضوع، وأظبط الإطار والتباين والحدة بحسب أحجام ديسكورد</small></div>';
    ckList.appendChild(warnLine);
    await loadAI();
    const p2 = ckBusy.play([{ t: 'بحدد الموضوع وأظبط الإطار…', ms: 3000 }, { t: 'بظبط التباين والحدة لكل حجم…', ms: 3500 }, { t: 'بتأكد من النتيجة…', ms: 2500 }]);
    finalCanvas = await smartRole(img);
    const ai = roleInfo && roleInfo.ai;
    await p2; if (my !== ckRun) return;
    const blob = await new Promise(res => finalCanvas.toBlob(res, 'image/png'));
    after = ckMetrics(finalCanvas); aChecks = ckChecks(after, blob.size);
    const aBad = aChecks.filter(c => c.lv !== 'ok' && c.k !== 'bg');
    useFixed = aBad.length < bad.length || (aBad.length === bad.length && after.leg[20] >= before.leg[20] - 0.02);
    warnLine.remove();
    let fixed = 0;
    bad.forEach(c => {
      const a = aChecks.find(x => x.k === c.k), li = rows[bChecks.indexOf(c)], okNow = useFixed && a.lv === 'ok';
      if (okNow) fixed++;
      const s = document.createElement('small'); s.className = 'aft' + (okNow ? '' : ' warn');
      s.textContent = (okNow ? 'اتظبط ✓ ' : 'لسه محتاج انتباه — ') + a.d;
      li.querySelector('div').appendChild(s);
      if (okNow) { li.className = 'ok'; li.querySelector('.st').innerHTML = CK_ICON.ok; }
    });
    summary = useFixed ? (fixed === bad.length ? 'fixed' : 'part') : 'orig';
    summary += '|' + fixed + '|' + bad.length + '|' + (ai ? 1 : 0);
    ckDrawSizes('ckAfter', useFixed ? finalCanvas : before.sq);
    if (useFixed) { ckFinal = { url: URL.createObjectURL(blob), name: 'أيقونة-متظبطة.png' }; }
  }
  document.getElementById('ckCmp').style.display = 'block';
  const [st, fx, tot, ai] = summary.split('|');
  let html, cls = '';
  if (st === 'ok') html = '<b>الأيقونة تمام ✓</b>كل النقاط سليمة ومفيش حاجة محتاجة تتغيّر. هتبان واضحة في ديسكورد بكل الأحجام.';
  else if (st === 'fixed') html = '<b>لقيت ' + tot + ' ' + (+tot > 2 ? 'مشاكل' : 'مشكلة') + ' وظبطتها كلها ✓</b>النسخة الجديدة 256×256 وواضحة بأحجام ديسكورد' + (ai === '1' ? ' (حددت الموضوع بالذكاء الاصطناعي).' : '.');
  else if (st === 'part') { html = '<b>ظبطت ' + fx + ' من ' + tot + '</b>الباقي محتاج صورة أصلية أوضح أو بخلفية أبسط.'; cls = 'warn'; }
  else { html = '<b>الأصلية أحسن من أي نسخة جربتها</b>جربت أظبطها بس النتيجة مكانتش أحسن، فسيبتها زي ما هي. جرّب صورة أوضح.'; cls = 'warn'; }
  ckVerdict.className = 'ckverdict ' + cls; ckVerdict.innerHTML = '<span class="vi">' + (cls ? '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></svg>' : '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/></svg>') + '</span><div>' + html + '</div>'; ckVerdict.style.display = 'block';
  if (!(st === 'fixed' || st === 'part')) ckFinal = { url: URL.createObjectURL(file), name: file.name || 'أيقونة.png' };
  ckDownload.textContent = (st === 'fixed' || st === 'part') ? 'تنزيل الأيقونة المتظبطة' : 'تنزيل الأيقونة';
  ckDownload.disabled = false;
  document.getElementById('ckDims').textContent = 'الأصلية: \u2066' + w + '×' + h + '\u2069 — \u2066' + fmtSize(file.size) + '\u2069';
});
ckDownload.addEventListener('click', () => { if (ckFinal) dl(ckFinal.url, ckFinal.name); });

// ===== التنقل بين الشاشات =====
const VIEWS = {
  trim: ['workspace', 'تقريب الحواف'], role: ['workspace', 'أيقونة رول ديسكورد'],
  banner: ['banner', 'صورة مربعة لبانر'], resize: ['resize', 'تغيير المقاس'],
  compress: ['compress', 'تصغير الحجم وتغيير الصيغة'], enhance: ['enhance', 'تحسين جودة الصورة'],
  adjust: ['adjust', 'ضبط الألوان'], blur: ['blur', 'طمس أجزاء من الصورة'], check: ['check', 'فاحص الأيقونة']
};
const backSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
document.querySelectorAll('.view').forEach(sec => {
  const bar = document.createElement('div');
  bar.className = 'backbar';
  bar.innerHTML = '<button class="back" type="button">' + backSvg + 'رجوع للأدوات</button><span class="trail">الرئيسية ‹ <b></b></span>';
  bar.querySelector('.back').addEventListener('click', () => { location.hash = '#tools'; });
  sec.insertBefore(bar, sec.firstChild);
});
let routeToken = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function applyRoute() {
  const h = location.hash;
  const m = h.match(/^#\/(\w+)/);
  const body = document.body;
  if (m && VIEWS[m[1]]) {
    const key = m[1], [id, title] = VIEWS[key];
    if (key === 'trim' || key === 'role') {
      const wantRole = key === 'role';
      if (roleOpt.checked !== wantRole) { roleOpt.checked = wantRole; roleOpt.dispatchEvent(new Event('change')); }
      document.querySelector('#workspace .sec-head h2').textContent = title;
    }
    document.querySelector('#' + id + ' .trail b').textContent = title;
    if (key === 'check') loadAI();
    body.dataset.view = key;
    document.querySelectorAll('.intro').forEach(x => x.remove());
    const srcThumb = !reduceMotion && document.querySelector(`.card [data-mode="${key}"]`)?.closest('.card')?.querySelector('.thumb');
    if (srcThumb) {                                   // نسخة من صورة الكارت تظهر جوه الشاشة وتختفي
      const box = document.createElement('div');
      box.className = 'intro'; box.setAttribute('aria-hidden', 'true');
      box.appendChild(srcThumb.cloneNode(true));
      const sec = document.getElementById(id);
      sec.insertBefore(box, sec.querySelector('.backbar').nextSibling);
      box.addEventListener('animationend', ev => { if (ev.target === box) box.remove(); });
    }
    document.title = title + ' | صنع نور الدين';
    window.scrollTo(0, 0);
  } else {
    const wasView = body.dataset.view && body.dataset.view !== 'home';
    body.dataset.view = 'home';
    document.title = 'صنع نور الدين';
    const t = h.length > 1 ? document.getElementById(decodeURIComponent(h.slice(1))) : null;
    if (t) requestAnimationFrame(() => t.scrollIntoView({behavior: wasView ? 'auto' : 'smooth', block: 'start'}));
    else if (wasView || !h) window.scrollTo(0, 0);
  }
}
function route(first) {
  const my = ++routeToken, body = document.body;
  const change = !first && body.dataset.view && !reduceMotion;
  if (!change) { applyRoute(); return; }
  body.classList.add('leaving');                      // الشاشة القديمة بتختفي بسرعة (160ms)
  setTimeout(() => {
    if (my !== routeToken) return;
    applyRoute();
    requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('leaving')));
  }, 160);
}
window.addEventListener('hashchange', () => route());

// ===== واجهة الصفحة =====
const menuBtn = document.getElementById('menuBtn');
const drawer = document.getElementById('drawer');
menuBtn.addEventListener('click', () => {
  const open = drawer.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', open);
});
drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  drawer.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false');
}));

document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { location.hash = '#/' + btn.dataset.mode; }));


drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
resetBtn.addEventListener('click', () => showBgRm('bgRmSlot', false));
roleOpt.addEventListener('change', () => showBgRm('bgRmSlot', false));
route(true);


// تحذير تحت كل أداة، بيظهر لما النتيجة تجهز (زرار التنزيل يتفعّل)
const WARNS = {
  downloadBtn: () => roleOpt.checked
    ? []
    : ['التقريب بيقص الأطراف الفاضية، راجع الحواف وتأكد إن مفيش جزء من الموضوع اتقص.', 'لو الصورة فيها ظل أو توهج خفيف ممكن يتشال مع الخلفية.', 'الصورة الأصلية مش بتتغير، اللي بتنزله نسخة جديدة.'],
  bDownload: () => ['القص بيعتمد على الوضع والتكبير اللي اخترتهم، راجع الجزء الظاهر قبل التنزيل.', 'لو الصورة الأصلية صغيرة، تكبيرها لبانر كبير هيخليها باهتة.'],
  rDownload: () => ['تغيير المقاس بالقص ممكن يقص جزء من الصورة، وبالتمديد ممكن يبوّظ النسب.', 'تكبير صورة صغيرة بيقلل جودتها.'],
  cDownload: () => ['الضغط الشديد بيقلل الجودة ويظهر تشوّه في الصورة، راجع النتيجة قبل ما تحفظها.', 'الصورة الأصلية مش بتتغير، فاحتفظ بنسختك.'],
  eDownload: () => ['زيادة التحسين أكتر من اللازم بتظهر حبيبات وهالات حوالين الحواف.', 'التحسين مش بيرجّع تفاصيل مش موجودة في الصورة الأصلية.'],
  adDownload: () => ['زيادة السطوع أو التباين أو التشبع أكتر من اللازم بتحرق الألوان وتضيّع التفاصيل.', 'راجع الصورة بعد التعديل قبل ما تحفظها.'],
  xDownload: () => ['التمويه ممكن ما يخفيش الكلام تماماً لو كان كبير ومقروء، زوّد القوة وراجع النتيجة.', 'لو بتخفي بيانات حساسة، اتأكد إن مفيش حاجة باينة قبل ما تشارك الصورة.']
};
Object.keys(WARNS).forEach(id => {
  const btn = document.getElementById(id);
  if (!btn) return;
  const box = document.createElement('div');
  box.className = 'warn'; box.style.display = 'none';
  box.innerHTML = '<h4><span class="wi"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span>تحذير</h4><ul></ul>';
  const actions = btn.closest('.actions');
  actions.parentNode.insertBefore(box, actions);
  const sync = () => {
    const list = WARNS[id]();
    const show = !btn.disabled && list.length > 0;
    if (show) {
      const ul = box.querySelector('ul'); ul.innerHTML = '';
      list.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    }
    box.style.display = show ? 'block' : 'none';
  };
  if (id === 'downloadBtn') roleOpt.addEventListener('change', () => setTimeout(sync, 0));
  new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ['disabled'] });
  sync();
});

