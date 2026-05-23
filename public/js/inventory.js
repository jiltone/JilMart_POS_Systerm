/* ── JilMart POS — Inventory Page ───────────────────────────────────────────── */
'use strict';

let allProducts = [];
let editingId   = null;

document.addEventListener('DOMContentLoaded', async () => {
  App.initSidebarToggle();
  await loadProducts();
  await loadCategories();
  bindEvents();
  checkLowStockBadge();

  // URL param filter
  const params = new URLSearchParams(location.search);
  if (params.get('filter') === 'lowstock') {
    document.getElementById('inv-stock-filter').value = 'low';
    filterProducts();
  }
});

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadProducts() {
  try {
    allProducts = await App.api.get('/api/products');
    renderProducts(allProducts);
    document.getElementById('product-count-label').textContent =
      `${allProducts.length} products total`;
  } catch (e) {
    App.toast('Failed to load products', 'error');
  }
}

async function loadCategories() {
  try {
    const cats = await App.api.get('/api/products/meta/categories');
    const sel  = document.getElementById('inv-category');
    cats.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  } catch {}
}

async function checkLowStockBadge() {
  try {
    const data = await App.api.get('/api/reports/dashboard');
    if (data.lowStock > 0) {
      const badge = document.getElementById('low-stock-badge');
      badge.textContent = `⚠ ${data.lowStock} Low Stock`;
      badge.style.display = '';
      document.getElementById('inv-low-count').textContent = data.lowStock;
      document.getElementById('inv-low-stock-alert').style.display = '';
    }
  } catch {}
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderProducts(products) {
  const tbody = document.getElementById('inv-tbody');
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-4)">No products found</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => {
    let stockClass = 'stock-ok', stockLabel = p.stock_quantity;
    if (p.stock_quantity <= 0)                      { stockClass = 'stock-out'; stockLabel = 'Out'; }
    else if (p.stock_quantity <= p.low_stock_threshold) { stockClass = 'stock-low'; }

    const margin = p.retail_price > 0
      ? (((p.retail_price - p.cost_price) / p.retail_price) * 100).toFixed(1) + '%'
      : '—';

    return `<tr>
      <td><span class="mono" style="font-size:11px;color:var(--text-3)">${App.esc(p.barcode)}</span></td>
      <td style="font-weight:500">${App.esc(p.name)}</td>
      <td><span class="badge badge-gray">${App.esc(p.category)}</span></td>
      <td class="text-right">${App.fmt(p.cost_price)}</td>
      <td class="text-right fw-600">${App.fmt(p.retail_price)}</td>
      <td style="color:var(--text-3);font-size:12px">${App.esc(p.unit)}</td>
      <td class="text-center">
        <span class="stock-badge ${stockClass}">${stockLabel}</span>
        <button class="btn btn-secondary btn-sm btn-icon ml-4" title="Adjust stock"
                onclick="openStockAdjust(${p.id}, ${App.esc(JSON.stringify(p.name)).replace(/&quot;/g,'"')}, ${p.stock_quantity})"
                style="margin-left:4px;font-size:11px">±</button>
      </td>
      <td class="text-center"><span class="badge badge-info" style="font-size:10px">${margin}</span></td>
      <td class="text-center">
        <div style="display:flex;gap:4px;justify-content:center">
          <button class="btn btn-secondary btn-sm" onclick="openEditProduct(${p.id})">✏️</button>
          <button class="btn btn-sm" style="background:var(--danger-light);color:var(--danger);border:none"
                  onclick="deleteProduct(${p.id}, '${App.esc(p.name)}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Filter ────────────────────────────────────────────────────────────────────
function filterProducts() {
  const search   = document.getElementById('inv-search').value.toLowerCase();
  const category = document.getElementById('inv-category').value;
  const stock    = document.getElementById('inv-stock-filter').value;

  let filtered = allProducts;
  if (search)   filtered = filtered.filter(p =>
    p.name.toLowerCase().includes(search) || p.barcode.includes(search));
  if (category) filtered = filtered.filter(p => p.category === category);
  if (stock === 'low') filtered = filtered.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold);
  if (stock === 'out') filtered = filtered.filter(p => p.stock_quantity <= 0);

  renderProducts(filtered);
}

// ── Add / Edit Product ────────────────────────────────────────────────────────
function openAddProduct() {
  editingId = null;
  document.getElementById('product-modal-title').textContent = 'Add Product';
  document.getElementById('edit-product-id').value = '';
  ['p-barcode','p-name','p-cost','p-retail'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('p-stock').value     = '0';
  document.getElementById('p-threshold').value = '10';
  document.getElementById('p-category').value  = 'General';
  document.getElementById('p-unit').value       = 'pcs';
  document.getElementById('p-margin-display').textContent = '—';
  App.openModal('modal-product');
  setTimeout(() => document.getElementById('p-barcode')?.focus(), 200);
}

async function openEditProduct(id) {
  try {
    const p = await App.api.get(`/api/products/${id}`);
    editingId = id;
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    document.getElementById('edit-product-id').value = id;
    document.getElementById('p-barcode').value    = p.barcode;
    document.getElementById('p-name').value       = p.name;
    document.getElementById('p-category').value   = p.category;
    document.getElementById('p-cost').value       = p.cost_price;
    document.getElementById('p-retail').value     = p.retail_price;
    document.getElementById('p-stock').value      = p.stock_quantity;
    document.getElementById('p-unit').value       = p.unit;
    document.getElementById('p-threshold').value  = p.low_stock_threshold;
    updateMarginDisplay();
    App.openModal('modal-product');
  } catch (e) { App.toast('Failed to load product', 'error'); }
}

function updateMarginDisplay() {
  const cost   = parseFloat(document.getElementById('p-cost').value)   || 0;
  const retail = parseFloat(document.getElementById('p-retail').value) || 0;
  const el     = document.getElementById('p-margin-display');
  if (retail > 0 && cost > 0) {
    const margin = ((retail - cost) / retail * 100).toFixed(1);
    el.textContent = margin + '% margin';
    el.style.color = parseFloat(margin) > 0 ? 'var(--primary-dark)' : 'var(--danger)';
  } else {
    el.textContent = '—';
  }
}

async function saveProduct() {
  const barcode   = document.getElementById('p-barcode').value.trim();
  const name      = document.getElementById('p-name').value.trim();
  const category  = document.getElementById('p-category').value;
  const cost      = parseFloat(document.getElementById('p-cost').value);
  const retail    = parseFloat(document.getElementById('p-retail').value);
  const stock     = parseInt(document.getElementById('p-stock').value) || 0;
  const unit      = document.getElementById('p-unit').value;
  const threshold = parseInt(document.getElementById('p-threshold').value) || 10;

  if (!barcode || !name || isNaN(cost) || isNaN(retail)) {
    App.toast('Barcode, name, cost price and retail price are required', 'warning');
    return;
  }

  const btn = document.getElementById('btn-save-product');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (editingId) {
      await App.api.put(`/api/products/${editingId}`,
        { name, category, cost_price: cost, retail_price: retail, stock_quantity: stock, low_stock_threshold: threshold, unit });
      App.toast('Product updated', 'success');
    } else {
      await App.api.post('/api/products',
        { barcode, name, category, cost_price: cost, retail_price: retail, stock_quantity: stock, low_stock_threshold: threshold, unit });
      App.toast('Product added', 'success');
    }
    App.closeModal('modal-product');
    await loadProducts();
  } catch (e) {
    App.toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"? This will hide it from inventory.`)) return;
  try {
    await App.api.del(`/api/products/${id}`);
    App.toast(`"${name}" deleted`, 'success');
    await loadProducts();
  } catch (e) { App.toast(e.message, 'error'); }
}

