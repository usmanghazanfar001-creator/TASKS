// Step 5: end-to-end workflow test. Start the server first (npm start), then run: npm test
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
  const email = `test${Date.now()}@example.com`;

  console.log('Accounts');
  let r = await call('POST', '/api/auth/register', { name: 'Test User', email, password: 'secret123' });
  ok(r.status === 201 && r.data.token, 'register new user');
  const userToken = r.data.token;
  r = await call('POST', '/api/auth/register', { name: 'Dup', email, password: 'secret123' });
  ok(r.status === 409, 'duplicate email rejected');
  r = await call('POST', '/api/auth/login', { email, password: 'wrong' });
  ok(r.status === 401, 'wrong password rejected');
  r = await call('POST', '/api/auth/login', { email, password: 'secret123' });
  ok(r.status === 200, 'login works');

  console.log('Catalog');
  r = await call('GET', '/api/products');
  ok(r.status === 200 && r.data.length > 0, 'list products');
  const product = r.data[0];
  r = await call('GET', '/api/products?q=' + encodeURIComponent(product.name.split(' ')[0]));
  ok(r.data.some(p => p.id === product.id), 'search finds product');

  console.log('Cart');
  r = await call('GET', '/api/cart');
  ok(r.status === 401, 'cart requires login');
  r = await call('POST', '/api/cart', { productId: product.id, quantity: 2 }, userToken);
  ok(r.status === 201 && r.data[0].quantity === 2, 'add to cart');
  r = await call('PUT', '/api/cart/' + product.id, { quantity: 3 }, userToken);
  ok(r.data[0].quantity === 3, 'update cart quantity');
  r = await call('POST', '/api/cart', { productId: product.id, quantity: 99999 }, userToken);
  ok(r.status === 400, 'cannot exceed stock');

  console.log('Orders');
  r = await call('POST', '/api/orders', null, userToken);
  ok(r.status === 201 && r.data.items.length === 1, 'checkout creates order');
  const orderId = r.data.id;
  ok(Math.abs(r.data.total - product.price * 3) < 0.01, 'order total correct');
  r = await call('GET', '/api/products/' + product.id);
  ok(r.data.stock === product.stock - 3, 'stock decreased');
  r = await call('GET', '/api/cart', null, userToken);
  ok(r.data.length === 0, 'cart cleared after checkout');
  r = await call('GET', '/api/orders', null, userToken);
  ok(r.data.some(o => o.id === orderId), 'order in history');

  console.log('Admin');
  r = await call('POST', '/api/products', { name: 'X', price: 1, stock: 1, category: 'Test' }, userToken);
  ok(r.status === 403, 'customer cannot create products');
  r = await call('POST', '/api/auth/login', { email: 'admin@shop.com', password: 'admin123' });
  const adminToken = r.data.token;
  ok(!!adminToken, 'admin login');
  r = await call('POST', '/api/products', { name: 'Test Item', price: 9.5, stock: 5, category: 'Test' }, adminToken);
  ok(r.status === 201, 'admin creates product');
  const newId = r.data.id;
  r = await call('PUT', '/api/products/' + newId, { name: 'Test Item', price: 12, stock: 7, category: 'Test' }, adminToken);
  ok(r.data.price === 12, 'admin updates product');
  r = await call('PUT', `/api/orders/${orderId}/status`, { status: 'shipped' }, adminToken);
  ok(r.data.status === 'shipped', 'admin ships order');
  r = await call('PUT', `/api/orders/${orderId}/status`, { status: 'cancelled' }, adminToken);
  r = await call('GET', '/api/products/' + product.id);
  ok(r.data.stock === product.stock, 'cancelling restores stock');
  r = await call('DELETE', '/api/products/' + newId, null, adminToken);
  ok(r.status === 200, 'admin deletes product');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('Is the server running?', e.message); process.exit(1); });
