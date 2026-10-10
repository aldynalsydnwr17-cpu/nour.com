
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
    process(e.target.result);                  // المعالجة الفعلية سريعة، والأنيميشن بيعرض اللي لقيته فعلًا خطوة خطوة
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
    holdCmp = false;
    downloadBtn.disabled = !resultBlobUrl;
    setCmp(0);
    sweepCmp(0, 50, 900);
    if (roleOpt.checked) showToast('أداة رولز ديسكورد بتحاول تظبط الصورة على قد ما تقدر، لكن ديسكورد بيعرض أيقونة الرول بحجم ثابت حوالي 20 بكسل.', 7000);
  };
  reader.readAsDataURL(file);
}

let lastInfo = null;
function process(src) {
  const img = new Image();
  img.onload = () => {
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(img, 0, 0);
      const data = tctx.getImageData(0, 0, w, h);
      const data0 = tctx.getImageData(0, 0, w, h); // نسخة أصلية لقراءة لون الخلفية

      let hasAlpha = checkHasAlpha(data);
      let bg = hasAlpha ? null : sampleCorners(data, w, h);
      let srcImg = img, bgNote = '';

      const box = findBounds(data, w, h, hasAlpha, bg);
      lastInfo = {w, h, kind: bgNote.includes('اتشالت') ? 'removed' : bgNote.includes('مفيش') ? 'none' : (hasAlpha ? 'alpha' : 'solid'), bg: (!hasAlpha || bgNote.includes('اتشالت')) ? sampleCorners(data0, w, h) : null, out: roleOpt.checked ? '256×256' : (box.maxX - box.minX + 1) + '×' + (box.maxY - box.minY + 1)};

      let cw = box.maxX - box.minX + 1;
      let ch = box.maxY - box.minY + 1;
      let outCanvas = document.createElement('canvas');

      if (roleOpt.checked) {
        outCanvas = smartRole(img);
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
      if (roleOpt.checked && roleInfo) dims.textContent += `  —  ${roleInfo.crop} · تباين ×${roleInfo.con} · تشبع ×${roleInfo.sat} · حدّة ${roleInfo.shp}`;
      previewRow.style.display = 'flex'; renderRolePreview(outCanvas); if (!holdCmp) setCmp(50);
      resetBtn.style.display = 'inline-block';

      outCanvas.toBlob(blob => {
        if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
        resultBlobUrl = URL.createObjectURL(blob);
        if (roleOpt.checked && blob.size > 256 * 1024) dims.textContent += '  —  تنبيه: حجم الملف أكبر من 256KB وديسكورد مش هيقبله';
        if (!holdCmp) downloadBtn.disabled = false;
      }, 'image/png');
    } catch (err) {
      dims.textContent = 'حصل خطأ أثناء معالجة الصورة، جرب صورة تانية.';
    }
  };
  img.src = src;
}

