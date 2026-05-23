/* ── JilMart POS — Shared Utilities ────────────────────────────────────────── */
'use strict';

const App = (() => {
  // ── Currency formatter ────────────────────────────────────────────────────
  function fmt(amount) {
    const n = parseFloat(amount) || 0;
    return 'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Date/time helpers ─────────────────────────────────────────────────────
  function fmtDate(d) {
    const dt = d ? new Date(d) : new Date();
    return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
  }
  function fmtTime(d) {
    const dt = d ? new Date(d) : new Date();
    return dt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true });
  }
  function fmtDateTime(d) { return fmtDate(d) + '  ' + fmtTime(d); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // ── API wrapper ───────────────────────────────────────────────────────────
  const api = {
    async get(url) {
      const r = await fetch(url);
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      return r.json();
    },
    async post(url, body) {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      return r.json();
    },
    async put(url, body) {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      return r.json();
    },
    async del(url) {
      const r = await fetch(url, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      return r.json();
    },
  };

  // ── Toast notifications ───────────────────────────────────────────────────
  let toastContainer;
  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }
  const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  function toast(msg, type = 'success', duration = 3000) {
    ensureToastContainer();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${ICONS[type]||'💬'}</span><span class="toast-msg">${msg}</span>`;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toast-out .3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('show'); document.body.style.overflow = 'hidden'; }
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('show'); document.body.style.overflow = ''; }
  }
  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop.show').forEach(m => {
      m.classList.remove('show');
    });
    document.body.style.overflow = '';
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  let _cashier = null;
  function getCashier() {
    if (!_cashier) {
      try { _cashier = JSON.parse(sessionStorage.getItem('jm_cashier') || 'null'); } catch {}
    }
    return _cashier;
  }
  function setCashier(c) {
    _cashier = c;
    sessionStorage.setItem('jm_cashier', JSON.stringify(c));
  }
  function logout() {
    _cashier = null;
    sessionStorage.removeItem('jm_cashier');
    window.location.reload();
  }

  // ── Store settings cache ──────────────────────────────────────────────────
  let _settings = null;
  async function getSettings() {
    if (_settings) return _settings;
    _settings = await api.get('/api/inventory/settings');
    return _settings;
  }

  // ── Sidebar toggle ────────────────────────────────────────────────────────
  function initSidebarToggle() {
    const layout  = document.querySelector('.app-layout');
    const btn     = document.getElementById('sidebar-toggle');
    const stored  = localStorage.getItem('jm_sidebar');
    if (stored === 'collapsed' && layout) layout.classList.add('sidebar-collapsed');
    if (btn && layout) {
      btn.addEventListener('click', () => {
        layout.classList.toggle('sidebar-collapsed');
        localStorage.setItem('jm_sidebar', layout.classList.contains('sidebar-collapsed') ? 'collapsed' : 'open');
      });
    }
  }

  // ── Clock ─────────────────────────────────────────────────────────────────
  function startClock(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const tick = () => { el.textContent = fmtTime(); };
    tick();
    setInterval(tick, 1000);
  }

  // ── Confirm dialog ────────────────────────────────────────────────────────
  function confirm(msg) { return window.confirm(msg); }

  // ── Escape HTML ───────────────────────────────────────────────────────────
  function esc(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  // ── Debounce ──────────────────────────────────────────────────────────────
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  return { fmt, fmtDate, fmtTime, fmtDateTime, todayISO, api, toast, openModal, closeModal,
           closeAllModals, getCashier, setCashier, logout, getSettings, initSidebarToggle,
           startClock, confirm, esc, debounce };
})();

// ── Login overlay (shared by all pages) ──────────────────────────────────────
(function initLogin() {
  const overlay = document.getElementById('login-overlay');
  if (!overlay) return;

  const cashier = App.getCashier();
  if (cashier) {
    overlay.classList.add('hidden');
    updateCashierUI(cashier);
    return;
  }

  // Load cashiers list
  let selectedCashier = null;
  let pinBuffer = '';
  let loginStep = 'select'; // 'select' | 'pin'

  const listEl    = document.getElementById('cashier-list');
  const stepSelect= document.getElementById('login-step-select');
  const stepPin   = document.getElementById('login-step-pin');
  const pinDots   = document.querySelectorAll('.pin-dot');
  const pinError  = document.getElementById('pin-error');
  const selName   = document.getElementById('selected-cashier-name');

  App.api.get('/api/inventory/cashiers').then(cashiers => {
    listEl.innerHTML = cashiers.filter(c => c.is_active).map(c => `
      <div class="cashier-select-item" data-id="${c.id}" data-name="${App.esc(c.name)}" data-role="${c.role}">
        <div class="csi-avatar">${c.name[0].toUpperCase()}</div>
        <div><div class="csi-name">${App.esc(c.name)}</div><div class="csi-role">${c.role}</div></div>
      </div>`).join('');

    listEl.querySelectorAll('.cashier-select-item').forEach(item => {
      item.addEventListener('click', () => {
        listEl.querySelectorAll('.cashier-select-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        selectedCashier = { id: parseInt(item.dataset.id), name: item.dataset.name, role: item.dataset.role };
        selName.textContent = selectedCashier.name;
        stepSelect.style.display = 'none';
        stepPin.style.display = 'block';
        pinBuffer = '';
        updateDots();
        pinError.textContent = '';
      });
    });
  }).catch(() => { App.toast('Could not load cashiers', 'error'); });

  function updateDots() {
    pinDots.forEach((d, i) => d.classList.toggle('filled', i < pinBuffer.length));
  }

  document.querySelectorAll('.pin-key[data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (pinBuffer.length >= 6) return;
      pinBuffer += btn.dataset.val;
      updateDots();
      pinError.textContent = '';
      if (pinBuffer.length >= 4) attemptLogin();
    });
  });

  document.getElementById('pin-delete')?.addEventListener('click', () => {
    pinBuffer = pinBuffer.slice(0, -1);
    updateDots();
  });
  document.getElementById('pin-clear')?.addEventListener('click', () => {
    pinBuffer = '';
    updateDots();
  });
  document.getElementById('back-to-select')?.addEventListener('click', () => {
    stepSelect.style.display = 'block';
    stepPin.style.display = 'none';
    pinBuffer = '';
    updateDots();
  });

  async function attemptLogin() {
    try {
      const c = await App.api.post('/api/inventory/cashiers/login', { pin: pinBuffer });
      App.setCashier(c);
      overlay.style.transition = 'opacity .4s';
      overlay.classList.add('hidden');
      updateCashierUI(c);
    } catch {
      pinError.textContent = 'Incorrect PIN. Try again.';
      pinBuffer = '';
      updateDots();
      const box = document.querySelector('.login-box');
      box.style.animation = 'none';
      box.offsetHeight;
      box.style.animation = 'shake .3s ease';
    }
  }

  // Keyboard support for PIN
  document.addEventListener('keydown', e => {
    if (overlay.classList.contains('hidden')) return;
    if (loginStep === 'pin' || stepPin.style.display !== 'none') {
      if (e.key >= '0' && e.key <= '9' && pinBuffer.length < 6) {
        pinBuffer += e.key;
        updateDots();
        if (pinBuffer.length >= 4) attemptLogin();
      } else if (e.key === 'Backspace') {
        pinBuffer = pinBuffer.slice(0, -1);
        updateDots();
      }
    }
  });
})();

function updateCashierUI(cashier) {
  document.querySelectorAll('.cashier-name-display').forEach(el => el.textContent = cashier.name);
  document.querySelectorAll('.cashier-role-display').forEach(el => el.textContent = cashier.role);
  document.querySelectorAll('.cashier-avatar-display').forEach(el => el.textContent = cashier.name[0].toUpperCase());
  document.querySelectorAll('#logout-btn').forEach(btn => btn.addEventListener('click', App.logout));
}

// ── Shake keyframe ────────────────────────────────────────────────────────────
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `@keyframes shake {
  0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)}
  60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }`;
document.head.appendChild(shakeStyle);
