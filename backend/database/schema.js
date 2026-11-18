const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, 'society-booking.db');

const SCHEMA = `
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

CREATE TABLE IF NOT EXISTS amenities (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// Kept separate so an existing database that already contains duplicate
// bookings does not prevent the rest of the schema from being applied.
const UNIQUE_SLOT_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS uniq_amenity_slot
    ON bookings(amenity, booking_date, time_slot)`;

function resolveDbPath() {
    return process.env.DB_PATH || DEFAULT_DB_PATH;
}

function applySchema(db) {
    return new Promise((resolve, reject) => {
        db.exec(SCHEMA, (err) => {
            if (err) return reject(err);
            db.exec(UNIQUE_SLOT_INDEX, (indexErr) => {
                if (indexErr) {
                    console.warn('Could not create unique booking index (duplicate bookings exist?):', indexErr.message);
                }
                resolve();
            });
        });
    });
}

module.exports = { applySchema, resolveDbPath };
