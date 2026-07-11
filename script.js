/* ============ Data preloader ============
   Loads the two big payloads from /data before the visualisation IIFEs
   reach for them via document.getElementById('panesPayload'|'extraPayload').
   Original IIFEs read from a <script id="..." type="application/json"> tag;
   we now fetch the JSON, then inject those same tags into the DOM so the
   downstream code can keep its existing textContent read pattern unchanged. */
window.__runWhenDataReady = function(fn){
  if (window.__DATA_READY) fn();
  else document.addEventListener('data-ready', fn, { once: true });
};
(async function preloadData(){
  const [panes, extra] = await Promise.all([
    fetch('data/panes.json').then(r => r.text()),
    fetch('data/extra.json').then(r => r.text())
  ]);
  function inject(id, text){
    const s = document.createElement('script');
    s.id = id;
    s.type = 'application/json';
    s.textContent = text;
    document.body.appendChild(s);
  }
  inject('panesPayload', panes);
  inject('extraPayload', extra);
  window.__DATA_READY = true;
  document.dispatchEvent(new Event('data-ready'));
})();

/* ============ Left-nav routing ============
   Findings and Fetching are separate top-level views (view swap).
   Physicalisation lives inside Findings — clicking it scrolls to that section
   instead of switching views, so the visitor stays in the chart context.
*/
(function () {
  const views = Array.from(document.querySelectorAll('.view'));
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const findingsView = document.getElementById('view-findings');
  const physSection = document.getElementById('view-physicalisation');

  function activate(view) {
    if (view === 'physicalisation') {
      // Ensure the findings view is showing, then scroll to the physicalisation section.
      views.forEach(v => v.classList.toggle('active', v.id === 'view-findings'));
      navLinks.forEach(a => a.classList.toggle('active', a.dataset.view === 'physicalisation'));
      requestAnimationFrame(() => {
        if (physSection) physSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    views.forEach(v => v.classList.toggle('active', v.dataset.view === view));
    navLinks.forEach(a => a.classList.toggle('active', a.dataset.view === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navLinks.forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      activate(a.dataset.view);
    });
  });
})();

/* ============ Physicalisation gallery — thumbs, view, prev/next arrows ============ */
(function () {
  document.querySelectorAll('.phys-thumbs').forEach(group => {
    const targetId = group.dataset.target;
    const viewer = document.getElementById(targetId);
    if (!viewer) return;
    const thumbs = Array.from(group.querySelectorAll('.phys-thumb'));
    const counter = viewer.querySelector('.phys-counter');
    let currentIdx = 0;

    function show(idx) {
      if (idx < 0) idx = thumbs.length - 1;
      if (idx >= thumbs.length) idx = 0;
      currentIdx = idx;
      const btn = thumbs[idx];
      const src = btn.dataset.src;
      viewer.style.backgroundImage = 'url("' + src + '")';
      viewer.classList.add('loaded');
      thumbs.forEach((b, i) => b.classList.toggle('active', i === idx));
      if (counter) counter.textContent = (idx + 1) + ' / ' + thumbs.length;
    }

    thumbs.forEach((b, i) => {
      // Give every thumb its background so the "windows" grid stays visually
      // dense — placeholder path is fine, dark facade shows through until the
      // real image loads.
      b.style.backgroundImage = 'url("' + b.dataset.src + '")';
      b.addEventListener('click', () => show(i));
    });

    viewer.querySelectorAll('.phys-arrow').forEach(arrow => {
      const dir = parseInt(arrow.dataset.dir, 10);
      arrow.addEventListener('click', () => show(currentIdx + dir));
    });

    // Preload the first active thumbnail on mount.
    const initialActive = thumbs.findIndex(b => b.classList.contains('active'));
    show(initialActive >= 0 ? initialActive : 0);
  });
})();

/* ============ Warming bar chart ============ */
(async function () {
  const svg = d3.select('#warmingChart');
  const tooltip = d3.select('#warmingTooltip');
  if (svg.empty()) return;
  let raw;
  try { raw = await fetch('data/warming.json').then(r => r.json()); }
  catch (e) { console.error('Failed to load warming data:', e); return; }
  const rows = raw
    .map(r => ({ year: r[0], temp: r[1] }))
    .filter(r => Number.isFinite(r.year) && Number.isFinite(r.temp));
  if (!rows.length) return;
  const W = 900, H = 420;
  const margin = { top: 24, right: 64, bottom: 50, left: 18 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const tempExtent = d3.extent(rows, r => r.temp);
  const tempScale = d3.scaleLinear()
    .domain([Math.min(0, tempExtent[0]), tempExtent[1]])
    .range([0, 1]).clamp(true);
  const hueScale = d3.scaleLinear()
    .domain([0, 0.33, 0.66, 1])
    .range(['#fff2b0', '#fde047', '#f59e0b', '#c2410c'])
    .interpolate(d3.interpolateRgb).clamp(true);
  const yellowMix = '#fde047';
  rows.forEach((r, i) => {
    const baseColor = hueScale(tempScale(r.temp));
    if (i === 0) { r.delta = 0; r.color = baseColor; }
    else {
      r.delta = r.temp - rows[i - 1].temp;
      r.color = (r.delta < 0) ? d3.interpolateRgb(baseColor, yellowMix)(0.28) : baseColor;
    }
  });
  const x = d3.scaleBand().domain(rows.map(r => r.year)).range([0, innerW]).padding(0.18);
  const tempMin = Math.min(0, d3.min(rows, r => r.temp));
  const tempMax = Math.max(1.6, d3.max(rows, r => r.temp));
  const y = d3.scaleLinear().domain([tempMin, tempMax * 1.05]).nice().range([innerH, 0]);
  const g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
  const yTicks = y.ticks(6);
  g.append('g').selectAll('line').data(yTicks).enter().append('line')
    .attr('class', 'gridline').attr('x1', 0).attr('x2', innerW)
    .attr('y1', d => y(d)).attr('y2', d => y(d));
  g.append('g').selectAll('text').data(yTicks).enter().append('text')
    .attr('class', 'axis-tick').attr('x', innerW + 10).attr('y', d => y(d))
    .attr('text-anchor', 'start').attr('dy', '0.32em')
    .text(d => d.toFixed(1) + '°');
  const xTickYears = rows.map(r => r.year).filter(yr => yr % 5 === 0 || yr === rows[rows.length - 1].year);
  g.append('g').selectAll('text').data(xTickYears).enter().append('text')
    .attr('class', 'axis-tick').attr('x', d => x(d) + x.bandwidth() / 2)
    .attr('y', innerH + 16).attr('text-anchor', 'middle').text(d => d);
  g.append('text').attr('class', 'axis-label')
    .attr('transform', 'translate(' + (innerW + 50) + ',' + (innerH / 2) + ') rotate(90)')
    .attr('text-anchor', 'middle').text('°C above 1850–1900');
  g.append('text').attr('class', 'axis-label')
    .attr('x', innerW / 2).attr('y', innerH + 40)
    .attr('text-anchor', 'middle').text('Year');
  g.append('line').attr('x1', 0).attr('x2', innerW)
    .attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', '#9ca3af').attr('stroke-width', 1)
    .attr('shape-rendering', 'crispEdges');
  g.append('line').attr('x1', 0).attr('x2', innerW)
    .attr('y1', y(1.5)).attr('y2', y(1.5))
    .attr('stroke', '#c0382f').attr('stroke-width', 2.5)
    .attr('stroke-dasharray', '8 5');
  g.append('text').attr('class', 'axis-tick')
    .attr('x', 4).attr('y', y(1.5) - 6)
    .attr('fill', '#c0382f').style('font-weight', '600')
    .text('1.5 °C threshold');
  const wrapNode = document.getElementById('warmingChartWrap');
  g.selectAll('rect.bar').data(rows).enter().append('rect')
    .attr('class', 'bar').attr('x', r => x(r.year))
    .attr('y', r => y(Math.max(0, r.temp)))
    .attr('width', x.bandwidth())
    .attr('height', r => Math.abs(y(r.temp) - y(0)))
    .attr('fill', r => r.color)
    .attr('stroke', '#0000000d').attr('stroke-width', 0.3)
    .on('mousemove', function (event, r) {
      const rect = wrapNode.getBoundingClientRect();
      const px = event.clientX - rect.left + 12;
      const py = event.clientY - rect.top + 12;
      const deltaTxt = r.delta === 0 ? '—' : (r.delta > 0 ? '+' : '') + r.delta.toFixed(3) + '°';
      tooltip.style('left', px + 'px').style('top', py + 'px')
        .style('opacity', 1)
        .html(r.year + ' · ' + r.temp.toFixed(3) + '°C<br/>Δ vs prev: ' + deltaTxt);
    })
    .on('mouseleave', function () { tooltip.style('opacity', 0); });
})();

/* ============ Panes of Heat — animated dumbbell panel (all cities) ============ */
window.__runWhenDataReady(function () {
  const payload = JSON.parse(document.getElementById('panesPayload').textContent);
  const DATA = payload.data;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const NS = 'http://www.w3.org/2000/svg';
  const CITY_DISPLAY = { delhi: 'Delhi', mumbai: 'Mumbai', chennai: 'Chennai', kolkata: 'Kolkata' };

  const COLOR_ACTUAL    = '#f59e0b';
  const COLOR_FELT      = '#e8202a';
  const COLOR_FELT_COOL = '#1f6fb0';
  const HOT_RAMP = [
    [255,245,200],[253,215,130],[248,160,70],[225,85,45],[165,20,20]
  ];
  const COOL_RAMP = [
    [241,233,196],[192,215,218],[120,175,210],[50,112,175],[17,55,110]
  ];
  function rampColor(stops, k) {
    const n = stops.length - 1;
    const t = Math.max(0, Math.min(1, k));
    const p = t * n;
    const i = Math.min(n - 1, Math.floor(p));
    const f = p - i;
    const a = stops[i], b = stops[i + 1];
    const r = Math.round(a[0] + (b[0]-a[0]) * f);
    const g = Math.round(a[1] + (b[1]-a[1]) * f);
    const c = Math.round(a[2] + (b[2]-a[2]) * f);
    return 'rgb(' + r + ',' + g + ',' + c + ')';
  }

  // Shared y-domain
  let yMax = 0;
  Object.values(DATA).forEach(cityD => {
    Object.values(cityD.hourly).forEach(hr => {
      hr.t2m.forEach(v => { if (v != null && v > yMax) yMax = v; });
      hr.utci.forEach(v => { if (v != null && v > yMax) yMax = v; });
    });
  });
  const Y_MAX = Math.ceil(Math.max(yMax, 50) / 5) * 5;
  const Y_MIN = 0;

  const W = 520, H = 320;
  const M = { top: 18, right: 30, bottom: 46, left: 56 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  function y(v) { return M.top + innerH - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * innerH; }

  const cityCtx = {};

  function initCity(svg) {
    const city = svg.dataset.city;
    const cityD = DATA[city];
    // Some hours have 366 samples (leap year) but the days list has 367
    // entries (spilling into 2025-01-01). Trim n to the shorter of the two so
    // dumbbells align with month labels rather than drifting one slot per city.
    let n = cityD.days.length;
    Object.values(cityD.hourly).forEach(hr => {
      if (hr.t2m && hr.t2m.length < n) n = hr.t2m.length;
      if (hr.utci && hr.utci.length < n) n = hr.utci.length;
    });
    const slotW = innerW / n;
    const xForIdx = i => M.left + (i + 0.5) * slotW;

    const defs = document.createElementNS(NS, 'defs');
    const dumbLayer = document.createElementNS(NS, 'g');
    const dotsLayer = document.createElementNS(NS, 'g');
    const staticLayer = document.createElementNS(NS, 'g');
    const hitLayer = document.createElementNS(NS, 'g');
    svg.appendChild(defs);
    svg.appendChild(dumbLayer);
    svg.appendChild(dotsLayer);
    svg.appendChild(staticLayer);
    svg.appendChild(hitLayer);

    // Y ticks
    for (let v = Y_MIN; v <= Y_MAX; v += 10) {
      const yy = y(v);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', M.left - 10); t.setAttribute('y', yy + 5);
      t.setAttribute('text-anchor', 'end');
      t.setAttribute('font-family', "IBM Plex Sans, sans-serif");
      t.setAttribute('font-weight', 500);
      t.setAttribute('font-size', 14);
      t.setAttribute('fill', '#161616');
      t.textContent = v + '°';
      staticLayer.appendChild(t);
    }

    [
      { temp: 26, label: 'Moderate heat',    color: '#f1c21b' },
      { temp: 32, label: 'Strong heat',      color: '#ff832b' },
      { temp: 38, label: 'Very strong heat', color: '#d04a3a' },
      { temp: 46, label: 'Extreme heat',     color: '#8a0a0a' }
    ].forEach(ref => {
      const yR = y(ref.temp);
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', M.left); ln.setAttribute('x2', M.left + innerW);
      ln.setAttribute('y1', yR); ln.setAttribute('y2', yR);
      ln.setAttribute('stroke', ref.color);
      ln.setAttribute('stroke-width', 1.2);
      ln.setAttribute('stroke-dasharray', '6 4');
      staticLayer.appendChild(ln);
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', M.left + innerW - 6);
      lbl.setAttribute('y', yR - 6);
      lbl.setAttribute('text-anchor', 'end');
      lbl.setAttribute('font-family', "IBM Plex Sans, sans-serif");
      lbl.setAttribute('font-weight', 600);
      lbl.setAttribute('font-size', 12);
      lbl.setAttribute('fill', ref.color);
      lbl.textContent = ref.label;
      staticLayer.appendChild(lbl);
    });

    const baselineY = y(Y_MIN);
    const base = document.createElementNS(NS, 'line');
    base.setAttribute('x1', M.left); base.setAttribute('x2', M.left + innerW);
    base.setAttribute('y1', baselineY); base.setAttribute('y2', baselineY);
    base.setAttribute('stroke', '#161616'); base.setAttribute('stroke-width', 1.4);
    staticLayer.appendChild(base);

    MONTHS.forEach((m, mi) => {
      const prefix = '2024-' + String(mi+1).padStart(2,'0');
      let firstIdx = -1, lastIdx = -1;
      for (let k = 0; k < cityD.days.length; k++) {
        if (cityD.days[k].startsWith(prefix)) {
          if (firstIdx < 0) firstIdx = k;
          lastIdx = k;
        }
      }
      if (firstIdx < 0) return;
      const midX = (xForIdx(firstIdx) + xForIdx(lastIdx)) / 2;
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', midX); lbl.setAttribute('y', baselineY + 24);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('font-family', "IBM Plex Sans, sans-serif");
      lbl.setAttribute('font-weight', 500);
      lbl.setAttribute('font-size', 14);
      lbl.setAttribute('fill', '#6f6f6f');
      lbl.textContent = m;
      staticLayer.appendChild(lbl);
    });

    // Hit-test rects
    for (let i = 0; i < n; i++) {
      const hit = document.createElementNS(NS, 'rect');
      hit.setAttribute('x', xForIdx(i) - slotW / 2);
      hit.setAttribute('y', M.top);
      hit.setAttribute('width', slotW);
      hit.setAttribute('height', innerH);
      hit.setAttribute('fill', 'transparent');
      hit.dataset.index = String(i);
      hit.setAttribute('class', 'bar-hit');
      hitLayer.appendChild(hit);
    }

    cityCtx[city] = { svg, defs, dumbLayer, dotsLayer, cityD, n, slotW, xForIdx, hit: null };
  }

  function drawBarsForCity(city, hour) {
    const ctx = cityCtx[city];
    if (!ctx) return;
    const { defs, dumbLayer, dotsLayer, cityD, n, xForIdx } = ctx;
    while (dumbLayer.firstChild) dumbLayer.removeChild(dumbLayer.firstChild);
    while (dotsLayer.firstChild) dotsLayer.removeChild(dotsLayer.firstChild);
    while (defs.firstChild) defs.removeChild(defs.firstChild);

    const hr = cityD.hourly[String(hour)];
    if (!hr) return;

    // Dumbbells — vertical gradient from Actual (amber) at the T2M endpoint
    // to Felt (red when hotter than actual, blue when cooler) at the UTCI
    // endpoint. Colours match the two dot fills exactly.
    for (let i = 0; i < n; i++) {
      const t = hr.t2m[i], u = hr.utci[i];
      if (t == null || u == null || t === u) continue;
      const cx = xForIdx(i);
      const feltCool = u < t;
      const feltColor = feltCool ? COLOR_FELT_COOL : COLOR_FELT;

      const gradId = 'g-' + city + '-' + hour + '-' + i;
      const grad = document.createElementNS(NS, 'linearGradient');
      grad.setAttribute('id', gradId);
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', cx); grad.setAttribute('x2', cx);
      // Gradient runs from the actual (T2M) endpoint to the felt (UTCI)
      // endpoint, regardless of which one is higher in y.
      grad.setAttribute('y1', y(t)); grad.setAttribute('y2', y(u));
      const s1 = document.createElementNS(NS, 'stop');
      s1.setAttribute('offset', '0%');
      s1.setAttribute('stop-color', COLOR_ACTUAL);
      grad.appendChild(s1);
      const s2 = document.createElementNS(NS, 'stop');
      s2.setAttribute('offset', '100%');
      s2.setAttribute('stop-color', feltColor);
      grad.appendChild(s2);
      defs.appendChild(grad);

      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', cx); ln.setAttribute('x2', cx);
      ln.setAttribute('y1', y(t)); ln.setAttribute('y2', y(u));
      ln.setAttribute('stroke', 'url(#' + gradId + ')');
      ln.setAttribute('stroke-width', 1.4);
      ln.setAttribute('stroke-linecap', 'butt');
      dumbLayer.appendChild(ln);
    }

    // Dots — actual dot is always amber; the felt dot flips to blue when the
    // body felt cooler than the thermometer (typical at night with high wind).
    const R = 1.6;
    for (let i = 0; i < n; i++) {
      const cx = xForIdx(i);
      const t = hr.t2m[i], u = hr.utci[i];
      if (t != null) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', y(t));
        c.setAttribute('r', R); c.setAttribute('fill', COLOR_ACTUAL);
        dotsLayer.appendChild(c);
      }
      if (u != null) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', y(u));
        c.setAttribute('r', R);
        c.setAttribute('fill', (t != null && u < t) ? COLOR_FELT_COOL : COLOR_FELT);
        dotsLayer.appendChild(c);
      }
    }

    ctx.hit = {
      city: CITY_DISPLAY[city],
      d: hr,
      days: cityD.days,
      hour,
      fmtDay(i) {
        const day = cityD.days[i]; if (!day) return '';
        const parts = day.split('-');
        return parts[2] + ' ' + MONTHS[parseInt(parts[1], 10) - 1];
      }
    };
  }

  const state = { hour: 12, playing: true, lastTick: 0 };
  const svgs = Array.from(document.querySelectorAll('.pane-svg'));
  svgs.forEach(initCity);

  function drawAll() { Object.keys(cityCtx).forEach(city => drawBarsForCity(city, state.hour)); }

  function updateClock() {
    const h = state.hour;
    const suffix = h < 12 ? 'AM' : 'PM';
    let display = h % 12;
    if (display === 0) display = 12;
    document.getElementById('clockDigital').innerHTML =
      String(display).padStart(2, '0') + ':30<span class="ampm">' + suffix + '</span>';
  }

  const HOUR_MS = 900;
  function tick(ts) {
    if (!state.lastTick) state.lastTick = ts;
    if (state.playing && ts - state.lastTick >= HOUR_MS) {
      state.hour = (state.hour + 1) % 24;
      state.lastTick = ts;
      drawAll();
      updateClock();
      refreshTip();
    }
    requestAnimationFrame(tick);
  }

  const tt = document.getElementById('tt');
  const hoverState = { city: null, i: -1, x: 0, y: 0 };
  function showTip(hit, i, evt) {
    if (!hit) return;
    const u = hit.d.utci[i];
    const t = hit.d.t2m[i];
    if (u == null && t == null) { hideTip(); return; }
    const gap = (u != null && t != null) ? (u - t) : null;
    const gapColor = (gap == null) ? '#fff' : (gap >= 0 ? '#e8202a' : '#1f6fb0');
    const gapTxt = (gap == null) ? '' : (gap >= 0 ? '+' : '') + gap.toFixed(1) + '°';
    const h = hit.hour;
    const suffix = h < 12 ? 'AM' : 'PM';
    let display = h % 12;
    if (display === 0) display = 12;
    const timeStr = String(display).padStart(2,'0') + ':30 ' + suffix;
    const dateStr = hit.fmtDay(i);
    var recTxt = (t != null ? t.toFixed(1) + '°' : '—');
    var feltTxt = (u != null ? u.toFixed(1) + '°' : '—');
    var feltCooler = (gap != null && gap < 0);
    var feltDotColor = feltCooler ? '#1f6fb0' : '#e8202a';
    var feltTextColor = feltCooler ? '#1f6fb0' : '#c0382f';
    var scaleHTML = '';
    if (u != null && t != null) {
      var lo = Math.min(t, u), hi = Math.max(t, u);
      var range = Math.max(6, hi - lo + 4);
      var mid = (lo + hi) / 2;
      var axLo = mid - range / 2, axHi = mid + range / 2;
      var pctT = ((t - axLo) / (axHi - axLo)) * 100;
      var pctU = ((u - axLo) / (axHi - axLo)) * 100;
      var barLeft = Math.min(pctT, pctU), barRight = Math.max(pctT, pctU);
      scaleHTML =
        '<div class="tt-scale">' +
          '<div class="tt-scale-track"></div>' +
          '<div class="tt-scale-bar" style="left:' + barLeft + '%;width:' + (barRight - barLeft) + '%;background:' + gapColor + ';"></div>' +
          '<div class="tt-scale-dot rec" style="left:' + pctT + '%;"></div>' +
          '<div class="tt-scale-dot felt" style="left:' + pctU + '%;background:' + feltDotColor + ';"></div>' +
        '</div>';
    }
    tt.innerHTML =
      '<div class="tt-head">' +
        '<span class="tt-time">' + timeStr + '</span>' +
        '<span class="tt-conn">on</span>' +
        '<span class="tt-date">' + dateStr + '</span>' +
        '<span class="tt-conn">in</span>' +
        '<span class="tt-city">' + hit.city + '</span>' +
      '</div>' +
      '<div class="tt-row rec"><span class="lbl">Recorded</span><span class="val">' + recTxt + '</span></div>' +
      '<div class="tt-row felt" style="color:' + feltTextColor + ';"><span class="lbl" style="color:' + feltTextColor + ';">Felt</span><span class="val" style="color:' + feltTextColor + ';">' + feltTxt + '</span></div>' +
      scaleHTML +
      (gap != null ? '<div class="tt-gap-row" style="color:' + gapColor + ';">' + gapTxt + ' gap</div>' : '');
    tt.classList.add('on');
    if (evt) { hoverState.x = evt.clientX; hoverState.y = evt.clientY; }
    const pad = 14;
    const r = tt.getBoundingClientRect();
    let x = hoverState.x + pad, yy = hoverState.y + pad;
    if (x + r.width  > window.innerWidth - 8)  x = hoverState.x - r.width - pad;
    if (yy + r.height > window.innerHeight - 8) yy = hoverState.y - r.height - pad;
    tt.style.left = Math.max(8, x) + 'px';
    tt.style.top  = Math.max(8, yy) + 'px';
  }
  function hideTip() { tt.classList.remove('on'); hoverState.city = null; hoverState.i = -1; }
  function refreshTip() {
    if (!hoverState.city || hoverState.i < 0) return;
    const ctx = cityCtx[hoverState.city];
    if (ctx && ctx.hit) showTip(ctx.hit, hoverState.i, null);
  }

  svgs.forEach(svg => {
    const city = svg.dataset.city;
    svg.addEventListener('mousemove', e => {
      const target = e.target;
      if (target && target.classList && target.classList.contains('bar-hit')) {
        const i = parseInt(target.dataset.index, 10);
        if (Number.isFinite(i)) {
          hoverState.city = city;
          hoverState.i = i;
          showTip(cityCtx[city].hit, i, e);
        }
      } else hideTip();
    });
    svg.addEventListener('mouseleave', hideTip);
  });

  drawAll(); updateClock();

  const playBtn = document.getElementById('playBtn');
  playBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    state.lastTick = 0;
    playBtn.textContent = state.playing ? 'Pause' : 'Play';
  });

  // Mobile city selector — shows one dumbbell card at a time via CSS toggling
  const panesCityToggle = document.getElementById('panesCityToggle');
  if (panesCityToggle) {
    const grid = document.getElementById('panesGrid');
    function applyCity(city) {
      grid.dataset.selectedCity = city;
    }
    applyCity('delhi');
    panesCityToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-city]');
      if (!btn) return;
      panesCityToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      applyCity(btn.dataset.city);
    });
  }

  requestAnimationFrame(tick);
});

