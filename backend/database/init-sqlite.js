require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'society-booking.db');

// Require admin credentials to come from environment, not source code
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_PHONE = process.env.ADMIN_PHONE || '0000000000';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('❌ Missing ADMIN_EMAIL or ADMIN_PASSWORD in your .env file.');
    console.error('   Create a .env file (see .env.example) before running init-db.');
    process.exit(1);
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database initialization failed:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to SQLite database successfully!');
});

// Create tables
const schema = `
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    unit_number INTEGER NOT NULL,
    unit_type TEXT NOT NULL,
    resident_type TEXT NOT NULL,
    password TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    unit_number INTEGER NOT NULL,
    amenity TEXT NOT NULL,
    booking_date TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    guests INTEGER NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_unit_number ON users(unit_number);
CREATE INDEX IF NOT EXISTS idx_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_amenity_date_time ON bookings(amenity, booking_date, time_slot);
CREATE INDEX IF NOT EXISTS idx_user_booking ON bookings(email, booking_date, time_slot);
CREATE INDEX IF NOT EXISTS idx_phone_booking ON bookings(phone, booking_date, time_slot);
CREATE INDEX IF NOT EXISTS idx_unit_booking ON bookings(unit_number, booking_date, time_slot);
CREATE INDEX IF NOT EXISTS idx_session_email ON sessions(email);
CREATE INDEX IF NOT EXISTS idx_session_active ON sessions(active);
`;

db.exec(schema, (err) => {
    if (err) {
        console.error('❌ Schema execution failed:', err.message);
        process.exit(1);
    }

    console.log('✅ Database schema executed successfully!');

    // Insert default admin user - password hashed at runtime from .env, never stored in source
    const adminPasswordHash = hashPassword(ADMIN_PASSWORD);
    db.run(
        `INSERT OR IGNORE INTO users (id, name, email, phone, unit_number, unit_type, resident_type, password, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['admin001', 'System Admin', ADMIN_EMAIL, ADMIN_PHONE, 9999, 'ADMIN', 'admin', adminPasswordHash, 'approved'],
        (err) => {
            if (err) {
                console.error('❌ Admin user creation failed:', err.message);
            } else {
                console.log(`✅ Default admin user created (email: ${ADMIN_EMAIL})`);
            }

            console.log('\n✅ Database initialization complete!');
            console.log('Database: SQLite (society-booking.db)');
            console.log('Tables created: users, bookings, sessions');

            db.close((err) => {
                if (err) {
                    console.error('❌ Error closing database:', err.message);
                } else {
                    console.log('Database connection closed.');
                }
            });
        }
    );
});
