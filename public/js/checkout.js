/* ── JilMart POS — Checkout Logic ───────────────────────────────────────────── */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const POS = {
  cart:      [],
  discount:  0,       // global discount %
  settings:  {},
  quickKeys: [],
  lastScanTime: 0,
  scanBuffer: '',
  scanTimer:  null,
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  App.initSidebarToggle();
  App.startClock('clock');
  initReceiptNumber();
  await loadSettings();
  await loadQuickKeys();
  await checkLowStock();
  bindEvents();
  bindKeyboard();
  focusSearch();
});

async function loadSettings() {
  try { POS.settings = await App.api.get('/api/inventory/settings'); } catch {}
}

function initReceiptNumber() {
  const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
  document.getElementById('current-receipt-no').textContent = `RCP-${d}-????`;
}

async function checkLowStock() {
  try {
    const data = await App.api.get('/api/reports/dashboard');
    if (data.lowStock > 0) {
      document.getElementById('low-stock-count').textContent = data.lowStock;
      document.getElementById('low-stock-banner').style.display = 'flex';
    }
  } catch {}
}

// ── Quick Keys ────────────────────────────────────────────────────────────────
async function loadQuickKeys() {
  try {
    POS.quickKeys = await App.api.get('/api/inventory/quick-keys');
    renderQuickKeys();
  } catch {}
}

function renderQuickKeys() {
  const grid = document.getElementById('quick-keys-grid');
  if (!POS.quickKeys.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-4);font-size:12px;padding:12px">No quick keys configured</div>';
    return;
  }
  grid.innerHTML = POS.quickKeys.map(qk => `
    <button class="qk-btn" style="background:${App.esc(qk.color)}"
            data-qk-id="${qk.id}" data-pid="${qk.product_id||''}" data-price="${qk.price}">
      <span class="qk-name">${App.esc(qk.name)}</span>
      <span class="qk-price">${qk.price > 0 ? 'LKR '+qk.price.toFixed(2) : 'custom'}</span>
    </button>`).join('');

  grid.querySelectorAll('.qk-btn').forEach(btn => {
    btn.addEventListener('click', () => handleQuickKey(btn));
  });
}

async function handleQuickKey(btn) {
  const pid   = btn.dataset.pid;
  const price = parseFloat(btn.dataset.price) || 0;
  const name  = btn.querySelector('.qk-name').textContent;

  if (pid) {
    try {
      const p = await App.api.get(`/api/products/${pid}`);
      addToCart(p, 1);
    } catch { App.toast('Product not found', 'error'); }
  } else {
    // Custom item — prompt for price
    const customPrice = price > 0 ? price : parseFloat(prompt(`Enter price for "${name}" (LKR):`) || '0');
    if (customPrice > 0) {
      addToCart({ id: null, barcode: 'CUSTOM', name, retail_price: customPrice, unit: 'pcs', stock_quantity: 9999 }, 1);
    }
  }
}

// ── Cart ──────────────────────────────────────────────────────────────────────
function addToCart(product, qty = 1) {
  if (product.stock_quantity !== undefined && product.stock_quantity <= 0 && product.id) {
    App.toast(`${product.name} is out of stock`, 'warning');
    return;
  }
  const existing = POS.cart.findIndex(i => i.product_id === product.id && product.id !== null);
  if (existing >= 0) {
    POS.cart[existing].quantity += qty;
    App.toast(`${product.name} ×${POS.cart[existing].quantity}`, 'success', 1500);
  } else {
    POS.cart.push({
      product_id:    product.id,
      barcode:       product.barcode,
      name:          product.name,
      unit:          product.unit || 'pcs',
      unit_price:    product.retail_price,
      quantity:      qty,
      item_discount: 0,
    });
    App.toast(`Added: ${product.name}`, 'success', 1500);
  }
  renderCart();
  clearSearch();
  focusSearch();
}