/* ============ Insight 1 — 2024 calendar per city, two-panel (T2M / UTCI) ============ */
window.__runWhenDataReady(function () {
  const extra = JSON.parse(document.getElementById('extraPayload').textContent);
  const CAL = extra.calendar;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Per-city thresholds — same as the buildings viz and the clocks:
  //   Delhi/Kolkata (Plains):  day 40°, night 30°
  //   Mumbai/Chennai (Coastal): day 37°, night 30°
  const CITY_THRESHOLDS = {
    delhi:   { day: 40, night: 30 },
    kolkata: { day: 40, night: 30 },
    mumbai:  { day: 37, night: 30 },
    chennai: { day: 37, night: 30 }
  };

  const monthsT2M = document.getElementById('calMonthsT2M');
  const monthsUTCI = document.getElementById('calMonthsUTCI');
  const countT2M = document.getElementById('calCountT2M');
  const countUTCI = document.getElementById('calCountUTCI');
  const toggle = document.getElementById('calCityToggle');
  const countT2MNight = document.getElementById('calCountT2MNight');
  const countUTCINight = document.getElementById('calCountUTCINight');

  function buildPanel(container, days, valueKey, nightKey, dayThr, nightThr) {
    container.innerHTML = '';
    const byMonth = new Map();
    days.forEach(rec => {
      const m = parseInt(rec.d.split('-')[1], 10) - 1;
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(rec);
    });
    let hotN = 0, nightN = 0;
    for (let m = 0; m < 12; m++) {
      const monthDiv = document.createElement('div');
      monthDiv.className = 'cal-month';
      const name = document.createElement('div');
      name.className = 'cal-month-name';
      name.textContent = MONTHS[m];
      monthDiv.appendChild(name);
      const grid = document.createElement('div');
      grid.className = 'cal-cells';
      const firstDay = new Date(Date.UTC(2024, m, 1));
      const startDow = firstDay.getUTCDay();
      const daysInMonth = new Date(Date.UTC(2024, m + 1, 0)).getUTCDate();
      for (let i = 0; i < startDow; i++) {
        const ph = document.createElement('div');
        ph.className = 'cal-cell placeholder';
        grid.appendChild(ph);
      }
      const monthRecs = byMonth.get(m) || [];
      for (let dd = 1; dd <= daysInMonth; dd++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        const rec = monthRecs.find(r => parseInt(r.d.split('-')[2], 10) === dd);
        if (rec) {
          const v = rec[valueKey];
          if (v != null && v > dayThr) {
            cell.classList.add('hot');
            // Severity ramp anchored to the city's cutoff.
            if (v > dayThr + 6) cell.classList.add('high');
            else if (v > dayThr + 3) cell.classList.add('med');
            hotN++;
          }
          // Warm-night dot — city's night threshold, applied to the night-window
          // extreme (7:30 PM – 7:30 AM IST). T2M panel uses night T2M ("nt");
          // UTCI panel uses night UTCI ("nu"). Three-tier severity.
          const nv = rec[nightKey];
          if (nv != null && nv > nightThr) {
            cell.classList.add('night');
            if (nv > nightThr + 4)      cell.classList.add('night-high');
            else if (nv > nightThr + 2) cell.classList.add('night-med');
            nightN++;
          }
        }
        grid.appendChild(cell);
      }
      monthDiv.appendChild(grid);
      container.appendChild(monthDiv);
    }
    return { hotN, nightN };
  }

  function render(city) {
    const days = CAL[city] || [];
    const thr = CITY_THRESHOLDS[city] || { day: 40, night: 30 };
    // Recorded panel: day = day-max T2M > city day cutoff; night dot = night-max T2M > city night cutoff.
    // Felt panel: same rules on UTCI (day = du, night = nu).
    const rT2M  = buildPanel(monthsT2M,  days, 'dt', 'nt', thr.day, thr.night);
    const rUTCI = buildPanel(monthsUTCI, days, 'du', 'nu', thr.day, thr.night);
    countT2M.textContent  = rT2M.hotN;
    countUTCI.textContent = rUTCI.hotN;
    countT2MNight.textContent  = rT2M.nightN;
    countUTCINight.textContent = rUTCI.nightN;
  }

  toggle.addEventListener('click', e => {
    const btn = e.target.closest('button[data-city]');
    if (!btn) return;
    toggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    render(btn.dataset.city);
  });
  render('delhi');

  // Mobile mode toggle — swap between Recorded (T2M) and Felt (UTCI) panels
  const modeToggle = document.getElementById('calModeToggle');
  const grid2 = document.querySelector('.cal-grid-2');
  if (modeToggle && grid2) {
    function setMode(mode) { grid2.dataset.calMode = mode; }
    setMode('t2m');
    modeToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      modeToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      setMode(btn.dataset.mode);
    });
    // Swipe support
    let startX = null;
    grid2.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
    }, { passive: true });
    grid2.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const endX = (e.changedTouches[0] || {}).clientX;
      if (typeof endX !== 'number') { startX = null; return; }
      const dx = endX - startX;
      if (Math.abs(dx) > 50) {
        const next = dx < 0 ? 'utci' : 't2m';
        setMode(next);
        modeToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === next));
      }
      startX = null;
    }, { passive: true });
  }
});

