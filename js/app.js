/* =========================================================
   Simulador de Probabilidad — Lógica de la aplicación
   ---------------------------------------------------------
   Módulos:
   1. Utilidades (formato, fracciones, RNG)
   2. Teoría (probabilidades exactas)
   3. Simulación Monte Carlo con puntos de control
   4. Gráficas (Chart.js) y tema
   5. Renderizado de resultados y animación
   6. Prueba manual
   7. Análisis de error
   8. Sección de teoría (dados y árbol)
   9. Navegación, tema y eventos
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   1. UTILIDADES
   --------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const nf = (x, d = 2) =>
  Number.isFinite(x) ? x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const nInt = (x) => Math.round(x).toLocaleString('es-CO');
const pct = (x, d = 2) => nf(x * 100, d) + ' %';

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const fracStr = (num, den) => {
  if (num === 0) return '0';
  const g = gcd(num, den);
  const n = num / g, d = den / g;
  return d === 1 ? String(n) : `${n}/${d}`;
};

/* Generador pseudoaleatorio con semilla (mulberry32) */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const makeRng = (seedValue) =>
  seedValue === '' || seedValue === null || Number.isNaN(Number(seedValue)) ? Math.random : mulberry32(Math.floor(Number(seedValue)));

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------------------------------------------------
   Estado global
   --------------------------------------------------------- */
const MAX_N = 1_000_000;
const state = {
  exp: 'dice',
  target: 7,
  fuseN: 20,
  fuseK: 5,
  n: 10000,
  logScale: 'logarithmic',
  run: null,          // última simulación { cps, theory, params, exp }
  animId: null,
  animating: false,
  manual: { trials: 0, hits: 0 },
  charts: { conv: null, cmp: null, dist: null, err: null },
};

/* ---------------------------------------------------------
   2. TEORÍA
   --------------------------------------------------------- */
function getTheory(exp = state.exp, params = currentParams()) {
  let labels = [], values = [], probs = [], targetIdx = 0, varName = '', varShort = '';
  if (exp === 'dice') {
    for (let s = 2; s <= 12; s++) {
      labels.push(String(s));
      values.push(s);
      probs.push((6 - Math.abs(s - 7)) / 36);
    }
    targetIdx = params.target - 2;
    varName = 'Suma de los dados (S)';
    varShort = 'S';
  } else {
    const { N, K } = params;
    const tot = N * (N - 1);
    labels = ['0 defectuosos', '1 defectuoso', '2 defectuosos'];
    values = [0, 1, 2];
    probs = [(N - K) * (N - K - 1) / tot, 2 * K * (N - K) / tot, K * (K - 1) / tot];
    targetIdx = 2;
    varName = 'N.º de defectuosos (X)';
    varShort = 'X';
  }
  const p = probs[targetIdx];
  const mean = values.reduce((a, v, i) => a + v * probs[i], 0);
  const variance = values.reduce((a, v, i) => a + v * v * probs[i], 0) - mean * mean;
  return { labels, values, probs, targetIdx, p, mean, variance, varName, varShort };
}

function currentParams() {
  return { target: state.target, N: state.fuseN, K: state.fuseK };
}

function readInputs() {
  state.exp = $('input[name="exp"]:checked').value;
  state.target = parseInt($('#diceTarget').value, 10);
  state.fuseN = Number($('#fuseN').value);
  state.fuseK = Number($('#fuseK').value);
  state.n = Number($('#nInput').value);
}

function validate() {
  const errs = [];
  if (!Number.isInteger(state.n) || state.n < 1 || state.n > MAX_N)
    errs.push(`El número de simulaciones debe ser un entero entre 1 y ${nInt(MAX_N)}.`);
  if (state.exp === 'fuses') {
    if (!Number.isInteger(state.fuseN) || state.fuseN < 2 || state.fuseN > 500)
      errs.push('El número de fusibles (N) debe ser un entero entre 2 y 500.');
    else if (!Number.isInteger(state.fuseK) || state.fuseK < 0 || state.fuseK > state.fuseN)
      errs.push('Los defectuosos (K) deben ser un entero entre 0 y N.');
  }
  return errs;
}

function showFormError(errs) {
  const box = $('#formError');
  if (errs.length) { box.textContent = errs.join(' '); box.hidden = false; }
  else box.hidden = true;
}

function describeEvent() {
  const th = getTheory();
  if (state.exp === 'dice') {
    const ways = 6 - Math.abs(state.target - 7);
    return {
      title: 'Experimento 1 · Lanzamiento de dos dados',
      text: `Se lanzan dos dados de 6 caras. El evento de interés es que la suma de las caras sea igual a ${state.target}.`,
      formula: `P(S = ${state.target}) = ${ways}/36 = ${fracStr(ways, 36)}<br><span class="eq-big">≈ ${nf(th.p, 4)}</span>`,
    };
  }
  const { fuseN: N, fuseK: K } = state;
  return {
    title: 'Experimento 2 · Extracción de fusibles (sin reemplazo)',
    text: `Una caja tiene ${N} fusibles, ${K} defectuosos. Se extraen 2 uno tras otro sin devolver el primero. Evento: ambos defectuosos.`,
    formula: `P = (${K}/${N}) × (${Math.max(K - 1, 0)}/${N - 1}) = ${fracStr(K * (K - 1), N * (N - 1))}<br><span class="eq-big">≈ ${nf(th.p, 4)}</span>`,
  };
}

