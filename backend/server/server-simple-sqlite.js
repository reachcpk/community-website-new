require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const { applySchema, resolveDbPath } = require('../database/schema');
const { hashPassword, verifyPassword, needsRehash } = require('../auth/password');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_COOKIE = 'society_session';
const SESSION_TTL_DAYS = 7;
const MAX_GUESTS = 10;
const UNIT_MIN = 100;
const UNIT_MAX = 6000;
const UNIT_TYPES = ['1BHK', '2BHK', '3BHK', '4BHK', 'penthouse'];
const RESIDENT_TYPES = ['owner', 'tenant'];
const TIME_SLOTS = [
    '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00',
    '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00'
];

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend/html')));
app.use('/css', express.static(path.join(__dirname, '../../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../../frontend/js')));

const dbPath = resolveDbPath();
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database successfully!');
});

// Helper function to run queries
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// Cookie parsing helper
function parseCookies(req) {
    const cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const [name, ...rest] = cookie.trim().split('=');
            try {
                cookies[name] = decodeURIComponent(rest.join('='));
            } catch {
                cookies[name] = rest.join('=');
            }
        });
    }
    return cookies;
}

function setSessionCookie(res, sessionId) {
    res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
        path: '/'
    });
}

function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function isAdminUser(user) {
    return user.resident_type === 'admin' || (!!process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL);
}

function publicUser(user) {
    const { password: _, ...rest } = user;
    return { ...rest, is_admin: isAdminUser(user) };
}

// Loads the logged-in user from the server-side session referenced by the HttpOnly cookie
async function loadSessionUser(req) {
    const sessionId = parseCookies(req)[SESSION_COOKIE];
    if (!sessionId) return null;

    const rows = await query(
        `SELECT users.* FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.id = ? AND sessions.active = 1
           AND sessions.created_at > datetime('now', ?)`,
        [sessionId, `-${SESSION_TTL_DAYS} days`]
    );
    const user = rows[0];
    if (!user || user.status !== 'approved') return null;
    return { user, sessionId };
}

async function requireAuth(req, res, next) {
    try {
        const session = await loadSessionUser(req);
        if (!session) {
            return res.status(401).json({ success: false, message: 'Please login first' });
        }
        req.user = session.user;
        req.sessionId = session.sessionId;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ success: false, message: 'Authentication failed' });
    }
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (!isAdminUser(req.user)) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        req.adminUser = req.user;
        next();
    });
}

// Simple in-memory rate limiter for credential endpoints
function rateLimit({ windowMs, max }) {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = `${req.ip}:${req.path}`;
        const entry = hits.get(key);
        if (!entry || now - entry.start > windowMs) {
            hits.set(key, { start: now, count: 1 });
            return next();
        }
        entry.count += 1;
        if (entry.count > max) {
            return res.status(429).json({ success: false, message: 'Too many attempts. Please try again later.' });
        }
        next();
    };
}
const credentialLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// Normalize phone number for comparison
// Keeps the last 10 digits so "+91 98765 43210", "098765 43210" and "9876543210" all match
function normalizePhone(phone) {
    if (!phone) return '';
    return phone.toString().replace(/\D/g, '').slice(-10);
}

function todayLocalISO() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now - offset).toISOString().split('T')[0];
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

// API Routes

