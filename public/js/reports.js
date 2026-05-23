/* ── JilMart POS — Reports Page ─────────────────────────────────────────────── */
'use strict';

let charts = {};

document.addEventListener('DOMContentLoaded', async () => {
  App.initSidebarToggle();

  // Set default date to today
  const today = App.todayISO();
  document.getElementById('report-date').value = today;
  document.getElementById('hist-date').value   = today;
  document.getElementById('monthly-picker').value = today.slice(0, 7);
  document.getElementById('tp-to').value   = today;
  document.getElementById('tp-from').value = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);

  await loadDashboard();
  await loadDailyReport(today);
  await loadWeeklyReport();
  bindEvents();
});

// ── Dashboard stats ───────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const d = await App.api.get('/api/reports/dashboard');
    document.getElementById('stat-revenue').textContent  = App.fmt(d.today.revenue);
    document.getElementById('stat-txn').textContent      = d.today.count;
    document.getElementById('stat-lowstock').textContent = d.lowStock;

    const avg = d.today.count > 0 ? d.today.revenue / d.today.count : 0;
    document.getElementById('stat-avg').textContent = App.fmt(avg);

    const diff = d.today.revenue - d.yesterday.revenue;
    const pct  = d.yesterday.revenue > 0 ? (diff / d.yesterday.revenue * 100).toFixed(1) : 0;
    const meta = document.getElementById('stat-revenue-meta');
    meta.textContent = `${diff >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs yesterday`;
    meta.className   = 'stat-meta ' + (diff >= 0 ? 'up' : 'down');
  } catch {}
}

// ── Daily ─────────────────────────────────────────────────────────────────────
async function loadDailyReport(date) {
  try {
    const data = await App.api.get(`/api/reports/daily?date=${date}`);
    renderDailyTopProducts(data.topProducts);
    renderHourlyChart(data.hourly);
    renderPaymentChart(data.byPayment);
  } catch (e) { App.toast('Failed to load daily report', 'error'); }
}

function renderDailyTopProducts(products) {
  const tbody = document.getElementById('daily-top-body');
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-4)">No sales on this date</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td style="font-weight:500">${App.esc(p.name)}</td>
      <td class="mono" style="font-size:11px;color:var(--text-3)">${App.esc(p.barcode)}</td>
      <td class="text-center"><strong>${p.qty_sold}</strong></td>
      <td class="text-right fw-600 text-primary">${App.fmt(p.revenue)}</td>
    </tr>`).join('');
}

function renderHourlyChart(hourly) {
  const ctx = document.getElementById('chart-hourly').getContext('2d');
  if (charts.hourly) charts.hourly.destroy();

  const labels   = Array.from({length:24}, (_,i) => `${String(i).padStart(2,'0')}:00`);
  const revenues = labels.map((_,i) => {
    const h = hourly.find(r => parseInt(r.hour) === i);
    return h ? h.revenue : 0;
  });

  charts.hourly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.filter((_,i) => revenues[i] > 0 || (i >= 6 && i <= 22)),
      datasets: [{
        label: 'Revenue (LKR)',
        data: revenues.filter((_,i) => revenues[i] > 0 || (i >= 6 && i <= 22)),
        backgroundColor: 'rgba(16,185,129,0.7)',
        borderColor: '#10B981',
        borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'Rs.'+v } } }
    }
  });
}

function renderPaymentChart(byPayment) {
  const ctx = document.getElementById('chart-payment').getContext('2d');
  if (charts.payment) charts.payment.destroy();
  if (!byPayment.length) return;

  const COLORS = { CASH:'#10B981', CARD:'#3B82F6', MOBILE:'#8B5CF6', SPLIT:'#F97316' };
  charts.payment = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: byPayment.map(r => r.payment_method),
      datasets: [{
        data: byPayment.map(r => r.total),
        backgroundColor: byPayment.map(r => COLORS[r.payment_method] || '#6B7280'),
        borderWidth: 2, borderColor: '#fff',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${App.fmt(ctx.raw)}` } }
      }
    }
  });
}

// ── Weekly ────────────────────────────────────────────────────────────────────
async function loadWeeklyReport() {
  try {
    const data = await App.api.get('/api/reports/weekly');
    renderWeeklyChart(data);
    renderWeeklyTable(data);
  } catch {}
}