function removeFromCart(idx) {
  POS.cart.splice(idx, 1);
  renderCart();
  focusSearch();
}

function updateQty(idx, newQty) {
  newQty = parseInt(newQty) || 0;
  if (newQty <= 0) { removeFromCart(idx); return; }
  POS.cart[idx].quantity = newQty;
  renderCart();
}

function updateItemDiscount(idx, disc) {
  disc = parseFloat(disc) || 0;
  disc = Math.max(0, Math.min(100, disc));
  POS.cart[idx].item_discount = disc;
  renderCart();
}

function clearCart() {
  if (POS.cart.length === 0) return;
  if (!confirm('Clear all items from cart?')) return;
  POS.cart = [];
  POS.discount = 0;
  document.getElementById('global-discount').value = 0;
  renderCart();
  initReceiptNumber();
  focusSearch();
}

function renderCart() {
  const table    = document.getElementById('cart-table');
  const empty    = document.getElementById('empty-cart');
  const tbody    = document.getElementById('cart-body');

  if (POS.cart.length === 0) {
    table.style.display = 'none';
    empty.style.display = '';
    updateTotals(0, 0, 0);
    updateFooter(0, 0, 0);
    return;
  }

  table.style.display = '';
  empty.style.display = 'none';

  let subtotal = 0;
  tbody.innerHTML = POS.cart.map((item, i) => {
    const lineTotal = item.unit_price * item.quantity * (1 - item.item_discount / 100);
    subtotal += lineTotal;
    return `
      <tr>
        <td class="col-num">${i + 1}</td>
        <td class="col-name">
          <div style="font-weight:500">${App.esc(item.name)}</div>
          <div style="font-size:10px;color:var(--text-4)">${App.esc(item.unit)}</div>
        </td>
        <td class="col-sku">${App.esc(item.barcode)}</td>
        <td class="col-qty">
          <div class="qty-control">
            <button class="qty-btn" onclick="updateQty(${i}, ${item.quantity - 1})">−</button>
            <input class="qty-input" type="number" value="${item.quantity}" min="1"
                   onchange="updateQty(${i}, this.value)" onblur="updateQty(${i}, this.value)">
            <button class="qty-btn" onclick="updateQty(${i}, ${item.quantity + 1})">+</button>
          </div>
        </td>
        <td class="col-price text-right">${App.fmt(item.unit_price)}</td>
        <td class="col-disc text-center">
          <input class="item-disc-input" type="number" value="${item.item_discount}" min="0" max="100"
                 onchange="updateItemDiscount(${i}, this.value)" title="Item discount %">
        </td>
        <td class="col-total text-right">${App.fmt(lineTotal)}</td>
        <td class="col-action text-center">
          <button class="remove-btn" onclick="removeFromCart(${i})" title="Remove">✕</button>
        </td>
      </tr>`;
  }).join('');

  const discountAmt = subtotal * (POS.discount / 100);
  const total       = subtotal - discountAmt;
  const totalUnits  = POS.cart.reduce((s, i) => s + i.quantity, 0);

  updateTotals(subtotal, discountAmt, total);
  updateFooter(POS.cart.length, totalUnits, subtotal);
}

function updateTotals(subtotal, discountAmt, total) {
  document.getElementById('disp-subtotal').textContent = App.fmt(subtotal);
  document.getElementById('total-due').textContent     = App.fmt(total);
  const discRow = document.getElementById('disp-discount-row');
  if (discountAmt > 0) {
    discRow.style.display = '';
    document.getElementById('disp-discount').textContent = '- ' + App.fmt(discountAmt);
  } else {
    discRow.style.display = 'none';
  }
}

function updateFooter(itemCount, units, subtotal) {
  document.getElementById('footer-items').textContent    = itemCount;
  document.getElementById('footer-units').textContent    = units;
  document.getElementById('footer-subtotal').textContent = App.fmt(subtotal);
}

