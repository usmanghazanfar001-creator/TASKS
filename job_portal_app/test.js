// End-to-end workflow test. Start the server first (npm start), then run: npm test
const BASE = process.env.BASE || 'http://localhost:3000';
let passed = 0, failed = 0;
const ok = (cond, label) => { cond ? passed++ : failed++; console.log((cond ? '  PASS ' : '  FAIL ') + label); };

async function call(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

(async () => {
  const stamp = Date.now();
  const seekerEmail = `seeker${stamp}@example.com`, empEmail = `emp${stamp}@example.com`;

  console.log('Accounts');
  let r = await call('POST', '/api/auth/register', { name: 'Test Seeker', email: seekerEmail, password: 'secret123', role: 'seeker' });
  ok(r.status === 201, 'register seeker');
  const seekerToken = r.data.token, seekerId = r.data.user.id;
  r = await call('POST', '/api/auth/register', { name: 'Test Employer', email: empEmail, password: 'secret123', role: 'employer' });
  ok(r.status === 400, 'employer needs a company name');
  r = await call('POST', '/api/auth/register', { name: 'Test Employer', email: empEmail, password: 'secret123', role: 'employer', company: 'TestCo' });
  ok(r.status === 201, 'register employer');
  const empToken = r.data.token;
  r = await call('POST', '/api/auth/register', { name: 'X', email: empEmail, password: 'secret123', role: 'seeker' });
  ok(r.status === 409, 'duplicate email rejected');
  r = await call('POST', '/api/auth/register', { name: 'X', email: `a${stamp}@example.com`, password: 'secret123', role: 'admin' });
  ok(r.status === 400, 'cannot self-register as admin');

  console.log('Job posting');
  const jobBody = { title: `Quantum Widget Engineer ${stamp}`, company: 'TestCo', location: 'Atlantis', type: 'Full-time', category: 'Engineering', salary_min: 90000, salary_max: 120000, description: 'Build widgets.' };
  r = await call('POST', '/api/jobs', jobBody, seekerToken);
  ok(r.status === 403, 'seeker cannot post jobs');
  r = await call('POST', '/api/jobs', { ...jobBody, type: 'Bogus' }, empToken);
  ok(r.status === 400, 'invalid job type rejected');
  r = await call('POST', '/api/jobs', jobBody, empToken);
  ok(r.status === 201, 'employer posts job');
  const jobId = r.data.id;
  r = await call('PUT', '/api/jobs/' + jobId, { ...jobBody, location: 'Atlantis City' }, empToken);
  ok(r.status === 200 && r.data.location === 'Atlantis City', 'employer edits job');

  console.log('Search & filters');
  r = await call('GET', '/api/jobs?q=' + encodeURIComponent('Quantum Widget ' + 'Engineer ' + stamp));
  ok(r.data.total === 1 && r.data.jobs[0].id === jobId, 'keyword search');
  r = await call('GET', `/api/jobs?location=${encodeURIComponent('Atlantis City')}&type=Full-time&category=Engineering`);
  ok(r.data.jobs.some(j => j.id === jobId), 'combined filters');
  r = await call('GET', '/api/jobs?minSalary=500000');
  ok(!r.data.jobs.some(j => j.id === jobId), 'salary filter excludes job');
  r = await call('GET', '/api/jobs?limit=2&page=1');
  ok(r.data.jobs.length <= 2 && r.data.pages >= 1, 'pagination');

  console.log('Applications');
  r = await call('POST', `/api/jobs/${jobId}/apply`, { coverLetter: 'Hire me' });
  ok(r.status === 401, 'apply requires login');
  r = await call('POST', `/api/jobs/${jobId}/apply`, { coverLetter: 'Hire me' }, empToken);
  ok(r.status === 403, 'employer cannot apply');
  r = await call('POST', `/api/jobs/${jobId}/apply`, { coverLetter: 'Hire me' }, seekerToken);
  ok(r.status === 201, 'seeker applies');
  const appId = r.data.id;
  r = await call('POST', `/api/jobs/${jobId}/apply`, { coverLetter: 'again' }, seekerToken);
  ok(r.status === 409, 'duplicate application rejected');
  r = await call('GET', `/api/jobs/${jobId}/applications`, null, empToken);
  ok(r.data.length === 1 && r.data[0].email === seekerEmail, 'employer sees applicant');
  r = await call('GET', `/api/jobs/${jobId}/applications`, null, seekerToken);
  ok(r.status === 403, 'seeker cannot view applicants');
  r = await call('PUT', `/api/applications/${appId}/status`, { status: 'shortlisted' }, empToken);
  ok(r.data.status === 'shortlisted', 'employer shortlists applicant');
  r = await call('GET', '/api/applications/mine', null, seekerToken);
  ok(r.data[0].status === 'shortlisted', 'seeker sees new status');
  r = await call('DELETE', '/api/applications/' + appId, null, seekerToken);
  ok(r.status === 400, 'reviewed application cannot be withdrawn');

  console.log('Admin');
  r = await call('GET', '/api/admin/stats', null, empToken);
  ok(r.status === 403, 'employer cannot open admin stats');
  r = await call('POST', '/api/auth/login', { email: 'admin@jobs.com', password: 'admin123' });
  const adminToken = r.data.token;
  ok(!!adminToken, 'admin login');
  r = await call('GET', '/api/admin/stats', null, adminToken);
  ok(r.data.openJobs >= 1 && r.data.applications >= 1, 'admin stats');
  r = await call('PUT', `/api/admin/jobs/${jobId}/status`, { status: 'removed' }, adminToken);
  r = await call('GET', '/api/jobs?q=' + encodeURIComponent('Quantum Widget Engineer ' + stamp));
  ok(r.data.total === 0, 'removed job disappears from search');
  r = await call('PUT', `/api/admin/users/${seekerId}/active`, { active: false }, adminToken);
  ok(r.status === 200, 'admin deactivates user');
  r = await call('POST', '/api/auth/login', { email: seekerEmail, password: 'secret123' });
  ok(r.status === 403, 'deactivated user cannot log in');
  r = await call('DELETE', '/api/admin/users/' + seekerId, null, adminToken);
  ok(r.status === 200, 'admin deletes user');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('Is the server running?', e.message); process.exit(1); });
