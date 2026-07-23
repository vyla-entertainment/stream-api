import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';

const [, , type, rpmArg, label] = process.argv;

if (!type || !rpmArg) {
    console.log('Usage: node database/add-key.mjs <type> <rpm> [label]');
    console.log('Example: node database/add-key.mjs standard 500 flixora');
    process.exit(1);
}

const rpm = parseInt(rpmArg, 10);
if (isNaN(rpm) || rpm <= 0) {
    console.log('rpm must be a positive number');
    process.exit(1);
}

const prefix = type === 'partner' ? 'pk' : type === 'public' ? 'pub' : 'sk';
const suffix = crypto.randomBytes(16).toString('hex');
const key = label ? `${prefix}_${label}_${suffix}` : `${prefix}_${suffix}`;

const db = new DatabaseSync('./data/api_keys.db');
db.exec('PRAGMA journal_mode = WAL;');

db.prepare(`
    INSERT INTO api_keys (key, type, rpm, active)
    VALUES (?, ?, ?, 1)
`).run(key, type, rpm);

console.log('Key created:');
console.log(key);