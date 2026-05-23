const express = require('express');
const router  = express.Router();
const db      = require('../database/db');

router.get('/dashboard', (req, res) => {
  const today     = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
  res.json({
    today:         db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue
                               FROM transactions WHERE DATE(created_at)=?`).get(today),
    yesterday:     db.prepare(`SELECT COALESCE(SUM(total_amount),0) as revenue
                               FROM transactions WHERE DATE(created_at)=?`).get(yesterday),
    lowStock:      db.prepare(`SELECT COUNT(*) as count FROM products
                               WHERE stock_quantity<=low_stock_threshold AND is_active=1`).get().count,
    totalProducts: db.prepare(`SELECT COUNT(*) as count FROM products WHERE is_active=1`).get().count,
    totalTxnToday: db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE DATE(created_at)=?`).get(today).count,
  });
});

router.get('/daily', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0,10);
  res.json({
    date,
    summary: db.prepare(`SELECT COUNT(*) as transaction_count,
      COALESCE(SUM(total_amount),0) as total_revenue,
      COALESCE(SUM(discount_applied),0) as total_discounts,
      COALESCE(AVG(total_amount),0) as avg_transaction,
      COALESCE(MAX(total_amount),0) as max_transaction
      FROM transactions WHERE DATE(created_at)=?`).get(date),
    byPayment: db.prepare(`SELECT payment_method,COUNT(*) as count,SUM(total_amount) as total
      FROM transactions WHERE DATE(created_at)=? GROUP BY payment_method`).all(date),
    topProducts: db.prepare(`SELECT p.name,p.barcode,SUM(ti.quantity) as qty_sold,
      SUM(ti.quantity*ti.price_at_sale) as revenue
      FROM transaction_items ti JOIN products p ON ti.product_id=p.id
      JOIN transactions t ON ti.transaction_id=t.id
      WHERE DATE(t.created_at)=? GROUP BY p.id ORDER BY qty_sold DESC LIMIT 10`).all(date),
    hourly: db.prepare(`SELECT strftime('%H',created_at) as hour,COUNT(*) as count,
      SUM(total_amount) as revenue FROM transactions
      WHERE DATE(created_at)=? GROUP BY hour ORDER BY hour`).all(date),
    transactions: db.prepare(`SELECT t.*,c.name as cashier_name FROM transactions t
      LEFT JOIN cashiers c ON t.cashier_id=c.id
      WHERE DATE(t.created_at)=? ORDER BY t.created_at DESC`).all(date),
  });
});

router.get('/weekly', (req, res) => {
  res.json(db.prepare(`SELECT DATE(created_at) as date,COUNT(*) as transaction_count,
    SUM(total_amount) as revenue FROM transactions
    WHERE created_at>=datetime('now','-7 days')
    GROUP BY date ORDER BY date`).all());
});

router.get('/monthly', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0,7);
  res.json({
    month,
    days:  db.prepare(`SELECT DATE(created_at) as date,COUNT(*) as transaction_count,
             SUM(total_amount) as revenue,SUM(discount_applied) as discounts
             FROM transactions WHERE strftime('%Y-%m',created_at)=?
             GROUP BY date ORDER BY date`).all(month),
    total: db.prepare(`SELECT COUNT(*) as transaction_count,
             COALESCE(SUM(total_amount),0) as total_revenue,
             COALESCE(SUM(discount_applied),0) as total_discounts
             FROM transactions WHERE strftime('%Y-%m',created_at)=?`).get(month),
  });
});

router.get('/top-products', (req, res) => {
  const { start_date, end_date, limit=20 } = req.query;
  let sql = `SELECT p.name,p.category,p.barcode,SUM(ti.quantity) as qty_sold,
    SUM(ti.quantity*ti.price_at_sale) as revenue
    FROM transaction_items ti JOIN products p ON ti.product_id=p.id
    JOIN transactions t ON ti.transaction_id=t.id WHERE 1=1`;
  const p = [];
  if (start_date){ sql += ' AND DATE(t.created_at)>=?'; p.push(start_date); }
  if (end_date)  { sql += ' AND DATE(t.created_at)<=?'; p.push(end_date); }
  sql += ' GROUP BY p.id ORDER BY revenue DESC LIMIT ?';
  p.push(+limit);
  res.json(db.prepare(sql).all(...p));
});

module.exports = router;