function getCartTotals() {
  let subtotal = POS.cart.reduce((s, item) =>
    s + item.unit_price * item.quantity * (1 - item.item_discount / 100), 0);
  const discountAmt = subtotal * (POS.discount / 100);
  const total       = subtotal - discountAmt;
  return { subtotal, discountAmt, total };
}

// ── Barcode / Search ──────────────────────────────────────────────────────────
const searchInput = () => document.getElementById('search-input');
const resultsEl   = () => document.getElementById('search-results');

function focusSearch() {
  setTimeout(() => searchInput()?.focus(), 80);
}
function clearSearch() {
  const inp = searchInput();
  const res = resultsEl();
  if (inp) inp.value = '';
  if (res) { res.innerHTML = ''; res.classList.remove('show'); }
}

const doSearch = App.debounce(async (q) => {
  if (!q.trim()) { clearSearch(); return; }
  try {
    const products = await App.api.get(`/api/products/search?q=${encodeURIComponent(q)}`);
    showSearchResults(products);
  } catch {}
}, 280);

function showSearchResults(products) {
  const res = resultsEl();
  if (!products.length) {
    res.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-4);font-size:12px">No products found</div>';
    res.classList.add('show');
    return;
  }
  res.innerHTML = products.map(p => {
    const stockClass = p.stock_quantity <= 0 ? 'out' : p.stock_quantity <= p.low_stock_threshold ? 'low' : '';
    const stockLabel = p.stock_quantity <= 0 ? 'OUT' : `${p.stock_quantity} ${p.unit}`;
    return `
      <div class="search-result-item" data-id="${p.id}" data-barcode="${App.esc(p.barcode)}">
        <div style="flex:1">
          <div class="sri-name">${App.esc(p.name)}</div>
          <div class="sri-barcode">${App.esc(p.barcode)}</div>
        </div>
        <div style="text-align:right">
          <div class="sri-price">${App.fmt(p.retail_price)}</div>
          <div class="sri-stock ${stockClass}">${stockLabel}</div>
        </div>
      </div>`;
  }).join('');
  res.classList.add('show');

  res.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', async () => {
      try {
        const p = await App.api.get(`/api/products/${item.dataset.id}`);
        addToCart(p, 1);
      } catch { App.toast('Failed to load product', 'error'); }
    });
  });
}

// Barcode scanner detection: characters arriving < 50ms apart
function handleBarcodeInput(char) {
  const now = Date.now();
  if (now - POS.lastScanTime > 100) POS.scanBuffer = '';
  POS.lastScanTime = now;
  POS.scanBuffer += char;

  clearTimeout(POS.scanTimer);
  POS.scanTimer = setTimeout(() => {
    if (POS.scanBuffer.length >= 3) {
      processBarcodeOrSearch(POS.scanBuffer);
    }
    POS.scanBuffer = '';
  }, 80);
}

async function processBarcodeOrSearch(value) {
  const inp = searchInput();
  // Try exact barcode lookup first
  try {
    const p = await App.api.get(`/api/products/barcode/${encodeURIComponent(value)}`);
    addToCart(p, 1);
    if (inp) inp.value = '';
    return;
  } catch {}
  // Fall back to search
  doSearch(value);
}

