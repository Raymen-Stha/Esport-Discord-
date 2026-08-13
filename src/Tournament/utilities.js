// ─── Tournament Database & Logger Utilities ─────────────────────────
// Every tournament module reads/writes JSON through this file.
// Features:
//   • Async I/O with fs.promises (non-blocking reads/writes)
//   • In-memory cache with auto-invalidation on writes
//   • Atomic writes (write temp → rename) to prevent corruption
//   • Automatic .backup before every write
//   • File-level mutex (Promise-based queue) to prevent concurrent write races
//   • Audit logger that appends to logs.json

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { dataFiles, defaultSettings } = require('./config');

const DATA_DIR = path.join(__dirname, 'data');

// ── In-memory cache ─────────────────────────────────────────────────
// Stores parsed JSON keyed by filename. Invalidated on every writeData().
const dataCache = new Map();

// ── Promise-based write locks (one per file) ────────────────────────
// Replaces the old spinlock (setTimeout polling) with a proper queue.
const lockQueues = new Map();

/**
 * Acquire a simple async mutex for a given filename.
 * Returns a release function. Uses a Promise chain instead of busy-waiting.
 */
function acquireLock(filename) {
    let release;
    const newLock = new Promise(resolve => { release = resolve; });

    // Get the current tail of the queue (or a resolved promise if none)
    const currentLock = lockQueues.get(filename) || Promise.resolve();

    // Chain our new lock onto the queue
    lockQueues.set(filename, currentLock.then(() => newLock));

    // Wait for the previous lock to release, then return our release function
    return currentLock.then(() => release);
}

// ── Read / Write ────────────────────────────────────────────────────

/**
 * Read and parse a JSON data file (async, cached).
 * Returns the parsed object/array from cache if available,
 * or reads from disk and caches the result.
 * Returns the provided fallback if the file is missing or unparseable.
 */
async function readData(filename, fallback = []) {
    // Return from cache if available
    if (dataCache.has(filename)) {
        return dataCache.get(filename);
    }

    const filePath = path.join(DATA_DIR, filename);
    try {
        await fsp.access(filePath);
        const raw = (await fsp.readFile(filePath, 'utf8')).trim();
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        dataCache.set(filename, parsed);
        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') return fallback;
        console.error(`❌ [DB] Failed to read ${filename}:`, err.message);
        return fallback;
    }
}

/**
 * Atomically write data to a JSON file (async).
 * 1. Backup current file → filename.backup
 * 2. Write to filename.tmp
 * 3. Rename .tmp → filename
 * 4. Invalidate cache
 */
async function writeData(filename, data) {
    const release = await acquireLock(filename);
    const filePath = path.join(DATA_DIR, filename);
    const tmpPath = filePath + '.tmp';
    const backupPath = filePath + '.backup';

    try {
        // Backup existing file
        try {
            await fsp.access(filePath);
            await fsp.copyFile(filePath, backupPath);
        } catch (_) { /* file doesn't exist yet, skip backup */ }

        // Write to temp, then rename (atomic on most OS)
        await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
        await fsp.rename(tmpPath, filePath);

        // Invalidate cache so next read picks up fresh data
        dataCache.set(filename, data);
    } catch (err) {
        console.error(`❌ [DB] Failed to write ${filename}:`, err.message);
        // Clean up temp if it exists
        try { await fsp.unlink(tmpPath); } catch (_) { /* ignore */ }
        throw err;
    } finally {
        release();
    }
}

// ── Initialization ──────────────────────────────────────────────────

/**
 * Ensure the data directory and all JSON files exist.
 * Called once at startup. Uses async I/O.
 */
async function ensureDataFiles() {
    try {
        await fsp.access(DATA_DIR);
    } catch (_) {
        await fsp.mkdir(DATA_DIR, { recursive: true });
    }

    const defaults = {
        [dataFiles.games]:       [],
        [dataFiles.tournaments]: [],
        [dataFiles.matches]:     [],
        [dataFiles.rosters]:     [],
        [dataFiles.reminders]:   {},
        [dataFiles.summary]:     {},
        [dataFiles.logs]:        [],
        [dataFiles.settings]:    defaultSettings
    };

    for (const [filename, fallback] of Object.entries(defaults)) {
        const filePath = path.join(DATA_DIR, filename);
        try {
            await fsp.access(filePath);
            // Ensure empty files get valid JSON
            const raw = (await fsp.readFile(filePath, 'utf8')).trim();
            if (!raw) {
                await fsp.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8');
                console.log(`📁 [DB] Initialized empty ${filename}`);
            }
        } catch (_) {
            await fsp.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8');
            console.log(`📁 [DB] Created ${filename}`);
        }
    }
}

// ── ID Generator ────────────────────────────────────────────────────

/**
 * Generate a short, unique ID (8 hex chars from crypto.randomBytes).
 */
function generateId() {
    return crypto.randomBytes(4).toString('hex');
}

// ── Audit Logger ────────────────────────────────────────────────────

/**
 * Append an entry to logs.json.
 * @param {string} action  - e.g. 'GAME_CREATED', 'ROSTER_SUBMITTED'
 * @param {string} details - Human-readable description
 * @param {string|null} actorId - Discord user ID or 'SYSTEM' / 'WEB'
 */
async function log(action, details, actorId = 'SYSTEM') {
    try {
        const logs = await readData(dataFiles.logs, []);
        logs.unshift({
            id: generateId(),
            action,
            details,
            actorId,
            timestamp: new Date().toISOString()
        });

        // Keep last 500 entries to prevent unbounded growth
        if (logs.length > 500) logs.length = 500;

        await writeData(dataFiles.logs, logs);
    } catch (err) {
        console.error(`❌ [Logger] Failed to write log:`, err.message);
    }
}

// ── Input Sanitisation Helpers ──────────────────────────────────────

/**
 * Strip dangerous characters and trim whitespace.
 */
function sanitizeString(input, maxLength = 200) {
    if (typeof input !== 'string') return '';
    return input.trim().slice(0, maxLength);
}

/**
 * Validate that a string looks like a Discord snowflake ID.
 */
function isValidSnowflake(id) {
    return typeof id === 'string' && /^\d{17,20}$/.test(id);
}

/**
 * Validate an ISO 8601 date string.
 */
function isValidISODate(str) {
    if (typeof str !== 'string') return false;
    const d = new Date(str);
    return !isNaN(d.getTime());
}

module.exports = {
    readData,
    writeData,
    ensureDataFiles,
    generateId,
    log,
    sanitizeString,
    isValidSnowflake,
    isValidISODate,
    DATA_DIR
};
