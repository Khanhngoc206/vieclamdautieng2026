// db.js - PostgreSQL + hỗ trợ ảnh poster
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          SERIAL PRIMARY KEY,
      company     TEXT NOT NULL,
      title       TEXT NOT NULL,
      qty         INTEGER DEFAULT 1,
      category    TEXT DEFAULT 'Khác',
      salary      TEXT DEFAULT '',
      work_type   TEXT DEFAULT 'Toàn thời gian',
      address     TEXT DEFAULT '',
      description TEXT DEFAULT '',
      poster_url  TEXT DEFAULT '',
      contact     TEXT NOT NULL,
      phone       TEXT NOT NULL,
      email       TEXT DEFAULT '',
      badge       TEXT DEFAULT '',
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS poster_url TEXT DEFAULT '';`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workers (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      age         INTEGER,
      gender      TEXT DEFAULT 'Nam',
      seek        TEXT NOT NULL,
      experience  TEXT DEFAULT '',
      location    TEXT DEFAULT '',
      phone       TEXT NOT NULL,
      available   TEXT DEFAULT 'Có thể đi làm ngay',
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id       SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );
  `);

  await pool.query(`
    INSERT INTO admins (username, password)
    VALUES ('admin', 'DauTieng@2024')
    ON CONFLICT (username) DO NOTHING;
  `);

  console.log('✅ Database đã sẵn sàng');
}

init().catch(console.error);
module.exports = pool;