// ── Payment ───────────────────────────────────────────────────────────────────
function openPayment(method) {
  const cashier = App.getCashier();
  if (!cashier) { App.toast('Please log in first', 'error'); return; }
  if (POS.cart.length === 0) { App.toast('Cart is empty', 'warning'); return; }

  const { subtotal, discountAmt, total } = getCartTotals();
  const fmtTotal = App.fmt(total);

  if (method === 'CASH') {
    document.getElementById('cash-due').textContent = fmtTotal;
    document.getElementById('cash-tendered').value  = '';
    document.getElementById('change-amount').textContent = App.fmt(0);
    document.getElementById('change-display').classList.remove('change-insufficient');
    // Quick amount buttons
    const presets = [500, 1000, 2000, 5000];
    const nearest = Math.ceil(total / 100) * 100;
    if (!presets.includes(nearest)) presets.unshift(nearest);
    document.getElementById('cash-quick-amounts').innerHTML =
      presets.slice(0,5).map(v => `
        <button class="qty-preset-btn" data-val="${v}" onclick="setCashTendered(${v})">${App.fmt(v)}</button>
      `).join('');
    App.openModal('modal-cash');
    setTimeout(() => document.getElementById('cash-tendered')?.focus(), 200);

  } else if (method === 'CARD') {
    document.getElementById('card-due').textContent = fmtTotal;
    document.getElementById('card-ref').value = '';
    App.openModal('modal-card');

  } else if (method === 'MOBILE') {
    document.getElementById('mobile-due').textContent = fmtTotal;
    document.getElementById('mobile-ref').value = '';
    App.openModal('modal-mobile');

  } else if (method === 'SPLIT') {
    document.getElementById('split-due').textContent = fmtTotal;
    ['split-cash','split-card','split-mobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('split-remaining').textContent = fmtTotal;
    App.openModal('modal-split');
  }
}

function setCashTendered(amount) {
  document.getElementById('cash-tendered').value = amount;
  document.querySelectorAll('#cash-quick-amounts .qty-preset-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.val) === amount);
  });
  calcChange();
}

function calcChange() {
  const { total } = getCartTotals();
  const tendered  = parseFloat(document.getElementById('cash-tendered').value) || 0;
  const change    = tendered - total;
  const disp      = document.getElementById('change-display');
  const amtEl     = document.getElementById('change-amount');
  if (change >= 0) {
    disp.classList.remove('change-insufficient');
    amtEl.textContent = App.fmt(change);
  } else {
    disp.classList.add('change-insufficient');
    amtEl.textContent = '- ' + App.fmt(Math.abs(change));
  }
}

function calcSplitRemaining() {
  const { total } = getCartTotals();
  const cash   = parseFloat(document.getElementById('split-cash').value)   || 0;
  const card   = parseFloat(document.getElementById('split-card').value)   || 0;
  const mobile = parseFloat(document.getElementById('split-mobile').value) || 0;
  const remaining = total - cash - card - mobile;
  document.getElementById('split-remaining').textContent = App.fmt(Math.max(0, remaining));
  document.getElementById('split-remaining').style.color =
    remaining > 0.005 ? 'var(--danger)' : 'var(--primary-dark)';
}

async function processPayment(method, extra = {}) {
  const cashier = App.getCashier();
  const { subtotal, discountAmt, total } = getCartTotals();

  const payload = {
    items: POS.cart.map(item => ({
      product_id:      item.product_id,
      quantity:        item.quantity,
      price_at_sale:   item.unit_price,
      discount_amount: item.unit_price * item.quantity * (item.item_discount / 100),
    })).filter(i => i.product_id !== null),
    payment_method:   method,
    subtotal:         subtotal,
    discount_applied: discountAmt,
    total_amount:     total,
    cashier_id:       cashier.id,
    ...extra,
  };

  // Add custom (no-id) items with a placeholder if any
  const customItems = POS.cart.filter(i => i.product_id === null);
  if (customItems.length && payload.items.length === 0) {
    App.toast('Custom items cannot be saved without product records. Add products first.', 'warning');
  }

  if (payload.items.length === 0) {
    App.toast('No saveable items in cart', 'error');
    return;
  }

  try {
    const btn = document.getElementById('btn-process-' + method.toLowerCase().replace('split','split'));
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span> Processing…'; }

    const txn = await App.api.post('/api/transactions', payload);
    App.closeAllModals();
    showReceipt(txn);
    App.toast('Payment processed successfully!', 'success');
  } catch (e) {
    App.toast('Payment failed: ' + e.message, 'error');
    const btn = document.querySelector('.btn-pay-process');
    if (btn) { btn.disabled = false; }
  }
}

