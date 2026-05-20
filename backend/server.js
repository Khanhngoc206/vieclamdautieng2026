// server.js - PostgreSQL version
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// ── Auth ───────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Cần đăng nhập.' });
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString();
    if (!decoded.includes(':DauTiengSecret:')) return res.status(401).json({ error: 'Token không hợp lệ.' });
    next();
  } catch { res.status(401).json({ error: 'Token không hợp lệ.' }); }
}

// ── PUBLIC ─────────────────────────────────────────────────────

app.get('/api/jobs', async (req, res) => {
  try {
    const { search = '', category = '', work_type = '' } = req.query;
    let sql = 'SELECT * FROM jobs WHERE 1=1';
    const p = [];
    if (search) { sql += ` AND (title ILIKE $${p.length+1} OR company ILIKE $${p.length+1} OR address ILIKE $${p.length+1})`; p.push(`%${search}%`); }
    if (category) { sql += ` AND category = $${p.length+1}`; p.push(category); }
    if (work_type) { sql += ` AND work_type = $${p.length+1}`; p.push(work_type); }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql, p);
    const stats = await pool.query('SELECT COUNT(*) as total, SUM(qty) as total_qty, COUNT(DISTINCT company) as companies FROM jobs');
    const s = stats.rows[0];
    res.json({ jobs: rows, total: rows.length, total_qty: parseInt(s.total_qty)||0, total_companies: parseInt(s.companies)||0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy.' });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/workers', async (req, res) => {
  try {
    const { search = '' } = req.query;
    let sql = 'SELECT * FROM workers WHERE 1=1';
    const p = [];
    if (search) { sql += ` AND (name ILIKE $1 OR seek ILIKE $1 OR location ILIKE $1)`; p.push(`%${search}%`); }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql, p);
    res.json({ workers: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const j = await pool.query('SELECT COUNT(*) as c, SUM(qty) as q, COUNT(DISTINCT company) as co FROM jobs');
    const w = await pool.query('SELECT COUNT(*) as c FROM workers');
    res.json({
      total_jobs: parseInt(j.rows[0].c)||0,
      total_qty: parseInt(j.rows[0].q)||0,
      total_companies: parseInt(j.rows[0].co)||0,
      total_workers: parseInt(w.rows[0].c)||0
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN LOGIN ────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT id FROM admins WHERE username=$1 AND password=$2', [username, password]);
    if (!rows.length) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
    const token = Buffer.from(`${rows[0].id}:${Date.now()}:DauTiengSecret:${username}`).toString('base64');
    res.json({ token });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN JOBS ─────────────────────────────────────────────────
app.post('/api/admin/jobs', requireAdmin, async (req, res) => {
  try {
    const { company, title, qty, category, salary, work_type, address, description, contact, phone, email, badge } = req.body;
    if (!company || !title || !contact || !phone) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    const { rows } = await pool.query(
      `INSERT INTO jobs (company,title,qty,category,salary,work_type,address,description,contact,phone,email,badge)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [company, title, qty||1, category||'Khác', salary||'', work_type||'Toàn thời gian', address||'', description||'', contact, phone, email||'', badge||'']
    );
    res.status(201).json({ message: 'Đã đăng tin thành công.', id: rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/jobs/:id', requireAdmin, async (req, res) => {
  try {
    const { company, title, qty, category, salary, work_type, address, description, contact, phone, email, badge } = req.body;
    await pool.query(
      `UPDATE jobs SET company=$1,title=$2,qty=$3,category=$4,salary=$5,work_type=$6,address=$7,description=$8,contact=$9,phone=$10,email=$11,badge=$12 WHERE id=$13`,
      [company, title, qty||1, category, salary||'', work_type, address||'', description||'', contact, phone, email||'', badge||'', req.params.id]
    );
    res.json({ message: 'Đã cập nhật.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/jobs/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM jobs WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN WORKERS ──────────────────────────────────────────────
app.post('/api/admin/workers', requireAdmin, async (req, res) => {
  try {
    const { name, age, gender, seek, experience, location, phone, available } = req.body;
    if (!name || !seek || !phone) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    await pool.query(
      `INSERT INTO workers (name,age,gender,seek,experience,location,phone,available) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [name, age||null, gender||'Nam', seek, experience||'', location||'', phone, available||'Có thể đi làm ngay']
    );
    res.status(201).json({ message: 'Đã thêm hồ sơ.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/workers/:id', requireAdmin, async (req, res) => {
  try {
    const { name, age, gender, seek, experience, location, phone, available } = req.body;
    await pool.query(
      `UPDATE workers SET name=$1,age=$2,gender=$3,seek=$4,experience=$5,location=$6,phone=$7,available=$8 WHERE id=$9`,
      [name, age||null, gender, seek, experience||'', location||'', phone, available, req.params.id]
    );
    res.json({ message: 'Đã cập nhật.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/workers/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM workers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Fallback ───────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Server: http://localhost:${PORT}`);
  console.log(`🌐 Trang công khai: http://localhost:${PORT}`);
  console.log(`🔐 Trang admin: http://localhost:${PORT}/admin.html\n`);
});