function updateHeader() {
  const d = describeEvent();
  $('#eventTitle').textContent = d.title;
  $('#eventText').textContent = d.text;
  $('#formulaBox').innerHTML = d.formula;
}

/* ---------------------------------------------------------
   3. SIMULACIÓN MONTE CARLO
   --------------------------------------------------------- */
function makeCheckpoints(n) {
  const set = new Set([n]);
  const points = Math.min(n, 240);
  for (let k = 0; k < points; k++) {
    const frac = points > 1 ? k / (points - 1) : 0;
    set.add(Math.max(1, Math.round(Math.pow(n, frac))));
  }
  return Array.from(set).sort((a, b) => a - b);
}

/* Ejecuta n ensayos y devuelve instantáneas acumuladas */
function simulate(n, exp, params, rng) {
  const cps = makeCheckpoints(n);
  const nOutcomes = exp === 'dice' ? 11 : 3;
  const hist = new Array(nOutcomes).fill(0);
  const snaps = [];
  let succ = 0, sx = 0, sx2 = 0, ci = 0, next = cps[0];

  if (exp === 'dice') {
    const t = params.target;
    for (let i = 1; i <= n; i++) {
      const x = 2 + Math.floor(rng() * 6) + Math.floor(rng() * 6);
      hist[x - 2]++;
      if (x === t) succ++;
      sx += x; sx2 += x * x;
      if (i === next) { snaps.push({ n: i, succ, hist: hist.slice(), sx, sx2 }); next = cps[++ci]; }
    }
  } else {
    const { N, K } = params;
    for (let i = 1; i <= n; i++) {
      // Extracción sin reemplazo: el segundo índice se elige entre los N-1 restantes
      const a = Math.floor(rng() * N);
      let b = Math.floor(rng() * (N - 1));
      if (b >= a) b++;
      const x = (a < K ? 1 : 0) + (b < K ? 1 : 0);
      hist[x]++;
      if (x === 2) succ++;
      sx += x; sx2 += x * x;
      if (i === next) { snaps.push({ n: i, succ, hist: hist.slice(), sx, sx2 }); next = cps[++ci]; }
    }
  }
  return snaps;
}

/* Versión ligera: solo cuenta éxitos (para el análisis de error) */
function countSuccesses(n, exp, params, rng) {
  let succ = 0;
  if (exp === 'dice') {
    const t = params.target;
    for (let i = 0; i < n; i++) if (2 + Math.floor(rng() * 6) + Math.floor(rng() * 6) === t) succ++;
  } else {
    const { N, K } = params;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(rng() * N);
      let b = Math.floor(rng() * (N - 1));
      if (b >= a) b++;
      if (a < K && b < K) succ++;
    }
  }
  return succ;
}

/* ---------------------------------------------------------
   4. GRÁFICAS Y TEMA
   --------------------------------------------------------- */
const hasChart = () => typeof window.Chart !== 'undefined';

function themeColors() {
  return {
    text: cssVar('--muted'),
    strong: cssVar('--text'),
    grid: cssVar('--grid-line'),
    primary: cssVar('--primary'),
    primaryStrong: cssVar('--primary-strong'),
    accent: cssVar('--accent'),
    warn: cssVar('--warn'),
    danger: cssVar('--danger'),
    surface: cssVar('--surface-solid'),
    border: cssVar('--border-strong'),
  };
}

function applyChartDefaults() {
  if (!hasChart()) return;
  const c = themeColors();
  Chart.defaults.color = c.text;
  Chart.defaults.font.family = '"Inter", system-ui, sans-serif';
  Chart.defaults.borderColor = c.grid;
  Chart.defaults.plugins.tooltip.backgroundColor = c.surface;
  Chart.defaults.plugins.tooltip.titleColor = c.strong;
  Chart.defaults.plugins.tooltip.bodyColor = c.text;
  Chart.defaults.plugins.tooltip.borderColor = c.border;
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
}

