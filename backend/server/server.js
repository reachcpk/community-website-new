require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend/html')));
app.use('/css', express.static(path.join(__dirname, '../../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../../frontend/js')));

// Data file paths
const USERS_FILE = path.join(__dirname, '../../data/users.json');
const BOOKINGS_FILE = path.join(__dirname, '../../data/bookings.json');
const SESSIONS_FILE = path.join(__dirname, '../../data/sessions.json');

// Ensure data directory exists
async function ensureDataDirectory() {
    const dataDir = path.join(__dirname, '../../data');
    try {
        await fs.access(dataDir);
    } catch {
        await fs.mkdir(dataDir, { recursive: true });
    }
    
    // Initialize files if they don't exist
    try {
        await fs.access(USERS_FILE);
    } catch {
        await fs.writeFile(USERS_FILE, JSON.stringify([]));
    }
    
    try {
        await fs.access(BOOKINGS_FILE);
    } catch {
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify([]));
    }
    
    try {
        await fs.access(SESSIONS_FILE);
    } catch {
        await fs.writeFile(SESSIONS_FILE, JSON.stringify([]));
    }
}

// Helper functions to read/write data
async function readUsers() {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
}

async function writeUsers(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function readBookings() {
    const data = await fs.readFile(BOOKINGS_FILE, 'utf8');
    return JSON.parse(data);
}

async function writeBookings(bookings) {
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

async function readSessions() {
    const data = await fs.readFile(SESSIONS_FILE, 'utf8');
    return JSON.parse(data);
}

async function writeSessions(sessions) {
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

// Password hashing
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Check if user has active session
async function hasActiveSession(email) {
    const sessions = await readSessions();
    const session = sessions.find(s => s.email === email && s.active);
    return !!session;
}

// API Routes

// Check if email exists
app.post('/api/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        const users = await readUsers();
        const exists = users.some(u => u.email === email);
        res.json({ exists });
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Check if unit number exists
app.post('/api/check-unit', async (req, res) => {
    try {
        const { unitNumber } = req.body;
        const users = await readUsers();
        const exists = users.some(u => u.unitNumber === parseInt(unitNumber));
        res.json({ exists });
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
        
        const users = await readUsers();
        
        // Check if email already exists
        if (users.some(u => u.email === email)) {
            return res.json({ success: false, message: 'Email already registered' });
        }
        
        // Check if unit number already exists
        if (users.some(u => u.unitNumber === parseInt(unitNumber))) {
            return res.json({ success: false, message: 'Unit number already registered' });
        }
        
        // Create new user
        const newUser = {
            id: Date.now().toString(),
            name,
            email,
            phone,
            unitNumber: parseInt(unitNumber),
            unitType,
            residentType,
            password: hashPassword(password),
            status: 'pending', // Requires admin approval
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        await writeUsers(users);
        
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
        
        const users = await readUsers();
        const user = users.find(u => u.email === email && u.password === hashPassword(password));
        
        if (!user) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }
        
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
        const sessions = await readSessions();
        const session = {
            id: crypto.randomUUID(),
            email: user.email,
            userId: user.id,
            createdAt: new Date().toISOString(),
            active: true
        };
        
        sessions.push(session);
        await writeSessions(sessions);
        
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
        
        const sessions = await readSessions();
        const sessionIndex = sessions.findIndex(s => s.email === email && s.active);
        
        if (sessionIndex !== -1) {
            sessions[sessionIndex].active = false;
            await writeSessions(sessions);
        }
        
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
        
        const bookings = await readBookings();
        
        // Check for duplicate booking (same amenity, date, time)
        const duplicateAmenity = bookings.find(b => 
            b.amenity === amenity && 
            b.date === date && 
            b.time === time
        );
        
        if (duplicateAmenity) {
            return res.json({ success: false, message: 'This amenity is already booked for this time slot' });
        }
        
        // Check for same user booking multiple amenities at same time
        const sameUserConflict = bookings.find(b => 
            (b.email === email || b.phone === phone) &&
            b.date === date &&
            b.time === time
        );
        
        if (sameUserConflict) {
            return res.json({ success: false, message: 'You already have another amenity booked at this time' });
        }
        
        // Create booking
        const newBooking = {
            id: Date.now().toString(),
            name,
            email,
            phone,
            unitNumber,
            amenity,
            date,
            time,
            guests: parseInt(guests),
            notes: notes || '',
            createdAt: new Date().toISOString()
        };
        
        bookings.push(newBooking);
        await writeBookings(bookings);
        
        res.json({ success: true, message: 'Booking confirmed' });
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ success: false, message: 'Booking failed' });
    }
});

// Get all registrations (admin)
app.get('/api/registrations', async (req, res) => {
    try {
        const users = await readUsers();
        const registrations = users.map(u => ({
            name: u.name,
            email: u.email,
            phone: u.phone,
            unitNumber: u.unitNumber,
            unitType: u.unitType,
            residentType: u.residentType,
            status: u.status
        }));
        
        res.json(registrations);
    } catch (error) {
        console.error('Get registrations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Approve user (admin)
app.post('/api/approve', async (req, res) => {
    try {
        const { email } = req.body;
        
        const users = await readUsers();
        const userIndex = users.findIndex(u => u.email === email);
        
        if (userIndex === -1) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        users[userIndex].status = 'approved';
        await writeUsers(users);
        
        res.json({ success: true, message: 'User approved' });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ success: false, message: 'Approval failed' });
    }
});

// Reject user (admin)
app.post('/api/reject', async (req, res) => {
    try {
        const { email } = req.body;
        
        const users = await readUsers();
        const userIndex = users.findIndex(u => u.email === email);
        
        if (userIndex === -1) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        users[userIndex].status = 'rejected';
        await writeUsers(users);
        
        res.json({ success: true, message: 'User rejected' });
    } catch (error) {
        console.error('Reject error:', error);
        res.status(500).json({ success: false, message: 'Rejection failed' });
    }
});

// Start server
async function startServer() {
    await ensureDataDirectory();
    
    app.listen(PORT, () => {
        console.log(`Society Hub server running on http://localhost:${PORT}`);
        console.log(`Society capacity: 250 units (Unit numbers: 100-6000)`);
        console.log(`Amenities available: 15`);
    });
}

startServer();