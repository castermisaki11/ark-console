# ARK OPS — Field Console

Command board + daily ops log สำหรับผู้ดูแลเซิร์ฟเวอร์ Ark ข้อมูลเก็บใน Supabase (Postgres)

## ตั้งค่า Supabase

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com) (ฟรี)
2. ไปที่ **Project Settings → Database → Connection string → URI** แล้วคัดลอกมา (จะมีรูปแบบ `postgresql://postgres:[PASSWORD]@...`)
3. ใส่รหัสผ่านของโปรเจกต์แทน `[PASSWORD]`
4. ตั้งเป็น env var ชื่อ `DATABASE_URL`

ไม่ต้องสร้างตารางเอง — แอปจะสร้างตาราง `commands` และ `logs` ให้อัตโนมัติตอนสตาร์ทครั้งแรก (พร้อมข้อมูลตัวอย่าง 3 รายการ)

## รันบนเครื่อง/เซิร์ฟเวอร์

```bash
npm install
DATABASE_URL="postgresql://postgres:xxxx@xxxx.supabase.co:5432/postgres" npm start
```

เปิด `http://localhost:4100` (เปลี่ยนพอร์ตได้ด้วย `PORT=xxxx npm start`)

## รันบน Railway

ไปที่ tab **Variables** ของ service แล้วเพิ่ม `DATABASE_URL` เป็น connection string จาก Supabase — ข้อมูลจะถาวรเพราะเก็บอยู่ที่ Supabase ไม่ใช่ filesystem ของ Railway แล้ว จึงไม่ต้องใช้ Volumes

## รันบน Termux

```bash
pkg install nodejs
npm install
DATABASE_URL="..." npm start
```

## โครงสร้าง

```
ark-console/
  server.js          Express server + REST API
  db.js               Postgres pool + สร้างตาราง (Supabase)
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

