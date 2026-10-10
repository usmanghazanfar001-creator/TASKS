const express = require('express');
const compression = require('compression');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) { console.error('JWT_SECRET must be set in production'); process.exit(1); }
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'lms.db'));
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ---------- Step 1: course and student modules (schema) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','instructor','admin')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, instructor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, content TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE (course_id, student_id));
CREATE TABLE IF NOT EXISTS lesson_progress (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (student_id, lesson_id));
CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, pass_mark INTEGER NOT NULL DEFAULT 60);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  text TEXT NOT NULL, options TEXT NOT NULL, correct INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, score INTEGER NOT NULL, total INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT DEFAULT '', due_date TEXT, max_points INTEGER NOT NULL DEFAULT 100);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL, grade REAL, feedback TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, graded_at TEXT, UNIQUE (assignment_id, student_id));
CREATE INDEX IF NOT EXISTS idx_courses_pub ON courses(published, id DESC);
CREATE INDEX IF NOT EXISTS idx_courses_instr ON courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, position);
CREATE INDEX IF NOT EXISTS idx_enroll_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts ON quiz_attempts(quiz_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assign_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_subs_assign ON submissions(assignment_id);
`);

// ---------- Demo data on first run ----------
if (!db.prepare('SELECT 1 FROM users').get()) {
  const addUser = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)');
  addUser.run('Admin', 'admin@lms.com', bcrypt.hashSync('admin123', 10), 'admin');
  const ins = addUser.run('Ivy Instructor', 'instructor@lms.com', bcrypt.hashSync('instructor123', 10), 'instructor').lastInsertRowid;
  addUser.run('Sam Student', 'student@lms.com', bcrypt.hashSync('student123', 10), 'student');
  const cid = db.prepare('INSERT INTO courses (instructor_id,title,description,category,published) VALUES (?,?,?,?,1)')
    .run(ins, 'Intro to Web Development', 'Learn how the web works and build your first pages with HTML and CSS.', 'Programming').lastInsertRowid;
  const addLesson = db.prepare('INSERT INTO lessons (course_id,title,content,position) VALUES (?,?,?,?)');
  addLesson.run(cid, 'How the web works', 'Browsers request pages from servers using HTTP. Servers respond with HTML, CSS and JavaScript.', 1);
  addLesson.run(cid, 'HTML basics', 'HTML describes structure: headings, paragraphs, links, images and lists.', 2);
  addLesson.run(cid, 'Styling with CSS', 'CSS controls presentation: colours, fonts, spacing and layout.', 3);
  const qid = db.prepare('INSERT INTO quizzes (course_id,title,pass_mark) VALUES (?,?,60)').run(cid, 'HTML & CSS basics').lastInsertRowid;
  const addQ = db.prepare('INSERT INTO questions (quiz_id,text,options,correct) VALUES (?,?,?,?)');
  addQ.run(qid, 'Which tag creates a hyperlink?', JSON.stringify(['<a>', '<link>', '<href>']), 0);
  addQ.run(qid, 'What does CSS stand for?', JSON.stringify(['Computer Style Sheets', 'Cascading Style Sheets', 'Creative Styling System']), 1);
  addQ.run(qid, 'Which protocol do browsers use to fetch pages?', JSON.stringify(['FTP', 'SMTP', 'HTTP']), 2);
  db.prepare('INSERT INTO assignments (course_id,title,description,due_date,max_points) VALUES (?,?,?,?,?)')
    .run(cid, 'Build a personal page', 'Describe (or paste) the HTML for a page introducing yourself.', null, 20);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '1h' : 0 }));

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// simple in-memory rate limit for login/register
const hits = new Map();
const limiter = (req, res, next) => {
  const max = +process.env.RATE_LIMIT || 100, now = Date.now(), e = hits.get(req.ip) || { n: 0, t: now };
  if (now - e.t > 15 * 60 * 1000) { e.n = 0; e.t = now; }
  e.n++; hits.set(req.ip, e);
  e.n > max ? bad(res, 'Too many attempts, please try again later', 429) : next();
};
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > 15 * 60 * 1000) hits.delete(k); }, 5 * 60 * 1000).unref();

app.get('/api/health', (req, res) => { db.prepare('SELECT 1').get(); res.json({ status: 'ok' }); });

// ---------- Step 2: authentication & authorization ----------
const sign = u => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
function loadUser(req) {
  try {
    const { id } = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return u && u.active ? u : null;
  } catch { return null; }
}
const auth = (req, res, next) => { req.user = loadUser(req); req.user ? next() : bad(res, 'Please log in', 401); };
const optAuth = (req, res, next) => { req.user = loadUser(req); next(); };
const role = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : bad(res, 'Not allowed for your account type', 403);

app.post('/api/auth/register', limiter, (req, res) => {
  const { name, email, password, role: r } = req.body;
  if (!name?.trim()) return bad(res, 'Name is required');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Valid email is required');
  if (!password || password.length < 6) return bad(res, 'Password must be at least 6 characters');
  if (!['student', 'instructor'].includes(r)) return bad(res, 'Choose student or instructor');
  try {
    const id = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
      .run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), r).lastInsertRowid;
    const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    res.status(201).json({ token: sign(user), user });
  } catch (e) { e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? bad(res, 'Email already registered', 409) : bad(res, 'Server error', 500); }
});

app.post('/api/auth/login', limiter, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get((req.body.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash)) return bad(res, 'Invalid email or password', 401);
  if (!u.active) return bad(res, 'This account has been deactivated', 403);
  res.json({ token: sign(u), user: publicUser(u) });
});
app.get('/api/auth/me', auth, (req, res) => res.json(publicUser(req.user)));

// ---------- helpers ----------
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const count = (sql, ...a) => db.prepare(sql).get(...a).n;
const isEnrolled = (cid, sid) => !!one('SELECT 1 FROM enrollments WHERE course_id = ? AND student_id = ?', cid, sid);

// Step 4: progress = completed lessons + passed quizzes + submitted assignments, out of all items
function progress(cid, sid) {
  const lessons = { total: count('SELECT COUNT(*) n FROM lessons WHERE course_id = ?', cid),
    done: count('SELECT COUNT(*) n FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id WHERE l.course_id = ? AND p.student_id = ?', cid, sid) };
  const quizzes = { total: count('SELECT COUNT(*) n FROM quizzes WHERE course_id = ?', cid),
    done: count(`SELECT COUNT(DISTINCT q.id) n FROM quizzes q JOIN quiz_attempts a ON a.quiz_id = q.id
      WHERE q.course_id = ? AND a.student_id = ? AND a.score * 100 >= q.pass_mark * a.total`, cid, sid) };
  const assignments = { total: count('SELECT COUNT(*) n FROM assignments WHERE course_id = ?', cid),
    done: count('SELECT COUNT(*) n FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_id = ? AND s.student_id = ?', cid, sid) };
  const total = lessons.total + quizzes.total + assignments.total, done = lessons.done + quizzes.done + assignments.done;
  return { lessons, quizzes, assignments, percent: total ? Math.round(done / total * 100) : 0 };
}

// Course access helpers: owner instructor, or admin when allowed
function courseFor(req, res, id, { adminOk = false } = {}) {
  const c = one('SELECT * FROM courses WHERE id = ?', id);
  if (!c) { bad(res, 'Course not found', 404); return null; }
  if (c.instructor_id !== req.user.id && !(adminOk && req.user.role === 'admin')) { bad(res, 'This is not your course', 403); return null; }
  return c;
}

// ---------- Step 3: course management ----------
app.get('/api/courses', optAuth, (req, res) => {
  const q = `%${req.query.q || ''}%`, cat = req.query.category || '';
  const rows = all(`SELECT c.id, c.title, c.description, c.category, u.name instructor_name,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) lesson_count,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) student_count
    FROM courses c JOIN users u ON u.id = c.instructor_id
    WHERE c.published = 1 AND (c.title LIKE ? OR c.description LIKE ?) AND (? = '' OR c.category = ?) ORDER BY c.id DESC`, q, q, cat, cat);
  const mine = new Set(req.user?.role === 'student' ? all('SELECT course_id FROM enrollments WHERE student_id = ?', req.user.id).map(r => r.course_id) : []);
  res.json(rows.map(r => ({ ...r, enrolled: mine.has(r.id) })));
});

function validateCourse(b) {
  for (const f of ['title', 'description', 'category']) if (!b[f]?.toString().trim()) return `${f[0].toUpperCase() + f.slice(1)} is required`;
  return null;
}

app.post('/api/courses', auth, role('instructor'), (req, res) => {
  const err = validateCourse(req.body); if (err) return bad(res, err);
  const id = db.prepare('INSERT INTO courses (instructor_id,title,description,category) VALUES (?,?,?,?)')
    .run(req.user.id, req.body.title.trim(), req.body.description.trim(), req.body.category.trim()).lastInsertRowid;
  res.status(201).json(one('SELECT * FROM courses WHERE id = ?', id));
});

app.put('/api/courses/:id', auth, role('instructor'), (req, res) => {
  const c = courseFor(req, res, req.params.id); if (!c) return;
  const err = validateCourse(req.body); if (err) return bad(res, err);
  db.prepare('UPDATE courses SET title=?, description=?, category=? WHERE id=?').run(req.body.title.trim(), req.body.description.trim(), req.body.category.trim(), c.id);
  res.json(one('SELECT * FROM courses WHERE id = ?', c.id));
});

app.put('/api/courses/:id/publish', auth, role('instructor', 'admin'), (req, res) => {
  const c = courseFor(req, res, req.params.id, { adminOk: true }); if (!c) return;
  db.prepare('UPDATE courses SET published = ? WHERE id = ?').run(req.body.published ? 1 : 0, c.id);
  res.json({ id: c.id, published: req.body.published ? 1 : 0 });
});

app.delete('/api/courses/:id', auth, role('instructor', 'admin'), (req, res) => {
  const c = courseFor(req, res, req.params.id, { adminOk: true }); if (!c) return;
  db.prepare('DELETE FROM courses WHERE id = ?').run(c.id);
  res.json({ deleted: true });
});

// Full course view: content is only included for the owner, admins and enrolled students
app.get('/api/courses/:id', optAuth, (req, res) => {
  const c = one('SELECT c.*, u.name instructor_name FROM courses c JOIN users u ON u.id = c.instructor_id WHERE c.id = ?', req.params.id);
  if (!c) return bad(res, 'Course not found', 404);
  const u = req.user, isOwner = !!u && u.id === c.instructor_id, isAdmin = u?.role === 'admin';
  if (!c.published && !isOwner && !isAdmin) return bad(res, 'Course not found', 404);
  const enrolled = !!u && u.role === 'student' && isEnrolled(c.id, u.id), full = isOwner || isAdmin || enrolled;

  const lessons = all(`SELECT id, title, position${full ? ', content' : ''} FROM lessons WHERE course_id = ? ORDER BY position, id`, c.id);
  const quizzes = all('SELECT q.id, q.title, q.pass_mark, (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) questions FROM quizzes q WHERE q.course_id = ? ORDER BY q.id', c.id);
  const assignments = all(`SELECT id, title, ${full ? 'description,' : ''} due_date, max_points FROM assignments WHERE course_id = ? ORDER BY id`, c.id);
  if (enrolled) {
    const done = new Set(all('SELECT lesson_id FROM lesson_progress WHERE student_id = ?', u.id).map(r => r.lesson_id));
    lessons.forEach(l => l.completed = done.has(l.id));
    quizzes.forEach(q => q.best = one('SELECT score, total FROM quiz_attempts WHERE quiz_id = ? AND student_id = ? ORDER BY score * 1.0 / total DESC LIMIT 1', q.id, u.id) || null);
    assignments.forEach(a => a.submission = one('SELECT id, content, grade, feedback, created_at FROM submissions WHERE assignment_id = ? AND student_id = ?', a.id, u.id) || null);
  }
  if (isOwner || isAdmin) assignments.forEach(a => a.submissions = count('SELECT COUNT(*) n FROM submissions WHERE assignment_id = ?', a.id));
  res.json({ course: c, enrolled, isOwner, lessons, quizzes, assignments, progress: enrolled ? progress(c.id, u.id) : null });
});

app.post('/api/courses/:id/enroll', auth, role('student'), (req, res) => {
  const c = one('SELECT * FROM courses WHERE id = ? AND published = 1', req.params.id);
  if (!c) return bad(res, 'Course not found', 404);
  try { db.prepare('INSERT INTO enrollments (course_id, student_id) VALUES (?,?)').run(c.id, req.user.id); res.status(201).json({ enrolled: true }); }
  catch { bad(res, 'You are already enrolled', 409); }
});

app.get('/api/courses/:id/students', auth, role('instructor'), (req, res) => {
  const c = courseFor(req, res, req.params.id); if (!c) return;
  res.json(all(`SELECT u.id, u.name, u.email, e.created_at FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.course_id = ? ORDER BY e.id`, c.id)
    .map(s => ({ ...s, progress: progress(c.id, s.id) })));
});

// Lessons
app.post('/api/courses/:id/lessons', auth, role('instructor'), (req, res) => {
  const c = courseFor(req, res, req.params.id); if (!c) return;
  if (!req.body.title?.trim() || !req.body.content?.trim()) return bad(res, 'Lesson title and content are required');
  const pos = count('SELECT COALESCE(MAX(position), 0) + 1 n FROM lessons WHERE course_id = ?', c.id);
  const id = db.prepare('INSERT INTO lessons (course_id, title, content, position) VALUES (?,?,?,?)').run(c.id, req.body.title.trim(), req.body.content.trim(), pos).lastInsertRowid;
  res.status(201).json(one('SELECT * FROM lessons WHERE id = ?', id));
});

app.delete('/api/lessons/:id', auth, role('instructor'), (req, res) => {
  const l = one('SELECT * FROM lessons WHERE id = ?', req.params.id);
  if (!l) return bad(res, 'Lesson not found', 404);
  if (!courseFor(req, res, l.course_id)) return;
  db.prepare('DELETE FROM lessons WHERE id = ?').run(l.id);
  res.json({ deleted: true });
});

app.put('/api/lessons/:id/complete', auth, role('student'), (req, res) => {
  const l = one('SELECT * FROM lessons WHERE id = ?', req.params.id);
  if (!l || !isEnrolled(l.course_id, req.user.id)) return bad(res, 'Enroll in this course first', 403);
  req.body.completed
    ? db.prepare('INSERT OR IGNORE INTO lesson_progress (student_id, lesson_id) VALUES (?,?)').run(req.user.id, l.id)
    : db.prepare('DELETE FROM lesson_progress WHERE student_id = ? AND lesson_id = ?').run(req.user.id, l.id);
  res.json({ progress: progress(l.course_id, req.user.id) });
});

// ---------- Step 4: quizzes ----------
function validateQuiz(b) {
  if (!b.title?.trim()) return 'Quiz title is required';
  const pm = b.pass_mark === undefined ? 60 : +b.pass_mark;
  if (!(pm >= 0 && pm <= 100)) return 'Pass mark must be between 0 and 100';
  if (!Array.isArray(b.questions) || !b.questions.length) return 'Add at least one question';
  for (const q of b.questions) {
    if (!q.text?.trim()) return 'Every question needs text';
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.some(o => !String(o).trim())) return 'Every question needs at least 2 non-empty options';
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) return 'Every question needs a valid correct answer';
  }
  return null;
}

app.post('/api/courses/:id/quizzes', auth, role('instructor'), (req, res) => {
  const c = courseFor(req, res, req.params.id); if (!c) return;
  const err = validateQuiz(req.body); if (err) return bad(res, err);
  const id = db.transaction(() => {
    const qid = db.prepare('INSERT INTO quizzes (course_id, title, pass_mark) VALUES (?,?,?)').run(c.id, req.body.title.trim(), req.body.pass_mark === undefined ? 60 : +req.body.pass_mark).lastInsertRowid;
    for (const q of req.body.questions) db.prepare('INSERT INTO questions (quiz_id, text, options, correct) VALUES (?,?,?,?)').run(qid, q.text.trim(), JSON.stringify(q.options.map(o => String(o).trim())), q.correct);
    return qid;
  })();
  res.status(201).json({ id });
});

app.delete('/api/quizzes/:id', auth, role('instructor'), (req, res) => {
  const q = one('SELECT * FROM quizzes WHERE id = ?', req.params.id);
  if (!q) return bad(res, 'Quiz not found', 404);
  if (!courseFor(req, res, q.course_id)) return;
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(q.id);
  res.json({ deleted: true });
});

function quizAccess(req, res) {
  const q = one('SELECT * FROM quizzes WHERE id = ?', req.params.id);
  if (!q) { bad(res, 'Quiz not found', 404); return null; }
  const c = one('SELECT * FROM courses WHERE id = ?', q.course_id);
  const owner = req.user.id === c.instructor_id || req.user.role === 'admin';
  if (!owner && !(req.user.role === 'student' && isEnrolled(c.id, req.user.id))) { bad(res, 'Enroll in this course first', 403); return null; }
  return { q, owner };
}

app.get('/api/quizzes/:id', auth, (req, res) => {
  const a = quizAccess(req, res); if (!a) return;
  const questions = all('SELECT id, text, options, correct FROM questions WHERE quiz_id = ? ORDER BY id', a.q.id)
    .map(x => ({ id: x.id, text: x.text, options: JSON.parse(x.options), ...(a.owner ? { correct: x.correct } : {}) }));
  res.json({ id: a.q.id, title: a.q.title, pass_mark: a.q.pass_mark, questions });
});

app.post('/api/quizzes/:id/attempt', auth, role('student'), (req, res) => {
  const a = quizAccess(req, res); if (!a) return;
  const qs = all('SELECT correct FROM questions WHERE quiz_id = ? ORDER BY id', a.q.id);
  if (!Array.isArray(req.body.answers) || req.body.answers.length !== qs.length) return bad(res, 'Answer every question');
  const results = qs.map((q, i) => req.body.answers[i] === q.correct);
  const score = results.filter(Boolean).length;
  db.prepare('INSERT INTO quiz_attempts (quiz_id, student_id, score, total) VALUES (?,?,?,?)').run(a.q.id, req.user.id, score, qs.length);
  res.json({ score, total: qs.length, passed: score * 100 >= a.q.pass_mark * qs.length, results });
});

// ---------- Step 4: assignments ----------
app.post('/api/courses/:id/assignments', auth, role('instructor'), (req, res) => {
  const c = courseFor(req, res, req.params.id); if (!c) return;
  const { title, description, due_date, max_points } = req.body;
  if (!title?.trim()) return bad(res, 'Assignment title is required');
  const pts = max_points === undefined || max_points === '' ? 100 : +max_points;
  if (!(pts > 0)) return bad(res, 'Max points must be greater than 0');
  if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return bad(res, 'Due date must be YYYY-MM-DD');
  const id = db.prepare('INSERT INTO assignments (course_id, title, description, due_date, max_points) VALUES (?,?,?,?,?)').run(c.id, title.trim(), (description || '').trim(), due_date || null, pts).lastInsertRowid;
  res.status(201).json(one('SELECT * FROM assignments WHERE id = ?', id));
});

app.delete('/api/assignments/:id', auth, role('instructor'), (req, res) => {
  const a = one('SELECT * FROM assignments WHERE id = ?', req.params.id);
  if (!a) return bad(res, 'Assignment not found', 404);
  if (!courseFor(req, res, a.course_id)) return;
  db.prepare('DELETE FROM assignments WHERE id = ?').run(a.id);
  res.json({ deleted: true });
});

app.post('/api/assignments/:id/submit', auth, role('student'), (req, res) => {
  const a = one('SELECT * FROM assignments WHERE id = ?', req.params.id);
  if (!a || !isEnrolled(a.course_id, req.user.id)) return bad(res, 'Enroll in this course first', 403);
  if (!req.body.content?.trim()) return bad(res, 'Submission cannot be empty');
  const ex = one('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?', a.id, req.user.id);
  if (ex?.grade !== undefined && ex?.grade !== null) return bad(res, 'This submission has already been graded');
  ex ? db.prepare('UPDATE submissions SET content = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.body.content.trim(), ex.id)
     : db.prepare('INSERT INTO submissions (assignment_id, student_id, content) VALUES (?,?,?)').run(a.id, req.user.id, req.body.content.trim());
  res.status(201).json({ submitted: true });
});

app.get('/api/assignments/:id/submissions', auth, role('instructor'), (req, res) => {
  const a = one('SELECT * FROM assignments WHERE id = ?', req.params.id);
  if (!a) return bad(res, 'Assignment not found', 404);
  if (!courseFor(req, res, a.course_id)) return;
  res.json({ assignment: a, submissions: all(`SELECT s.id, s.content, s.grade, s.feedback, s.created_at, u.name, u.email
    FROM submissions s JOIN users u ON u.id = s.student_id WHERE s.assignment_id = ? ORDER BY s.id`, a.id) });
});

app.put('/api/submissions/:id/grade', auth, role('instructor'), (req, res) => {
  const s = one(`SELECT s.id, a.max_points FROM submissions s JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id WHERE s.id = ? AND c.instructor_id = ?`, req.params.id, req.user.id);
  if (!s) return bad(res, 'Submission not found', 404);
  const g = +req.body.grade;
  if (req.body.grade === '' || req.body.grade == null || !(g >= 0 && g <= s.max_points)) return bad(res, `Grade must be between 0 and ${s.max_points}`);
  db.prepare('UPDATE submissions SET grade = ?, feedback = ?, graded_at = CURRENT_TIMESTAMP WHERE id = ?').run(g, (req.body.feedback || '').trim(), s.id);
  res.json({ id: s.id, grade: g });
});

// ---------- Dashboards ----------
app.get('/api/student/dashboard', auth, role('student'), (req, res) => {
  const uid = req.user.id;
  const courses = all(`SELECT c.id, c.title, u.name instructor_name FROM enrollments e JOIN courses c ON c.id = e.course_id
    JOIN users u ON u.id = c.instructor_id WHERE e.student_id = ? ORDER BY e.id DESC`, uid).map(c => ({ ...c, progress: progress(c.id, uid) }));
  const pending = all(`SELECT a.id, a.title, a.due_date, a.course_id, c.title course_title FROM assignments a
    JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = ? JOIN courses c ON c.id = a.course_id
    WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ?)
    ORDER BY a.due_date IS NULL, a.due_date`, uid, uid);
  const grades = all(`SELECT a.title, a.max_points, s.grade, s.feedback, c.title course_title FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id
    WHERE s.student_id = ? AND s.grade IS NOT NULL ORDER BY s.graded_at DESC LIMIT 10`, uid);
  res.json({ courses, pending, grades });
});

app.get('/api/instructor/courses', auth, role('instructor'), (req, res) =>
  res.json(all(`SELECT c.*, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) students,
    (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_id = c.id AND s.grade IS NULL) pending
    FROM courses c WHERE c.instructor_id = ? ORDER BY c.id DESC`, req.user.id)));

// ---------- Admin ----------
const admin = [auth, role('admin')];
app.get('/api/admin/stats', ...admin, (req, res) => res.json({
  students: count("SELECT COUNT(*) n FROM users WHERE role = 'student'"),
  instructors: count("SELECT COUNT(*) n FROM users WHERE role = 'instructor'"),
  courses: count('SELECT COUNT(*) n FROM courses'),
  published: count('SELECT COUNT(*) n FROM courses WHERE published = 1'),
  enrollments: count('SELECT COUNT(*) n FROM enrollments')
}));
app.get('/api/admin/users', ...admin, (req, res) => res.json(all('SELECT id, name, email, role, active, created_at FROM users ORDER BY id DESC')));
app.get('/api/admin/courses', ...admin, (req, res) => res.json(all(`SELECT c.id, c.title, c.published, u.name instructor_name,
  (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) students FROM courses c JOIN users u ON u.id = c.instructor_id ORDER BY c.id DESC`)));
app.put('/api/admin/users/:id/active', ...admin, (req, res) => {
  const u = one('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return bad(res, 'User not found', 404);
  if (u.role === 'admin') return bad(res, 'Administrator accounts cannot be deactivated');
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, u.id);
  res.json({ id: u.id, active: req.body.active ? 1 : 0 });
});
app.delete('/api/admin/users/:id', ...admin, (req, res) => {
  const u = one('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return bad(res, 'User not found', 404);
  if (u.role === 'admin') return bad(res, 'Administrator accounts cannot be deleted');
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ deleted: true });
});

// Invalid JSON and unexpected errors
app.use((err, req, res, next) => err.type === 'entity.parse.failed' ? bad(res, 'Invalid JSON') : (console.error(err), bad(res, 'Server error', 500)));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`LMS running at http://localhost:${PORT}\nDemo logins: admin@lms.com / admin123, instructor@lms.com / instructor123, student@lms.com / student123`));
  const stop = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
module.exports = app;
