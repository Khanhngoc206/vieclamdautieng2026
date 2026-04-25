// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// ── Auth middleware ────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Cần đăng nhập.' });
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString();
    if (!decoded.includes(':DauTiengSecret:')) return res.status(401).json({ error: 'Token không hợp lệ.' });
    next();
  } catch { res.status(401).json({ error: 'Token không hợp lệ.' }); }
}

// ── PUBLIC: Đọc dữ liệu ────────────────────────────────────────

// GET /api/jobs
app.get('/api/jobs', (req, res) => {
  const { search = '', category = '', work_type = '' } = req.query;
  let sql = 'SELECT * FROM jobs WHERE 1=1';
  const p = [];
  if (search) { sql += ' AND (title LIKE ? OR company LIKE ? OR address LIKE ?)'; const q=`%${search}%`; p.push(q,q,q); }
  if (category) { sql += ' AND category = ?'; p.push(category); }
  if (work_type) { sql += ' AND work_type = ?'; p.push(work_type); }
  sql += ' ORDER BY created_at DESC';
  const jobs = db.prepare(sql).all(...p);
  const { total_qty } = db.prepare('SELECT SUM(qty) as total_qty FROM jobs').get();
  const { companies } = db.prepare('SELECT COUNT(DISTINCT company) as companies FROM jobs').get();
  res.json({ jobs, total: jobs.length, total_qty: total_qty||0, total_companies: companies });
});

// GET /api/jobs/:id
app.get('/api/jobs/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy.' });
  res.json(job);
});

// GET /api/workers
app.get('/api/workers', (req, res) => {
  const { search = '' } = req.query;
  let sql = 'SELECT * FROM workers WHERE 1=1';
  const p = [];
  if (search) { sql += ' AND (name LIKE ? OR seek LIKE ? OR location LIKE ?)'; const q=`%${search}%`; p.push(q,q,q); }
  sql += ' ORDER BY created_at DESC';
  res.json({ workers: db.prepare(sql).all(...p) });
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  res.json({
    total_jobs: db.prepare('SELECT COUNT(*) as c FROM jobs').get().c,
    total_qty: db.prepare('SELECT SUM(qty) as c FROM jobs').get().c || 0,
    total_companies: db.prepare('SELECT COUNT(DISTINCT company) as c FROM jobs').get().c,
    total_workers: db.prepare('SELECT COUNT(*) as c FROM workers').get().c,
  });
});

// ── ADMIN: Đăng nhập ───────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT id FROM admins WHERE username = ? AND password = ?').get(username, password);
  if (!admin) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
  const token = Buffer.from(`${admin.id}:${Date.now()}:DauTiengSecret:${username}`).toString('base64');
  res.json({ token });
});

// ── ADMIN: Quản lý Jobs ────────────────────────────────────────

// POST /api/admin/jobs – Đăng tin mới
app.post('/api/admin/jobs', requireAdmin, (req, res) => {
  const { company, title, qty, category, salary, work_type, address, description, contact, phone, email, badge } = req.body;
  if (!company || !title || !contact || !phone) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
  const result = db.prepare(`
    INSERT INTO jobs (company,title,qty,category,salary,work_type,address,description,contact,phone,email,badge)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(company, title, qty||1, category||'Khác', salary, work_type||'Toàn thời gian', address, description, contact, phone, email||'', badge||'');
  res.status(201).json({ message: 'Đã đăng tin thành công.', id: result.lastInsertRowid });
});

// PUT /api/admin/jobs/:id – Sửa tin
app.put('/api/admin/jobs/:id', requireAdmin, (req, res) => {
  const { company, title, qty, category, salary, work_type, address, description, contact, phone, email, badge } = req.body;
  db.prepare(`UPDATE jobs SET company=?,title=?,qty=?,category=?,salary=?,work_type=?,address=?,description=?,contact=?,phone=?,email=?,badge=? WHERE id=?`)
    .run(company, title, qty||1, category, salary, work_type, address, description, contact, phone, email||'', badge||'', req.params.id);
  res.json({ message: 'Đã cập nhật.' });
});

// DELETE /api/admin/jobs/:id – Xóa tin
app.delete('/api/admin/jobs/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ message: 'Đã xóa.' });
});

// ── ADMIN: Quản lý Workers ─────────────────────────────────────

// POST /api/admin/workers
app.post('/api/admin/workers', requireAdmin, (req, res) => {
  const { name, age, gender, seek, experience, location, phone, available } = req.body;
  if (!name || !seek || !phone) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
  db.prepare(`INSERT INTO workers (name,age,gender,seek,experience,location,phone,available) VALUES (?,?,?,?,?,?,?,?)`)
    .run(name, age||null, gender||'Nam', seek, experience||'', location||'', phone, available||'Có thể đi làm ngay');
  res.status(201).json({ message: 'Đã thêm hồ sơ.' });
});

// PUT /api/admin/workers/:id
app.put('/api/admin/workers/:id', requireAdmin, (req, res) => {
  const { name, age, gender, seek, experience, location, phone, available } = req.body;
  db.prepare(`UPDATE workers SET name=?,age=?,gender=?,seek=?,experience=?,location=?,phone=?,available=? WHERE id=?`)
    .run(name, age||null, gender, seek, experience, location, phone, available, req.params.id);
  res.json({ message: 'Đã cập nhật.' });
});

// DELETE /api/admin/workers/:id
app.delete('/api/admin/workers/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM workers WHERE id = ?').run(req.params.id);
  res.json({ message: 'Đã xóa.' });
});

// ── Fallback SPA ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Server: http://localhost:${PORT}`);
  console.log(`🌐 Trang công khai: http://localhost:${PORT}`);
  console.log(`🔐 Trang admin:     http://localhost:${PORT}/admin.html`);
  console.log(`   Tài khoản: admin / DauTieng@2024\n`);
});
