/* ── JilMart POS — Settings Page ────────────────────────────────────────────── */
'use strict';

let cashierEditId = null;
let quickKeys     = [];

document.addEventListener('DOMContentLoaded', async () => {
  App.initSidebarToggle();
  await loadSettings();
  await loadCashiers();
  await loadQuickKeys();
  bindTabs();
  bindEvents();
  generateReceiptPreview();
});

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await App.api.get('/api/inventory/settings');
    document.getElementById('s-store-name').value    = s.store_name    || '';
    document.getElementById('s-store-address').value = s.store_address || '';
    document.getElementById('s-store-phone').value   = s.store_phone   || '';
    document.getElementById('s-store-email').value   = s.store_email   || '';
    document.getElementById('s-currency').value      = s.currency      || 'LKR';
    document.getElementById('s-tax-rate').value      = s.tax_rate      || '0';
    document.getElementById('s-receipt-footer').value= s.receipt_footer|| '';
    document.getElementById('s-printer-width').value = s.printer_width || '48';
    document.getElementById('s-low-stock-alert').value = s.low_stock_alert || '1';
  } catch {}
}

async function saveStoreSettings() {
  const btn = document.getElementById('btn-save-store');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await App.api.put('/api/inventory/settings', {
      store_name:    document.getElementById('s-store-name').value,
      store_address: document.getElementById('s-store-address').value,
      store_phone:   document.getElementById('s-store-phone').value,
      store_email:   document.getElementById('s-store-email').value,
      currency:      document.getElementById('s-currency').value,
      tax_rate:      document.getElementById('s-tax-rate').value,
    });
    App.toast('Store settings saved', 'success');
  } catch (e) { App.toast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Save Store Settings';
}

async function saveReceiptSettings() {
  const btn = document.getElementById('btn-save-receipt');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await App.api.put('/api/inventory/settings', {
      receipt_footer:  document.getElementById('s-receipt-footer').value,
      printer_width:   document.getElementById('s-printer-width').value,
      low_stock_alert: document.getElementById('s-low-stock-alert').value,
    });
    App.toast('Receipt settings saved', 'success');
    generateReceiptPreview();
  } catch (e) { App.toast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Save Receipt Settings';
}

function generateReceiptPreview() {
  const name   = document.getElementById('s-store-name')?.value    || 'JilMart Supermarket';
  const addr   = document.getElementById('s-store-address')?.value || '123 Main Street, Colombo';
  const phone  = document.getElementById('s-store-phone')?.value   || '+94 11 234 5678';
  const footer = document.getElementById('s-receipt-footer')?.value|| 'Thank you for shopping at JilMart!';
  const width  = parseInt(document.getElementById('s-printer-width')?.value) || 48;
  const line   = '─'.repeat(width);
  const dline  = '═'.repeat(width);
  const center = s => ' '.repeat(Math.max(0, Math.floor((width - s.length) / 2))) + s;

  const preview = [
    center(name),
    center(addr),
    center(phone),
    dline,
    'Receipt : RCP-20240523-0001',
    'Date    : 23/05/2024   Time: 10:30 AM',
    'Cashier : John Silva',
    line,
    'Product               Qty   Price     Total',
    line,
    'Samba Rice 5kg          2  780.00  1,560.00',
    'White Bread             1   95.00     95.00',
    'Coca-Cola 330ml         3  110.00    330.00',
    line,
    'Sub Total:'.padEnd(width-12) + 'LKR 1,985.00',
    'Discount (5%):'.padEnd(width-11) + '- LKR 99.25',
    dline,
    'TOTAL DUE:'.padEnd(width-12) + 'LKR 1,885.75',
    dline,
    'Payment : CASH',
    'Cash:'.padEnd(width-12) + 'LKR 2,000.00',
    'Change:'.padEnd(width-11) + 'LKR   114.25',
    dline,
    center(footer),
    '',
  ].join('\n');

  const el = document.getElementById('receipt-preview');
  if (el) el.textContent = preview;
}

// ── Cashiers ──────────────────────────────────────────────────────────────────
async function loadCashiers() {
  try {
    const cashiers = await App.api.get('/api/inventory/cashiers');
    const tbody    = document.getElementById('cashier-tbody');
    tbody.innerHTML = cashiers.map(c => `
      <tr>
        <td style="font-weight:500">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;
                        display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">
              ${c.name[0].toUpperCase()}
            </div>
            ${App.esc(c.name)}
          </div>
        </td>
        <td style="color:var(--text-3);font-family:monospace">${App.esc(c.username)}</td>
        <td><span class="badge ${c.role==='admin'?'badge-danger':c.role==='supervisor'?'badge-warning':'badge-info'}">${c.role}</span></td>
        <td class="text-center">
          <span class="badge ${c.is_active ? 'badge-success' : 'badge-gray'}">${c.is_active ? 'Active' : 'Inactive'}</span>
        </td>
        <td class="text-center">
          <button class="btn btn-secondary btn-sm" onclick="openEditCashier(${c.id})">✏️ Edit</button>
        </td>
      </tr>`).join('');
  } catch {}
}

