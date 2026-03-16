'use strict';
// Lightweight canvas chart renderer — no external dependencies

const Charts = (() => {

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getCtx(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    const dpr = window.devicePixelRatio || 1;
    const w   = el.offsetWidth;
    const h   = el.offsetHeight || 120;
    el.width  = w * dpr;
    el.height = h * dpr;
    el.style.width  = w + 'px';
    el.style.height = h + 'px';
    const ctx = el.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w, h };
  }

  const COLOR = {
    green:  '#22c55e',
    red:    '#ef4444',
    yellow: '#eab308',
    blue:   '#3b82f6',
    purple: '#a855f7',
  };

  // Read CSS custom properties at render time so charts respect the current theme
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ── Line chart ─────────────────────────────────────────────────────────────

  function lineChart(canvasId, data, opts = {}) {
    const g = getCtx(canvasId);
    if (!g || !data.length) return;
    const { ctx, w, h } = g;

    const pad    = { top: 10, right: 10, bottom: 24, left: 36 };
    const cw     = w - pad.left - pad.right;
    const ch     = h - pad.top  - pad.bottom;
    const color  = opts.color || COLOR.blue;
    const min    = opts.min !== undefined ? opts.min : Math.min(...data) * 0.95;
    const max    = opts.max !== undefined ? opts.max : Math.max(...data) * 1.05;
    const range  = max - min || 1;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = cssVar('--border');
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
      const val = max - (range / 4) * i;
      ctx.fillStyle = cssVar('--text-muted');
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(opts.fmt ? opts.fmt(val) : val.toFixed(1), pad.left - 4, y + 3);
    }

    // X labels
    if (opts.labels && opts.labels.length) {
      ctx.fillStyle = cssVar('--text-muted');
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      const step = cw / (data.length - 1 || 1);
      opts.labels.forEach((lbl, i) => {
        if (i % Math.ceil(data.length / 6) === 0) {
          ctx.fillText(lbl, pad.left + i * step, h - 4);
        }
      });
    }

    // Area fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0,   color + '40');
    grad.addColorStop(1,   color + '05');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + ch);
    data.forEach((v, i) => {
      const x = pad.left + (i / (data.length - 1 || 1)) * cw;
      const y = pad.top + ch - ((v - min) / range) * ch;
      if (i === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + cw, pad.top + ch);
    ctx.closePath();
    ctx.fill();

    // Line
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = pad.left + (i / (data.length - 1 || 1)) * cw;
      const y = pad.top + ch - ((v - min) / range) * ch;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Last point dot
    if (data.length > 0) {
      const lv = data[data.length - 1];
      const lx = pad.left + cw;
      const ly = pad.top + ch - ((lv - min) / range) * ch;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Bar chart ──────────────────────────────────────────────────────────────

  function barChart(canvasId, data, opts = {}) {
    const g = getCtx(canvasId);
    if (!g || !data.length) return;
    const { ctx, w, h } = g;

    const pad   = { top: 10, right: 10, bottom: 24, left: 36 };
    const cw    = w - pad.left - pad.right;
    const ch    = h - pad.top  - pad.bottom;
    const max   = Math.max(...data.map(d => d.value)) * 1.05 || 1;
    const bw    = (cw / data.length) * 0.65;
    const gap   = (cw / data.length) * 0.35;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = cssVar('--border');
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 3; i++) {
      const y = pad.top + (ch / 3) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    }

    // Bars
    data.forEach((d, i) => {
      const x   = pad.left + (cw / data.length) * i + gap / 2;
      const bh  = (d.value / max) * ch;
      const y   = pad.top + ch - bh;
      ctx.fillStyle = d.color || COLOR.blue;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, bw, bh, 3) : ctx.rect(x, y, bw, bh);
      ctx.fill();

      ctx.fillStyle = cssVar('--text-muted');
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label || '', x + bw / 2, h - 5);
    });
  }

  // ── Donut chart ────────────────────────────────────────────────────────────

  function donutChart(canvasId, segments, opts = {}) {
    const g = getCtx(canvasId);
    if (!g) return;
    const { ctx, w, h } = g;

    const cx    = w / 2;
    const cy    = h / 2;
    const r     = Math.min(cx, cy) * 0.85;
    const inner = r * 0.58;
    const total = segments.reduce((s, d) => s + d.value, 0) || 1;

    ctx.clearRect(0, 0, w, h);

    let angle = -Math.PI / 2;
    segments.forEach(seg => {
      const slice = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      angle += slice;
    });

    // Inner hole — matches card background for clean donut shape in any theme
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = cssVar('--bg-card');
    ctx.fill();

    // Center label
    if (opts.centerLabel) {
      ctx.fillStyle = cssVar('--text');
      ctx.font = `bold ${Math.floor(r * 0.28)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.centerLabel, cx, cy - 6);
      if (opts.centerSub) {
        ctx.font = `${Math.floor(r * 0.16)}px sans-serif`;
        ctx.fillStyle = cssVar('--text-muted');
        ctx.fillText(opts.centerSub, cx, cy + 14);
      }
    }
  }

  return { lineChart, barChart, donutChart };
})();