/* ============ Insight 2 — dual-ring clocks (June average, Recorded vs Felt) ============ */
window.__runWhenDataReady(function () {
  const panes = JSON.parse(document.getElementById('panesPayload').textContent);
  const CITIES = ['delhi', 'kolkata', 'mumbai', 'chennai'];
  const CITY_DISPLAY = { delhi: 'Delhi', kolkata: 'Kolkata', mumbai: 'Mumbai', chennai: 'Chennai' };
  const CITY_THR = {
    delhi:   { day: 40, night: 30 },
    kolkata: { day: 40, night: 30 },
    mumbai:  { day: 37, night: 30 },
    chennai: { day: 37, night: 30 }
  };
  const NS = 'http://www.w3.org/2000/svg';

  // Editorial "hottest month" per city — matches the climatological peak we're
  // telling the story about, not the raw 2024 mean. (Delhi/Kolkata inland peak in
  // June; Mumbai/Chennai coastal peak in May before the monsoon.)
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
  const HOT_MONTH_INDEX = {
    delhi:   5,  // June
    kolkata: 3,  // April
    mumbai:  4,  // May
    chennai: 4   // May
  };
  const HOT_MONTH = {};    // city -> { month: 0-11, name: 'June' }
  const MONTH_MEAN = {};   // city -> { t2m: [24], utci: [24] }

  CITIES.forEach(city => {
    const cityD = panes.data[city];
    const m = HOT_MONTH_INDEX[city];
    HOT_MONTH[city] = { month: m, name: MONTH_NAMES[m] };

    // Collect day indices for that month
    const idxs = [];
    cityD.days.forEach((d, i) => {
      if (!d.startsWith('2024-')) return;
      if (parseInt(d.slice(5, 7), 10) - 1 === m) idxs.push(i);
    });

    // Per-hour means across the hottest month
    const t2m = new Array(24).fill(null);
    const utci = new Array(24).fill(null);
    for (let h = 0; h < 24; h++) {
      const bucket = cityD.hourly[String(h)];
      let sT = 0, cT = 0, sU = 0, cU = 0;
      idxs.forEach(i => {
        const t = bucket.t2m[i];
        const u = bucket.utci[i];
        if (t != null) { sT += t; cT++; }
        if (u != null) { sU += u; cU++; }
      });
      t2m[h]  = cT ? sT / cT : null;
      utci[h] = cU ? sU / cU : null;
    }
    MONTH_MEAN[city] = { t2m, utci };
  });

  function hotHours(city, key) {
    const thr = CITY_THR[city];
    const series = MONTH_MEAN[city][key];
    const out = [];
    // Bucket h corresponds to h:30 IST. Day window is 6:30 AM – 5:30 PM IST → buckets 6..17.
    for (let h = 0; h < 24; h++) {
      const v = series[h];
      if (v == null) continue;
      const isDay = (h >= 6 && h <= 17);
      const cutoff = isDay ? thr.day : thr.night;
      if (v > cutoff) out.push(h);
    }
    return out;
  }

  // ---- Single-ring clock ----------------------------------------------------
  // Design intent: no white face, no dial numerals, no centre digits.
  // A thin dashed ring shows the 12-h loop; a bold coloured wedge highlights the
  // hours that were too hot. The count is written LARGE beside the ring, not on it.
  function drawClock(svg, hotHrs, colorClass, half) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const W = 200, H = 200;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const cx = W / 2, cy = H / 2;
    const r = 78;

    function angleOf(hour) { return ((hour % 12) / 12) * 2 * Math.PI - Math.PI / 2; }
    function arcPath(startHour, endHour) {
      const sweep = endHour - startHour;
      if (sweep >= 12 - 1e-6) {
        return 'M ' + (cx + r) + ' ' + cy +
               ' A ' + r + ' ' + r + ' 0 1 1 ' + (cx - r) + ' ' + cy +
               ' A ' + r + ' ' + r + ' 0 1 1 ' + (cx + r) + ' ' + cy;
      }
      const sa = angleOf(startHour), ea = angleOf(endHour);
      const large = sweep > 6 ? 1 : 0;
      const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
      const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
      return 'M ' + x1 + ' ' + y1 +
             ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2;
    }

    // Thin printed-dial ring
    const track = document.createElementNS(NS, 'circle');
    track.setAttribute('cx', cx); track.setAttribute('cy', cy);
    track.setAttribute('r', r);
    track.setAttribute('class', 'ring-track');
    svg.appendChild(track);

    // 12 tiny hour tick-marks — small lines just inside the ring instead of dots
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
      const isCardinal = (i % 3 === 0);
      const inLen  = isCardinal ? 5 : 3;
      const rIn  = r - inLen - 8;
      const rOut = r - 8;
      const tick = document.createElementNS(NS, 'line');
      tick.setAttribute('x1', cx + rIn  * Math.cos(angle));
      tick.setAttribute('y1', cy + rIn  * Math.sin(angle));
      tick.setAttribute('x2', cx + rOut * Math.cos(angle));
      tick.setAttribute('y2', cy + rOut * Math.sin(angle));
      tick.setAttribute('class', 'clock-tick' + (isCardinal ? ' cardinal' : ''));
      svg.appendChild(tick);
    }

    // Cardinal-position numerals (bucket h renders at ((h%12)/12)*2π - π/2).
    // Day face runs 6 AM → 6 PM; night face 6 PM → 6 AM.
    const isDay = (half === 'day');
    const labels = isDay
      ? [
          { text: '12',    x: 0,  y: -1 },
          { text: '3 PM',  x: 1,  y:  0 },
          { text: '6',     x: 0,  y:  1 },
          { text: '9 AM',  x: -1, y:  0 }
        ]
      : [
          { text: '12',    x: 0,  y: -1 },
          { text: '3 AM',  x: 1,  y:  0 },
          { text: '6',     x: 0,  y:  1 },
          { text: '9 PM',  x: -1, y:  0 }
        ];
    labels.forEach(pos => {
      const rr = 96;
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', cx + pos.x * rr);
      t.setAttribute('y', cy + pos.y * rr + 4);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'clock-hour-label');
      t.textContent = pos.text;
      svg.appendChild(t);
    });

    // Contiguous hot-hour runs on a 24-h loop
    function buildRuns(hotHours) {
      const hotSet = new Set(hotHours);
      const hot = [];
      for (let h = 0; h < 24; h++) hot.push(hotSet.has(h));
      if (hot.every(Boolean))  return [{ start: 0, len: 24 }];
      if (hot.every(v => !v))  return [];
      let pivot = hot.indexOf(false);
      if (pivot < 0) pivot = 0;
      const runs = [];
      let i = 0;
      while (i < 24) {
        const h = (pivot + i) % 24;
        if (!hot[h]) { i++; continue; }
        let j = i;
        while (j < 24 && hot[(pivot + j) % 24]) j++;
        runs.push({ start: (pivot + i) % 24, len: j - i });
        i = j;
      }
      return runs;
    }
    const runs = buildRuns(hotHrs || []);
    runs.forEach(run => {
      const seg = document.createElementNS(NS, 'path');
      seg.setAttribute('class', colorClass);
      const sweep = Math.min(run.len, 12);
      seg.setAttribute('d', arcPath(run.start, run.start + sweep));
      svg.appendChild(seg);
    });

    // Centre stack — number on top, then "hours" and "too hot to step out"
    const nHot = (hotHrs || []).length;
    const unit = nHot === 1 ? 'hour' : 'hours';

    const num = document.createElementNS(NS, 'text');
    num.setAttribute('x', cx); num.setAttribute('y', cy - 4);
    num.setAttribute('text-anchor', 'middle');
    num.setAttribute('class', 'clock-count ' + (nHot > 0 ? 'active' : 'zero'));
    num.textContent = nHot + ' ' + unit;
    svg.appendChild(num);

    const l1 = document.createElementNS(NS, 'text');
    l1.setAttribute('x', cx); l1.setAttribute('y', cy + 14);
    l1.setAttribute('text-anchor', 'middle');
    l1.setAttribute('class', 'clock-count-label');
    l1.textContent = 'too hot to';
    svg.appendChild(l1);

    const l2 = document.createElementNS(NS, 'text');
    l2.setAttribute('x', cx); l2.setAttribute('y', cy + 28);
    l2.setAttribute('text-anchor', 'middle');
    l2.setAttribute('class', 'clock-count-label');
    l2.textContent = 'step out';
    svg.appendChild(l2);
  }

  // ---- Wiring ---------------------------------------------------------------
  const heatWrap = document.getElementById('clocksHeatStretch');
  const halfToggle = document.getElementById('clockHalfdayToggle');
  const cityToggle = document.getElementById('clockCityToggle');
  let currentHalf = 'day';  // 'day' = buckets 6..17 (6:30 AM – 5:30 PM IST), 'night' = rest
  let currentCity = 'delhi';

  // Build TWO clock cards side-by-side: Recorded (T2M) + Felt (UTCI)
  function makeCard(kind, labelText) {
    const card = document.createElement('div');
    card.className = 'clock-card ' + kind;
    const title = document.createElement('div');
    title.className = 'clock-card-title ' + kind;
    title.textContent = labelText;
    card.appendChild(title);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'clock-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    card.appendChild(svg);
    heatWrap.appendChild(card);
    return { card, title, svg };
  }
  const recCard  = makeCard('rec',  'Recorded heat');
  const feltCard = makeCard('felt', 'Felt heat');

  // Caption below the two clocks: names the hottest month for the current city
  const caption = document.createElement('div');
  caption.className = 'clocks-caption';
  heatWrap.parentNode.insertBefore(caption, heatWrap.nextSibling);

  function filterHalf(hours, half) {
    // Day window: buckets 6..17 (6:30 AM – 5:30 PM IST). Night: everything else.
    return hours.filter(h => {
      const isDay = (h >= 6 && h <= 17);
      return half === 'day' ? isDay : !isDay;
    });
  }

  function renderClock() {
    const t = filterHalf(hotHours(currentCity, 't2m'),  currentHalf);
    const u = filterHalf(hotHours(currentCity, 'utci'), currentHalf);
    drawClock(recCard.svg,  t, 'seg-recorded', currentHalf);
    drawClock(feltCard.svg, u, 'seg-felt',     currentHalf);
    const hot = HOT_MONTH[currentCity];
    caption.innerHTML =
      '<span class="caption-main">Hottest month in ' + CITY_DISPLAY[currentCity] + ': ' + hot.name + ' 2024</span>' +
      '<span class="caption-sub">Hours above comfortable heat thresholds in the hottest month of the city in 2024</span>';
  }
  renderClock();

  halfToggle.addEventListener('click', e => {
    const btn = e.target.closest('button[data-half]');
    if (!btn) return;
    halfToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    currentHalf = btn.dataset.half;
    renderClock();
  });

  cityToggle.addEventListener('click', e => {
    const btn = e.target.closest('button[data-city]');
    if (!btn) return;
    cityToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    currentCity = btn.dataset.city;
    renderClock();
  });

});