function alpha(hex, a) {
  // Acepta #rrggbb o rgb(); devuelve rgba con alfa
  if (hex.startsWith('#')) {
    const h = hex.length === 4 ? hex.replace(/./g, (m, i) => (i ? m + m : m)) : hex;
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return hex;
}

function destroyCharts() {
  Object.keys(state.charts).forEach((k) => { if (state.charts[k]) { state.charts[k].destroy(); state.charts[k] = null; } });
}

function buildConvergenceChart(run) {
  if (!hasChart()) return;
  const c = themeColors();
  if (state.charts.conv) state.charts.conv.destroy();
  const { cps, theory } = run;
  const p = theory.p;
  const nMax = cps[cps.length - 1].n;
  const lower = cps.map((s) => ({ x: s.n, y: Math.max(0, p - 1.96 * Math.sqrt(p * (1 - p) / s.n)) }));
  const upper = cps.map((s) => ({ x: s.n, y: Math.min(1, p + 1.96 * Math.sqrt(p * (1 - p) / s.n)) }));
  const yMax = Math.min(1, Math.max(0.25, p * 2.4));

  state.charts.conv = new Chart($('#chConv'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'IC 95 % (inf.)', data: lower, borderColor: 'transparent', pointRadius: 0, fill: false, order: 5 },
        { label: 'Intervalo de confianza 95 %', data: upper, borderColor: 'transparent', backgroundColor: alpha(c.primary, 0.16), pointRadius: 0, fill: '-1', order: 4 },
        { label: 'Probabilidad teórica', data: [{ x: 1, y: p }, { x: nMax, y: p }], borderColor: c.warn, borderDash: [7, 5], borderWidth: 2, pointRadius: 0, order: 2 },
        { label: 'Frecuencia relativa simulada', data: [], borderColor: c.accent, backgroundColor: c.accent, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, tension: 0.15, order: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: {
        x: { type: state.logScale, min: 1, max: nMax, title: { display: true, text: 'Número de ensayos (n)' }, grid: { color: c.grid },
             ticks: { callback: (v) => (state.logScale === 'logarithmic' ? ([1, 10, 100, 1e3, 1e4, 1e5, 1e6].includes(v) ? nInt(v) : '') : nInt(v)) , maxRotation: 0 } },
        y: { min: 0, max: yMax, title: { display: true, text: 'Frecuencia relativa' }, grid: { color: c.grid }, ticks: { callback: (v) => nf(v, 2) } },
      },
      plugins: {
        legend: { labels: { filter: (item) => item.text !== 'IC 95 % (inf.)' } },
        tooltip: {
          filter: (item) => item.datasetIndex === 3,
          callbacks: {
            title: (items) => `n = ${nInt(items[0].parsed.x)}`,
            label: (item) => ` Frecuencia: ${nf(item.parsed.y, 4)}  (teórica ${nf(p, 4)})`,
          },
        },
      },
    },
  });
}