// ── Receipt ───────────────────────────────────────────────────────────────────
function showReceipt(txn) {
  const settings = POS.settings;
  const storeName = settings.store_name || 'JilMart Supermarket';
  const storeAddr = settings.store_address || '';
  const storePhone= settings.store_phone  || '';
  const footer    = (settings.receipt_footer || 'Thank you!').replace(/\n/g, '<br>');
  const width     = 46;
  const line      = '─'.repeat(width);
  const dline     = '═'.repeat(width);

  const padR = (s, n) => String(s).substring(0,n).padEnd(n);
  const padL = (s, n) => String(s).substring(0,n).padStart(n);
  const center = (s) => {
    const l = Math.max(0, Math.floor((width - s.length) / 2));
    return ' '.repeat(l) + s;
  };

  const itemLines = txn.items.map(item => {
    const total    = (item.price_at_sale * item.quantity - (item.discount_amount||0)).toFixed(2);
    const nameCol  = padR(item.name, 22);
    const qtyCol   = padL(`×${item.quantity}`, 4);
    const priceCol = padL(item.price_at_sale.toFixed(2), 8);
    const totCol   = padL(total, 10);
    return `${nameCol}${qtyCol}${priceCol}${totCol}`;
  }).join('\n');

  const html = `
    <pre style="font-size:12px;line-height:1.7;font-family:'Courier New',monospace;background:#fff;padding:8px">
${center(storeName)}
${center(storeAddr)}
${center(storePhone)}
${dline}
Receipt : ${txn.receipt_number}
Date    : ${App.fmtDate(txn.created_at)}   Time: ${App.fmtTime(txn.created_at)}
Cashier : ${txn.cashier_name || '—'}
${line}
${'Product'.padEnd(22)}${'Qty'.padStart(4)}${'Price'.padStart(8)}${'Total'.padStart(10)}
${line}
${itemLines}
${line}
${'Sub Total:'.padEnd(36)}${padL(App.fmt(txn.subtotal), 10)}
${txn.discount_applied > 0 ? `${'Discount:'.padEnd(36)}${padL('- '+App.fmt(txn.discount_applied), 10)}\n` : ''}${dline}
${'TOTAL DUE:'.padEnd(36)}${padL(App.fmt(txn.total_amount), 10)}
${dline}
Payment : ${txn.payment_method}${txn.cash_given > 0 ? `\n${'Cash:'.padEnd(36)}${padL(App.fmt(txn.cash_given),10)}\n${'Change:'.padEnd(36)}${padL(App.fmt(txn.change_given),10)}` : ''}
${dline}
${center(footer)}
    </pre>`;

  document.getElementById('receipt-content').innerHTML = html;
  document.getElementById('print-area').innerHTML = `<div class="receipt-print-area">${html}</div>`;
  App.openModal('modal-receipt');
}

function startNewSale() {
  POS.cart = [];
  POS.discount = 0;
  document.getElementById('global-discount').value = 0;
  renderCart();
  App.closeModal('modal-receipt');
  initReceiptNumber();
  focusSearch();
}

// ── Add Product (F2) ──────────────────────────────────────────────────────────
function openAddProduct(prefillBarcode = '') {
  document.getElementById('np-barcode').value  = prefillBarcode;
  document.getElementById('np-name').value     = '';
  document.getElementById('np-cost').value     = '';
  document.getElementById('np-retail').value   = '';
  document.getElementById('np-stock').value    = '0';
  document.getElementById('np-threshold').value= '10';
  App.openModal('modal-add-product');
  setTimeout(() => document.getElementById(prefillBarcode ? 'np-name' : 'np-barcode')?.focus(), 200);
}

