const express = require('express');
const router  = express.Router();
const db      = require('../database/db');

router.get('/', (req, res) => {
  const { category, search, lowstock } = req.query;
  let sql = 'SELECT * FROM products WHERE is_active=1';
  const p = [];
  if (category)        { sql += ' AND category=?';                    p.push(category); }
  if (search)          { sql += ' AND (name LIKE ? OR barcode LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
  if (lowstock === '1'){ sql += ' AND stock_quantity <= low_stock_threshold'; }
  sql += ' ORDER BY name';
  res.json(db.prepare(sql).all(...p));
});

router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  res.json(db.prepare(
    'SELECT * FROM products WHERE is_active=1 AND (name LIKE ? OR barcode LIKE ?) LIMIT 12'
  ).all(`%${q}%`, `%${q}%`));
});

router.get('/meta/categories', (req, res) => {
  res.json(db.prepare(
    'SELECT DISTINCT category FROM products WHERE is_active=1 ORDER BY category'
  ).all().map(r => r.category));
});

router.get('/barcode/:barcode', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE barcode=? AND is_active=1').get(req.params.barcode);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

router.post('/', (req, res) => {
  const { barcode, name, category, cost_price, retail_price, stock_quantity, low_stock_threshold, unit } = req.body;
  if (!barcode || !name || cost_price == null || retail_price == null)
    return res.status(400).json({ error: 'barcode, name, cost_price and retail_price are required' });
  try {
    const r = db.prepare(`INSERT INTO products
      (barcode,name,category,cost_price,retail_price,stock_quantity,low_stock_threshold,unit)
      VALUES (?,?,?,?,?,?,?,?)`
    ).run(barcode, name, category||'General', cost_price, retail_price,
          stock_quantity||0, low_stock_threshold||10, unit||'pcs');
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(r.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Barcode already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, category, cost_price, retail_price, stock_quantity, low_stock_threshold, unit } = req.body;
  try {
    db.prepare(`UPDATE products SET
      name=?,category=?,cost_price=?,retail_price=?,stock_quantity=?,
      low_stock_threshold=?,unit=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).run(name, category, cost_price, retail_price, stock_quantity, low_stock_threshold, unit, req.params.id);
    res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE products SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