function renderWeeklyChart(days) {
  const ctx = document.getElementById('chart-weekly').getContext('2d');
  if (charts.weekly) charts.weekly.destroy();
  charts.weekly = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days.map(d => App.fmtDate(d.date)),
      datasets: [{
        label: 'Revenue (LKR)',
        data: days.map(d => d.revenue),
        borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)',
        fill: true, tension: 0.3, pointRadius: 5,
        pointBackgroundColor: '#10B981',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'Rs.'+v } } }
    }
  });
}

function renderWeeklyTable(days) {
  const tbody = document.getElementById('weekly-tbody');
  if (!days.length) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-4)">No data</td></tr>'; return; }
  tbody.innerHTML = days.map(d => `
    <tr>
      <td>${App.fmtDate(d.date)}</td>
      <td class="text-center">${d.transaction_count}</td>
      <td class="text-right fw-600 text-primary">${App.fmt(d.revenue)}</td>
    </tr>`).join('');
}

// ── Monthly ───────────────────────────────────────────────────────────────────
async function loadMonthlyReport(month) {
  try {
    const data = await App.api.get(`/api/reports/monthly?month=${month}`);
    renderMonthlyChart(data.days);
    renderMonthlyTable(data.days);
    document.getElementById('monthly-total-badge').textContent =
      `Total: ${App.fmt(data.total.total_revenue)} · ${data.total.transaction_count} txns`;
  } catch {}
}

function renderMonthlyChart(days) {
  const ctx = document.getElementById('chart-monthly').getContext('2d');
  if (charts.monthly) charts.monthly.destroy();
  charts.monthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.map(d => App.fmtDate(d.date)),
      datasets: [{
        label: 'Revenue',
        data: days.map(d => d.revenue),
        backgroundColor: 'rgba(16,185,129,0.75)',
        borderColor: '#10B981', borderWidth: 1, borderRadius: 4,
      }, {
        label: 'Discounts',
        data: days.map(d => d.discounts),
        backgroundColor: 'rgba(239,68,68,0.5)',
        borderColor: '#EF4444', borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'Rs.'+v } } }
    }
  });
}

function renderMonthlyTable(days) {
  const tbody = document.getElementById('monthly-tbody');
  if (!days.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-4)">No data</td></tr>'; return; }
  tbody.innerHTML = days.map(d => `
    <tr>
      <td>${App.fmtDate(d.date)}</td>
      <td class="text-center">${d.transaction_count}</td>
      <td class="text-right fw-600 text-primary">${App.fmt(d.revenue)}</td>
      <td class="text-right text-danger">${App.fmt(d.discounts)}</td>
    </tr>`).join('');
}

// ── Top Products ──────────────────────────────────────────────────────────────
async function loadTopProducts(from, to) {
  try {
    let url = '/api/reports/top-products?limit=30';
    if (from) url += `&start_date=${from}`;
    if (to)   url += `&end_date=${to}`;
    const products = await App.api.get(url);
    const tbody    = document.getElementById('top-products-tbody');
    if (!products.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-4)">No data</td></tr>';
      return;
    }
    tbody.innerHTML = products.map((p, i) => `
      <tr>
        <td><strong>#${i+1}</strong></td>
        <td style="font-weight:500">${App.esc(p.name)}</td>
        <td><span class="badge badge-gray">${App.esc(p.category)}</span></td>
        <td class="text-center">${p.qty_sold}</td>
        <td class="text-right fw-700 text-primary">${App.fmt(p.revenue)}</td>
      </tr>`).join('');
  } catch {}
}