async function saveNewProduct() {
  const barcode   = document.getElementById('np-barcode').value.trim();
  const name      = document.getElementById('np-name').value.trim();
  const category  = document.getElementById('np-category').value;
  const costPrice = parseFloat(document.getElementById('np-cost').value);
  const retailPrice= parseFloat(document.getElementById('np-retail').value);
  const stock     = parseInt(document.getElementById('np-stock').value) || 0;
  const unit      = document.getElementById('np-unit').value;
  const threshold = parseInt(document.getElementById('np-threshold').value) || 10;
  const addToCartNow = document.getElementById('np-add-to-cart').checked;

  if (!barcode || !name || isNaN(costPrice) || isNaN(retailPrice)) {
    App.toast('Please fill all required fields', 'warning');
    return;
  }
  if (retailPrice <= 0) { App.toast('Retail price must be > 0', 'warning'); return; }

  try {
    const btn = document.getElementById('btn-save-product');
    btn.disabled = true; btn.textContent = 'Saving…';
    const product = await App.api.post('/api/products', { barcode, name, category, cost_price: costPrice,
      retail_price: retailPrice, stock_quantity: stock, low_stock_threshold: threshold, unit });
    App.closeModal('modal-add-product');
    App.toast(`Product "${name}" added!`, 'success');
    if (addToCartNow) addToCart(product, 1);
    btn.disabled = false; btn.textContent = 'Save Product';
  } catch (e) {
    App.toast(e.message, 'error');
    const btn = document.getElementById('btn-save-product');
    btn.disabled = false; btn.textContent = 'Save Product';
  }
}

