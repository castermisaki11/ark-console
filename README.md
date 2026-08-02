# ARK OPS — Field Console

Command board + daily ops log สำหรับผู้ดูแลเซิร์ฟเวอร์ Ark ข้อมูลเก็บใน Supabase (Postgres)

## ตั้งค่า Supabase

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com) (ฟรี)
2. ไปที่ **Project Settings → Database → Connection string → URI** แล้วคัดลอกมา (จะมีรูปแบบ `postgresql://postgres:[PASSWORD]@...`)
3. ใส่รหัสผ่านของโปรเจกต์แทน `[PASSWORD]`
4. ตั้งเป็น env var ชื่อ `DATABASE_URL`

ไม่ต้องสร้างตารางเอง — แอปจะสร้างตาราง `commands`, `logs`, `usage_events` ให้อัตโนมัติตอนสตาร์ทครั้งแรก (พร้อมข้อมูลตัวอย่าง 3 รายการในตาราง commands)

## เข้าสู่ระบบด้วย Discord OAuth (บังคับ)

ตั้งแต่เวอร์ชันนี้ ตัว dashboard **ต้องเข้าสู่ระบบด้วยบัญชี Discord ก่อนใช้งาน** — ไม่มี route ไหน (หน้าเว็บหรือ `/api/*`) เข้าถึงได้โดยไม่ล็อกอิน ยกเว้นหน้า `/login` เอง แอปจะไม่สตาร์ทถ้ายังตั้งค่าไม่ครบ

### 1. สร้าง/ใช้ Discord Application เดิม

