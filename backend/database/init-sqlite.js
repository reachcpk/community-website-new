require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { applySchema, resolveDbPath } = require('./schema');
const { hashPassword } = require('../auth/password');

const dbPath = resolveDbPath();

// Require admin credentials to come from environment, not source code
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_PHONE = process.env.ADMIN_PHONE || '0000000000';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('❌ Missing ADMIN_EMAIL or ADMIN_PASSWORD in your .env file.');
    console.error('   Create a .env file (see .env.example) before running init-db.');
    process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database initialization failed:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to SQLite database successfully!');
});

applySchema(db).then(() => {
    console.log('✅ Database schema executed successfully!');

    // Create or update the admin account from .env (re-run init-db to reset the admin password)
    const adminPasswordHash = hashPassword(ADMIN_PASSWORD);
    db.run(
        `INSERT INTO users (id, name, email, phone, unit_number, unit_type, resident_type, password, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET email = excluded.email, phone = excluded.phone, password = excluded.password`,
        ['admin001', 'System Admin', ADMIN_EMAIL, ADMIN_PHONE, 9999, 'ADMIN', 'admin', adminPasswordHash, 'approved'],
        (err) => {
            if (err) {
                console.error('❌ Admin user creation failed:', err.message);
            } else {
                console.log(`✅ Admin user ready (email: ${ADMIN_EMAIL})`);
            }

            // Password may have changed: end existing admin sessions
            db.run('UPDATE sessions SET active = 0 WHERE user_id = ?', ['admin001'], (sessionErr) => {
                if (sessionErr) console.error('❌ Could not clear admin sessions:', sessionErr.message);

                console.log('\n✅ Database initialization complete!');
                console.log('Database: SQLite (society-booking.db)');
                console.log('Tables created: users, bookings, sessions, amenities');

                db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err.message);
                    } else {
                        console.log('Database connection closed.');
                    }
                });
            });
        }
    );
}).catch((err) => {
    console.error('❌ Schema execution failed:', err.message);
    process.exit(1);
});