/* ============ Windows of Comfort — buildings graphic (v9-style) ============ */
window.__runWhenDataReady(function () {
  const extra = JSON.parse(document.getElementById('extraPayload').textContent);
  const WCOM = extra.wcom;
  if (!WCOM) return;

  const DAYS = 365;
  const CITY_THRESHOLDS = {
    delhi:   { terrain: 'Plains',  day: 40, night: 30 },
    kolkata: { terrain: 'Plains',  day: 40, night: 30 },
    mumbai:  { terrain: 'Coastal', day: 37, night: 30 },
    chennai: { terrain: 'Coastal', day: 37, night: 30 }
  };

  const BANDS = {
    tropical: { lo: 25, hi: 32, color: '#f1c21b', nightOnly: true },
    strong:   { lo: 32, hi: 38, color: '#ff832b', nightOnly: false },
    very:     { lo: 38, hi: 46, color: '#e8202a', nightOnly: false },
    extreme:  { lo: 46, hi: Infinity, color: '#8a0a0a', nightOnly: false }
  };
  const BAND_ORDER = ['tropical', 'strong', 'very', 'extreme'];
  const COOL_FILL = '#cfe6f5';   // v9 below-cutoff fill

  function isNightHour(h) { return h >= 19 || h <= 7; }

  // ERA5 UTC-stamped. IST hour h maps to UTC index (istIdx − 5).
  function valueAt(city, doy, hour, kind) {
    const arr = WCOM[city] && WCOM[city][kind];
    if (!arr) return null;
    const istIdx = (doy - 1) * 24 + hour;
    const utcIdx = istIdx - 5;
    if (utcIdx < 0 || utcIdx >= arr.length) return null;
    const v = arr[utcIdx];
    return (v == null) ? null : v;
  }

  function matchBand(v, isNight, city) {
    if (v == null) return null;
    const thr = CITY_THRESHOLDS[city];
    const cutoff = isNight ? thr.night : thr.day;
    if (v < cutoff) return null;
    for (const key of BAND_ORDER) {
      const b = BANDS[key];
      if (v >= b.lo && v < b.hi) return key;
    }
    return 'tropical';
  }

  const buildingLeft   = document.getElementById('wcomBuildingLeft');
  const buildingRight  = document.getElementById('wcomBuildingRight');
  const countLeftEl    = document.getElementById('wcomCountLeft');
  const countRightEl   = document.getElementById('wcomCountRight');
  const clockDigital   = document.getElementById('wcomClockDigital');
  const cityToggle     = document.getElementById('wcomCityToggle');
  const playBtn        = document.getElementById('wcomPlayBtn');

  const winsLeft = [];
  const winsRight = [];
  function buildTowers() {
    buildingLeft.innerHTML = '';
    buildingRight.innerHTML = '';
    winsLeft.length = 0;
    winsRight.length = 0;
    const frL = document.createDocumentFragment();
    const frR = document.createDocumentFragment();
    // Fixed set of panes that get a stick figure — deterministic, not randomised.
    // Each entry: [doy, poseNumber 1..4]. Same figures appear every load.
    const FIGURES_LEFT = [
      [12,1],[27,3],[41,2],[58,4],[73,1],[89,2],[104,3],[118,1],
      [131,4],[145,2],[159,3],[172,1],[186,4],[199,2],[213,1],[228,3],
      [241,2],[255,4],[269,1],[283,3],[297,2],[311,4],[325,1],[339,3],[353,2]
    ];
    const FIGURES_RIGHT = [
      [8,2],[22,4],[35,1],[49,3],[64,2],[80,1],[95,4],[110,3],
      [124,2],[139,1],[154,3],[168,4],[181,2],[195,1],[209,3],[223,4],
      [237,2],[251,1],[265,3],[280,4],[294,2],[308,1],[322,3],[336,4],[350,2],[362,1]
    ];
    const figMapL = new Map(FIGURES_LEFT);
    const figMapR = new Map(FIGURES_RIGHT);
    for (let doy = 1; doy <= DAYS; doy++) {
      const a = document.createElement('div');
      a.className = 'win';
      if (figMapL.has(doy)) { a.classList.add('has-figure'); a.classList.add('pose-' + figMapL.get(doy)); }
      frL.appendChild(a);
      winsLeft.push(a);
      const b = document.createElement('div');
      b.className = 'win';
      if (figMapR.has(doy)) { b.classList.add('has-figure'); b.classList.add('pose-' + figMapR.get(doy)); }
      frR.appendChild(b);
      winsRight.push(b);
    }
    buildingLeft.appendChild(frL);
    buildingRight.appendChild(frR);
  }
  buildTowers();

  const state = { city: 'delhi', hour: 13, playing: true, lastTick: 0 };

  function render() {
    const isNight = isNightHour(state.hour);

    let litL = 0, litR = 0;
    // Both towers show their own value at every hour — no night-time swap.
    // Left is always Actual (T2M); right is always Feels-like (UTCI).
    winsLeft.forEach((w, i) => {
      const v = valueAt(state.city, i + 1, state.hour, 't2m');
      const band = matchBand(v, isNight, state.city);
      w.style.backgroundColor = band ? BANDS[band].color : COOL_FILL;
      if (band) litL++;
    });
    winsRight.forEach((w, i) => {
      const v = valueAt(state.city, i + 1, state.hour, 'utci');
      const band = matchBand(v, isNight, state.city);
      w.style.backgroundColor = band ? BANDS[band].color : COOL_FILL;
      if (band) litR++;
    });

    countLeftEl.textContent  = litL;
    countRightEl.textContent = litR;

    // Digital clock display (IST · :30 past each hour)
    const h = state.hour;
    const suffix = h < 12 ? 'AM' : 'PM';
    let display = h % 12;
    if (display === 0) display = 12;
    clockDigital.innerHTML = String(display).padStart(2, '0') + ':30<span class="ampm">' + suffix + '</span>';
  }

  render();

  const HOUR_MS = 1400;
  function tick(ts) {
    if (!state.lastTick) state.lastTick = ts;
    if (state.playing && ts - state.lastTick >= HOUR_MS) {
      state.hour = (state.hour + 1) % 24;
      state.lastTick = ts;
      render();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  cityToggle.addEventListener('click', e => {
    const btn = e.target.closest('button[data-city]');
    if (!btn) return;
    cityToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    state.city = btn.dataset.city;
    render();
  });

  playBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    state.lastTick = 0;
    playBtn.textContent = state.playing ? 'Pause' : 'Play';
  });
});