ถ้าคุณตั้งค่าบอทไว้แล้ว (หัวข้อ "ตั้งค่า Discord Bot" ด้านล่าง) ใช้ **Application เดิมได้เลย** — `DISCORD_CLIENT_ID` ตัวเดียวกันใช้ได้ทั้งบอทและ OAuth login เพราะเป็นค่า Application ID เดียวกัน ถ้ายังไม่เคยสร้าง ให้ไปที่ [Discord Developer Portal](https://discord.com/developers/applications) → New Application

1. แท็บ **OAuth2 → General** → คัดลอก **Client ID** เป็น `DISCORD_CLIENT_ID`
2. ในหน้าเดียวกัน กด **Reset Secret** แล้วคัดลอกเป็น `DISCORD_CLIENT_SECRET` (เก็บเป็นความลับ ห้าม commit)
3. ที่ **Redirects** กด **Add Redirect** แล้วใส่ URL ที่ตรงกับที่คุณจะรัน เช่น:
   - รันในเครื่อง: `http://localhost:4100/auth/discord/callback`
   - deploy บน Railway: `https://<your-app>.up.railway.app/auth/discord/callback`

   ค่าที่ใส่ตรงนี้ต้องตรงกับ `DISCORD_REDIRECT_URI` เป๊ะๆ (รวม path `/auth/discord/callback`)

### 2. หา Discord User ID ของแอดมิน

เปิด Discord → Settings → Advanced → เปิด **Developer Mode** → คลิกขวาที่ชื่อตัวเอง (หรือคนที่จะให้สิทธิ์แอดมิน) → **Copy User ID**

### 3. ตั้งค่า env vars

```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://localhost:4100/auth/discord/callback
SESSION_SECRET=...          # สุ่มค่ายาวๆ เช่น: openssl rand -hex 32
ADMIN_IDS=123456789012345678,987654321098765432   # คั่นด้วย comma ได้หลายคน
```

เฉพาะ Discord ID ที่อยู่ใน `ADMIN_IDS` เท่านั้นที่ล็อกอินเข้า dashboard ได้ — คนอื่นที่ล็อกอินด้วย Discord สำเร็จแต่ไม่อยู่ในรายชื่อจะเจอหน้า "Access Denied" (403) และ session จะถูกทำลายทันที

> หมายเหตุ: session เก็บอยู่ใน Postgres (ตาราง `user_sessions`, สร้างอัตโนมัติ) ไม่ใช่ในหน่วยความจำ ดังนั้น login จะไม่หลุดตอน deploy ใหม่/restart

### วิธีใช้งาน

1. เปิด dashboard → จะถูกพาไปหน้า `/login` อัตโนมัติถ้ายังไม่ได้ล็อกอิน
2. กด **Login with Discord** → อนุญาต (authorize) แอป → ถูกพาเข้ามาที่ dashboard
3. ชื่อ/รูปโปรไฟล์ Discord จะขึ้นที่มุมขวาบน กดปุ่ม **Logout** เพื่อออกจากระบบ

## รันบนเครื่อง/เซิร์ฟเวอร์

```bash
npm install
DATABASE_URL="postgresql://postgres:xxxx@xxxx.supabase.co:5432/postgres" npm start
```

หรือคัดลอก `.env.example` เป็น `.env` แล้วกรอกค่าทั้งหมดลงไป (`DATABASE_URL`, `DISCORD_BOT_TOKEN` ฯลฯ) จากนั้นรัน `npm start` เฉยๆ ได้เลยโดยไม่ต้องพิมพ์ env var ทุกครั้ง — **`.env` ต้องไม่ถูก commit ขึ้น git เด็ดขาด** (อยู่ใน `.gitignore` ให้แล้ว) เพราะมี token/connection string จริงอยู่ข้างใน

เปิด `http://localhost:4100` (เปลี่ยนพอร์ตได้ด้วย `PORT=xxxx npm start`)

## รันบน Railway

ไปที่ tab **Variables** ของ service แล้วเพิ่ม `DATABASE_URL` เป็น connection string จาก Supabase — ข้อมูลจะถาวรเพราะเก็บอยู่ที่ Supabase ไม่ใช่ filesystem ของ Railway แล้ว จึงไม่ต้องใช้ Volumes

อย่าลืมเพิ่ม `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `ADMIN_IDS` และตั้ง `DISCORD_REDIRECT_URI` เป็น URL จริงของ Railway เช่น `https://<your-app>.up.railway.app/auth/discord/callback` (ต้องไปเพิ่ม URL เดียวกันนี้ใน Discord Developer Portal → OAuth2 → Redirects ด้วย) และตั้ง `NODE_ENV=production` เพื่อให้ session cookie ถูกส่งแบบ `secure` เท่านั้น

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
  auth/
    discordOAuth.js    คุยกับ Discord OAuth2 (authorize URL, แลก token, ดึงโปรไฟล์, เช็ค ADMIN_IDS)
  middleware/
    auth.js            attachUser + requireAuth (กัน route ที่ต้องล็อกอิน)
  routes/
    authRoutes.js       /login, /auth/discord, /auth/discord/callback, /auth/me, /logout
  discord/
    client.js          Discord client + login (ข้ามอัตโนมัติถ้าไม่ตั้ง token)
    commands.js         นิยาม slash command
    interactions.js      handler ของ slash command / modal
    notify.js            สร้าง embed + ส่งแจ้งเตือนเข้า channel
  public/
    index.html          dashboard (ต้องล็อกอิน)
    login.html           หน้า login (สาธารณะ)
    access-denied.html   หน้าแจ้งเมื่อ Discord ID ไม่อยู่ใน ADMIN_IDS
    style.css
    app.js
```

## Auth

| Method | Path                     | ต้องล็อกอิน | หมายเหตุ                                     |
|--------|--------------------------|:-----------:|-----------------------------------------------|
| GET    | /login                   | ไม่          | หน้า login                                     |
| GET    | /auth/discord            | ไม่          | เริ่ม OAuth flow → redirect ไป Discord         |
| GET    | /auth/discord/callback   | ไม่          | Discord redirect กลับมาที่นี่พร้อม code        |
| GET    | /auth/me                 | ต้อง          | คืนข้อมูลผู้ใช้ที่ล็อกอินอยู่ (ใช้แสดง header)  |
| POST   | /logout                  | ไม่          | ทำลาย session แล้ว redirect ไป /login          |

ทุก route อื่นนอกเหนือจากด้านบน (`/`, static assets, `/api/*`) **ต้องล็อกอินก่อนถึงจะเข้าถึงได้** — หน้าเว็บจะถูก redirect ไป `/login`, ส่วน `/api/*` จะได้ `401 Unauthorized` กลับมาเป็น JSON

## API

คำสั่งด้านล่างทั้งหมดต้องล็อกอินก่อน (ดูหัวข้อ Auth ด้านบน)

| Method | Path                | Body                                          |
|--------|---------------------|------------------------------------------------|
| GET    | /api/commands       | —                                              |
| POST   | /api/commands       | `{ category, name, command, description }`    |
| PUT    | /api/commands/:id   | ฟิลด์ใดก็ได้ในสี่ตัวด้านบน                     |
| DELETE | /api/commands/:id   | —                                              |
| GET    | /api/logs           | —                                              |
| POST   | /api/logs           | `{ text }`                                     |
| PUT    | /api/logs/:id       | `{ text }`                                     |
| DELETE | /api/logs/:id       | —                                              |
| POST   | /api/events         | `{ type, clientId, meta }` — เก็บสถิติการใช้งาน (frontend ยิงอัตโนมัติตอน copy/เปิดหน้า) |
| GET    | /api/events/summary | — คืนยอดรวม event, จำนวนผู้ใช้ไม่ซ้ำ, แยกตาม type |

## ตั้งค่า Discord Bot (ไม่บังคับ)

บอทจะแจ้งเตือนเข้า channel ที่กำหนดทุกครั้งที่มีการเพิ่ม/แก้ไข/ลบคำสั่ง และเมื่อสถานะฐานข้อมูลเปลี่ยน (online ↔ offline) นอกจากนี้ยังใช้สั่งงานผ่าน slash command ในดิสคอร์ดได้ด้วย (บันทึกประจำวันยังใช้งานได้ปกติในหน้าเว็บ แต่ไม่มีการแจ้งเตือน/สั่งงานผ่าน Discord แล้ว)

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
- `/cmd delete <target>` — พิมพ์ค้นหาแล้วเลือกจากรายการ (autocomplete) เพื่อลบ
- `/status` — เช็คสถานะฐานข้อมูลตอนนี้

> ถ้าเคยรัน `deploy-commands` ตอนที่ยังมี `/log` อยู่ ต้องรัน `npm run deploy-commands` ซ้ำอีกครั้งหลังอัปเดตโค้ด เพื่อให้ Discord เอา `/log` ออกจากเมนู (ไม่งั้นจะยังค้างอยู่ในรายการ แต่กดแล้วจะไม่ตอบสนอง)

## สถิติการใช้งาน (usage_events)

ฝั่งเว็บจะยิง event เก็บลง DB อัตโนมัติตอน: เปิดหน้าเว็บ (`page_view`), กด copy คำสั่ง (`copy_command`), กด copy ผลลัพธ์จากเครื่องมือ set stat (`copy_stat`) และ TP coords (`copy_tp`) — แต่ละเครื่องจะมี `clientId` แบบสุ่มเก็บไว้ใน `localStorage` ของเบราว์เซอร์นั้นๆ (ไม่ผูกกับตัวบุคคลจริง แค่แยกเครื่อง/เบราว์เซอร์คร่าวๆ)

ดูสรุปได้ที่ `GET /api/events/summary` เช่น:
```bash
curl http://localhost:4100/api/events/summary
```
จะได้ `totalEvents`, `uniqueClients`, และ `byType` (breakdown ตามประเภท event)

## ต่อยอด

- เพิ่ม auth ง่าย ๆ ด้วย middleware ตรวจ header token ก่อนเข้าถึง `/api/*`
- ผูกเข้ากับ SuperApp Launcher เป็น sub-app ตัวที่ 5 (รันคนละพอร์ต ผ่าน reverse proxy เดิม)

