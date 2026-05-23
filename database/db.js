const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'jilmart.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS cashiers (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    username  TEXT UNIQUE NOT NULL,
    pin       TEXT NOT NULL,
    role      TEXT DEFAULT 'cashier',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode            TEXT UNIQUE NOT NULL,
    name               TEXT NOT NULL,
    category           TEXT DEFAULT 'General',
    cost_price         REAL NOT NULL,
    retail_price       REAL NOT NULL,
    stock_quantity     INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    unit               TEXT DEFAULT 'pcs',
    is_active          INTEGER DEFAULT 1,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quick_keys (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    name       TEXT NOT NULL,
    price      REAL NOT NULL DEFAULT 0,
    color      TEXT DEFAULT '#10B981',
    position   INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number   TEXT UNIQUE NOT NULL,
    subtotal         REAL NOT NULL,
    discount_applied REAL DEFAULT 0,
    total_amount     REAL NOT NULL,
    payment_method   TEXT NOT NULL,
    cash_given       REAL DEFAULT 0,
    change_given     REAL DEFAULT 0,
    card_amount      REAL DEFAULT 0,
    mobile_amount    REAL DEFAULT 0,
    cashier_id       INTEGER NOT NULL,
    notes            TEXT DEFAULT '',
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
  );

  CREATE TABLE IF NOT EXISTS transaction_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id  INTEGER NOT NULL,
    product_id      INTEGER NOT NULL,
    quantity        INTEGER NOT NULL,
    price_at_sale   REAL NOT NULL,
    discount_amount REAL DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (product_id)     REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Seed cashiers ─────────────────────────────────────────────────────────────
if (db.prepare('SELECT COUNT(*) as c FROM cashiers').get().c === 0) {
  db.prepare(`INSERT INTO cashiers (name,username,pin,role) VALUES
    ('Administrator','admin','1234','admin'),
    ('John Silva','john','1111','cashier'),
    ('Mary Fernando','mary','2222','cashier')`).run();
}

// ── Seed products ─────────────────────────────────────────────────────────────
if (db.prepare('SELECT COUNT(*) as c FROM products').get().c === 0) {
  const ins = db.prepare(`INSERT INTO products
    (barcode,name,category,cost_price,retail_price,stock_quantity,low_stock_threshold,unit)
    VALUES (?,?,?,?,?,?,?,?)`);
  const seed = db.transaction(rows => { for (const r of rows) ins.run(...r); });
  seed([
    // Groceries
    ['1001001001','Samba Rice 5kg',      'Groceries', 650,  780,  50, 10, 'bag'],
    ['1001001002','White Rice 5kg',      'Groceries', 600,  720,  45, 10, 'bag'],
    ['1001001003','Coconut Oil 1L',      'Groceries', 380,  450,  30,  5, 'bottle'],
    ['1001001004','Dhal Red 1kg',        'Groceries', 280,  340,  40,  8, 'pack'],
    ['1001001005','Sugar 1kg',           'Groceries', 180,  220,  60, 15, 'pack'],
    ['1001001006','Salt 400g',           'Groceries',  60,   80,  80, 20, 'pack'],
    ['1001001007','Wheat Flour 1kg',     'Groceries', 140,  180,  35, 10, 'pack'],
    ['1001001008','Coconut Milk 400ml',  'Groceries', 120,  155,  25,  5, 'can'],
    // Beverages
    ['2001001001','Elephant Tea 100g',   'Beverages', 320,  390,  25,  5, 'pack'],
    ['2001001002','Nescafe 200g',        'Beverages', 850,  990,  20,  5, 'jar'],
    ['2001001003','Milo 400g',           'Beverages', 680,  820,  22,  5, 'tin'],
    ['2001001004','Coca-Cola 330ml',     'Beverages',  85,  110, 100, 20, 'can'],
    ['2001001005','Sprite 330ml',        'Beverages',  85,  110,  80, 20, 'can'],
    ['2001001006','Water 1.5L',          'Beverages',  55,   75, 120, 30, 'bottle'],
    ['2001001007','Orange Juice 1L',     'Beverages', 280,  340,  18,  5, 'pack'],
    // Dairy
    ['3001001001','Highland Milk 1L',    'Dairy',     280,  340,  30, 10, 'pack'],
    ['3001001002','Curd 400ml',          'Dairy',     180,  220,  20,  5, 'cup'],
    ['3001001003','Butter 200g',         'Dairy',     350,  420,  15,  5, 'pack'],
    ['3001001004','Cheese Slice 200g',   'Dairy',     380,  460,  12,  5, 'pack'],
    ['3001001005','Yogurt 150g',         'Dairy',     110,  140,  24,  8, 'cup'],
    // Bakery
    ['4001001001','White Bread',         'Bakery',     75,   95,  40, 10, 'loaf'],
    ['4001001002','Brown Bread',         'Bakery',     90,  115,  25,  8, 'loaf'],
    ['4001001003','Cream Crackers 200g', 'Bakery',    120,  155,  30,  8, 'pack'],
    ['4001001004','Biscuits 100g',       'Bakery',     60,   80,  50, 10, 'pack'],
    // Household
    ['5001001001','Sunlight Soap 130g',  'Household',  85,  110,  50, 10, 'bar'],
    ['5001001002','Rinso 1kg',           'Household', 320,  390,  25,  8, 'pack'],
    ['5001001003','Toilet Paper 4-Roll', 'Household', 180,  220,  35, 10, 'pack'],
    ['5001001004','Washing Powder 1kg',  'Household', 290,  360,  20,  5, 'pack'],
    // Personal Care
    ['6001001001','Head & Shoulders 180ml','Personal Care',320,390,15,5,'bottle'],
    ['6001001002','Colgate 100ml',       'Personal Care',110,140,30,8,'tube'],
    ['6001001003','Lifebuoy Soap 100g',  'Personal Care', 65, 90,40,10,'bar'],
    // Produce
    ['7001001001','Carrot 1kg',          'Produce',   120,  160,  20,  5, 'kg'],
    ['7001001002','Tomato 1kg',          'Produce',   140,  180,  18,  5, 'kg'],
    ['7001001003','Potato 1kg',          'Produce',   100,  135,  25,  5, 'kg'],
    ['7001001004','Onion 1kg',           'Produce',    90,  120,  30,  5, 'kg'],
    ['7001001005','Cabbage (each)',       'Produce',    95,  130,  15,  5, 'pcs'],
    // Snacks
    ['8001001001','Chips 50g',           'Snacks',     55,   75,  60, 10, 'pack'],
    ['8001001002','Chocolate 50g',       'Snacks',    110,  145,  40, 10, 'bar'],
    ['8001001003','Peanuts 100g',        'Snacks',     70,   95,  35,  8, 'pack'],
    // Bags
    ['9001001001','Carry Bag Small',     'Bags',        3,    5, 500, 50, 'pcs'],
    ['9001001002','Carry Bag Large',     'Bags',        5,    8, 300, 50, 'pcs'],
  ]);
}

