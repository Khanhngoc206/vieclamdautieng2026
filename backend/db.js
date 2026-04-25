// db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'vieclamdautieng.db'));
db.pragma('journal_mode = WAL');

// Bảng tin tuyển dụng
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
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
    email       TEXT,
    badge       TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// Bảng hồ sơ người tìm việc (chỉ admin đăng)
db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    age         INTEGER,
    gender      TEXT DEFAULT 'Nam',
    seek        TEXT NOT NULL,
    experience  TEXT,
    location    TEXT,
    phone       TEXT NOT NULL,
    available   TEXT DEFAULT 'Có thể đi làm ngay',
    created_at  TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// Bảng admin
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
`);

// Admin mặc định (đổi mật khẩu sau khi deploy!)
const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
if (!existing) {
  db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', 'DauTieng@2024');
}

// Dữ liệu mẫu
const cnt = db.prepare('SELECT COUNT(*) as c FROM jobs').get();
if (cnt.c === 0) {
  const ins = db.prepare(`INSERT INTO jobs (company,title,qty,category,salary,work_type,address,description,contact,phone,badge) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  [
    ['Công ty TNHH Phú Xuân Rubber','Công nhân cạo mủ cao su',10,'Nông nghiệp','6–8 triệu/tháng','Toàn thời gian','Ấp 3, xã Định Thành, Dầu Tiếng','Thực hiện cạo mủ cao su theo ca. Không yêu cầu kinh nghiệm, được đào tạo. Hỗ trợ nhà ở tập thể.','Anh Nguyễn Văn Hùng','0903 456 789','hot'],
    ['Công ty CP Thực Phẩm Green Farm','Công nhân đóng gói sản phẩm',8,'Sản xuất','7–9 triệu/tháng','Toàn thời gian','KCN Dầu Tiếng, xã Long Hòa','Đóng gói, kiểm tra chất lượng sản phẩm thực phẩm. Làm việc ca ngày/ca đêm. Có phụ cấp ca đêm.','Chị Trần Thị Mai','0912 345 678','new'],
    ['Siêu thị Co.op Mart Dầu Tiếng','Nhân viên bán hàng',4,'Dịch vụ','6 triệu + thưởng','Toàn thời gian','TT Dầu Tiếng, Bình Dương','Tư vấn và bán hàng, sắp xếp hàng hóa, thu ngân. Ưu tiên có kinh nghiệm bán lẻ.','Chị Lê Thu Hoa','0978 234 567',''],
    ['Cty Bảo Vệ An Toàn Bình Dương','Nhân viên bảo vệ',6,'Bảo vệ','7–8 triệu/tháng','Toàn thời gian','Các điểm trong huyện Dầu Tiếng','Bảo vệ khu công nghiệp, nhà máy. Ưu tiên nam, sức khỏe tốt.','Anh Phạm Đức Long','0968 111 222','urgent'],
    ['HTX Nông nghiệp Hòa Lợi','Công nhân thu hoạch nông sản',15,'Nông nghiệp','350.000đ/ngày','Thời vụ','Xã Hòa Lợi, Dầu Tiếng','Thu hoạch mì, bắp, dưa hấu. Thời gian 5h-11h và 13h-17h.','Ông Lê Văn Nông','0906 789 012','new'],
    ['Kho Lạnh Dầu Tiếng Logistics','Nhân viên kho vận',5,'Kho vận','8–10 triệu/tháng','Toàn thời gian','QL 13, xã Minh Tân, Dầu Tiếng','Xuất nhập kho, kiểm đếm hàng hóa. Ưu tiên biết sử dụng máy nâng.','Chị Nguyễn Thị Kim','0941 567 890',''],
  ].forEach(r => ins.run(...r));

  const insW = db.prepare(`INSERT INTO workers (name,age,gender,seek,experience,location,phone) VALUES (?,?,?,?,?,?,?)`);
  [
    ['Nguyễn Văn An',28,'Nam','Công nhân sản xuất','3 năm kinh nghiệm nhà máy may','TT Dầu Tiếng','0901 234 xxx'],
    ['Trần Thị Bình',24,'Nữ','Nhân viên bán hàng / Thu ngân','2 năm làm tạp hóa','Xã Minh Tân','0912 xxx 456'],
    ['Lê Minh Cường',35,'Nam','Lái xe / Giao hàng','Có bằng B2, 8 năm lái xe','Xã Long Hòa','0933 789 xxx'],
  ].forEach(r => insW.run(...r));
}

module.exports = db;