/* ============ Exhibit-panel carousel: 3-visible thumbs + prev/next + counter ============ */
(function(){
  const main    = document.getElementById('exhibitMainImage');
  const strip   = document.getElementById('exhibitThumbs');
  const prev    = document.getElementById('exhibitPrev');
  const next    = document.getElementById('exhibitNext');
  const counter = document.getElementById('exhibitCounter');
  if (!main || !strip) return;
  const thumbs = Array.from(strip.querySelectorAll('.exhibit-thumb'));
  if (thumbs.length === 0) return;

  const VISIBLE = 5;
  let index  = 0;   // which thumb is currently the "selected" one
  let offset = 0;   // leftmost visible thumb index

  function stepWidth(){
    const cs = getComputedStyle(strip.parentElement.querySelector('.exhibit-thumb') || strip.parentElement);
    const carouselStyle = getComputedStyle(document.querySelector('.exhibit-carousel'));
    const w   = parseFloat(carouselStyle.getPropertyValue('--thumb-w')) || 56;
    const gap = parseFloat(carouselStyle.getPropertyValue('--thumb-gap')) || 12;
    return w + gap;
  }

  function render(){
    // Clamp offset so we never scroll past the last group
    const maxOffset = Math.max(0, thumbs.length - VISIBLE);
    offset = Math.min(Math.max(0, offset), maxOffset);
    // Translate strip
    strip.style.transform = 'translateX(' + (-offset * stepWidth()) + 'px)';
    // Active states
    thumbs.forEach((b, i) => b.classList.toggle('active', i === index));
    // Main image
    const src = thumbs[index].dataset.src;
    if (src) main.src = src;
    // Counter
    if (counter) counter.textContent = (index + 1) + ' / ' + thumbs.length;
    // Arrow enable/disable (based on whether a real photo exists before/after)
    let hasBefore = false, hasAfter = false;
    for (let i = index - 1; i >= 0; i--) if (!thumbs[i].classList.contains('placeholder')) { hasBefore = true; break; }
    for (let i = index + 1; i < thumbs.length; i++) if (!thumbs[i].classList.contains('placeholder')) { hasAfter = true; break; }
    if (prev) prev.disabled = !hasBefore;
    if (next) next.disabled = !hasAfter;
  }

  function goTo(i){
    index = Math.min(Math.max(0, i), thumbs.length - 1);
    // Keep the selected thumb inside the visible window
    if (index < offset) offset = index;
    else if (index >= offset + VISIBLE) offset = index - VISIBLE + 1;
    render();
  }

  function isReal(i){ return i >= 0 && i < thumbs.length && !thumbs[i].classList.contains('placeholder'); }
  function stepReal(dir){
    let i = index + dir;
    while (i >= 0 && i < thumbs.length && !isReal(i)) i += dir;
    if (isReal(i)) goTo(i);
  }
  thumbs.forEach((btn, i) => btn.addEventListener('click', () => { if (isReal(i)) goTo(i); }));
  if (prev) prev.addEventListener('click', () => stepReal(-1));
  if (next) next.addEventListener('click', () => stepReal(1));
  window.addEventListener('resize', render);
  render();
})();
