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
  server.js            Express server + REST API
  db.js                Postgres pool + สร้างตาราง (Supabase)
  deploy-commands.js   ลงทะเบียน slash command กับ Discord (รันครั้งเดียว)
  discord/
    client.js          Discord client + login (ข้ามอัตโนมัติถ้าไม่ตั้ง token)
    commands.js         นิยาม slash command
    interactions.js      handler ของ slash command / modal
    notify.js            สร้าง embed + ส่งแจ้งเตือนเข้า channel
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

## ตั้งค่า Discord Bot (ไม่บังคับ)

บอทจะแจ้งเตือนเข้า channel ที่กำหนดทุกครั้งที่มีการเพิ่ม/แก้ไข/ลบคำสั่งหรือบันทึกประจำวัน และเมื่อสถานะฐานข้อมูลเปลี่ยน (online ↔ offline) นอกจากนี้ยังใช้สั่งงานผ่าน slash command ในดิสคอร์ดได้ด้วย

1. สร้างแอปที่ [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. แท็บ **Bot** → Reset Token คัดลอกมาเป็น `DISCORD_BOT_TOKEN`
3. แท็บ **OAuth2 → URL Generator** → เลือก scope `bot` และ `applications.commands` → เปิดลิงก์ที่ได้เพื่อ invite บอทเข้าเซิร์ฟเวอร์ดิสคอร์ด
4. คัดลอก **Application ID** (หน้า General Information) เป็น `DISCORD_CLIENT_ID`
5. เปิด Discord → คลิกขวาที่ชื่อ server → Copy Server ID เป็น `DISCORD_GUILD_ID` (ต้องเปิด Developer Mode ใน Discord ก่อน)
6. คลิกขวาที่ channel ที่จะให้แจ้งเตือนเข้า → Copy Channel ID เป็น `DISCORD_NOTIFY_CHANNEL_ID`
7. ตั้ง env vars ทั้งสี่ตัวนี้ (พร้อมกับ `DATABASE_URL` เดิม) แล้วรัน:

```bash
npm install
DISCORD_BOT_TOKEN="..." DISCORD_CLIENT_ID="..." DISCORD_GUILD_ID="..." npm run deploy-commands
```

รันคำสั่งนี้ **ครั้งเดียว** (หรือทุกครั้งที่แก้ไข `discord/commands.js`) เพื่อลงทะเบียน slash command กับ Discord จากนั้นค่อยตั้ง env vars ทั้งหมดแล้ว `npm start` ตามปกติ — ถ้าไม่ตั้ง `DISCORD_BOT_TOKEN` แอปจะทำงานปกติทุกอย่างเหมือนเดิม แค่ไม่มีบอท/แจ้งเตือนเท่านั้น

### Slash commands ที่ใช้ได้
- `/cmd list [category]` — แสดงรายการคำสั่ง
- `/cmd add` — เปิดฟอร์มเพิ่มคำสั่งใหม่
- `/cmd search <query>` — ค้นหาคำสั่ง
- `/log add <text>` — เพิ่มบันทึกประจำวัน
- `/log today` — แสดงบันทึกของวันนี้
- `/status` — เช็คสถานะฐานข้อมูลตอนนี้

## ต่อยอด

- เพิ่ม auth ง่าย ๆ ด้วย middleware ตรวจ header token ก่อนเข้าถึง `/api/*`
- ผูกเข้ากับ SuperApp Launcher เป็น sub-app ตัวที่ 5 (รันคนละพอร์ต ผ่าน reverse proxy เดิม)

