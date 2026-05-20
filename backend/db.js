// db.js - PostgreSQL
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
      salary      TEXT,
      work_type   TEXT DEFAULT 'Toàn thời gian',
      address     TEXT,
      description TEXT,
      contact     TEXT NOT NULL,
      phone       TEXT NOT NULL,
      email       TEXT DEFAULT '',
      badge       TEXT DEFAULT '',
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);

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

  // Admin mặc định
  await pool.query(`
    INSERT INTO admins (username, password)
    VALUES ('admin', 'DauTieng@2024')
    ON CONFLICT (username) DO NOTHING;
  `);

  // Thêm tin tuyển dụng thật nếu chưa có
  const existing = await pool.query(
    `SELECT id FROM jobs WHERE company = 'Công ty TNHH TAISEI BIJUTSU PRINTING (VIỆT NAM)' LIMIT 1`
  );
  if (existing.rows.length === 0) {
    await pool.query(`
      INSERT INTO jobs (company, title, qty, category, salary, work_type, address, description, contact, phone, email, badge)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      'Công ty TNHH TAISEI BIJUTSU PRINTING (VIỆT NAM)',
      'Nhân viên vận hành máy in',
      2, 'Sản xuất', 'Thỏa thuận', 'Toàn thời gian',
      'Huyện Dầu Tiếng, Bình Dương',
      `Công ty 100% vốn đầu tư Nhật Bản, chuyên in ấn bao bì sản phẩm với công nghệ in Offset.

📋 NỘI DUNG CÔNG VIỆC:
- Vận hành máy in dòng Heidelberg
- Trao đổi cụ thể trong buổi phỏng vấn

✅ YÊU CẦU:
- Giới tính: Nam
- Ít nhất 1 năm kinh nghiệm vận hành máy in Heidelberg
- Siêng năng, trung thực, hòa đồng

🎁 PHÚC LỢI:
- Thưởng lương tháng 13, thưởng lễ 30/04 & 02/09
- Nghỉ thêm 2 ngày thứ Bảy mỗi tháng
- Phép năm 14 ngày/năm (thâm niên 5 năm: 15 ngày)
- Tham gia đầy đủ BHXH, BHYT, BHTN
- Bảo hiểm tai nạn 24/24
- Công đoàn tặng quà ngày lễ & sinh nhật

📁 HỒ SƠ: Lý lịch, đơn xin việc, bằng cấp, CMND, giấy khám sức khỏe (công chứng 6 tháng)
📧 Gửi CV: diemle@taiseibijutsu.vn hoặc nộp trực tiếp tại công ty`,
      'Chị Diễm Lệ', '0962497537', 'diemle@taiseibijutsu.vn', 'new'
    ]);
  }

  console.log('✅ Database đã sẵn sàng');
}

init().catch(console.error);

module.exports = pool;