function buildCompareChart() {
  if (!hasChart()) return;
  const c = themeColors();
  if (state.charts.cmp) state.charts.cmp.destroy();
  state.charts.cmp = new Chart($('#chCmp'), {
    type: 'bar',
    data: {
      labels: ['Teórica', 'Simulada'],
      datasets: [{
        data: [0, 0],
        backgroundColor: [alpha(c.primary, 0.85), alpha(c.accent, 0.85)],
        borderColor: [c.primary, c.accent], borderWidth: 2, borderRadius: 12, maxBarThickness: 90,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      scales: {
        y: { beginAtZero: true, grid: { color: c.grid }, title: { display: true, text: 'Probabilidad (%)' }, ticks: { callback: (v) => nf(v, 1) } },
        x: { grid: { display: false } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => ` ${nf(i.parsed.y, 3)} %` } } },
    },
  });
}

function buildDistChart(theory) {
  if (!hasChart()) return;
  const c = themeColors();
  if (state.charts.dist) state.charts.dist.destroy();
  const targetColors = theory.labels.map((_, i) => (i === theory.targetIdx ? c.accent : alpha(c.primary, 0.8)));
  state.charts.dist = new Chart($('#chDist'), {
    type: 'bar',
    data: {
      labels: theory.labels,
      datasets: [
        { label: 'Simulada', data: theory.labels.map(() => 0), backgroundColor: targetColors, borderRadius: 8, order: 2 },
        { label: 'Teórica', type: 'line', data: theory.probs.map((x) => x * 100), borderColor: c.warn, backgroundColor: c.warn, borderWidth: 2.5, pointRadius: 5, pointHoverRadius: 7, tension: 0.2, order: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      scales: {
        y: { beginAtZero: true, grid: { color: c.grid }, title: { display: true, text: 'Frecuencia relativa (%)' }, ticks: { callback: (v) => nf(v, 0) } },
        x: { grid: { display: false }, title: { display: true, text: theory.varName } },
      },
      plugins: { tooltip: { callbacks: { label: (i) => ` ${i.dataset.label}: ${nf(i.parsed.y, 2)} %` } } },
    },
  });
}

/* ---------------------------------------------------------
   5. RENDERIZADO DE RESULTADOS Y ANIMACIÓN
   --------------------------------------------------------- */
function buildFreqTableSkeleton(theory) {
  $('#thValue').textContent = state.exp === 'dice' ? 'Suma' : 'Defectuosos';
  const tb = $('#freqTable tbody');
  tb.innerHTML = '';
  theory.labels.forEach((lab, i) => {
    const tr = document.createElement('tr');
    if (i === theory.targetIdx) tr.classList.add('is-target');
    tr.innerHTML = `<td>${state.exp === 'dice' ? lab : theory.values[i]}</td><td class="num"></td><td class="num"></td><td class="num">${pct(theory.probs[i])}</td><td class="num"></td>
      <td class="barcol"><div class="minibar"><i style="width:0"></i><b style="left:${Math.min(theory.probs[i] * 100 / maxProb(theory) * 0.92, 100)}%"></b></div></td>`;
    tb.appendChild(tr);
  });
}
const maxProb = (th) => Math.max(...th.probs, 1e-9);

function renderSnapshot(idx) {
  const run = state.run;
  if (!run) return;
  const { cps, theory } = run;
  const s = cps[idx];
  const p = theory.p;
  const f = s.succ / s.n;
  const abs = Math.abs(f - p);
  const rel = p > 0 ? abs / p : NaN;
  const half = 1.96 * Math.sqrt(p * (1 - p) / s.n);
  const mean = s.sx / s.n;
  const variance = s.n > 1 ? (s.sx2 - s.n * mean * mean) / (s.n - 1) : 0;

  $('#kTheory').textContent = nf(p, 4);
  $('#kTheorySub').textContent = pct(p, 3);
  $('#kEmp').textContent = nf(f, 4);
  $('#kEmpSub').textContent = pct(f, 3);
  $('#kAbs').textContent = nf(abs, 4);
  $('#kAbsSub').textContent = `${nf(abs * 100, 3)} puntos porcentuales`;
  $('#kRel').textContent = Number.isFinite(rel) ? pct(rel, 2) : '—';
  $('#kRelSub').textContent = '|f − p| / p';
  $('#kCI').textContent = `±${nf(half, 4)}`;
  const inside = abs <= half;
  $('#kCISub').textContent = inside ? 'La simulación cae dentro del IC' : 'Fuera del IC (poco habitual)';
  $('#kMeanLabel').textContent = `Media de ${theory.varShort}`;
  $('#kMean').textContent = nf(mean, 4);
  $('#kMeanSub').textContent = `Teórica: ${nf(theory.mean, 4)}`;
  $('#kVarLabel').textContent = `Varianza de ${theory.varShort}`;
  $('#kVar').textContent = nf(variance, 4);
  $('#kVarSub').textContent = `Teórica: ${nf(theory.variance, 4)}`;
  $('#kN').textContent = nInt(s.n);
  $('#kNSub').textContent = `${nInt(s.succ)} éxitos`;

  // Gráfica de convergencia
  if (state.charts.conv) {
    state.charts.conv.data.datasets[3].data = cps.slice(0, idx + 1).map((q) => ({ x: q.n, y: q.succ / q.n }));
    state.charts.conv.update('none');
  }
  // Comparación
  if (state.charts.cmp) {
    state.charts.cmp.data.datasets[0].data = [p * 100, f * 100];
    state.charts.cmp.options.scales.y.suggestedMax = Math.max(p, f) * 100 * 1.25;
    state.charts.cmp.update();
  }
  // Distribución + tabla
  const rows = $$('#freqTable tbody tr');
  const dmax = maxProb(theory);
  const freqs = s.hist.map((h) => h / s.n);
  if (state.charts.dist) {
    state.charts.dist.data.datasets[0].data = freqs.map((x) => x * 100);
    state.charts.dist.update();
  }
  rows.forEach((tr, i) => {
    const cells = tr.children;
    const diff = freqs[i] - theory.probs[i];
    cells[1].textContent = nInt(s.hist[i]);
    cells[2].textContent = pct(freqs[i], 2);
    cells[4].textContent = (diff >= 0 ? '+' : '−') + nf(Math.abs(diff) * 100, 2) + ' pp';
    cells[4].className = 'num ' + (Math.abs(diff) < 0.01 ? 'pos' : 'neg');
    $('i', cells[5]).style.width = Math.min(freqs[i] / dmax * 92, 100) + '%';
  });

  // Veredicto
  const v = $('#verdict');
  const done = idx === cps.length - 1;
  if (done) {
    const good = inside;
    v.className = 'verdict ' + (good ? 'good' : 'warn');
    v.innerHTML = `<span class="v-ico">${good ? '✅' : '⚠️'}</span><span>
      Con <b>n = ${nInt(s.n)}</b> la frecuencia simulada es <b>${nf(f, 4)}</b> frente a la teórica <b>${nf(p, 4)}</b>
      (error absoluto ${nf(abs, 4)}). ${good
        ? 'El resultado cae dentro del intervalo de confianza del 95 %: <b>la teoría tiene razón</b>.'
        : 'Queda fuera del intervalo del 95 %. Esto ocurre ≈5 % de las veces; vuelve a simular o aumenta n.'}
      ${s.n < 500 ? ' Con pocos ensayos la variabilidad es alta: prueba con más repeticiones.' : ''}</span>`;
  } else {
    v.className = 'verdict';
    v.innerHTML = '<span class="v-ico">⏳</span><span>Simulando… observa cómo la curva se estabiliza alrededor del valor teórico.</span>';
  }
}

function setProgress(i, total, n) {
  $('#progressFill').style.width = ((i + 1) / total * 100) + '%';
  $('#progressText').textContent = `Ensayo ${nInt(n)} de ${nInt(state.run.cps[total - 1].n)}`;
}

function stopAnimation() {
  if (state.animId) cancelAnimationFrame(state.animId);
  state.animId = null;
  state.animating = false;
  $('#runBtn').disabled = false;
  $('#runLabel').textContent = 'Simular';
  $('#progressWrap').hidden = true;
}

function runSimulation() {
  if (state.animating) {   // el botón actúa como "Saltar animación"
    stopAnimation();
    renderSnapshot(state.run.cps.length - 1);
    return;
  }
  readInputs();
  const errs = validate();
  showFormError(errs);
  if (errs.length) return;
  if (!hasChart()) { $('#chartWarn').hidden = false; }

  const theory = getTheory();
  const rng = makeRng($('#seedInput').value);
  const t0 = performance.now();
  const cps = simulate(state.n, state.exp, currentParams(), rng);
  const ms = performance.now() - t0;
  state.run = { cps, theory, exp: state.exp, params: currentParams() };

  updateHeader();
  $('#emptyState').hidden = true;
  $('#resultsBody').hidden = false;
  buildConvergenceChart(state.run);
  buildCompareChart();
  buildDistChart(theory);
  buildFreqTableSkeleton(theory);
  stopAnimation();

  const animate = $('#animToggle').checked && cps.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate) {
    renderSnapshot(cps.length - 1);
    toast(`Simulación completada en ${nf(ms, 1)} ms`);
    return;
  }

  state.animating = true;
  $('#runLabel').textContent = 'Saltar animación';
  $('#progressWrap').hidden = false;
  const duration = 2600;
  const start = performance.now();
  let last = -1;
  const frame = (now) => {
    const prog = Math.min((now - start) / duration, 1);
    // easing suave: más lento al inicio, donde ocurre la mayor variación
    const idx = Math.min(cps.length - 1, Math.floor(Math.pow(prog, 0.85) * cps.length));
    if (idx !== last) { last = idx; renderSnapshot(idx); setProgress(idx, cps.length, cps[idx].n); }
    if (prog < 1) state.animId = requestAnimationFrame(frame);
    else { stopAnimation(); renderSnapshot(cps.length - 1); toast(`Simulación completada en ${nf(ms, 1)} ms`); }
  };
  state.animId = requestAnimationFrame(frame);
}

function resetResults() {
  stopAnimation();
  state.run = null;
  destroyCharts();
  $('#resultsBody').hidden = true;
  $('#emptyState').hidden = false;
  $('#verdict').className = 'verdict';
  $('#verdict').innerHTML = '';
}

/* ---------------------------------------------------------
   6. PRUEBA MANUAL
   --------------------------------------------------------- */
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
function dieHTML(v) {
  let h = '<div class="die" role="img" aria-label="Dado con ' + v + '">';
  for (let i = 1; i <= 9; i++) h += `<span class="${PIPS[v].includes(i) ? 'on' : ''}"></span>`;
  return h + '</div>';
}

function manualIdle() {
  const stage = $('#manualStage');
  if (state.exp === 'dice') {
    $('#manualDesc').textContent = `Lanza los dados una vez. Éxito si la suma es ${state.target}.`;
    $('#manualLabel').textContent = 'Lanzar dados';
    stage.innerHTML = '<p class="manual-hint">Pulsa «Lanzar dados» para tirar.</p>';
  } else {
    $('#manualDesc').textContent = 'Extrae 2 fusibles sin reemplazo. Éxito si ambos son defectuosos.';
    $('#manualLabel').textContent = 'Extraer 2 fusibles';
    if (state.fuseN <= 100) stage.innerHTML = fuseGridHTML(state.fuseN, state.fuseK, []) ;
    else stage.innerHTML = '<p class="manual-hint">Pulsa «Extraer 2 fusibles» (la caja es demasiado grande para dibujarla).</p>';
  }
  updateManualFoot();
}

function fuseGridHTML(N, K, picked) {
  let h = '<div class="fuse-grid" role="img" aria-label="Caja de fusibles">';
  for (let i = 0; i < N; i++) h += `<span class="fuse ${i < K ? 'bad' : ''} ${picked.includes(i) ? 'picked' : ''}"></span>`;
  return h + '</div>';
}

function manualTrial() {
  readInputs();
  const stage = $('#manualStage');
  let hit = false, msg = '';
  if (state.exp === 'dice') {
    const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
    hit = d1 + d2 === state.target;
    msg = `Suma = ${d1 + d2} ${hit ? '· ¡Éxito!' : '· No coincide'}`;
    stage.innerHTML = `<div><div class="dice-pair">${dieHTML(d1)}${dieHTML(d2)}</div><p class="manual-result ${hit ? 'hit' : 'miss'}">${msg}</p></div>`;
  } else {
    const { fuseN: N, fuseK: K } = state;
    if (N < 2 || K < 0 || K > N) { toast('Revisa los parámetros de los fusibles'); return; }
    const a = Math.floor(Math.random() * N);
    let b = Math.floor(Math.random() * (N - 1)); if (b >= a) b++;
    const da = a < K, db = b < K;
    hit = da && db;
    msg = `1.º ${da ? 'defectuoso' : 'bueno'} · 2.º ${db ? 'defectuoso' : 'bueno'} ${hit ? '· ¡Éxito!' : ''}`;
    const grid = N <= 100 ? fuseGridHTML(N, K, [a, b]) : '';
    stage.innerHTML = `<div>${grid}<p class="manual-result ${hit ? 'hit' : 'miss'}">${msg}</p></div>`;
  }
  state.manual.trials++;
  if (hit) state.manual.hits++;
  updateManualFoot();
}

function updateManualFoot() {
  const { trials, hits } = state.manual;
  $('#mTrials').textContent = nInt(trials);
  $('#mHits').textContent = nInt(hits);
  $('#mFreq').textContent = trials ? nf(hits / trials, 3) : '—';
}

/* ---------------------------------------------------------
   7. ANÁLISIS DE ERROR
   --------------------------------------------------------- */
const ERR_NS = [10, 100, 1000, 10000, 100000];
let errRunning = false;

function refreshErrorHeader() {
  readInputs();
  const th = getTheory();
  $('#errExpName').textContent = state.exp === 'dice' ? `Dos dados · P(suma = ${state.target})` : `Fusibles · N = ${state.fuseN}, K = ${state.fuseK}`;
  $('#errExpP').textContent = `Probabilidad teórica p = ${nf(th.p, 5)}`;
}

function runErrorAnalysis() {
  if (errRunning) return;
  readInputs();
  const errs = validate().filter((e) => !e.startsWith('El número de simulaciones'));
  if (errs.length) { toast(errs[0]); return; }
  const reps = Math.floor(Number($('#errReps').value));
  if (!(reps >= 5 && reps <= 200)) { toast('Las repeticiones deben estar entre 5 y 200'); return; }

  const th = getTheory();
  const p = th.p;
  const params = currentParams();
  const exp = state.exp;
  const rng = makeRng($('#seedInput').value);
  const rows = [];
  errRunning = true;
  $('#errRun').disabled = true;
  $('#errProgressWrap').hidden = false;
  $('#errBody').hidden = true;

  let k = 0;
  const step = () => {
    const n = ERR_NS[k];
    let sum = 0;
    for (let r = 0; r < reps; r++) sum += Math.abs(countSuccesses(n, exp, params, rng) / n - p);
    const mae = sum / reps;
    const expected = Math.sqrt(2 / Math.PI) * Math.sqrt(p * (1 - p) / n);
    rows.push({ n, mae, expected, rel: p > 0 ? mae / p : NaN });
    k++;
    $('#errProgressFill').style.width = (k / ERR_NS.length * 100) + '%';
    $('#errProgressText').textContent = `Procesando n = ${nInt(n)} (${reps} repeticiones)…`;
    if (k < ERR_NS.length) setTimeout(step, 20);
    else finishErrorAnalysis(rows, p, reps);
  };
  setTimeout(step, 30);
}

function finishErrorAnalysis(rows, p, reps) {
  errRunning = false;
  $('#errRun').disabled = false;
  $('#errProgressWrap').hidden = true;
  $('#errBody').hidden = false;

  const tb = $('#errTable tbody');
  tb.innerHTML = rows.map((r) => `<tr><td>${nInt(r.n)}</td><td class="num">${nf(r.mae, 5)}</td><td class="num">${nf(r.expected, 5)}</td><td class="num">${Number.isFinite(r.rel) ? pct(r.rel, 1) : '—'}</td></tr>`).join('');

  const first = rows[0], last = rows[rows.length - 1];
  $('#errNote').textContent = p > 0 && last.mae > 0
    ? `Al pasar de n = ${nInt(first.n)} a n = ${nInt(last.n)} (×${nInt(last.n / first.n)}), el error medio bajó ≈ ${nf(first.mae / last.mae, 1)} veces; la teoría 1/√n predice ≈ ${nf(Math.sqrt(last.n / first.n), 1)} veces. Cada punto es el promedio de ${reps} simulaciones.`
    : 'La probabilidad teórica es 0: el evento es imposible y el error es siempre 0.';

  state.errData = rows;
  buildErrChart(rows);
}

function buildErrChart(rows) {
  if (!hasChart()) return;
  const c = themeColors();
  const first = rows[0];
  if (state.charts.err) state.charts.err.destroy();
  const valid = (v) => (v > 0 ? v : null);
  const ref = rows.map((r) => ({ x: r.n, y: valid(first.mae * Math.sqrt(first.n / r.n)) }));
  state.charts.err = new Chart($('#chErr'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'Error medio simulado', data: rows.map((r) => ({ x: r.n, y: valid(r.mae) })), borderColor: c.accent, backgroundColor: c.accent, borderWidth: 3, pointRadius: 6, pointHoverRadius: 8, tension: 0.15 },
        { label: 'Error esperado √(2/π)·√(p(1−p)/n)', data: rows.map((r) => ({ x: r.n, y: valid(r.expected) })), borderColor: c.primary, backgroundColor: c.primary, borderWidth: 2, pointRadius: 4, tension: 0.15 },
        { label: 'Referencia 1/√n', data: ref, borderColor: c.warn, borderDash: [6, 5], borderWidth: 2, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      scales: {
        x: { type: 'logarithmic', title: { display: true, text: 'n (escala log)' }, grid: { color: c.grid }, ticks: { callback: (v) => ([10, 100, 1e3, 1e4, 1e5].includes(v) ? nInt(v) : '') } },
        y: { type: 'logarithmic', title: { display: true, text: 'Error absoluto (escala log)' }, grid: { color: c.grid }, ticks: { callback: (v) => { const m = Math.round(v / Math.pow(10, Math.floor(Math.log10(v)))); return [1, 2, 5].includes(m) ? nf(v, v < 0.001 ? 4 : 3) : ''; } } },
      },
      plugins: { tooltip: { callbacks: { title: (i) => `n = ${nInt(i[0].parsed.x)}`, label: (i) => ` ${i.dataset.label}: ${nf(i.parsed.y, 5)}` } } },
    },
  });
}

/* ---------------------------------------------------------
   8. SECCIÓN DE TEORÍA
   --------------------------------------------------------- */
function renderSumChips() {
  const box = $('#sumChips');
  box.innerHTML = '';
  for (let s = 2; s <= 12; s++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (s === state.target ? ' is-active' : '');
    b.textContent = s;
    b.addEventListener('click', () => setTarget(s));
    box.appendChild(b);
  }
}

function renderDiceGrid() {
  const t = state.target;
  let h = '<thead><tr><th class="corner">D1\\D2</th>' + [1, 2, 3, 4, 5, 6].map((j) => `<th>${j}</th>`).join('') + '</tr></thead><tbody>';
  let ways = 0;
  for (let i = 1; i <= 6; i++) {
    h += `<tr><th>${i}</th>`;
    for (let j = 1; j <= 6; j++) {
      const hit = i + j === t;
      if (hit) ways++;
      h += `<td class="${hit ? 'hit' : ''}" data-s="${i + j}" title="(${i}, ${j}) → suma ${i + j}">${i + j}</td>`;
    }
    h += '</tr>';
  }
  $('#diceGrid').innerHTML = h + '</tbody>';
  $$('#diceGrid td').forEach((td) => td.addEventListener('click', () => setTarget(Number(td.dataset.s))));
  $('#diceCallout').innerHTML = `Espacio muestral: <b>36</b> resultados. Casos favorables para suma ${t}: <b>${ways}</b>. Por lo tanto <b>P(S = ${t}) = ${ways}/36 = ${fracStr(ways, 36)} ≈ ${nf(ways / 36, 4)}</b>.`;
}

function renderFuseTree() {
  const { fuseN: N, fuseK: K } = state;
  if (!(N >= 2 && K >= 0 && K <= N)) { $('#fuseTree').innerHTML = '<p class="muted">Parámetros no válidos.</p>'; return; }
  const G = N - K, T = N * (N - 1);
  const f = (a, b) => fracStr(a, b);
  const leaf = (label, num, target) => `<div class="t-leaf ${target ? 'target' : ''}"><span>${label}</span><b>${f(num, T)} ≈ ${nf(num / T, 4)}</b></div>`;
  const branch = (nodeCls, nodeText, nodeProb, leaves) =>
    `<div class="t-branch"><div class="t-node ${nodeCls}">${nodeText}<small>${nodeProb}</small></div><div class="t-leaves">${leaves}</div></div>`;
  $('#fuseTree').innerHTML =
    `<span class="t-root">Caja: ${N} fusibles (${K} defectuosos, ${G} buenos)</span>` +
    branch('bad', '1.º defectuoso', `${f(K, N)}`,
      leaf(`2.º defectuoso <small>(${Math.max(K - 1, 0)}/${N - 1})</small>`, K * (K - 1), true) +
      leaf(`2.º bueno <small>(${G}/${N - 1})</small>`, K * G, false)) +
    branch('good', '1.º bueno', `${f(G, N)}`,
      leaf(`2.º defectuoso <small>(${K}/${N - 1})</small>`, G * K, false) +
      leaf(`2.º bueno <small>(${Math.max(G - 1, 0)}/${N - 1})</small>`, G * (G - 1), false));
  $('#fuseCallout').innerHTML = `Regla del producto: <b>P(DD) = P(D₁) · P(D₂|D₁) = ${f(K, N)} × ${f(Math.max(K - 1, 0), N - 1)} = ${f(K * (K - 1), T)} ≈ ${nf(K * (K - 1) / T, 4)}</b>.`;
}

function renderTheory() { renderSumChips(); renderDiceGrid(); renderFuseTree(); }

function setTarget(s) {
  state.target = s;
  $('#diceTarget').value = String(s);
  renderTheory();
  updateHeader();
  refreshErrorHeader();
  manualIdle();
  state.manual = { trials: 0, hits: 0 }; updateManualFoot();
}

/* ---------------------------------------------------------
   9. NAVEGACIÓN, TEMA Y EVENTOS
   --------------------------------------------------------- */
function showTab(name, pushHash = true) {
  const valid = ['simulador', 'error', 'teoria', 'acerca'];
  if (!valid.includes(name)) name = 'simulador';
  $$('.view').forEach((v) => { const on = v.id === 'tab-' + name; v.hidden = !on; v.classList.toggle('is-active', on); });
  $$('.tab').forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
  if (pushHash) history.replaceState(null, '', '#' + name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'error') refreshErrorHeader();
  if (name === 'teoria') renderTheory();
  // Redimensiona gráficas que estaban ocultas
  setTimeout(() => Object.values(state.charts).forEach((ch) => ch && ch.resize()), 60);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('sp-theme', theme); } catch (e) {}
  $('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#0b1020' : '#f3f5fc');
  if (hasChart()) {
    applyChartDefaults();
    if (state.run) {
      buildConvergenceChart(state.run); buildCompareChart(); buildDistChart(state.run.theory);
      renderSnapshot(state.animating ? 0 : state.run.cps.length - 1);
    }
    if (state.errData && !$('#errBody').hidden) buildErrChart(state.errData);
  }
}
function syncRangeFromN(n) {
  $('#nRange').value = Math.log10(Math.max(1, n)).toFixed(2);
  $$('#nChips .chip').forEach((c) => c.classList.toggle('is-active', Number(c.dataset.n) === n));
}