// معالجة رولز ديسكورد: بتلاقي الموضوع الحقيقي وتتجاهل النقط الشاردة، وبتحسب أصغر دايرة
// تغطي 99.5% من الموضوع (عشان ديسكورد بيعرض الأيقونة في إطار دايري صغير)، وبتحط الموضوع في
// ===== معالجة رولز ديسكورد الذكية =====
// 1) تحديد الموضوع الأساسي (مش الوسط بس) 2) أصغر مربع يغطي الموضوع كله 3) تجربة درجات تباين وتشبع وحدّة
// وقياس وضوح الأيقونة بالأحجام الصغير والمتوسط والكبير، واختيار أحسن نتيجة لكل صورة لوحدها
let roleInfo = null;
function smartRole(img) {
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
  if (alphaMode) {
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

  // ---- ب) أصغر مربع يغطي 94% من الموضوع، مع البحث عن أحسن مكان له ----
  const m = Math.min(wc, hc);
  let sz = Math.round(m * 0.85), bx = Math.round((wc - sz) / 2), by = Math.round((hc - sz) / 2);   // الاحتياطي: زي أداة البوت
  let cropNote = 'قص من النص';
  if (total > n * 0.01) {
    const W1 = wc + 1;
    const I = new Float64Array(W1 * (hc + 1));
    for (let y = 0; y < hc; y++) { let row = 0; for (let x = 0; x < wc; x++) { row += S[y * wc + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; } }
    const mass = (x0, y0, s) => I[(y0 + s) * W1 + x0 + s] - I[y0 * W1 + x0 + s] - I[(y0 + s) * W1 + x0] + I[y0 * W1 + x0];
    let cx = 0, cy = 0;
    for (let y = 0; y < hc; y++) for (let x = 0; x < wc; x++) { const v = S[y * wc + x]; cx += x * v; cy += y * v; }
    cx /= total; cy /= total;
    let found = null;
    for (let f = 0.30; f <= 1.0001; f += 0.025) {
      const s = Math.max(4, Math.min(m, Math.round(f * m)));
      let best = -1, px = 0, py = 0;
      for (let y0 = 0; y0 <= hc - s; y0++) for (let x0 = 0; x0 <= wc - s; x0++) {
        const ms = mass(x0, y0, s) - 1e-4 * Math.hypot(x0 + s / 2 - cx, y0 + s / 2 - cy);
        if (ms > best) { best = ms; px = x0; py = y0; }
      }
      const cov = mass(px, py, s) / total;
      if (cov >= 0.94 || s === m) { found = { s, px, py, cov }; break; }
    }
    if (found) {
      let s = Math.min(m, Math.round(found.s * 1.06));       // هامش 6%
      const ccx = found.px + found.s / 2, ccy = found.py + found.s / 2;
      bx = Math.round(Math.min(Math.max(0, ccx - s / 2), wc - s));
      by = Math.round(Math.min(Math.max(0, ccy - s / 2), hc - s));
      sz = s;
      cropNote = 'قص على الموضوع (' + Math.round(found.cov * 100) + '% مغطّى)';
    }
  }
  const sc = 1 / k;
  let side = Math.min(Math.min(w, h), Math.round(sz * sc));
  const sx = Math.round(Math.min(Math.max(0, bx * sc), w - side)), sy = Math.round(Math.min(Math.max(0, by * sc), h - side));

  // ---- ج) نقص ونصغّر على مراحل لـ 256×256 ----
  const OUT = 256;
  let cur = document.createElement('canvas'); cur.width = side; cur.height = side;
  cur.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, side, side);
  let size = side;
  while (size / 2 > OUT) {
    const nx = document.createElement('canvas'); const ns = Math.max(OUT, Math.floor(size / 2));
    nx.width = ns; nx.height = ns;
    const c = nx.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(cur, 0, 0, ns, ns); cur = nx; size = ns;
  }
  const base = document.createElement('canvas'); base.width = OUT; base.height = OUT;
  const bctx = base.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(cur, 0, 0, OUT, OUT);
  const src = bctx.getImageData(0, 0, OUT, OUT).data;
  const N = OUT * OUT;

  // ---- د) تفاصيل الحدّة (الأصلي - تغبيش 3×3) نحسبها مرة واحدة ----
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
  let sumL = 0, cntL = 0;
  for (let i = 0; i < N; i++) if (src[i * 4 + 3] > 40) { sumL += 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]; cntL++; }
  const pivot = Math.min(166, Math.max(90, cntL ? sumL / cntL : 128));

  const render = (con, sat, shp, target) => {
    const o = target || new Uint8ClampedArray(src.length);
    for (let i = 0; i < N; i++) {
      const j = i * 4; o[j + 3] = src[j + 3];
      if (!src[j + 3]) { o[j] = o[j + 1] = o[j + 2] = 0; continue; }
      const r = src[j] + shp * det[i * 3], g = src[j + 1] + shp * det[i * 3 + 1], b = src[j + 2] + shp * det[i * 3 + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      o[j] = (gray + (r - gray) * sat - pivot) * con + pivot;
      o[j + 1] = (gray + (g - gray) * sat - pivot) * con + pivot;
      o[j + 2] = (gray + (b - gray) * sat - pivot) * con + pivot;
    }
    return o;
  };

  // ---- هـ) مقياس الوضوح بالأحجام الحقيقية: 20 (صغير) و32 (متوسط) و64 (كبير) ----
  const tmp = document.createElement('canvas'); tmp.width = OUT; tmp.height = OUT;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  const sizes = [[20, 0.5], [32, 0.3], [64, 0.2]];
  const bgs = alphaMode ? [[49, 51, 56], [242, 243, 245]] : [[49, 51, 56]];
  const sat1 = v => Math.min(1, Math.max(0, v));
  const legib = (px) => {
    tctx.putImageData(new ImageData(new Uint8ClampedArray(px), OUT, OUT), 0, 0);
    let score = 0;
    for (const [s, wt] of sizes) {
      const c = document.createElement('canvas'); c.width = s; c.height = s;
      const cc = c.getContext('2d', { willReadFrequently: true });
      cc.imageSmoothingEnabled = true; cc.imageSmoothingQuality = 'high';
      let worst = 9;
      for (const bgc of bgs) {
        cc.fillStyle = `rgb(${bgc[0]},${bgc[1]},${bgc[2]})`; cc.fillRect(0, 0, s, s);
        cc.drawImage(tmp, 0, 0, s, s);
        const q = cc.getImageData(0, 0, s, s).data;
        const l = new Float32Array(s * s);
        let mean = 0, clip = 0;
        for (let i = 0; i < s * s; i++) {
          l[i] = 0.299 * q[i * 4] + 0.587 * q[i * 4 + 1] + 0.114 * q[i * 4 + 2]; mean += l[i];
          if (l[i] < 4 || l[i] > 251) clip++;
        }
        mean /= s * s; clip /= s * s;
        let v = 0, gsum = 0;
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          const i = y * s + x; v += (l[i] - mean) * (l[i] - mean);
          if (x + 1 < s) gsum += Math.abs(l[i + 1] - l[i]);
          if (y + 1 < s) gsum += Math.abs(l[i + s] - l[i]);
        }
        const sd = Math.sqrt(v / (s * s)), gm = gsum / (2 * s * s);
        const sc2 = 0.5 * sat1(sd / 42) + 0.5 * sat1(gm / 9) - 4 * Math.max(0, clip - 0.015);
        if (sc2 < worst) worst = sc2;
      }
      score += wt * worst;
    }
    return score;
  };

  // ---- و) نجرّب كل التركيبات ونختار الأحسن ----
  const CON = [1.0, 1.06, 1.12, 1.18, 1.25, 1.33, 1.42, 1.6, 1.8, 2.1, 2.5], SAT = [1.0, 1.1, 1.2], SHP = [0, 0.5, 1.0];
  const buf = new Uint8ClampedArray(src.length);
  let best = { sc: -9, con: 1, sat: 1, shp: 0 };
  for (const con of CON) for (const sat of SAT) for (const shp of SHP) {
    render(con, sat, shp, buf);
    const cost = 0.30 * (con - 1) * (con - 1) + 0.05 * (sat - 1) / 0.2 + 0.04 * shp;
    const sc3 = legib(buf) - cost;
    if (sc3 > best.sc) best = { sc: sc3, con, sat, shp };
  }
  const outPx = render(best.con, best.sat, best.shp);
  const out = document.createElement('canvas'); out.width = OUT; out.height = OUT;
  out.getContext('2d').putImageData(new ImageData(outPx, OUT, OUT), 0, 0);
  roleInfo = { crop: cropNote, con: best.con, sat: best.sat, shp: best.shp };
  return out;
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
function renderRolePreview(src) {
  const box = document.getElementById('rolePrev');
  if (!roleOpt.checked) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  [64, 32, 18].forEach(n => {
    const c = document.getElementById('rp' + n);
    const x = c.getContext('2d');
    x.clearRect(0, 0, n, n);
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, n, n);
  });
}

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

