const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const db = new Database(path.join(__dirname, 'expenses.db'));
db.pragma('foreign_keys = ON');

// Step 3: financial records stored in SQLite
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount REAL NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Step 5: Authentication ----------
const sign = u => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.userId = jwt.verify(h.replace('Bearer ', ''), JWT_SECRET).id;
    next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
}

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const r = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?,?,?)')
      .run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10));
    const user = { id: r.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase() };
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    res.status(e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500)
      .json({ error: e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Email already registered' : 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password_hash))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const u = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.userId);
  u ? res.json(u) : res.status(401).json({ error: 'User not found' });
});

// ---------- Step 2: Expense management APIs ----------
function validateTx(b) {
  if (!['income', 'expense'].includes(b.type)) return 'Type must be income or expense';
  if (!(+b.amount > 0)) return 'Amount must be greater than 0';
  if (!b.category?.trim()) return 'Category is required';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return 'Date is required (YYYY-MM-DD)';
  return null;
}
const txVals = b => [b.type, +(+b.amount).toFixed(2), b.category.trim(), (b.description || '').trim(), b.date];

app.get('/api/transactions', auth, (req, res) => {
  const { month, type } = req.query; // month = YYYY-MM
  let sql = 'SELECT * FROM transactions WHERE user_id = ?';
  const args = [req.userId];
  if (month) { sql += ' AND substr(date,1,7) = ?'; args.push(month); }
  if (type === 'income' || type === 'expense') { sql += ' AND type = ?'; args.push(type); }
  res.json(db.prepare(sql + ' ORDER BY date DESC, id DESC').all(...args));
});

app.post('/api/transactions', auth, (req, res) => {
  const err = validateTx(req.body);
  if (err) return res.status(400).json({ error: err });
  const r = db.prepare('INSERT INTO transactions (user_id, type, amount, category, description, date) VALUES (?,?,?,?,?,?)')
    .run(req.userId, ...txVals(req.body));
  res.status(201).json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/transactions/:id', auth, (req, res) => {
  const err = validateTx(req.body);
  if (err) return res.status(400).json({ error: err });
  const r = db.prepare('UPDATE transactions SET type=?, amount=?, category=?, description=?, date=? WHERE id=? AND user_id=?')
    .run(...txVals(req.body), req.params.id, req.userId);
  if (!r.changes) return res.status(404).json({ error: 'Transaction not found' });
  res.json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id));
});

app.delete('/api/transactions/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  r.changes ? res.json({ deleted: true }) : res.status(404).json({ error: 'Transaction not found' });
});

// ---------- Step 4: Reports and summaries ----------
app.get('/api/summary', auth, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const totals = db.prepare(`SELECT type, COALESCE(SUM(amount),0) total FROM transactions
    WHERE user_id = ? AND substr(date,1,7) = ? GROUP BY type`).all(req.userId, month);
  const income = totals.find(t => t.type === 'income')?.total || 0;
  const expense = totals.find(t => t.type === 'expense')?.total || 0;

  const byCategory = db.prepare(`SELECT category, SUM(amount) total FROM transactions
    WHERE user_id = ? AND type = 'expense' AND substr(date,1,7) = ?
    GROUP BY category ORDER BY total DESC`).all(req.userId, month);

  const monthly = db.prepare(`SELECT substr(date,1,7) month, type, SUM(amount) total FROM transactions
    WHERE user_id = ? GROUP BY month, type`).all(req.userId);
  const months = [...new Set(monthly.map(m => m.month))].sort().slice(-6);
  const trend = months.map(m => ({
    month: m,
    income: monthly.find(x => x.month === m && x.type === 'income')?.total || 0,
    expense: monthly.find(x => x.month === m && x.type === 'expense')?.total || 0
  }));

  res.json({ month, income, expense, balance: income - expense, byCategory, trend });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Expense Tracker running at http://localhost:${PORT}`));
