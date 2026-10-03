const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || './data/whistleguard.db';
const isMemoryDb = dbPath === ':memory:';

if (!isMemoryDb) {
  // Ensure data directory exists for file-based databases
  const resolvedDbPath = path.resolve(__dirname, '..', dbPath);
  const dbDir = path.dirname(resolvedDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

const resolvedDbPath = isMemoryDb ? ':memory:' : path.resolve(__dirname, '..', dbPath);
const db = new Database(resolvedDbPath);

// Enable WAL mode for better concurrent read performance (file DBs only)
if (!isMemoryDb) {
  db.pragma('journal_mode = WAL');
}
db.pragma('foreign_keys = ON');

/**
 * Initialize database schema
 */
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_code TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('security', 'harassment', 'corruption', 'technical', 'other')),
      description TEXT NOT NULL,
      evidence_url TEXT,
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'CLOSED')),
      is_closed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS status_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      old_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS moderators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'moderator' CHECK(role IN ('moderator', 'admin')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reports_case_code ON reports(case_code);
    CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_status_updates_report_id ON status_updates(report_id);
  `);
}

/**
 * Seed default moderator if none exists
 */
function seedModerator() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM moderators').get();
  if (existing.count === 0) {
    const username = process.env.DEFAULT_MODERATOR_USERNAME || 'admin';
    const password = process.env.DEFAULT_MODERATOR_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(password, 12);
    db.prepare('INSERT INTO moderators (username, password_hash, role) VALUES (?, ?, ?)').run(
      username,
      hash,
      'admin'
    );
    console.log(`[DB] Default admin moderator seeded: ${username}`);
  }
}

// Initialize on import
initializeDatabase();
seedModerator();

module.exports = db;
