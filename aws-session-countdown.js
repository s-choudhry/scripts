/// aws-session-countdown.js
(function awsSessionCountdown() {
  'use strict';

  function ensureBadge() {
    let el = document.getElementById('aws-session-countdown');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'aws-session-countdown';
    el.style.cssText = `
      position: fixed; z-index: 2147483647; right: 12px; bottom: 12px;
      font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background: rgba(0,0,0,.8); color: #fff; padding: 8px 10px; border-radius: 10px;
      box-shadow: 0 6px 18px rgba(0,0,0,.25); pointer-events: none; min-width: 120px; text-align:center;
    `;
    el.textContent = 'AWS: —';

    if (document.body) {
      document.body.appendChild(el);
    } else {
      document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
    }

    return el;
  }

  const KEY_HINTS = [
    'expiration', 'expires', 'expiry', 'session', 'sso', 'federat', 'assum', 'creds', 'token'
  ];

  function parseMaybeDate(val) {
    if (!val) return null;

    try {
      const obj = typeof val === 'string' ? JSON.parse(val) : val;
      if (obj && typeof obj === 'object') {
        const fields = [
          'expiration', 'expiresAt', 'expires', 'sessionExpiration', 'tokenExpiration',
          'accessTokenExpiresAt', 'ssoExpiresAt', 'ssoExpiration', 'expiry'
        ];
        for (const f of fields) {
          if (obj[f]) {
            const d = parseMaybeDate(obj[f]);
            if (d) return d;
          }
        }
      }
    } catch (_) {}

    if (/^\d{10,13}$/.test(String(val))) {
      const num = Number(val);
      const ms = num < 1e12 ? num * 1000 : num;
      const d = new Date(ms);
      return isFinite(d.getTime()) ? d : null;
    }

    const d = new Date(val);
    if (isFinite(d.getTime())) return d;

    return null;
  }

  function getCandidateExpiries() {
    const out = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      const lower = k.toLowerCase();

      if (!KEY_HINTS.some(h => lower.includes(h))) continue;

      const v = localStorage.getItem(k);
      const d = parseMaybeDate(v);

      if (d) {
        out.push({ source: `localStorage:${k}`, date: d });
      } else {
        try {
          const obj = JSON.parse(v);
          for (const [subK, subV] of Object.entries(obj || {})) {
            if (KEY_HINTS.some(h => String(subK).toLowerCase().includes(h))) {
              const d2 = parseMaybeDate(subV);
              if (d2) out.push({ source: `localStorage:${k}.${subK}`, date: d2 });
            }
          }
        } catch (_) {}
      }
    }

    document.cookie.split(';').forEach(c => {
      const [rawKey, ...rest] = c.split('=');
      if (!rawKey || !rest.length) return;

      const k = rawKey.trim();
      const v = decodeURIComponent(rest.join('=').trim());
      const lower = k.toLowerCase();

      if (!KEY_HINTS.some(h => lower.includes(h))) return;

      const d = parseMaybeDate(v);
      if (d) out.push({ source: `cookie:${k}`, date: d });
    });

    const globals = [window.AWSC, window.gnav, window.aws, window.awsui];

    globals.forEach((g, idx) => {
      try {
        if (!g || typeof g !== 'object') return;

        const stack = [g];
        const seen = new Set();

        while (stack.length) {
          const cur = stack.pop();
          if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;

          seen.add(cur);

          for (const [k, v] of Object.entries(cur)) {
            if (typeof v === 'object') stack.push(v);

            if (KEY_HINTS.some(h => String(k).toLowerCase().includes(h))) {
              const d = parseMaybeDate(v);
              if (d) out.push({ source: `global${idx}:${k}`, date: d });
            }
          }
        }
      } catch (_) {}
    });

    const now = Date.now();

    return out
      .filter(x => x.date.getTime() > now)
      .sort((a, b) => a.date - b.date);
  }

  function fmt(msLeft) {
    if (msLeft <= 0) return 'expired';

    const totalSec = Math.floor(msLeft / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const badge = ensureBadge();

  function tick() {
    const candidates = getCandidateExpiries();

    if (!candidates.length) {
      badge.textContent = 'AWS: —';
      return;
    }

    const best = candidates[0];
    const left = best.date.getTime() - Date.now();

    badge.textContent = `AWS: ${fmt(left)}`;
    badge.title = `Expires: ${best.date.toLocaleString()} (${best.source})`;
  }

  tick();
  setInterval(tick, 2000);
})();
