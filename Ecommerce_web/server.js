const express = require('express');
const { DatabaseSync } = require('node:sqlite'); // built into Node 22.13+ / 24 - no native compile needed
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const db = new DatabaseSync(path.join(__dirname, 'shop.db'));
db.exec('PRAGMA foreign_keys = ON');
// Small helper replacing better-sqlite3's db.transaction()
db.transaction = fn => (...args) => {
  db.exec('BEGIN');
  try { const r = fn(...args); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

// ---------- Database design ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  category TEXT NOT NULL,
  emoji TEXT DEFAULT '📦'
);
CREATE TABLE IF NOT EXISTS cart_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shipped','delivered','cancelled')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL
);
`);

// Seed demo admin + products on first run
if (!db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) {
  db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')")
    .run('Admin', 'admin@shop.com', bcrypt.hashSync('admin123', 10));
}
if (!db.prepare('SELECT 1 FROM products').get()) {
  const ins = db.prepare('INSERT INTO products (name,description,price,stock,category,emoji) VALUES (?,?,?,?,?,?)');
  [
    ['Wireless Headphones', 'Over-ear, 30h battery', 79.99, 25, 'Electronics', '🎧'],
    ['Smart Watch', 'Fitness and sleep tracking', 129.0, 15, 'Electronics', '⌚'],
    ['Mechanical Keyboard', 'Hot-swappable switches', 89.5, 20, 'Electronics', '⌨️'],
    ['Running Shoes', 'Lightweight daily trainers', 64.99, 30, 'Fashion', '👟'],
    ['Denim Jacket', 'Classic fit', 55.0, 12, 'Fashion', '🧥'],
    ['Backpack', '25L, water resistant', 39.9, 40, 'Fashion', '🎒'],
    ['Ceramic Mug Set', 'Set of 4', 24.0, 50, 'Home', '☕'],
    ['Desk Lamp', 'Dimmable LED', 32.5, 18, 'Home', '💡'],
    ['Yoga Mat', 'Non-slip, 6mm', 21.0, 35, 'Sports', '🧘'],
    ['Water Bottle', 'Insulated steel, 750ml', 18.75, 60, 'Sports', '🍶']
  ].forEach(p => ins.run(...p));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- User accounts & auth ----------
const sign = u => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  try {
    const { id } = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
    const u = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);
    if (!u) throw new Error();
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
}
const admin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const r = db.prepare("INSERT INTO users (name,email,password_hash) VALUES (?,?,?)")
      .run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10));
    const user = { id: r.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase(), role: 'customer' };
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    const dup = e.errcode === 2067 || /UNIQUE constraint/i.test(e.message);
    res.status(dup ? 409 : 500).json({ error: dup ? 'Email already registered' : 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get((req.body.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

app.get('/api/auth/me', auth, (req, res) => res.json(req.user));

// ---------- Product management APIs ----------
function validateProduct(b) {
  if (!b.name?.trim()) return 'Name is required';
  if (!(+b.price >= 0) || b.price === '' || b.price == null) return 'Price must be 0 or more';
  if (!Number.isInteger(+b.stock) || +b.stock < 0) return 'Stock must be a whole number, 0 or more';
  if (!b.category?.trim()) return 'Category is required';
  return null;
}
const prodVals = b => [b.name.trim(), (b.description || '').trim(), +(+b.price).toFixed(2), +b.stock, b.category.trim(), b.emoji?.trim() || '📦'];

app.get('/api/categories', (req, res) =>
  res.json(db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all().map(r => r.category)));

app.get('/api/products', (req, res) => {
  const q = `%${req.query.q || ''}%`, cat = req.query.category || '';
  res.json(db.prepare(`SELECT * FROM products WHERE (name LIKE ? OR description LIKE ?)
    AND (? = '' OR category = ?) ORDER BY id`).all(q, q, cat, cat));
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'Product not found' });
});

app.post('/api/products', auth, admin, (req, res) => {
  const err = validateProduct(req.body);
  if (err) return res.status(400).json({ error: err });
  const r = db.prepare('INSERT INTO products (name,description,price,stock,category,emoji) VALUES (?,?,?,?,?,?)').run(...prodVals(req.body));
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/products/:id', auth, admin, (req, res) => {
  const err = validateProduct(req.body);
  if (err) return res.status(400).json({ error: err });
  const r = db.prepare('UPDATE products SET name=?, description=?, price=?, stock=?, category=?, emoji=? WHERE id=?').run(...prodVals(req.body), req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Product not found' });
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

app.delete('/api/products/:id', auth, admin, (req, res) => {
  const r = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  r.changes ? res.json({ deleted: true }) : res.status(404).json({ error: 'Product not found' });
});

// ---------- Shopping cart (stored per user) ----------
const getCart = uid => db.prepare(`SELECT p.id, p.name, p.price, p.stock, p.emoji, c.quantity
  FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.user_id = ? ORDER BY c.rowid`).all(uid);

app.get('/api/cart', auth, (req, res) => res.json(getCart(req.user.id)));

app.post('/api/cart', auth, (req, res) => {
  const pid = +req.body.productId, add = +req.body.quantity || 1;
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const cur = db.prepare('SELECT quantity FROM cart_items WHERE user_id=? AND product_id=?').get(req.user.id, pid)?.quantity || 0;
  if (add < 1 || cur + add > p.stock) return res.status(400).json({ error: `Only ${p.stock} in stock` });
  db.prepare(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`).run(req.user.id, pid, add);
  res.status(201).json(getCart(req.user.id));
});

