const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DATABASE_URL || path.join(__dirname, '..', 'db', 'nursingquiz_cloud.db');

let db = null;
let SQL = null;

function saveDB() {
  if (!db) return;
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (err) {
    console.error('  ❌ Error al guardar DB:', err.message);
  }
}

async function initDB() {
  SQL = await initSqlJs();

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS question_banks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    share_code TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    correct INTEGER NOT NULL,
    explanation TEXT DEFAULT '',
    FOREIGN KEY (bank_id) REFERENCES question_banks(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    bank_id INTEGER,
    title TEXT DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'classic',
    player_count INTEGER DEFAULT 0,
    played_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    FOREIGN KEY (bank_id) REFERENCES question_banks(id) ON DELETE SET NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS player_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    correct INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    answers TEXT DEFAULT '[]',
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_question_banks_teacher ON question_banks(teacher_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_questions_bank ON questions(bank_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_game_sessions_teacher ON game_sessions(teacher_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_player_results_session ON player_results(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_question_banks_share ON question_banks(share_code)`);

  saveDB();
  console.log('  📦 Base de datos inicializada');
  setInterval(saveDB, 60000);
  return db;
}

function getDB() {
  if (!db) throw new Error('Base de datos no inicializada');
  return db;
}

function closeDB() {
  if (db) { saveDB(); db.close(); db = null; }
}

function _prepare(sql, params) {
  const stmt = db.prepare(sql);
  if (params && params.length > 0) stmt.bind(params);
  return stmt;
}

function query(sql, params = []) {
  const stmt = _prepare(sql, params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function all(sql, params = []) {
  return query(sql, params);
}

function run(sql, params = []) {
  const stmt = _prepare(sql, params);
  stmt.run();
  stmt.free();

  const rid = db.exec("SELECT last_insert_rowid() as id");
  const lastInsertRowid = rid?.[0]?.values?.[0]?.[0] ?? null;

  saveDB();
  return { lastInsertRowid };
}

module.exports = { initDB, getDB, closeDB, query, get, run, all };
