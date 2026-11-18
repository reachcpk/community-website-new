const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const ADMIN = { email: 'admin@test.local', password: 'Admin#Pass123' };

let tmpDir;
let server;

const env = () => ({
    ...process.env,
    PORT: String(PORT),
    DB_PATH: path.join(tmpDir, 'test.db'),
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password
});

async function api(method, url, body, cookie) {
    const res = await fetch(BASE + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const setCookie = res.headers.get('set-cookie');
    return { status: res.status, body: await res.json(), cookie: setCookie && setCookie.split(';')[0] };
}

async function login(email, password) {
    const res = await api('POST', '/api/login', { email, password });
    assert.strictEqual(res.body.success, true, JSON.stringify(res.body));
    return res.cookie;
}

function tomorrow() {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().split('T')[0];
}

before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'society-test-'));
    execFileSync(process.execPath, ['backend/database/init-sqlite.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
    server = spawn(process.execPath, ['backend/server/server-simple-sqlite.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
        try {
            await fetch(BASE + '/api/amenities');
            return;
        } catch {
            await new Promise(r => setTimeout(r, 100));
        }
    }
    throw new Error('Server did not start');
});

after(() => {
    server.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('a forged client-side cookie does not grant admin access', async () => {
    const forged = 'society_user=' + encodeURIComponent(JSON.stringify({ email: ADMIN.email }));
    const res = await api('POST', '/api/amenities', { name: 'Hacked' }, forged);
    assert.strictEqual(res.status, 401);
});

test('admin can manage amenities with a real session', async () => {
    const cookie = await login(ADMIN.email, ADMIN.password);
    assert.match(cookie, /^society_session=/);
    const me = await api('GET', '/api/me', null, cookie);
    assert.strictEqual(me.body.user.is_admin, true);
    assert.strictEqual(me.body.user.password, undefined);
    const res = await api('POST', '/api/amenities', { name: 'Pool' }, cookie);
    assert.strictEqual(res.body.success, true);
});

test('logging in again replaces the old session instead of locking the user out', async () => {
    const first = await login(ADMIN.email, ADMIN.password);
    const second = await login(ADMIN.email, ADMIN.password);
    assert.strictEqual((await api('GET', '/api/me', null, first)).status, 401);
    assert.strictEqual((await api('GET', '/api/me', null, second)).status, 200);
});

test('registration rejects self-assigned admin role', async () => {
    const res = await api('POST', '/api/register', {
        name: 'Mallory', email: 'm@x.com', phone: '9000000000', unitNumber: 101,
        unitType: '2BHK', residentType: 'admin', password: 'secret1'
    });
    assert.strictEqual(res.body.success, false);
});

test('admin password cannot be reset through forgot-password', async () => {
    const res = await api('POST', '/api/forgot-password', {
        email: ADMIN.email, unitNumber: 9999, phone: '0000000000',
        newPassword: 'pwned12', confirmPassword: 'pwned12'
    });
    assert.strictEqual(res.status, 403);
});

test('resident booking flow: auth required, validation, conflicts', async () => {
    const admin = await login(ADMIN.email, ADMIN.password);
    const reg = await api('POST', '/api/register', {
        name: 'Alice', email: 'alice@x.com', phone: '+91 98765 43210', unitNumber: 250,
        unitType: '2BHK', residentType: 'owner', password: 'secret1'
    });
    assert.strictEqual(reg.body.success, true);
    await api('POST', '/api/approve', { email: 'alice@x.com' }, admin);

    const booking = { amenity: 'Pool', date: tomorrow(), time: '09:00-10:00', guests: 2 };

    assert.strictEqual((await api('POST', '/api/book', booking)).status, 401);

    const alice = await login('alice@x.com', 'secret1');
    assert.strictEqual((await api('POST', '/api/book', { ...booking, guests: 50 }, alice)).body.success, false);
    assert.strictEqual((await api('POST', '/api/book', { ...booking, date: '2001-01-01' }, alice)).body.success, false);
    assert.strictEqual((await api('POST', '/api/book', { ...booking, time: 'all-day' }, alice)).body.success, false);

    const ok = await api('POST', '/api/book', { ...booking, email: 'someone-else@x.com' }, alice);
    assert.strictEqual(ok.body.success, true);

    const dup = await api('POST', '/api/book', booking, alice);
    assert.strictEqual(dup.body.success, false);
});

test('forgot-password matches phone numbers in different formats', async () => {
    const res = await api('POST', '/api/forgot-password', {
        email: 'alice@x.com', unitNumber: 250, phone: '09876543210',
        newPassword: 'newpass1', confirmPassword: 'newpass1'
    });
    assert.strictEqual(res.body.success, true);
    await login('alice@x.com', 'newpass1');
});

test('logout ends only the caller\'s session', async () => {
    const alice = await login('alice@x.com', 'newpass1');
    await api('POST', '/api/logout', { email: ADMIN.email });
    assert.strictEqual((await api('GET', '/api/me', null, alice)).status, 200);
    await api('POST', '/api/logout', null, alice);
    assert.strictEqual((await api('GET', '/api/me', null, alice)).status, 401);
});
