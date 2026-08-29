// server.js - multiple images support
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
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// Đếm lượt truy cập
app.use(async (req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.includes('.')) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const ip = req.ip || 'unknown';
      const page = req.path === '/' ? '/index' : req.path;
      await pool.query(`INSERT INTO page_views (date,page,ip_hash) VALUES ($1,$2,md5($3)) ON CONFLICT DO NOTHING`, [today, page, ip+today+page]);
      await pool.query(`INSERT INTO daily_stats (date,total_views) VALUES ($1,1) ON CONFLICT (date) DO UPDATE SET total_views=daily_stats.total_views+1`, [today]);
    } catch(e) {}
  }
  next();
});

function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Cần đăng nhập.' });
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString();
    if (!decoded.includes(':DauTiengSecret:')) return res.status(401).json({ error: 'Token không hợp lệ.' });
    next();
  } catch { res.status(401).json({ error: 'Token không hợp lệ.' }); }
}

// Parse images helper
function parseImages(job) {
  try {
    job.images_arr = JSON.parse(job.images || '[]');
  } catch {
    job.images_arr = [];
  }
  // Gộp poster_url cũ vào images_arr nếu chưa có
  if (job.poster_url && !job.images_arr.includes(job.poster_url)) {
    job.images_arr = [job.poster_url, ...job.images_arr].filter(Boolean);
  }
  return job;
}