// ── Seed quick keys ───────────────────────────────────────────────────────────
if (db.prepare('SELECT COUNT(*) as c FROM quick_keys').get().c === 0) {
  const pid = (b) => (db.prepare('SELECT id FROM products WHERE barcode=?').get(b) || {}).id || null;
  const ik = db.prepare('INSERT INTO quick_keys (product_id,name,price,color,position) VALUES (?,?,?,?,?)');
  const sq = db.transaction(() => {
    ik.run(pid('9001001001'), 'Small Bag',   5,   '#10B981', 1);
    ik.run(pid('9001001002'), 'Large Bag',   8,   '#059669', 2);
    ik.run(pid('7001001001'), 'Carrot /kg',  160, '#F59E0B', 3);
    ik.run(pid('7001001002'), 'Tomato /kg',  180, '#EF4444', 4);
    ik.run(pid('7001001003'), 'Potato /kg',  135, '#8B5CF6', 5);
    ik.run(pid('7001001004'), 'Onion /kg',   120, '#EC4899', 6);
    ik.run(null,              'Misc Item',   0,   '#6B7280', 7);
    ik.run(null,              'Custom',      0,   '#374151', 8);
  });
  sq();
}

// ── Seed settings ─────────────────────────────────────────────────────────────
if (db.prepare('SELECT COUNT(*) as c FROM settings').get().c === 0) {
  const is = db.prepare('INSERT INTO settings (key,value) VALUES (?,?)');
  const ss = db.transaction(() => {
    is.run('store_name',    'JilMart Supermarket');
    is.run('store_address', '123 Main Street, Colombo 03');
    is.run('store_phone',   '+94 11 234 5678');
    is.run('store_email',   'info@jilmart.lk');
    is.run('currency',      'LKR');
    is.run('tax_rate',      '0');
    is.run('receipt_footer','Thank you for shopping at JilMart!\nPlease come again.');
    is.run('low_stock_alert','1');
    is.run('printer_width', '48');
  });
  ss();
}

module.exports = db;
