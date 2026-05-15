/// aws-session-countdown.js
(function awsSessionCountdown() {
  'use strict';

  // -----------------------------
  // Safe DOM injection
  // -----------------------------
  function addBadgeWhenReady(el) {
    if (document.body) {
      if (!document.getElementById(el.id)) {
        document.body.appendChild(el);
      }
      return;
    }

    const timer = setInterval(() => {
      if (document.body) {
        clearInterval(timer);
        if (!document.getElementById(el.id)) {
          document.body.appendChild(el);
        }
      }
    }, 200);
  }

  // -----------------------------
  // UI
  // -----------------------------
  function ensureBadge() {
    let el = document.getElementById('aws-session-countdown');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'aws-session-countdown';

    el.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      right: 12px;
      bottom: 12px;
      font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background: rgba(0,0,0,.82);
      color: #fff;
      padding: 8px 10px;
      border-radius: 10px;
      box-shadow: 0 6px 18px rgba(0,0,0,.25);
      pointer-events: none;
      min-width: 120px;
      text-align: center;
      white-space: nowrap;
    `;

    el.textContent = 'AWS: —';
    addBadgeWhenReady(el);

    return el;
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  const KEY_HINTS = [
    'expiration',
    'expires',
    'expiry',
    'session',
    'sso',
    'federat',
    'assum',
    'creds',
    'credential',
    'token',
    'auth'
  ];

  const FIELD_HINTS = [
    'expiration',
    'expiresAt',
    'expires',
    'sessionExpiration',
    'tokenExpiration',
    'accessTokenExpiresAt',
    'ssoExpiresAt',
    'ssoExpiration',
    'expiry',
    'expiryTime',
    'expireTime',
    'validUntil'
  ];

  function parseMaybeDate(val) {
    if (val === null || val === undefined || val === '') return null;

    // If already a Date
    if (val instanceof Date && isFinite(val.getTime())) {
      return val;
    }

    // Numeric epoch seconds/ms
    if (typeof val === 'number' || /^\d{10,13}$/.test(String(val).trim())) {
      const num = Number(val);
      const ms = num < 1e12 ? num * 1000 : num;
      const d = new Date(ms);
      return isFinite(d.getTime()) ? d : null;
    }

    // Try JSON object/string
    try {
      const obj = typeof val === 'string' ? JSON.parse(val) : val;

      if (obj && typeof obj === 'object') {
        for (const f of FIELD_HINTS) {
          if (obj[f]) {
            const d = parseMaybeDate(obj[f]);
            if (d) return d;
          }
        }

        // One-level deeper scan
        for (const [k, v] of Object.entries(obj)) {
          const key = String(k).toLowerCase();

          if (
            KEY_HINTS.some(h => key.includes(h)) ||
            FIELD_HINTS.some(h => key.includes(h.toLowerCase()))
          ) {
            const d = parseMaybeDate(v);
            if (d) return d;
          }

          if (v && typeof v === 'object') {
            for (const [k2, v2] of Object.entries(v)) {
              const key2 = String(k2).toLowerCase();

              if (
                KEY_HINTS.some(h => key2.includes(h)) ||
                FIELD_HINTS.some(h => key2.includes(h.toLowerCase()))
              ) {
                const d2 = parseMaybeDate(v2);
                if (d2) return d2;
              }
            }
          }
        }
      }
    } catch (_) {
      // Not JSON
    }

    // ISO/string date
    const d = new Date(val);
    if (isFinite(d.getTime())) return d;

    return null;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function pushIfUseful(out, source, date) {
    if (!date || !isFinite(date.getTime())) return;

    const now = Date.now();
    const ts = date.getTime();

    // Keep future dates only.
    // Ignore dates too far in future to avoid false positives.
    if (ts > now && ts < now + 24 * 60 * 60 * 1000) {
      out.push({ source, date });
    }
  }

  function scanObjectForDates(obj, sourcePrefix, out, maxDepth = 5) {
    const seen = new Set();

    function walk(cur, path, depth) {
      if (!cur || typeof cur !== 'object' || depth > maxDepth || seen.has(cur)) return;
      seen.add(cur);

      for (const [k, v] of Object.entries(cur)) {
        const key = String(k);
        const lower = key.toLowerCase();
        const nextPath = path ? `${path}.${key}` : key;

        if (
          KEY_HINTS.some(h => lower.includes(h)) ||
          FIELD_HINTS.some(h => lower.includes(h.toLowerCase()))
        ) {
          const d = parseMaybeDate(v);
          pushIfUseful(out, `${sourcePrefix}:${nextPath}`, d);
        }

        if (v && typeof v === 'object') {
          walk(v, nextPath, depth + 1);
        }
      }
    }

    try {
      walk(obj, '', 0);
    } catch (_) {
      // ignore
    }
  }

  function getCandidateExpiries() {
    const out = [];

    // -----------------------------
    // localStorage
    // -----------------------------
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        const lower = k.toLowerCase();

        if (!KEY_HINTS.some(h => lower.includes(h))) continue;

        const v = localStorage.getItem(k);

        const directDate = parseMaybeDate(v);
        pushIfUseful(out, `localStorage:${k}`, directDate);

        try {
          const obj = JSON.parse(v);
          scanObjectForDates(obj, `localStorage:${k}`, out);
        } catch (_) {
          // ignore
        }
      }
    } catch (_) {
      // localStorage may be blocked on some pages
    }

    // -----------------------------
    // sessionStorage
    // -----------------------------
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i) || '';
        const lower = k.toLowerCase();

        if (!KEY_HINTS.some(h => lower.includes(h))) continue;

        const v = sessionStorage.getItem(k);

        const directDate = parseMaybeDate(v);
        pushIfUseful(out, `sessionStorage:${k}`, directDate);

        try {
          const obj = JSON.parse(v);
          scanObjectForDates(obj, `sessionStorage:${k}`, out);
        } catch (_) {
          // ignore
        }
      }
    } catch (_) {
      // sessionStorage may be blocked on some pages
    }

    // -----------------------------
    // cookies
    // -----------------------------
    try {
      document.cookie.split(';').forEach(c => {
        const [rawKey, ...rest] = c.split('=');
        if (!rawKey || !rest.length) return;

        const k = rawKey.trim();
        const v = safeDecode(rest.join('=').trim());
        const lower = k.toLowerCase();

        if (!KEY_HINTS.some(h => lower.includes(h))) return;

        const d = parseMaybeDate(v);
        pushIfUseful(out, `cookie:${k}`, d);

        try {
          const obj = JSON.parse(v);
          scanObjectForDates(obj, `cookie:${k}`, out);
        } catch (_) {
          // ignore
        }
      });
    } catch (_) {
      // ignore
    }

    // -----------------------------
    // AWS-ish globals
    // -----------------------------
    try {
      const globals = [
        ['AWSC', window.AWSC],
        ['gnav', window.gnav],
        ['aws', window.aws],
        ['awsui', window.awsui],
        ['AWS', window.AWS]
      ];

      globals.forEach(([name, obj]) => {
        if (obj && typeof obj === 'object') {
          scanObjectForDates(obj, `global:${name}`, out);
        }
      });
    } catch (_) {
      // ignore
    }

    // Earliest future expiry wins
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
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

  function updateBadgeColour(badge, msLeft, hasCandidate) {
    if (!hasCandidate) {
      badge.style.background = 'rgba(0,0,0,.82)';
      return;
    }

    const minutesLeft = msLeft / 60000;

    if (minutesLeft <= 0) {
      badge.style.background = 'rgba(180,35,24,.95)';
    } else if (minutesLeft <= 5) {
      badge.style.background = 'rgba(180,83,9,.95)';
    } else if (minutesLeft <= 15) {
      badge.style.background = 'rgba(133,77,14,.95)';
    } else {
      badge.style.background = 'rgba(0,0,0,.82)';
    }
  }

  const badge = ensureBadge();

  function tick() {
    const candidates = getCandidateExpiries();

    if (!candidates.length) {
      badge.textContent = 'AWS: —';
      badge.title = 'No AWS session expiry found in localStorage, sessionStorage, cookies, or AWS globals.';
      updateBadgeColour(badge, 0, false);
      return;
    }

    const best = candidates[0];
    const left = best.date.getTime() - Date.now();

    badge.textContent = `AWS: ${fmt(left)}`;
    badge.title = `Expires: ${best.date.toLocaleString()} | Source: ${best.source}`;

    updateBadgeColour(badge, left, true);
  }

  tick();
  setInterval(tick, 2000);
})();
