# ARK OPS — Field Console

Command board + daily ops log สำหรับผู้ดูแลเซิร์ฟเวอร์ Ark เก็บข้อมูลเป็นไฟล์ JSON ใน `data/` ไม่ต้องมี database

## รันบนเครื่อง/เซิร์ฟเวอร์

```bash
npm install
npm start
```

เปิด `http://localhost:4100` (เปลี่ยนพอร์ตได้ด้วย `PORT=xxxx npm start`)

## รันบน Termux

```bash
pkg install nodejs
npm install
npm start
```

## โครงสร้าง

```
ark-console/
  server.js          Express server + REST API
  data/
    commands.json     คำสั่งทั้งหมด (สร้างอัตโนมัติพร้อมตัวอย่าง 3 รายการ)
    logs.json          บันทึกประจำวัน (สร้างอัตโนมัติ ว่างเริ่มต้น)
  public/
    index.html
    style.css
    app.js
```

## API

| Method | Path              | Body                                          |
|--------|-------------------|------------------------------------------------|
| GET    | /api/commands     | —                                              |
| POST   | /api/commands     | `{ category, name, command, description }`    |
| PUT    | /api/commands/:id | ฟิลด์ใดก็ได้ในสี่ตัวด้านบน                     |
| DELETE | /api/commands/:id | —                                              |
| GET    | /api/logs         | —                                              |
| POST   | /api/logs         | `{ text }`                                     |
| PUT    | /api/logs/:id     | `{ text }`                                     |
| DELETE | /api/logs/:id     | —                                              |

## ต่อยอด

- เพิ่ม auth ง่าย ๆ ด้วย middleware ตรวจ header token ก่อนเข้าถึง `/api/*`
- ผูกเข้ากับ SuperApp Launcher เป็น sub-app ตัวที่ 5 (รันคนละพอร์ต ผ่าน reverse proxy เดิม)
- เปลี่ยนจาก JSON file เป็น SQLite ถ้าข้อมูลเริ่มเยอะหรือมีคนแก้พร้อมกันหลายคน