app.put('/api/cart/:productId', auth, (req, res) => {
  const qty = +req.body.quantity;
  if (!Number.isInteger(qty)) return res.status(400).json({ error: 'Quantity must be a number' });
  if (qty <= 0) db.prepare('DELETE FROM cart_items WHERE user_id=? AND product_id=?').run(req.user.id, req.params.productId);
  else {
    const p = db.prepare('SELECT stock FROM products WHERE id = ?').get(req.params.productId);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    if (qty > p.stock) return res.status(400).json({ error: `Only ${p.stock} in stock` });
    db.prepare('UPDATE cart_items SET quantity=? WHERE user_id=? AND product_id=?').run(qty, req.user.id, req.params.productId);
  }
  res.json(getCart(req.user.id));
});

app.delete('/api/cart/:productId', auth, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id=? AND product_id=?').run(req.user.id, req.params.productId);
  res.json(getCart(req.user.id));
});

// ---------- Orders ----------
const withItems = o => ({ ...o, items: db.prepare('SELECT product_id, name, price, quantity FROM order_items WHERE order_id = ?').all(o.id) });

app.post('/api/orders', auth, (req, res) => {
  const items = getCart(req.user.id);
  if (!items.length) return res.status(400).json({ error: 'Your cart is empty' });
  const short = items.find(i => i.quantity > i.stock);
  if (short) return res.status(400).json({ error: `Only ${short.stock} of "${short.name}" in stock` });

  const place = db.transaction(() => {
    const total = +items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2);
    const id = db.prepare('INSERT INTO orders (user_id, total) VALUES (?,?)').run(req.user.id, total).lastInsertRowid;
    for (const i of items) {
      db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity) VALUES (?,?,?,?,?)').run(id, i.id, i.name, i.price, i.quantity);
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(i.quantity, i.id);
    }
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
    return id;
  });
  const id = place();
  res.status(201).json(withItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)));
});

app.get('/api/orders', auth, (req, res) => {
  const all = req.user.role === 'admin' && req.query.all === '1';
  const rows = db.prepare(`SELECT o.*, u.name AS customer FROM orders o JOIN users u ON u.id = o.user_id
    ${all ? '' : 'WHERE o.user_id = ?'} ORDER BY o.id DESC`).all(...(all ? [] : [req.user.id]));
  res.json(rows.map(withItems));
});

function setStatus(order, status) {
  db.transaction(() => {
    if (status === 'cancelled' && order.status !== 'cancelled') {
      for (const i of db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(order.id))
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.quantity, i.product_id);
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, order.id);
  })();
  return withItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id));
}

app.put('/api/orders/:id/status', auth, admin, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (!['pending', 'shipped', 'delivered', 'cancelled'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
  if (o.status === 'cancelled' && req.body.status !== 'cancelled') return res.status(400).json({ error: 'Cancelled orders cannot be reopened' });
  res.json(setStatus(o, req.body.status));
});

app.put('/api/orders/:id/cancel', auth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (o.status !== 'pending') return res.status(400).json({ error: 'Only pending orders can be cancelled' });
  res.json(setStatus(o, 'cancelled'));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`Shop running at http://localhost:${PORT}\nDemo admin: admin@shop.com / admin123`));
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use - an old copy of the shop is probably still running.`);
      console.error('Close the other terminal window running it, or run "stop-shop.bat", or use another port:');
      console.error(`  set PORT=4000 && npm start\n`);
    } else console.error(e);
    process.exit(1);
  });
}
module.exports = app;
