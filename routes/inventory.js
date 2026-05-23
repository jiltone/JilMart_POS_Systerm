const express = require('express');
const router  = express.Router();
const db      = require('../database/db');

// ── Cashiers ──────────────────────────────────────────────────────────────────
router.get('/cashiers', (req, res) => {
  res.json(db.prepare(
    'SELECT id,name,username,role,is_active,created_at FROM cashiers ORDER BY name'
  ).all());
});

router.post('/cashiers/login', (req, res) => {
  const c = db.prepare(
    'SELECT id,name,username,role FROM cashiers WHERE pin=? AND is_active=1'
  ).get(req.body.pin);
  if (!c) return res.status(401).json({ error: 'Invalid PIN' });
  res.json(c);
});

router.post('/cashiers', (req, res) => {
  const { name, username, pin, role } = req.body;
  if (!name || !username || !pin) return res.status(400).json({ error: 'name, username, pin required' });
  try {
    const r = db.prepare('INSERT INTO cashiers (name,username,pin,role) VALUES (?,?,?,?)')
      .run(name, username, pin, role||'cashier');
    res.status(201).json(db.prepare('SELECT id,name,username,role,is_active FROM cashiers WHERE id=?').get(r.lastInsertRowid));
  } catch(e) { res.status(400).json({ error: e.message }); }
});

router.put('/cashiers/:id', (req, res) => {
  const { name, pin, role, is_active } = req.body;
  db.prepare('UPDATE cashiers SET name=?,pin=?,role=?,is_active=? WHERE id=?')
    .run(name, pin, role, is_active, req.params.id);
  res.json(db.prepare('SELECT id,name,username,role,is_active FROM cashiers WHERE id=?').get(req.params.id));
});

// ── Stock adjustment ──────────────────────────────────────────────────────────
router.post('/adjust-stock', (req, res) => {
  const { product_id, adjustment } = req.body;
  db.prepare('UPDATE products SET stock_quantity=stock_quantity+?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(adjustment, product_id);
  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(product_id));
});

// ── Quick keys ────────────────────────────────────────────────────────────────
router.get('/quick-keys', (req, res) => {
  res.json(db.prepare(`SELECT qk.*,p.retail_price as product_price,p.stock_quantity,p.name as product_name
    FROM quick_keys qk LEFT JOIN products p ON qk.product_id=p.id ORDER BY position`).all());
});

router.post('/quick-keys', (req, res) => {
  const { keys } = req.body;
  const upsert = db.transaction(() => {
    for (const k of keys) {
      if (k.id) {
        db.prepare('UPDATE quick_keys SET name=?,price=?,color=?,position=?,product_id=? WHERE id=?')
          .run(k.name, k.price, k.color, k.position, k.product_id||null, k.id);
      } else {
        db.prepare('INSERT INTO quick_keys (product_id,name,price,color,position) VALUES (?,?,?,?,?)')
          .run(k.product_id||null, k.name, k.price, k.color, k.position);
      }
    }
  });
  upsert();
  res.json({ success: true });
});

router.delete('/quick-keys/:id', (req, res) => {
  db.prepare('DELETE FROM quick_keys WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Settings ──────────────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const obj  = {};
  rows.forEach(r => obj[r.key] = r.value);
  res.json(obj);
});

router.put('/settings', (req, res) => {
  const upsert = db.transaction(() => {
    for (const [k, v] of Object.entries(req.body)) {
      db.prepare('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)')
        .run(k, v);
    }
  });
  upsert();
  res.json({ success: true });
});

module.exports = router;