function onExperimentChange() {
  readInputs();
  $('#params-dice').hidden = state.exp !== 'dice';
  $('#params-fuses').hidden = state.exp !== 'fuses';
  showFormError([]);
  resetResults();
  updateHeader();
  state.manual = { trials: 0, hits: 0 };
  manualIdle();
  renderTheory();
  refreshErrorHeader();
  $('#errBody').hidden = true;
}

function init() {
  applyChartDefaults();
  if (!hasChart()) $('#chartWarn').hidden = false;

  // Navegación
  $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  $$('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); showTab(a.dataset.go); }));
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1), false));

  // Tema
  $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

  // Experimento y parámetros
  $$('input[name="exp"]').forEach((r) => r.addEventListener('change', onExperimentChange));
  $('#diceTarget').addEventListener('change', () => { setTarget(parseInt($('#diceTarget').value, 10)); resetResults(); });
  ['#fuseN', '#fuseK'].forEach((s) => $(s).addEventListener('input', () => {
    readInputs(); updateHeader(); renderFuseTree(); refreshErrorHeader(); manualIdle(); state.manual = { trials: 0, hits: 0 }; updateManualFoot();
  }));

  // n: chips, input y slider (escala logarítmica)
  $$('#nChips .chip').forEach((c) => c.addEventListener('click', () => { const n = Number(c.dataset.n); $('#nInput').value = n; syncRangeFromN(n); }));
  $('#nInput').addEventListener('input', () => { const n = Number($('#nInput').value); if (n >= 1) syncRangeFromN(Math.min(n, MAX_N)); });
  $('#nRange').addEventListener('input', () => {
    const n = Math.round(Math.pow(10, Number($('#nRange').value)));
    $('#nInput').value = n;
    $$('#nChips .chip').forEach((c) => c.classList.toggle('is-active', Number(c.dataset.n) === n));
  });

  // Botones principales
  $('#runBtn').addEventListener('click', runSimulation);
  $('#resetBtn').addEventListener('click', () => { resetResults(); showFormError([]); toast('Resultados reiniciados'); });
  $$('#nInput, #seedInput, #fuseN, #fuseK').forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSimulation(); }));

  // Escala del gráfico de convergencia
  $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    $$('.seg-btn').forEach((x) => x.classList.toggle('is-active', x === b));
    state.logScale = b.dataset.scale;
    if (state.run) {
      buildConvergenceChart(state.run);
      renderSnapshot(state.animating ? 0 : state.run.cps.length - 1);
    }
  }));

  // Prueba manual y análisis de error
  $('#manualBtn').addEventListener('click', manualTrial);
  $('#manualReset').addEventListener('click', () => { state.manual = { trials: 0, hits: 0 }; manualIdle(); });
  $('#errRun').addEventListener('click', runErrorAnalysis);

  // Estado inicial
  readInputs();
  syncRangeFromN(state.n);
  updateHeader();
  manualIdle();
  renderTheory();
  refreshErrorHeader();
  showTab(location.hash ? location.hash.slice(1) : 'simulador', false);
}

document.addEventListener('DOMContentLoaded', init);
