const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'backend/database/society-booking.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
});

db.all(
    'SELECT id, name, email, phone, unit_number, unit_type, resident_type, status, password FROM users',
    (err, rows) => {
        if (err) {
            console.error('Query error:', err.message);
        } else {
            console.log('All users in database:');
            console.log(JSON.stringify(rows, null, 2));
        }
        db.close();
    }
);