// Check if email exists
app.post('/api/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        const result = await query('SELECT id FROM users WHERE email = ?', [email]);
        res.json({ exists: result.length > 0 });
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Check if unit number exists
app.post('/api/check-unit', async (req, res) => {
    try {
        const { unitNumber } = req.body;
        const result = await query('SELECT id FROM users WHERE unit_number = ?', [unitNumber]);
        res.json({ exists: result.length > 0 });
    } catch (error) {
        console.error('Check unit error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Register new user
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, unitType, residentType, password } = req.body;
        const unitNumber = Number(req.body.unitNumber);

        if (![name, email, phone, unitType, residentType, password].every(isNonEmptyString)) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (!Number.isInteger(unitNumber) || unitNumber < UNIT_MIN || unitNumber > UNIT_MAX) {
            return res.json({ success: false, message: `Unit number must be between ${UNIT_MIN} and ${UNIT_MAX}` });
        }

        if (!UNIT_TYPES.includes(unitType)) {
            return res.status(400).json({ success: false, message: 'Invalid unit type' });
        }

        if (!RESIDENT_TYPES.includes(residentType)) {
            return res.status(400).json({ success: false, message: 'Invalid resident type' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Check if email already exists
        const emailExists = await query('SELECT id FROM users WHERE email = ?', [email]);
        if (emailExists.length > 0) {
            return res.json({ success: false, message: 'Email already registered' });
        }

        // Check if unit number already exists
        const unitExists = await query('SELECT id FROM users WHERE unit_number = ?', [unitNumber]);
        if (unitExists.length > 0) {
            return res.json({ success: false, message: 'Unit number already registered' });
        }

        await run(
            'INSERT INTO users (id, name, email, phone, unit_number, unit_type, resident_type, password, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), name.trim(), email.trim(), phone.trim(), unitNumber, unitType, residentType, hashPassword(password), 'pending']
        );

        res.json({ success: true, message: 'Registration submitted for approval' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

// Login user
app.post('/api/login', credentialLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        const users = await query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        if (!user || !verifyPassword(password, user.password)) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }

        // Check if user is approved
        if (user.status !== 'approved') {
            return res.json({ success: false, message: 'Account not approved by admin' });
        }

        // Upgrade legacy unsalted hashes on successful login
        if (needsRehash(user.password)) {
            await run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(password), user.id]);
        }

        // Only one active session per user: a new login ends any previous session
        await run('UPDATE sessions SET active = 0 WHERE user_id = ?', [user.id]);

        const sessionId = crypto.randomUUID();
        await run(
            'INSERT INTO sessions (id, email, user_id, active) VALUES (?, ?, ?, 1)',
            [sessionId, user.email, user.id]
        );

        setSessionCookie(res, sessionId);
        res.json({ success: true, user: publicUser(user) });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// Current logged-in user
app.get('/api/me', async (req, res) => {
    try {
        const session = await loadSessionUser(req);
        if (!session) {
            return res.status(401).json({ success: false, message: 'Not logged in' });
        }
        res.json({ success: true, user: publicUser(session.user) });
    } catch (error) {
        console.error('Session lookup error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Forgot password - for pre-registered residents only
app.post('/api/forgot-password', credentialLimiter, async (req, res) => {
    try {
        const { email, unitNumber, phone, newPassword, confirmPassword } = req.body;

        // Validate required fields
        if (!email || !unitNumber || !phone || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        // Validate passwords match
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match' });
        }

        // Validate password length
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Normalize unit number and phone for comparison
        const normalizedUnitNumber = parseInt(unitNumber, 10);
        const normalizedInputPhone = normalizePhone(phone);

        // Find pre-registered user by email and unit number (phone verified separately due to formatting variations)
        const users = await query(
            'SELECT * FROM users WHERE email = ? AND unit_number = ? AND status = ?',
            [email, normalizedUnitNumber, 'approved']
        );

        // Match user by normalized phone number
        const user = users.find(u => normalizedInputPhone && normalizePhone(u.phone) === normalizedInputPhone);

        if (!user) {
            return res.status(404).json({ success: false, message: 'No matching pre-registered resident found. Please check your details or wait for admin approval.' });
        }

        // Admin passwords are managed via .env + `npm run init-db`, never through this public form
        if (isAdminUser(user)) {
            return res.status(403).json({ success: false, message: 'Admin password cannot be reset here' });
        }

        await run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(newPassword), user.id]);

        // Clear any active sessions for this user
        await run('UPDATE sessions SET active = 0 WHERE user_id = ?', [user.id]);

        res.json({ success: true, message: 'Password reset successful. Please login with your new password.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Password reset failed' });
    }
});

// Logout user
app.post('/api/logout', async (req, res) => {
    try {
        const sessionId = parseCookies(req)[SESSION_COOKIE];
        if (sessionId) {
            await run('UPDATE sessions SET active = 0 WHERE id = ?', [sessionId]);
        }
        clearSessionCookie(res);
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Logout failed' });
    }
});

// Get all amenities (public - used by amenities grid and booking form)
app.get('/api/amenities', async (req, res) => {
    try {
        const amenities = await query(
            'SELECT id, name, description, created_at FROM amenities ORDER BY name'
        );
        res.json(amenities);
    } catch (error) {
        console.error('Get amenities error:', error);
        res.status(500).json({ success: false, message: 'Failed to load amenities' });
    }
});

// Create amenity (admin)
app.post('/api/amenities', requireAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!isNonEmptyString(name)) {
            return res.status(400).json({ success: false, message: 'Amenity name is required' });
        }

        const trimmedName = name.trim();
        const existing = await query('SELECT id FROM amenities WHERE LOWER(name) = LOWER(?)', [trimmedName]);
        if (existing.length > 0) {
            return res.json({ success: false, message: 'An amenity with this name already exists' });
        }

        const amenityId = crypto.randomUUID();
        await run(
            'INSERT INTO amenities (id, name, description) VALUES (?, ?, ?)',
            [amenityId, trimmedName, String(description || '').trim()]
        );

        res.json({ success: true, message: 'Amenity created', amenity: { id: amenityId, name: trimmedName } });
    } catch (error) {
        console.error('Create amenity error:', error);
        res.status(500).json({ success: false, message: 'Failed to create amenity' });
    }
});

// Delete amenity (admin)
app.delete('/api/amenities/:id', requireAdmin, async (req, res) => {
    try {
        const result = await run('DELETE FROM amenities WHERE id = ?', [req.params.id]);

        if (result.changes === 0) {
            return res.json({ success: false, message: 'Amenity not found' });
        }

        res.json({ success: true, message: 'Amenity deleted' });
    } catch (error) {
        console.error('Delete amenity error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete amenity' });
    }
});

// Book amenity (resident identity comes from the session, never from the request body)
app.post('/api/book', requireAuth, async (req, res) => {
    try {
        const { amenity, date, time, notes } = req.body;
        const guests = Number(req.body.guests);
        const user = req.user;

        if (!amenity || !date || !time || !req.body.guests) {
            return res.status(400).json({ success: false, message: 'Missing required booking fields' });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
            return res.status(400).json({ success: false, message: 'Invalid booking date' });
        }

        if (date < todayLocalISO()) {
            return res.json({ success: false, message: 'Cannot book for past dates' });
        }

        if (!TIME_SLOTS.includes(time)) {
            return res.status(400).json({ success: false, message: 'Invalid time slot' });
        }

        if (!Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS) {
            return res.json({ success: false, message: `Guests must be between 1 and ${MAX_GUESTS}` });
        }

        // Validate amenity exists
        const amenityExists = await query('SELECT id FROM amenities WHERE name = ?', [amenity]);
        if (amenityExists.length === 0) {
            return res.json({ success: false, message: 'Selected amenity is not available' });
        }

        // Check for duplicate booking (same amenity, date, time)
        const duplicateAmenity = await query(
            'SELECT id FROM bookings WHERE amenity = ? AND booking_date = ? AND time_slot = ?',
            [amenity, date, time]
        );

        if (duplicateAmenity.length > 0) {
            return res.json({ success: false, message: 'This amenity is already booked for this time slot' });
        }

        // Check for same user booking multiple amenities at same time
        const sameUserConflict = await query(
            'SELECT id FROM bookings WHERE (email = ? OR phone = ?) AND booking_date = ? AND time_slot = ?',
            [user.email, user.phone, date, time]
        );

        if (sameUserConflict.length > 0) {
            return res.json({ success: false, message: 'You already have another amenity booked at this time' });
        }

        await run(
            'INSERT INTO bookings (id, name, email, phone, unit_number, amenity, booking_date, time_slot, guests, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), user.name, user.email, user.phone, user.unit_number, amenity, date, time, guests, String(notes || '')]
        );

        res.json({ success: true, message: 'Booking confirmed' });
    } catch (error) {
        console.error('Booking error:', error);
        if (error.message && error.message.includes('UNIQUE constraint failed: bookings.amenity')) {
            return res.json({ success: false, message: 'This amenity is already booked for this time slot' });
        }
        res.status(500).json({ success: false, message: 'Booking failed: Server error. Please try again.' });
    }
});

// Get all registrations (admin)
app.get('/api/registrations', requireAdmin, async (req, res) => {
    try {
        const registrations = await query(
            'SELECT name, email, phone, unit_number, unit_type, resident_type, status FROM users ORDER BY created_at DESC'
        );
        res.json(registrations);
    } catch (error) {
        console.error('Get registrations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

async function setUserStatus(req, res, status, label) {
    try {
        const { email } = req.body;

        const result = await run('UPDATE users SET status = ? WHERE email = ?', [status, email]);

        if (result.changes === 0) {
            return res.json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, message: `User ${label}` });
    } catch (error) {
        console.error(`${label} error:`, error);
        res.status(500).json({ success: false, message: `Failed to update user` });
    }
}

// Approve user (admin)
app.post('/api/approve', requireAdmin, (req, res) => setUserStatus(req, res, 'approved', 'approved'));

// Reject user (admin)
app.post('/api/reject', requireAdmin, (req, res) => setUserStatus(req, res, 'rejected', 'rejected'));

// Start server once the schema is in place
applySchema(db)
    .then(() => {
        app.listen(PORT, async () => {
            let amenityCount = 0;
            try {
                const rows = await query('SELECT COUNT(*) as c FROM amenities');
                amenityCount = rows[0].c;
            } catch (e) { /* ignore */ }
            console.log(`Society Hub server running on http://localhost:${PORT}`);
            console.log(`Society capacity: 250 units (Unit numbers: ${UNIT_MIN}-${UNIT_MAX})`);
            console.log(`Amenities available: ${amenityCount}`);
            console.log(`Database: SQLite (${dbPath})`);
        });
    })
    .catch((err) => {
        console.error('Database schema setup failed:', err.message);
        process.exit(1);
    });