// ── Quick Key Editor ──────────────────────────────────────────────────────────
function openQkEditor() {
  const grid = document.getElementById('qk-editor-grid');
  grid.innerHTML = POS.quickKeys.map(qk => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:12px;" data-qk-id="${qk.id}">
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <input type="color" value="${qk.color}" class="qk-e-color" style="width:32px;height:32px;border:none;cursor:pointer;border-radius:4px;padding:0">
        <input type="text" class="form-input qk-e-name" value="${App.esc(qk.name)}" placeholder="Key name" style="flex:1">
      </div>
      <input type="number" class="form-input qk-e-price" value="${qk.price}" placeholder="Price" min="0" step="0.01" style="width:100%">
    </div>`).join('');
  App.openModal('modal-qk-edit');
}

async function saveQuickKeys() {
  const keys = [];
  document.querySelectorAll('#qk-editor-grid [data-qk-id]').forEach(el => {
    keys.push({
      id:    parseInt(el.dataset.qkId),
      name:  el.querySelector('.qk-e-name').value,
      price: parseFloat(el.querySelector('.qk-e-price').value) || 0,
      color: el.querySelector('.qk-e-color').value,
      position: keys.length + 1,
    });
  });
  try {
    await App.api.post('/api/inventory/quick-keys', { keys });
    await loadQuickKeys();
    App.closeModal('modal-qk-edit');
    App.toast('Quick keys saved', 'success');
  } catch (e) { App.toast(e.message, 'error'); }
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  // Global discount
  document.getElementById('global-discount').addEventListener('input', e => {
    POS.discount = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
    renderCart();
  });

  // Search input
  const inp = searchInput();
  inp.addEventListener('input', e => {
    const v = e.target.value;
    if (!v.trim()) { clearSearch(); return; }
    doSearch(v);
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = inp.value.trim();
      if (v) processBarcodeOrSearch(v);
    }
    if (e.key === 'Escape') { clearSearch(); }
    if (e.key === 'ArrowDown') {
      const first = resultsEl()?.querySelector('.search-result-item');
      if (first) first.focus();
    }
  });

  // Close search when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-section')) clearSearch();
  });

  // Payment buttons
  document.getElementById('btn-cash').addEventListener('click',   () => openPayment('CASH'));
  document.getElementById('btn-card').addEventListener('click',   () => openPayment('CARD'));
  document.getElementById('btn-mobile').addEventListener('click', () => openPayment('MOBILE'));
  document.getElementById('btn-split').addEventListener('click',  () => openPayment('SPLIT'));

  // Clear cart
  document.getElementById('btn-clear-cart').addEventListener('click', clearCart);

  // Process payment buttons
  document.getElementById('btn-process-cash').addEventListener('click', () => {
    const tendered = parseFloat(document.getElementById('cash-tendered').value) || 0;
    const { total } = getCartTotals();
    if (tendered < total) { App.toast('Cash tendered is less than total', 'warning'); return; }
    processPayment('CASH', { cash_given: tendered, change_given: tendered - total });
  });
  document.getElementById('btn-process-card').addEventListener('click', () => {
    const ref = document.getElementById('card-ref').value;
    processPayment('CARD', { notes: ref ? 'Card ref: ' + ref : '' });
  });
  document.getElementById('btn-process-mobile').addEventListener('click', () => {
    const ref = document.getElementById('mobile-ref').value;
    processPayment('MOBILE', { notes: ref ? 'Mobile ref: ' + ref : '' });
  });
  document.getElementById('btn-process-split').addEventListener('click', () => {
    const cash   = parseFloat(document.getElementById('split-cash').value)   || 0;
    const card   = parseFloat(document.getElementById('split-card').value)   || 0;
    const mobile = parseFloat(document.getElementById('split-mobile').value) || 0;
    const { total } = getCartTotals();
    if (cash + card + mobile < total - 0.005) {
      App.toast('Total split amount is less than the total due', 'warning'); return;
    }
    processPayment('SPLIT', { cash_given: cash, card_amount: card, mobile_amount: mobile });
  });

  // Cash change calc
  document.getElementById('cash-tendered').addEventListener('input', calcChange);

  // Split remaining calc
  ['split-cash','split-card','split-mobile'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', calcSplitRemaining);
  });

  // Receipt modal close / new sale
  document.getElementById('btn-close-receipt').addEventListener('click',  () => App.closeModal('modal-receipt'));
  document.getElementById('btn-close-receipt2').addEventListener('click', () => App.closeModal('modal-receipt'));
  document.getElementById('btn-new-sale').addEventListener('click', startNewSale);

  // Add product
  document.getElementById('btn-save-product').addEventListener('click', saveNewProduct);
  document.getElementById('btn-gen-barcode').addEventListener('click', () => {
    document.getElementById('np-barcode').value = Date.now().toString().slice(-10);
  });

  // Quick keys
  document.getElementById('btn-qk-edit').addEventListener('click', openQkEditor);
  document.getElementById('btn-save-qk').addEventListener('click', saveQuickKeys);

  // Click on checkout area refocuses search
  document.querySelector('.main-content').addEventListener('click', e => {
    if (!e.target.closest('input,button,select,textarea,.modal-backdrop')) {
      focusSearch();
    }
  });
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', e => {
    // Don't fire shortcuts when typing in an input (except F-keys)
    const inInput = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);

    switch (e.key) {
      case 'F1': e.preventDefault(); document.getElementById('sidebar-toggle')?.click(); break;
      case 'F2': e.preventDefault(); openAddProduct(); break;
      case 'F3': e.preventDefault(); focusSearch(); break;
      case 'F4': e.preventDefault(); openPayment('CASH');   break;
      case 'F5': e.preventDefault(); openPayment('CARD');   break;
      case 'F6': e.preventDefault(); openPayment('MOBILE'); break;
      case 'F7': e.preventDefault(); openPayment('SPLIT');  break;
      case 'Delete': if (!inInput) { e.preventDefault(); clearCart(); } break;
      case 'Escape': App.closeAllModals(); clearSearch(); break;
    }
  });

  // Barcode scanner detection: rapid keystrokes to the document
  document.addEventListener('keypress', e => {
    const tag = e.target.tagName;
    // If focus is on search input, let it handle normally
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key.length === 1) handleBarcodeInput(e.key);
  });
}