// ===== التنقل بين الشاشات =====
const VIEWS = {
  trim: ['workspace', 'تقريب الحواف'], role: ['workspace', 'أيقونة رول ديسكورد'],
  banner: ['banner', 'صورة مربعة لبانر'], resize: ['resize', 'تغيير المقاس'],
  compress: ['compress', 'تصغير الحجم وتغيير الصيغة'], enhance: ['enhance', 'تحسين جودة الصورة'],
  adjust: ['adjust', 'ضبط الألوان'], blur: ['blur', 'طمس أجزاء من الصورة']
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
route(true);


// تحذير تحت كل أداة، بيظهر لما النتيجة تجهز (زرار التنزيل يتفعّل)
const WARNS = {
  downloadBtn: () => roleOpt.checked
    ? ['الأداة بتقص على الموضوع الأساسي في الصورة، فأطراف الصورة ممكن تتقص، راجع النتيجة قبل ما ترفعها.', 'أيقونة الرول بتتعرض صغيرة جداً في ديسكورد، والتفاصيل الدقيقة هتختفي.', 'ديسكورد بيرفض أيقونة الرول لو حجمها كبير، فتأكد إن الملف صغير قبل الرفع.']
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
    const show = !btn.disabled;
    if (show) {
      const ul = box.querySelector('ul'); ul.innerHTML = '';
      WARNS[id]().forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    }
    box.style.display = show ? 'block' : 'none';
  };
  new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ['disabled'] });
  sync();
});

