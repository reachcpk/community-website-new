require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend/html')));
app.use('/css', express.static(path.join(__dirname, '../../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../../frontend/js')));

// Database configuration - use new structure
const dbPath = path.join(__dirname, '../database/society-booking.db');
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
            cookies[name] = decodeURIComponent(rest.join('='));
        });
    }
    return cookies;
}

// Admin authentication middleware
async function requireAdmin(req, res, next) {
    try {
        const cookies = parseCookies(req);
        const userCookie = cookies.society_user;
        
        if (!userCookie) {
            return res.status(401).json({ success: false, message: 'Please login as admin' });
        }
        
        const user = JSON.parse(userCookie);
        const email = user.email;
        
        if (!email) {
            return res.status(401).json({ success: false, message: 'Invalid session' });
        }
        
        // Check if user is admin
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@society.com';
        const adminUsers = await query(
            'SELECT * FROM users WHERE email = ? AND (resident_type = ? OR email = ?)',
            [email, 'admin', adminEmail]
        );
        
        if (adminUsers.length === 0) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        req.adminUser = adminUsers[0];
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        res.status(401).json({ success: false, message: 'Authentication failed' });
    }
}

// Password hashing
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Check if user has active session
async function hasActiveSession(email) {
    const result = await query('SELECT * FROM sessions WHERE email = ? AND active = 1', [email]);
    return result.length > 0;
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
        const { name, email, phone, unitNumber, unitType, residentType, password } = req.body;
        
        // Validate unit number range
        if (unitNumber < 100 || unitNumber > 6000) {
            return res.json({ success: false, message: 'Unit number must be between 100 and 6000' });
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
        
        // Create new user
        const userId = Date.now().toString();
        await run(
            'INSERT INTO users (id, name, email, phone, unit_number, unit_type, resident_type, password, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, name, email, phone, unitNumber, unitType, residentType, hashPassword(password), 'pending']
        );
        
        res.json({ success: true, message: 'Registration submitted for approval' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

// Login user
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const users = await query(
            'SELECT * FROM users WHERE email = ? AND password = ?',
            [email, hashPassword(password)]
        );
        
        if (users.length === 0) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }
        
        const user = users[0];
        
        // Check if user is approved
        if (user.status !== 'approved') {
            return res.json({ success: false, message: 'Account not approved by admin' });
        }
        
        // Check if user already has active session
        const hasSession = await hasActiveSession(email);
        if (hasSession) {
            return res.json({ success: false, message: 'User already logged in. Please logout first.' });
        }
        
        // Create session
        const sessionId = crypto.randomUUID();
        await run(
            'INSERT INTO sessions (id, email, user_id, active) VALUES (?, ?, ?, 1)',
            [sessionId, email, user.id]
        );
        
        // Return user data (without password)
        const { password: _, ...userWithoutPassword } = user;
        res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// Logout user
app.post('/api/logout', async (req, res) => {
    try {
        const { email } = req.body;
        
        await run(
            'UPDATE sessions SET active = 0 WHERE email = ?',
            [email]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Logout failed' });
    }
});

// Book amenity
app.post('/api/book', async (req, res) => {
    try {
        const { name, email, phone, unitNumber, amenity, date, time, guests, notes } = req.body;
        
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
            [email, phone, date, time]
        );
        
        if (sameUserConflict.length > 0) {
            return res.json({ success: false, message: 'You already have another amenity booked at this time' });
        }
        
        // Validate required fields
        if (!name || !email || !phone || !unitNumber || !amenity || !date || !time || !guests) {
            return res.status(400).json({ success: false, message: 'Missing required booking fields' });
        }
        
        // Create booking
        const bookingId = Date.now().toString();
        await run(
            'INSERT INTO bookings (id, name, email, phone, unit_number, amenity, booking_date, time_slot, guests, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [bookingId, name, email, phone, unitNumber, amenity, date, time, parseInt(guests), notes || '']
        );
        
        res.json({ success: true, message: 'Booking confirmed' });
    } catch (error) {
        console.error('Booking error:', error);
        const errorMessage = error.message && error.message.includes('SQLITE_CONSTRAINT') 
            ? 'Booking failed: Missing required information. Please ensure all fields are filled.'
            : 'Booking failed: Server error. Please try again.';
        res.status(500).json({ success: false, message: errorMessage });
    }
});

// Get all registrations (admin)
app.get('/api/registrations', requireAdmin, async (req, res) => {
    try {
        const registrations = await query(
            'SELECT name, email, phone, unit_number, unit_type, resident_type, status FROM users'
        );
        res.json(registrations);
    } catch (error) {
        console.error('Get registrations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Approve user (admin)
app.post('/api/approve', requireAdmin, async (req, res) => {
    try {
        const { email } = req.body;
        
        const result = await run(
            'UPDATE users SET status = ? WHERE email = ?',
            ['approved', email]
        );
        
        if (result.changes === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, message: 'User approved' });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ success: false, message: 'Approval failed' });
    }
});

// Reject user (admin)
app.post('/api/reject', requireAdmin, async (req, res) => {
    try {
        const { email } = req.body;
        
        const result = await run(
            'UPDATE users SET status = ? WHERE email = ?',
            ['rejected', email]
        );
        
        if (result.changes === 0) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, message: 'User rejected' });
    } catch (error) {
        console.error('Reject error:', error);
        res.status(500).json({ success: false, message: 'Rejection failed' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Society Hub server running on http://localhost:${PORT}`);
    console.log(`Society capacity: 250 units (Unit numbers: 100-6000)`);
    console.log(`Amenities available: 15`);
    console.log(`Database: SQLite (society-booking.db)`);
});