// ── Stock Adjustment ──────────────────────────────────────────────────────────
function openStockAdjust(id, name, currentStock) {
  document.getElementById('stock-product-id').value = id;
  document.getElementById('stock-product-name').textContent = name;
  document.getElementById('stock-current').textContent = currentStock + ' units';
  document.getElementById('stock-adj').value = '';
  App.openModal('modal-stock');
  setTimeout(() => document.getElementById('stock-adj')?.focus(), 200);
}

async function saveStockAdjust() {
  const id  = parseInt(document.getElementById('stock-product-id').value);
  const adj = parseInt(document.getElementById('stock-adj').value);
  if (isNaN(adj) || adj === 0) { App.toast('Enter a valid adjustment', 'warning'); return; }
  try {
    await App.api.post('/api/inventory/adjust-stock', { product_id: id, adjustment: adj });
    App.toast(`Stock updated by ${adj > 0 ? '+' : ''}${adj}`, 'success');
    App.closeModal('modal-stock');
    await loadProducts();
  } catch (e) { App.toast(e.message, 'error'); }
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['Barcode','Name','Category','Cost Price','Retail Price','Stock','Unit','Low Stock Threshold'];
  const rows = allProducts.map(p =>
    [p.barcode, p.name, p.category, p.cost_price, p.retail_price, p.stock_quantity, p.unit, p.low_stock_threshold]
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `jilmart-inventory-${App.todayISO()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('btn-add-product').addEventListener('click', openAddProduct);
  document.getElementById('btn-save-product').addEventListener('click', saveProduct);
  document.getElementById('btn-refresh-inv').addEventListener('click', loadProducts);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-save-stock').addEventListener('click', saveStockAdjust);

  document.getElementById('p-gen-barcode').addEventListener('click', () => {
    document.getElementById('p-barcode').value = Date.now().toString().slice(-10);
  });

  ['p-cost','p-retail'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', updateMarginDisplay));

  const debouncedFilter = App.debounce(filterProducts, 250);
  document.getElementById('inv-search').addEventListener('input', debouncedFilter);
  document.getElementById('inv-category').addEventListener('change', filterProducts);
  document.getElementById('inv-stock-filter').addEventListener('change', filterProducts);
}
