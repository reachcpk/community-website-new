const crypto = require('crypto');

const KEY_LENGTH = 64;

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
    return `scrypt$${salt}$${hash}`;
}

function legacySha256(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function safeEqualHex(a, b) {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function verifyPassword(password, stored) {
    if (typeof password !== 'string' || typeof stored !== 'string') return false;

    if (stored.startsWith('scrypt$')) {
        const [, salt, hash] = stored.split('$');
        const candidate = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
        return safeEqualHex(candidate, hash);
    }

    // Accounts created before salted hashing used unsalted SHA-256
    return safeEqualHex(legacySha256(password), stored);
}

function needsRehash(stored) {
    return !String(stored).startsWith('scrypt$');
}

module.exports = { hashPassword, verifyPassword, needsRehash };