// ── Transaction history ───────────────────────────────────────────────────────
async function loadHistory(date) {
  try {
    const txns  = await App.api.get(`/api/transactions?date=${date}&limit=100`);
    const tbody = document.getElementById('history-tbody');
    if (!txns.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-4)">No transactions on this date</td></tr>';
      return;
    }
    const PMETA = { CASH:'💵', CARD:'💳', MOBILE:'📱', SPLIT:'⚡' };
    tbody.innerHTML = txns.map(t => `
      <tr>
        <td class="mono" style="font-size:11px">${App.esc(t.receipt_number)}</td>
        <td style="color:var(--text-3)">${App.fmtTime(t.created_at)}</td>
        <td>${App.esc(t.cashier_name || '—')}</td>
        <td>${PMETA[t.payment_method]||''} ${t.payment_method}</td>
        <td class="text-right fw-600">${App.fmt(t.total_amount)}</td>
        <td class="text-right text-danger">${t.discount_applied > 0 ? App.fmt(t.discount_applied) : '—'}</td>
        <td class="text-center">
          <button class="btn btn-secondary btn-sm" onclick="showTxnDetail(${t.id})">View</button>
        </td>
      </tr>`).join('');
  } catch {}
}

async function showTxnDetail(id) {
  try {
    const t = await App.api.get(`/api/transactions/${id}`);
    const PMETA = { CASH:'💵 Cash', CARD:'💳 Card', MOBILE:'📱 Mobile', SPLIT:'⚡ Split' };
    const itemRows = t.items.map(i => {
      const total = (i.price_at_sale * i.quantity - (i.discount_amount||0)).toFixed(2);
      return `<tr>
        <td>${App.esc(i.name)}</td>
        <td class="text-center">${i.quantity}</td>
        <td class="text-right">${App.fmt(i.price_at_sale)}</td>
        <td class="text-right fw-600">${App.fmt(total)}</td>
      </tr>`;
    }).join('');

    document.getElementById('txn-detail-body').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:13px">
        <div><strong>Receipt:</strong> ${App.esc(t.receipt_number)}</div>
        <div><strong>Date:</strong> ${App.fmtDateTime(t.created_at)}</div>
        <div><strong>Cashier:</strong> ${App.esc(t.cashier_name||'—')}</div>
        <div><strong>Payment:</strong> ${PMETA[t.payment_method]||t.payment_method}</div>
        ${t.cash_given > 0 ? `<div><strong>Cash:</strong> ${App.fmt(t.cash_given)}</div><div><strong>Change:</strong> ${App.fmt(t.change_given)}</div>` : ''}
      </div>
      <table class="data-table mb-12">
        <thead><tr><th>Product</th><th class="text-center">Qty</th><th class="text-right">Price</th><th class="text-right">Total</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="border-top:2px solid var(--border);padding-top:10px">
        <div class="receipt-totals-row"><span>Subtotal</span><span>${App.fmt(t.subtotal)}</span></div>
        ${t.discount_applied > 0 ? `<div class="receipt-totals-row" style="color:var(--danger)"><span>Discount</span><span>- ${App.fmt(t.discount_applied)}</span></div>` : ''}
        <div class="receipt-grand-total"><span>TOTAL</span><span>${App.fmt(t.total_amount)}</span></div>
      </div>`;
    App.openModal('modal-txn-detail');
  } catch (e) { App.toast('Failed to load transaction', 'error'); }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

      // Lazy load on tab click
      if (btn.dataset.tab === 'weekly')   loadWeeklyReport();
      if (btn.dataset.tab === 'monthly')  loadMonthlyReport(document.getElementById('monthly-picker').value);
      if (btn.dataset.tab === 'products') loadTopProducts(document.getElementById('tp-from').value, document.getElementById('tp-to').value);
      if (btn.dataset.tab === 'history')  loadHistory(document.getElementById('hist-date').value);
    });
  });

  document.getElementById('btn-load-report').addEventListener('click', () => {
    const date = document.getElementById('report-date').value;
    loadDailyReport(date);
    loadDashboard();
  });
  document.getElementById('btn-load-month').addEventListener('click', () => {
    loadMonthlyReport(document.getElementById('monthly-picker').value);
  });
  document.getElementById('btn-load-top').addEventListener('click', () => {
    loadTopProducts(document.getElementById('tp-from').value, document.getElementById('tp-to').value);
  });
  document.getElementById('btn-tp-all').addEventListener('click', () => {
    document.getElementById('tp-from').value = '';
    document.getElementById('tp-to').value   = '';
    loadTopProducts('', '');
  });
  document.getElementById('btn-load-hist').addEventListener('click', () => {
    loadHistory(document.getElementById('hist-date').value);
  });
}
