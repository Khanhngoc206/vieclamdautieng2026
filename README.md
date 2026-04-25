# Sàn Giới Thiệu Việc Làm Huyện Dầu Tiếng v2.0

## Cấu trúc
```
vieclamdautieng/
├── backend/
│   ├── server.js       ← API server (Express + SQLite)
│   ├── db.js           ← Database setup
│   └── package.json
└── frontend/
    └── public/
        ├── index.html  ← Trang công khai (chỉ xem)
        └── admin.html  ← Trang quản trị (đăng nhập mới dùng được)
```

## Chạy local
```bash
cd backend
npm install
npm start
# Mở http://localhost:3000
```

## Tài khoản admin mặc định
- URL: http://localhost:3000/admin.html
- Username: admin
- Password: DauTieng@2024
⚠️ Đổi mật khẩu trong db.js trước khi deploy!

## Deploy Railway (miễn phí, dễ nhất)
1. Tạo tài khoản https://railway.app
2. New Project → Deploy from GitHub
3. Upload code lên GitHub
4. Settings: Root Directory = "backend", Start Command = "npm start"
5. Nhận link: https://xxx.up.railway.app

## Sau khi có link
Sửa dòng trong index.html và admin.html:
  const API = '/api';  ← giữ nguyên nếu cùng server

## API (tóm tắt)
GET  /api/jobs           → Danh sách tin (công khai)
GET  /api/jobs/:id       → Chi tiết tin (công khai)
GET  /api/workers        → Danh sách hồ sơ (công khai)
GET  /api/stats          → Thống kê (công khai)

POST   /api/admin/jobs       → Đăng tin (cần token)
PUT    /api/admin/jobs/:id   → Sửa tin (cần token)
DELETE /api/admin/jobs/:id   → Xóa tin (cần token)
POST   /api/admin/workers    → Thêm hồ sơ (cần token)
PUT    /api/admin/workers/:id→ Sửa hồ sơ (cần token)
DELETE /api/admin/workers/:id→ Xóa hồ sơ (cần token)
