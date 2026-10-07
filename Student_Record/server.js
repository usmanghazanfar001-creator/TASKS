const express = require('express');
const { DatabaseSync } = require('node:sqlite'); // built into Node 22.5+ (no native build needed)
const path = require('path');

// Step 3: database connectivity (SQLite file created automatically)
const db = new DatabaseSync(path.join(__dirname, 'students.db'));
db.exec(`CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  course TEXT NOT NULL,
  age INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function validate(b) {
  if (!b.name || !b.name.trim()) return 'Name is required';
  if (!b.email || !/^\S+@\S+\.\S+$/.test(b.email)) return 'Valid email is required';
  if (!b.course || !b.course.trim()) return 'Course is required';
  if (b.age !== null && b.age !== undefined && b.age !== '' && (!Number.isInteger(+b.age) || +b.age < 1 || +b.age > 120)) return 'Age must be 1-120';
  return null;
}
const isUnique = e => e.errcode === 2067 || /UNIQUE constraint/i.test(e.message || '');
const clean = b => [b.name.trim(), b.email.trim().toLowerCase(), b.course.trim(), b.age === '' || b.age == null ? null : +b.age];

// Step 2 + 4: REST API with CRUD
app.get('/api/students', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare('SELECT * FROM students WHERE name LIKE ? OR email LIKE ? OR course LIKE ? ORDER BY id DESC').all(q, q, q));
});

app.get('/api/students/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  s ? res.json(s) : res.status(404).json({ error: 'Student not found' });
});

app.post('/api/students', (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const r = db.prepare('INSERT INTO students (name, email, course, age) VALUES (?,?,?,?)').run(...clean(req.body));
    res.status(201).json(db.prepare('SELECT * FROM students WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) {
    res.status(isUnique(e) ? 409 : 500).json({ error: isUnique(e) ? 'Email already exists' : 'Server error' });
  }
});

app.put('/api/students/:id', (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const r = db.prepare('UPDATE students SET name=?, email=?, course=?, age=? WHERE id=?').run(...clean(req.body), req.params.id);
    if (!r.changes) return res.status(404).json({ error: 'Student not found' });
    res.json(db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(isUnique(e) ? 409 : 500).json({ error: isUnique(e) ? 'Email already exists' : 'Server error' });
  }
});

app.delete('/api/students/:id', (req, res) => {
  const r = db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  r.changes ? res.json({ deleted: true }) : res.status(404).json({ error: 'Student not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Student Records running at http://localhost:${PORT}`));