function openAddCashier() {
  cashierEditId = null;
  document.getElementById('cashier-modal-title').textContent = 'Add Cashier';
  document.getElementById('cashier-edit-id').value = '';
  ['c-name','c-username','c-pin'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('c-role').value   = 'cashier';
  document.getElementById('c-active').value = '1';
  App.openModal('modal-cashier');
  setTimeout(() => document.getElementById('c-name')?.focus(), 200);
}

async function openEditCashier(id) {
  try {
    const cashiers = await App.api.get('/api/inventory/cashiers');
    const c = cashiers.find(x => x.id === id);
    if (!c) return;
    cashierEditId = id;
    document.getElementById('cashier-modal-title').textContent = 'Edit Cashier';
    document.getElementById('cashier-edit-id').value = id;
    document.getElementById('c-name').value     = c.name;
    document.getElementById('c-username').value = c.username;
    document.getElementById('c-pin').value      = '';
    document.getElementById('c-role').value     = c.role;
    document.getElementById('c-active').value   = String(c.is_active);
    App.openModal('modal-cashier');
  } catch {}
}

async function saveCashier() {
  const name     = document.getElementById('c-name').value.trim();
  const username = document.getElementById('c-username').value.trim();
  const pin      = document.getElementById('c-pin').value.trim();
  const role     = document.getElementById('c-role').value;
  const isActive = parseInt(document.getElementById('c-active').value);

  if (!name || !username) { App.toast('Name and username are required', 'warning'); return; }
  if (!cashierEditId && !pin) { App.toast('PIN is required for new cashiers', 'warning'); return; }

  const btn = document.getElementById('btn-save-cashier');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (cashierEditId) {
      const body = { name, pin: pin || undefined, role, is_active: isActive };
      if (!pin) delete body.pin;
      await App.api.put(`/api/inventory/cashiers/${cashierEditId}`, { name, pin: pin || null, role, is_active: isActive });
      App.toast('Cashier updated', 'success');
    } else {
      await App.api.post('/api/inventory/cashiers', { name, username, pin, role });
      App.toast('Cashier added', 'success');
    }
    App.closeModal('modal-cashier');
    await loadCashiers();
  } catch (e) { App.toast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Save';
}

// ── Quick Keys ────────────────────────────────────────────────────────────────
async function loadQuickKeys() {
  try {
    quickKeys = await App.api.get('/api/inventory/quick-keys');
    renderQKList();
  } catch {}
}

function renderQKList() {
  const container = document.getElementById('qk-list');
  container.innerHTML = quickKeys.map((qk, i) => `
    <div style="border:1.5px solid var(--border);border-radius:10px;padding:14px;position:relative" data-qk-idx="${i}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <input type="color" value="${qk.color}" class="qk-color-input" data-idx="${i}"
               style="width:36px;height:36px;border:none;cursor:pointer;border-radius:6px;padding:0;flex-shrink:0"
               title="Button color">
        <input type="text" class="form-input qk-name-input" value="${App.esc(qk.name)}" data-idx="${i}"
               placeholder="Key name" style="flex:1">
      </div>
      <input type="number" class="form-input qk-price-input" value="${qk.price}" data-idx="${i}"
             placeholder="Price (0 = custom)" min="0" step="0.01" style="width:100%;margin-bottom:6px">
      <div style="font-size:11px;color:var(--text-4)">
        ${qk.product_id ? `Linked to: <strong>${App.esc(qk.product_name||'Product')}</strong>` : 'Custom item'}
      </div>
      <button onclick="removeQK(${i})"
              style="position:absolute;top:8px;right:8px;width:22px;height:22px;border:none;
                     background:var(--danger-light);color:var(--danger);border-radius:50%;cursor:pointer;font-size:12px">✕</button>
    </div>`).join('');
}

function removeQK(idx) {
  quickKeys.splice(idx, 1);
  renderQKList();
}

function addQK() {
  quickKeys.push({ id: null, name: 'New Key', price: 0, color: '#10B981', position: quickKeys.length + 1, product_id: null });
  renderQKList();
}

async function saveQuickKeys() {
  // Collect current values from DOM
  const inputs = document.querySelectorAll('#qk-list [data-qk-idx]');
  const keys   = quickKeys.map((qk, i) => {
    const wrap = document.querySelector(`#qk-list [data-qk-idx="${i}"]`);
    if (wrap) {
      qk.name  = wrap.querySelector('.qk-name-input')?.value  || qk.name;
      qk.price = parseFloat(wrap.querySelector('.qk-price-input')?.value) || 0;
      qk.color = wrap.querySelector('.qk-color-input')?.value || qk.color;
    }
    qk.position = i + 1;
    return qk;
  });

  const btn = document.getElementById('btn-save-qk');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await App.api.post('/api/inventory/quick-keys', { keys });
    App.toast('Quick keys saved', 'success');
    await loadQuickKeys();
  } catch (e) { App.toast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Save';
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('btn-save-store').addEventListener('click', saveStoreSettings);
  document.getElementById('btn-save-receipt').addEventListener('click', saveReceiptSettings);
  document.getElementById('btn-add-cashier').addEventListener('click', openAddCashier);
  document.getElementById('btn-save-cashier').addEventListener('click', saveCashier);
  document.getElementById('btn-add-qk').addEventListener('click', addQK);
  document.getElementById('btn-save-qk').addEventListener('click', saveQuickKeys);

  // Live preview for receipt settings
  ['s-store-name','s-store-address','s-store-phone','s-receipt-footer','s-printer-width'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', generateReceiptPreview);
  });
}