// ── PUBLIC ─────────────────────────────────────────────────────
app.get('/api/jobs', async (req, res) => {
  try {
    const { search='', category='', work_type='', page=1, limit=6 } = req.query;
    const pageNum = Math.max(1, parseInt(page)||1);
    const limitNum = Math.min(20, Math.max(1, parseInt(limit)||6));
    const offset = (pageNum - 1) * limitNum;

    let where = 'WHERE 1=1';
    const p = [];
    if (search) { p.push(`%${search}%`); where += ` AND (title ILIKE $${p.length} OR company ILIKE $${p.length} OR address ILIKE $${p.length})`; }
    if (category) { p.push(category); where += ` AND category=$${p.length}`; }
    if (work_type) { p.push(work_type); where += ` AND work_type=$${p.length}`; }

    // Đếm tổng
    const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM jobs ${where}`, p);
    const totalItems = parseInt(countResult.rows[0].cnt) || 0;
    const totalPages = Math.ceil(totalItems / limitNum);

    // Lấy dữ liệu trang hiện tại
    p.push(limitNum); p.push(offset);
    const sql = `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT $${p.length-1} OFFSET $${p.length}`;
    const { rows } = await pool.query(sql, p);
    const jobs = rows.map(parseImages);

    const s = (await pool.query('SELECT COUNT(*) as t,SUM(qty) as q,COUNT(DISTINCT company) as c FROM jobs')).rows[0];
    res.json({
      jobs,
      total: totalItems,
      total_pages: totalPages,
      current_page: pageNum,
      per_page: limitNum,
      total_qty: parseInt(s.q)||0,
      total_companies: parseInt(s.c)||0
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy.' });
    res.json(parseImages(rows[0]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/workers', async (req, res) => {
  try {
    const { search='' } = req.query;
    let sql = 'SELECT * FROM workers WHERE 1=1';
    const p = [];
    if (search) { p.push(`%${search}%`); sql += ` AND (name ILIKE $1 OR seek ILIKE $1 OR location ILIKE $1)`; }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql, p);
    res.json({ workers: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const j = (await pool.query('SELECT COUNT(*) as c,SUM(qty) as q,COUNT(DISTINCT company) as co FROM jobs')).rows[0];
    const w = (await pool.query('SELECT COUNT(*) as c FROM workers')).rows[0];
    const a = (await pool.query("SELECT COUNT(*) as c FROM applications WHERE status='new'")).rows[0];
    res.json({ total_jobs: parseInt(j.c)||0, total_qty: parseInt(j.q)||0, total_companies: parseInt(j.co)||0, total_workers: parseInt(w.c)||0, new_applications: parseInt(a.c)||0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ỨNG TUYỂN ──────────────────────────────────────────────────
app.post('/api/apply', rateLimit({ windowMs: 60*60*1000, max: 5, message: { error: 'Quá nhiều lần gửi. Vui lòng thử lại sau 1 giờ.' } }), async (req, res) => {
  try {
    const { job_id, name, age, gender, phone, experience, note } = req.body;
    if (!job_id || !name || !phone) return res.status(400).json({ error: 'Vui lòng điền đầy đủ họ tên và số điện thoại.' });
    if (!/^(0|\+84)[0-9]{8,10}$/.test(phone.replace(/\s/g,''))) return res.status(400).json({ error: 'Số điện thoại không hợp lệ.' });
    const job = await pool.query('SELECT id,title,company FROM jobs WHERE id=$1', [job_id]);
    if (!job.rows.length) return res.status(404).json({ error: 'Tin tuyển dụng không tồn tại.' });
    const dup = await pool.query('SELECT id FROM applications WHERE job_id=$1 AND phone=$2', [job_id, phone.replace(/\s/g,'')]);
    if (dup.rows.length) return res.status(400).json({ error: 'Số điện thoại này đã ứng tuyển vào vị trí này rồi.' });
    await pool.query(`INSERT INTO applications (job_id,name,age,gender,phone,experience,note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [job_id, name.trim(), age||null, gender||'Nam', phone.replace(/\s/g,''), experience||'', note||'']);
    res.status(201).json({ message: `Đã gửi đơn ứng tuyển thành công vào vị trí "${job.rows[0].title}" tại ${job.rows[0].company}. Chúng tôi sẽ liên hệ với bạn sớm!` });
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

// ── ADMIN ANALYTICS ────────────────────────────────────────────
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  try {
    const total = (await pool.query('SELECT COALESCE(SUM(total_views),0) as t FROM daily_stats')).rows[0].t;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now()-86400000).toISOString().slice(0, 10);
    const todayViews = (await pool.query('SELECT COALESCE(total_views,0) as t FROM daily_stats WHERE date=$1', [today])).rows[0]?.t || 0;
    const yestViews = (await pool.query('SELECT COALESCE(total_views,0) as t FROM daily_stats WHERE date=$1', [yesterday])).rows[0]?.t || 0;
    const week = (await pool.query(`SELECT date,total_views FROM daily_stats WHERE date>=NOW()-INTERVAL '7 days' ORDER BY date ASC`)).rows;
    const month = (await pool.query(`SELECT date,total_views FROM daily_stats WHERE date>=NOW()-INTERVAL '30 days' ORDER BY date ASC`)).rows;
    const uniqueToday = (await pool.query('SELECT COUNT(DISTINCT ip_hash) as c FROM page_views WHERE date=$1', [today])).rows[0]?.c || 0;
    const uniqueWeek = (await pool.query(`SELECT COUNT(DISTINCT ip_hash) as c FROM page_views WHERE date>=NOW()-INTERVAL '7 days'`)).rows[0]?.c || 0;
    res.json({ total, todayViews, yestViews, uniqueToday, uniqueWeek, week, month });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN APPLICATIONS ─────────────────────────────────────────
app.get('/api/admin/applications', requireAdmin, async (req, res) => {
  try {
    const { job_id } = req.query;
    let sql = `SELECT a.*,j.title as job_title,j.company FROM applications a LEFT JOIN jobs j ON a.job_id=j.id WHERE 1=1`;
    const p = [];
    if (job_id) { p.push(job_id); sql += ` AND a.job_id=$${p.length}`; }
    sql += ' ORDER BY a.created_at DESC';
    const { rows } = await pool.query(sql, p);
    res.json({ applications: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/applications/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE applications SET status=$1 WHERE id=$2', [status, req.params.id]);
    res.json({ message: 'Đã cập nhật.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/applications/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM applications WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN JOBS ─────────────────────────────────────────────────
app.post('/api/admin/jobs', requireAdmin, async (req, res) => {
  try {
    const { company,title,qty,category,salary,work_type,address,description,images,contact,phone,email,badge } = req.body;
    if (!company||!title||!contact||!phone) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    const imagesArr = Array.isArray(images) ? images : [];
    const posterUrl = imagesArr[0] || '';
    const { rows } = await pool.query(
      `INSERT INTO jobs (company,title,qty,category,salary,work_type,address,description,poster_url,images,contact,phone,email,badge)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [company,title,qty||1,category||'Khác',salary||'',work_type||'Toàn thời gian',address||'',description||'',posterUrl,JSON.stringify(imagesArr),contact,phone,email||'',badge||'']
    );
    res.status(201).json({ message: 'Đã đăng tin thành công.', id: rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/jobs/:id', requireAdmin, async (req, res) => {
  try {
    const { company,title,qty,category,salary,work_type,address,description,images,contact,phone,email,badge } = req.body;
    const imagesArr = Array.isArray(images) ? images : [];
    const posterUrl = imagesArr[0] || '';
    await pool.query(
      `UPDATE jobs SET company=$1,title=$2,qty=$3,category=$4,salary=$5,work_type=$6,address=$7,description=$8,poster_url=$9,images=$10,contact=$11,phone=$12,email=$13,badge=$14 WHERE id=$15`,
      [company,title,qty||1,category,salary||'',work_type,address||'',description||'',posterUrl,JSON.stringify(imagesArr),contact,phone,email||'',badge||'',req.params.id]
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
    const { name,age,gender,seek,experience,location,phone,available } = req.body;
    if (!name||!seek||!phone) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    await pool.query(`INSERT INTO workers (name,age,gender,seek,experience,location,phone,available) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [name,age||null,gender||'Nam',seek,experience||'',location||'',phone,available||'Có thể đi làm ngay']);
    res.status(201).json({ message: 'Đã thêm hồ sơ.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/workers/:id', requireAdmin, async (req, res) => {
  try {
    const { name,age,gender,seek,experience,location,phone,available } = req.body;
    await pool.query(`UPDATE workers SET name=$1,age=$2,gender=$3,seek=$4,experience=$5,location=$6,phone=$7,available=$8 WHERE id=$9`,
      [name,age||null,gender,seek,experience||'',location||'',phone,available,req.params.id]);
    res.json({ message: 'Đã cập nhật.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/workers/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM workers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── EXPORT toàn bộ dữ liệu ────────────────────────────────────
app.get('/api/admin/export', requireAdmin, async (req, res) => {
  try {
    const jobs = (await pool.query('SELECT * FROM jobs ORDER BY id')).rows;
    const workers = (await pool.query('SELECT * FROM workers ORDER BY id')).rows;
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      jobs,
      workers
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-vieclamdautieng-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(exportData);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── IMPORT khôi phục dữ liệu ──────────────────────────────────
app.post('/api/admin/import', requireAdmin, async (req, res) => {
  try {
    const { jobs = [], workers = [], clear_existing = false } = req.body;

    let jobsAdded = 0, workersAdded = 0, jobsSkipped = 0, workersSkipped = 0;

    // Xóa dữ liệu cũ nếu chọn ghi đè
    if (clear_existing) {
      await pool.query('DELETE FROM applications');
      await pool.query('DELETE FROM jobs');
      await pool.query('DELETE FROM workers');
    }

    // Import jobs
    for (const j of jobs) {
      // Kiểm tra trùng (theo company + title + phone)
      const dup = await pool.query(
        'SELECT id FROM jobs WHERE company=$1 AND title=$2 AND phone=$3',
        [j.company, j.title, j.phone]
      );
      if (dup.rows.length > 0) { jobsSkipped++; continue; }

      await pool.query(
        `INSERT INTO jobs (company,title,qty,category,salary,work_type,address,description,poster_url,images,contact,phone,email,badge,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          j.company, j.title, j.qty||1, j.category||'Khác',
          j.salary||'', j.work_type||'Toàn thời gian',
          j.address||'', j.description||'',
          j.poster_url||'', j.images||'[]',
          j.contact, j.phone, j.email||'', j.badge||'',
          j.created_at || new Date().toISOString()
        ]
      );
      jobsAdded++;
    }

    // Import workers
    for (const w of workers) {
      const dup = await pool.query(
        'SELECT id FROM workers WHERE name=$1 AND phone=$2',
        [w.name, w.phone]
      );
      if (dup.rows.length > 0) { workersSkipped++; continue; }

      await pool.query(
        `INSERT INTO workers (name,age,gender,seek,experience,location,phone,available,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          w.name, w.age||null, w.gender||'Nam',
          w.seek, w.experience||'', w.location||'',
          w.phone, w.available||'Có thể đi làm ngay',
          w.created_at || new Date().toISOString()
        ]
      );
      workersAdded++;
    }

    res.json({
      message: `Nhập dữ liệu thành công!`,
      jobs_added: jobsAdded,
      jobs_skipped: jobsSkipped,
      workers_added: workersAdded,
      workers_skipped: workersSkipped
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Server: http://localhost:${PORT}`);
  console.log(`🌐 Trang công khai: http://localhost:${PORT}`);
  console.log(`🔐 Trang admin: http://localhost:${PORT}/admin.html\n`);
});
