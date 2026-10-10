// End-to-end test. Start the server first (npm start), then run: npm test
const BASE = process.env.BASE || 'http://localhost:3000';
let passed = 0, failed = 0;
const ok = (cond, label) => { cond ? passed++ : failed++; console.log((cond ? '  PASS ' : '  FAIL ') + label); };
async function call(method, url, body, token) {
  const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { email, password })).data.token;

(async () => {
  const s = Date.now();

  console.log('Authentication & authorization');
  let r = await call('POST', '/api/auth/register', { name: 'Ins', email: `ins${s}@x.com`, password: 'secret123', role: 'instructor' });
  ok(r.status === 201, 'register instructor');
  const ins = r.data.token;
  r = await call('POST', '/api/auth/register', { name: 'Stu', email: `stu${s}@x.com`, password: 'secret123', role: 'student' });
  ok(r.status === 201, 'register student');
  const stu = r.data.token, stuId = r.data.user.id;
  r = await call('POST', '/api/auth/register', { name: 'Stu2', email: `stu2${s}@x.com`, password: 'secret123', role: 'student' });
  const stu2 = r.data.token;
  r = await call('POST', '/api/auth/register', { name: 'H', email: `h${s}@x.com`, password: 'secret123', role: 'admin' });
  ok(r.status === 400, 'cannot self-register as admin');
  r = await call('POST', '/api/auth/login', { email: `stu${s}@x.com`, password: 'nope' });
  ok(r.status === 401, 'wrong password rejected');

  console.log('Course management');
  r = await call('POST', '/api/courses', { title: 'T', description: 'D', category: 'C' }, stu);
  ok(r.status === 403, 'student cannot create courses');
  r = await call('POST', '/api/courses', { title: `Test Course ${s}`, description: 'A course', category: 'Testing' }, ins);
  ok(r.status === 201, 'instructor creates course');
  const cid = r.data.id;
  r = await call('GET', `/api/courses?q=${s}`);
  ok(r.data.length === 0, 'draft course hidden from catalog');
  r = await call('GET', '/api/courses/' + cid);
  ok(r.status === 404, 'draft course not viewable by public');
  r = await call('PUT', `/api/courses/${cid}/publish`, { published: true }, ins);
  ok(r.status === 200, 'instructor publishes course');
  r = await call('GET', `/api/courses?q=${s}`);
  ok(r.data.length === 1, 'published course appears in catalog');
  r = await call('POST', `/api/courses/${cid}/lessons`, { title: 'L1', content: 'Lesson one' }, ins);
  ok(r.status === 201, 'add lesson');
  const l1 = r.data.id;
  await call('POST', `/api/courses/${cid}/lessons`, { title: 'L2', content: 'Lesson two' }, ins);
  r = await call('GET', '/api/courses/' + cid);
  ok(r.data.lessons.length === 2 && r.data.lessons[0].content === undefined, 'lesson content hidden until enrolled');

  console.log('Enrollment & access');
  r = await call('POST', `/api/lessons/${l1}/complete`, { completed: true }, stu);
  ok(r.status === 403, 'cannot complete lesson before enrolling');
  r = await call('POST', `/api/courses/${cid}/enroll`, null, stu);
  ok(r.status === 201, 'student enrolls');
  r = await call('POST', `/api/courses/${cid}/enroll`, null, stu);
  ok(r.status === 409, 'double enrollment rejected');
  r = await call('GET', '/api/courses/' + cid, null, stu);
  ok(r.data.lessons[0].content === 'Lesson one', 'enrolled student sees content');

  console.log('Quizzes');
  const quiz = { title: 'Quiz 1', pass_mark: 50, questions: [
    { text: '1+1?', options: ['1', '2', '3'], correct: 1 }, { text: '2+2?', options: ['3', '4'], correct: 1 } ] };
  r = await call('POST', `/api/courses/${cid}/quizzes`, quiz, stu);
  ok(r.status === 403, 'student cannot create quizzes');
  r = await call('POST', `/api/courses/${cid}/quizzes`, { ...quiz, questions: [{ text: 'x', options: ['a', 'b'], correct: 5 }] }, ins);
  ok(r.status === 400, 'invalid quiz rejected');
  r = await call('POST', `/api/courses/${cid}/quizzes`, quiz, ins);
  ok(r.status === 201, 'instructor creates quiz');
  const qid = r.data.id;
  r = await call('GET', '/api/quizzes/' + qid, null, stu);
  ok(r.data.questions.length === 2 && r.data.questions[0].correct === undefined, 'student quiz hides answers');
  r = await call('GET', '/api/quizzes/' + qid, null, stu2);
  ok(r.status === 403, 'non-enrolled student blocked from quiz');
  r = await call('POST', `/api/quizzes/${qid}/attempt`, { answers: [1, 1] }, stu);
  ok(r.data.score === 2 && r.data.passed, 'quiz auto-graded (perfect score)');
  r = await call('POST', `/api/quizzes/${qid}/attempt`, { answers: [0, 0] }, stu);
  ok(r.data.score === 0 && !r.data.passed, 'quiz auto-graded (failing score)');

  console.log('Assignments & grading');
  r = await call('POST', `/api/courses/${cid}/assignments`, { title: 'Essay', description: 'Write', max_points: 10, due_date: '2030-01-01' }, ins);
  ok(r.status === 201, 'instructor creates assignment');
  const aid = r.data.id;
  r = await call('POST', `/api/assignments/${aid}/submit`, { content: 'My essay' }, stu2);
  ok(r.status === 403, 'non-enrolled student cannot submit');
  r = await call('POST', `/api/assignments/${aid}/submit`, { content: 'My essay' }, stu);
  ok(r.status === 201, 'student submits assignment');
  r = await call('POST', `/api/assignments/${aid}/submit`, { content: 'My essay v2' }, stu);
  ok(r.status === 201, 'student can resubmit before grading');
  r = await call('GET', `/api/assignments/${aid}/submissions`, null, ins);
  ok(r.data.submissions.length === 1 && r.data.submissions[0].content === 'My essay v2', 'instructor sees submission');
  const subId = r.data.submissions[0].id;
  r = await call('PUT', `/api/submissions/${subId}/grade`, { grade: 99, feedback: 'x' }, ins);
  ok(r.status === 400, 'grade above max rejected');
  r = await call('PUT', `/api/submissions/${subId}/grade`, { grade: 9, feedback: 'Great' }, ins);
  ok(r.status === 200, 'instructor grades submission');
  r = await call('POST', `/api/assignments/${aid}/submit`, { content: 'late edit' }, stu);
  ok(r.status === 400, 'graded submission locked');

  console.log('Progress tracking');
  r = await call('PUT', `/api/lessons/${l1}/complete`, { completed: true }, stu);
  ok(r.data.progress.lessons.done === 1, 'lesson marked complete');
  r = await call('GET', '/api/student/dashboard', null, stu);
  const c = r.data.courses.find(x => x.id === cid);
  ok(c && c.progress.percent === 75, 'progress = 3 of 4 items (1 lesson + quiz + assignment)');
  ok(r.data.grades.some(g => g.grade === 9), 'grade shown on student dashboard');
  r = await call('GET', `/api/courses/${cid}/students`, null, ins);
  ok(r.data.length === 1 && r.data[0].progress.percent === 75, 'instructor sees student progress');
  r = await call('GET', '/api/instructor/courses', null, ins);
  ok(r.data[0].students === 1, 'instructor dashboard enrollment count');

  console.log('Admin');
  r = await call('GET', '/api/admin/stats', null, ins);
  ok(r.status === 403, 'instructor cannot open admin stats');
  const adm = await login('admin@lms.com', 'admin123');
  r = await call('GET', '/api/admin/stats', null, adm);
  ok(r.data.courses >= 1 && r.data.enrollments >= 1, 'admin stats');
  r = await call('PUT', `/api/admin/users/${stuId}/active`, { active: false }, adm);
  r = await call('POST', '/api/auth/login', { email: `stu${s}@x.com`, password: 'secret123' });
  ok(r.status === 403, 'deactivated user cannot log in');
  r = await call('PUT', `/api/courses/${cid}/publish`, { published: false }, adm);
  ok(r.status === 200, 'admin can unpublish a course');
  r = await call('DELETE', '/api/courses/' + cid, null, adm);
  ok(r.status === 200, 'admin can delete a course');
  r = await call('GET', '/api/health');
  ok(r.data.status === 'ok', 'health check');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('Is the server running?', e.message); process.exit(1); });
