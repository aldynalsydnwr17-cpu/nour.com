
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
let squarePrev = false;
roleOpt.addEventListener('change', () => {
  if (roleOpt.checked) { squarePrev = squareOpt.checked; squareOpt.checked = true; }
  else { squareOpt.checked = squarePrev; }
  squareOpt.disabled = roleOpt.checked;
  document.getElementById('sensBox').style.display = roleOpt.checked ? 'block' : 'none';
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

      // وضع الرولز: لو الصورة ليها خلفية ثابتة نشيلها الأول، ولو مفيش نكمل تظبيط الأبعاد بس
      if (roleOpt.checked && !hasAlpha) {
        const cut = removeBackground(data, w, h);
        if (cut) { srcImg = cut.canvas; data.data.set(cut.data); hasAlpha = true; bg = null; bgNote = '  —  اتشالت الخلفية'; }
        else bgNote = '  —  مفيش خلفية ثابتة، اتظبطت الأبعاد بس';
      }
      const box = findBounds(data, w, h, hasAlpha, bg);
      lastInfo = {w, h, kind: bgNote.includes('اتشالت') ? 'removed' : bgNote.includes('مفيش') ? 'none' : (hasAlpha ? 'alpha' : 'solid'), bg: (!hasAlpha || bgNote.includes('اتشالت')) ? sampleCorners(data0, w, h) : null, out: roleOpt.checked ? '256×256' : (box.maxX - box.minX + 1) + '×' + (box.maxY - box.minY + 1)};

      let cw = box.maxX - box.minX + 1;
      let ch = box.maxY - box.minY + 1;
      let outCanvas = document.createElement('canvas');

      if (roleOpt.checked) {
        outCanvas = smartRoleFit(srcImg, data, w, h, hasAlpha, bg);
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
      previewRow.style.display = 'flex'; renderRolePreview(outCanvas); if (!holdCmp) setCmp(50);
      resetBtn.style.display = 'inline-block';

      outCanvas.toBlob(blob => {
        if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
        resultBlobUrl = URL.createObjectURL(blob);
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
// نص مربع 256×256 شفاف مع هامش بسيط، وبعدين بتزوّد التباين 10% زي ما اتفقنا
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
  const half = Math.max(radius, Math.max(bw, bh) / 2) * 1.04;

  // 4) نرسم الموضوع في مربع 256×256 شفاف
  const OUT = 256;
  const scale = OUT / (2 * half);
  const out = document.createElement('canvas');
  out.width = OUT; out.height = OUT;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -(cx - half) * scale, -(cy - half) * scale, w * scale, h * scale);

  // 5) تباين +10% على الألوان بس (الشفافية زي ما هي)
  const id = ctx.getImageData(0, 0, OUT, OUT);
  const p = id.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    for (let k = 0; k < 3; k++) {
      const v = (p[i + k] - 128) * 1.1 + 128;
      p[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  ctx.putImageData(id, 0, 0);
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
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.classList.add('theme-anim'); setTimeout(() => root.classList.remove('theme-anim'), 500);
  const tb = document.getElementById('themeBtn'); tb.classList.remove('spin'); void tb.offsetWidth; tb.classList.add('spin');
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) {}
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = next === 'light' ? '#f5f5fb' : '#0a0a12';
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
