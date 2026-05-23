const express = require('express');
const router  = express.Router();
const db      = require('../database/db');

function genReceiptNo() {
  const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const last = db.prepare(
    `SELECT receipt_number FROM transactions WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`RCP-${d}-%`);
  const seq = last ? parseInt(last.receipt_number.split('-').pop()) + 1 : 1;
  return `RCP-${d}-${String(seq).padStart(4,'0')}`;
}

router.post('/', (req, res) => {
  const { items, payment_method, subtotal, discount_applied, total_amount,
          cash_given, change_given, card_amount, mobile_amount, cashier_id, notes } = req.body;

  if (!items || items.length === 0)
    return res.status(400).json({ error: 'No items in transaction' });

  const create = db.transaction(() => {
    const receiptNo = genReceiptNo();
    const txn = db.prepare(`INSERT INTO transactions
      (receipt_number,subtotal,discount_applied,total_amount,payment_method,
       cash_given,change_given,card_amount,mobile_amount,cashier_id,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(receiptNo, subtotal, discount_applied||0, total_amount, payment_method,
          cash_given||0, change_given||0, card_amount||0, mobile_amount||0, cashier_id, notes||'');

    for (const item of items) {
      db.prepare(`INSERT INTO transaction_items
        (transaction_id,product_id,quantity,price_at_sale,discount_amount)
        VALUES (?,?,?,?,?)`
      ).run(txn.lastInsertRowid, item.product_id, item.quantity, item.price_at_sale, item.discount_amount||0);
      db.prepare('UPDATE products SET stock_quantity=stock_quantity-? WHERE id=?')
        .run(item.quantity, item.product_id);
    }
    return txn.lastInsertRowid;
  });

  try {
    const id = create();
    const transaction = db.prepare(
      `SELECT t.*,c.name as cashier_name FROM transactions t
       LEFT JOIN cashiers c ON t.cashier_id=c.id WHERE t.id=?`
    ).get(id);
    const tItems = db.prepare(
      `SELECT ti.*,p.name,p.barcode,p.unit FROM transaction_items ti
       LEFT JOIN products p ON ti.product_id=p.id WHERE ti.transaction_id=?`
    ).all(id);
    res.status(201).json({ ...transaction, items: tItems });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', (req, res) => {
  const { date, cashier_id, limit=50, offset=0 } = req.query;
  let sql = `SELECT t.*,c.name as cashier_name FROM transactions t
             LEFT JOIN cashiers c ON t.cashier_id=c.id WHERE 1=1`;
  const p = [];
  if (date)       { sql += ' AND DATE(t.created_at)=?'; p.push(date); }
  if (cashier_id) { sql += ' AND t.cashier_id=?';       p.push(cashier_id); }
  sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  p.push(+limit, +offset);
  res.json(db.prepare(sql).all(...p));
});

router.get('/:id', (req, res) => {
  const t = db.prepare(
    `SELECT t.*,c.name as cashier_name FROM transactions t
     LEFT JOIN cashiers c ON t.cashier_id=c.id WHERE t.id=?`
  ).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare(
    `SELECT ti.*,p.name,p.barcode,p.unit FROM transaction_items ti
     LEFT JOIN products p ON ti.product_id=p.id WHERE ti.transaction_id=?`
  ).all(req.params.id);
  res.json({ ...t, items });
});

module.exports = router;
