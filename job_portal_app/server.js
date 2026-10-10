const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Remote'];
const APP_STATUSES = ['applied', 'reviewing', 'shortlisted', 'rejected', 'hired'];

const db = new Database(path.join(__dirname, 'jobs.db'));
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ---------- Schema (with indexes for search/filter performance) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('seeker','employer','admin')),
  company TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  salary_min INTEGER,
  salary_max INTEGER,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','removed')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seeker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (job_id, seeker_id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_status_id ON jobs(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_employer ON jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_apps_seeker ON applications(seeker_id);
CREATE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id);
`);

// ---------- Demo data on first run ----------
if (!db.prepare('SELECT 1 FROM users').get()) {
  const addUser = db.prepare('INSERT INTO users (name,email,password_hash,role,company) VALUES (?,?,?,?,?)');
  addUser.run('Admin', 'admin@jobs.com', bcrypt.hashSync('admin123', 10), 'admin', null);
  const emp = addUser.run('Erin Employer', 'employer@jobs.com', bcrypt.hashSync('employer123', 10), 'employer', 'TechNova').lastInsertRowid;
  addUser.run('Sam Seeker', 'seeker@jobs.com', bcrypt.hashSync('seeker123', 10), 'seeker', null);
  const addJob = db.prepare('INSERT INTO jobs (employer_id,title,company,location,type,category,salary_min,salary_max,description) VALUES (?,?,?,?,?,?,?,?,?)');
  [
    ['Frontend Developer', 'New York', 'Full-time', 'Engineering', 70000, 95000, 'Build responsive interfaces with modern JavaScript.'],
    ['Backend Engineer', 'Remote', 'Remote', 'Engineering', 85000, 115000, 'Design REST APIs and optimise database queries.'],
    ['UI/UX Designer', 'Austin', 'Full-time', 'Design', 60000, 85000, 'Own the design system and run user research.'],
    ['Marketing Intern', 'Chicago', 'Internship', 'Marketing', 20000, 28000, 'Support campaigns and social media content.'],
    ['Data Analyst', 'New York', 'Contract', 'Data', 65000, 90000, 'Turn raw data into dashboards and insights.'],
    ['Customer Support Specialist', 'Austin', 'Part-time', 'Support', 30000, 42000, 'Help customers via chat and email.']
  ].forEach(j => addJob.run(emp, j[0], 'TechNova', ...j.slice(1)));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// ---------- User management & auth ----------
const sign = u => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, company: u.company });

function auth(req, res, next) {
  try {
    const { id } = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!u || !u.active) throw new Error();
    req.user = u; next();
  } catch { bad(res, 'Please log in', 401); }
}
const role = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : bad(res, 'Not allowed for your account type', 403);

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role: r, company } = req.body;
  if (!name?.trim()) return bad(res, 'Name is required');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Valid email is required');
  if (!password || password.length < 6) return bad(res, 'Password must be at least 6 characters');
  if (!['seeker', 'employer'].includes(r)) return bad(res, 'Choose job seeker or employer');
  if (r === 'employer' && !company?.trim()) return bad(res, 'Company name is required for employers');
  try {
    const id = db.prepare('INSERT INTO users (name,email,password_hash,role,company) VALUES (?,?,?,?,?)')
      .run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), r, r === 'employer' ? company.trim() : null).lastInsertRowid;
    const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? bad(res, 'Email already registered', 409) : bad(res, 'Server error', 500);
  }
});

app.post('/api/auth/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get((req.body.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash)) return bad(res, 'Invalid email or password', 401);
  if (!u.active) return bad(res, 'This account has been deactivated', 403);
  res.json({ token: sign(u), user: publicUser(u) });
});
app.get('/api/auth/me', auth, (req, res) => res.json(publicUser(req.user)));

// ---------- Job listings: public search + filters + pagination ----------
app.get('/api/jobs/meta', (req, res) => {
  const col = c => db.prepare(`SELECT DISTINCT ${c} v FROM jobs WHERE status='open' ORDER BY v`).all().map(r => r.v);
  res.json({ locations: col('location'), categories: col('category'), types: TYPES });
});

app.get('/api/jobs', (req, res) => {
  const { q, location, type, category, minSalary } = req.query;
  const page = Math.max(1, +req.query.page || 1), limit = Math.min(50, +req.query.limit || 8);
  const where = ["j.status = 'open'", 'u.active = 1'], args = [];
  if (q) { where.push('(j.title LIKE ? OR j.company LIKE ? OR j.description LIKE ?)'); args.push(...Array(3).fill(`%${q}%`)); }
  if (location) { where.push('j.location = ?'); args.push(location); }
  if (type) { where.push('j.type = ?'); args.push(type); }
  if (category) { where.push('j.category = ?'); args.push(category); }
  if (+minSalary > 0) { where.push('COALESCE(j.salary_max, j.salary_min, 0) >= ?'); args.push(+minSalary); }
  const from = `FROM jobs j JOIN users u ON u.id = j.employer_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) n ${from}`).get(...args).n;
  const jobs = db.prepare(`SELECT j.* ${from} ORDER BY j.id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  res.json({ jobs, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

app.get('/api/jobs/:id', (req, res) => {
  const j = db.prepare("SELECT * FROM jobs WHERE id = ? AND status != 'removed'").get(req.params.id);
  j ? res.json(j) : bad(res, 'Job not found', 404);
});

// ---------- Job posting (employers) ----------
function validateJob(b) {
  for (const f of ['title', 'company', 'location', 'category', 'description']) if (!b[f]?.toString().trim()) return `${f[0].toUpperCase() + f.slice(1)} is required`;
  if (!TYPES.includes(b.type)) return 'Invalid job type';
  const lo = b.salary_min === '' || b.salary_min == null ? null : +b.salary_min;
  const hi = b.salary_max === '' || b.salary_max == null ? null : +b.salary_max;
  if ((lo !== null && !(lo >= 0)) || (hi !== null && !(hi >= 0))) return 'Salary must be a positive number';
  if (lo !== null && hi !== null && lo > hi) return 'Minimum salary cannot exceed maximum';
  return null;
}
const jobVals = b => [b.title.trim(), b.company.trim(), b.location.trim(), b.type, b.category.trim(),
  b.salary_min === '' || b.salary_min == null ? null : +b.salary_min,
  b.salary_max === '' || b.salary_max == null ? null : +b.salary_max, b.description.trim()];

app.post('/api/jobs', auth, role('employer'), (req, res) => {
  const err = validateJob(req.body);
  if (err) return bad(res, err);
  const id = db.prepare('INSERT INTO jobs (employer_id,title,company,location,type,category,salary_min,salary_max,description) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, ...jobVals(req.body)).lastInsertRowid;
  res.status(201).json(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
});

const ownJob = (req, res) => {
  const j = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!j) { bad(res, 'Job not found', 404); return null; }
  if (req.user.role !== 'admin' && j.employer_id !== req.user.id) { bad(res, 'This is not your job posting', 403); return null; }
  return j;
};

app.put('/api/jobs/:id', auth, role('employer'), (req, res) => {
  const j = ownJob(req, res); if (!j) return;
  const err = validateJob(req.body);
  if (err) return bad(res, err);
  db.prepare('UPDATE jobs SET title=?, company=?, location=?, type=?, category=?, salary_min=?, salary_max=?, description=? WHERE id=?').run(...jobVals(req.body), j.id);
  res.json(db.prepare('SELECT * FROM jobs WHERE id = ?').get(j.id));
});

app.put('/api/jobs/:id/status', auth, role('employer'), (req, res) => {
  const j = ownJob(req, res); if (!j) return;
  if (j.status === 'removed') return bad(res, 'This job was removed by an administrator');
  if (!['open', 'closed'].includes(req.body.status)) return bad(res, 'Status must be open or closed');
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(req.body.status, j.id);
  res.json({ id: j.id, status: req.body.status });
});

app.delete('/api/jobs/:id', auth, role('employer', 'admin'), (req, res) => {
  const j = ownJob(req, res); if (!j) return;
  db.prepare('DELETE FROM jobs WHERE id = ?').run(j.id);
  res.json({ deleted: true });
});

app.get('/api/employer/jobs', auth, role('employer'), (req, res) =>
  res.json(db.prepare(`SELECT j.*, (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) applicants
    FROM jobs j WHERE j.employer_id = ? ORDER BY j.id DESC`).all(req.user.id)));

// ---------- Application workflow ----------
app.post('/api/jobs/:id/apply', auth, role('seeker'), (req, res) => {
  const j = db.prepare("SELECT * FROM jobs WHERE id = ? AND status = 'open'").get(req.params.id);
  if (!j) return bad(res, 'This job is not accepting applications', 404);
  try {
    const id = db.prepare('INSERT INTO applications (job_id, seeker_id, cover_letter) VALUES (?,?,?)')
      .run(j.id, req.user.id, (req.body.coverLetter || '').trim()).lastInsertRowid;
    res.status(201).json(db.prepare('SELECT * FROM applications WHERE id = ?').get(id));
  } catch (e) {
    e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? bad(res, 'You already applied to this job', 409) : bad(res, 'Server error', 500);
  }
});

app.get('/api/applications/mine', auth, role('seeker'), (req, res) =>
  res.json(db.prepare(`SELECT a.*, j.title, j.company, j.location, j.status job_status
    FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.seeker_id = ? ORDER BY a.id DESC`).all(req.user.id)));

app.delete('/api/applications/:id', auth, role('seeker'), (req, res) => {
  const a = db.prepare('SELECT * FROM applications WHERE id = ? AND seeker_id = ?').get(req.params.id, req.user.id);
  if (!a) return bad(res, 'Application not found', 404);
  if (a.status !== 'applied') return bad(res, 'Only applications not yet reviewed can be withdrawn');
  db.prepare('DELETE FROM applications WHERE id = ?').run(a.id);
  res.json({ deleted: true });
});

app.get('/api/jobs/:id/applications', auth, role('employer', 'admin'), (req, res) => {
  const j = ownJob(req, res); if (!j) return;
  res.json(db.prepare(`SELECT a.id, a.cover_letter, a.status, a.created_at, u.name, u.email
    FROM applications a JOIN users u ON u.id = a.seeker_id WHERE a.job_id = ? ORDER BY a.id DESC`).all(j.id));
});

app.put('/api/applications/:id/status', auth, role('employer'), (req, res) => {
  const a = db.prepare(`SELECT a.id FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ? AND j.employer_id = ?`).get(req.params.id, req.user.id);
  if (!a) return bad(res, 'Application not found', 404);
  if (!APP_STATUSES.includes(req.body.status)) return bad(res, 'Invalid status');
  db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(req.body.status, a.id);
  res.json({ id: a.id, status: req.body.status });
});

// ---------- Admin management ----------
const admin = [auth, role('admin')];

app.get('/api/admin/stats', ...admin, (req, res) => {
  const count = sql => db.prepare(sql).get().n;
  res.json({
    seekers: count("SELECT COUNT(*) n FROM users WHERE role='seeker'"),
    employers: count("SELECT COUNT(*) n FROM users WHERE role='employer'"),
    openJobs: count("SELECT COUNT(*) n FROM jobs WHERE status='open'"),
    totalJobs: count('SELECT COUNT(*) n FROM jobs'),
    applications: count('SELECT COUNT(*) n FROM applications'),
    byCategory: db.prepare("SELECT category, COUNT(*) n FROM jobs WHERE status='open' GROUP BY category ORDER BY n DESC").all()
  });
});

app.get('/api/admin/users', ...admin, (req, res) =>
  res.json(db.prepare('SELECT id, name, email, role, company, active, created_at FROM users ORDER BY id DESC').all()));

app.put('/api/admin/users/:id/active', ...admin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return bad(res, 'User not found', 404);
  if (u.role === 'admin') return bad(res, 'Administrator accounts cannot be deactivated');
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, u.id);
  res.json({ id: u.id, active: req.body.active ? 1 : 0 });
});

app.delete('/api/admin/users/:id', ...admin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return bad(res, 'User not found', 404);
  if (u.role === 'admin') return bad(res, 'Administrator accounts cannot be deleted');
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ deleted: true });
});

app.get('/api/admin/jobs', ...admin, (req, res) =>
  res.json(db.prepare(`SELECT j.*, u.name employer_name, (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) applicants
    FROM jobs j JOIN users u ON u.id = j.employer_id ORDER BY j.id DESC`).all()));

app.put('/api/admin/jobs/:id/status', ...admin, (req, res) => {
  if (!['open', 'closed', 'removed'].includes(req.body.status)) return bad(res, 'Invalid status');
  const r = db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  r.changes ? res.json({ id: +req.params.id, status: req.body.status }) : bad(res, 'Job not found', 404);
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(
  `Job Portal running at http://localhost:${PORT}\nDemo logins: admin@jobs.com / admin123, employer@jobs.com / employer123, seeker@jobs.com / seeker123`));
module.exports = app;
