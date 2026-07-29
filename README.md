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

## Deploy ขึ้น Netlify

Netlify ไม่รัน Express server ค้างไว้ตลอดแบบที่ทำใน Termux ได้ (host แบบนั้นเป็น static site + serverless functions ที่ไม่มี filesystem ถาวร) โปรเจกต์นี้เลยมีเวอร์ชันสำหรับ Netlify แยกไว้ในโฟลเดอร์ `netlify/functions/` โดยสลับจากเก็บไฟล์ JSON เป็น **Netlify Blobs** (พื้นที่เก็บข้อมูลถาวรของ Netlify เอง ไม่ต้องตั้ง database เพิ่ม) — หน้าเว็บ (`public/`) และ path `/api/...` เดิมใช้ได้เหมือนเดิมทุกอย่าง ไม่ต้องแก้ `app.js`

**ขั้นตอน**

1. ติดตั้ง Netlify CLI (รันจากเครื่องไหนก็ได้ ไม่จำเป็นต้องเป็น Termux)
   ```
   npm install -g netlify-cli
   ```
2. ที่โฟลเดอร์โปรเจกต์ ติดตั้ง dependency สำหรับ Blobs
   ```
   npm install @netlify/blobs
   ```
3. ล็อกอิน Netlify
   ```
   netlify login
   ```
4. ผูกโปรเจกต์กับ site ใหม่ (ครั้งแรกครั้งเดียว)
   ```
   netlify init
   ```
   เลือก "Create & configure a new site" ตอบคำถามตาม default ได้เลย (publish dir คือ `public` ตั้งไว้ใน `netlify.toml` แล้ว)
5. ทดสอบในเครื่องก่อน deploy จริง (จำลอง functions + blobs ให้ในเครื่อง)
   ```
   netlify dev
   ```
6. Deploy ขึ้น production
   ```
   netlify deploy --prod
   ```

หลังจากนั้นจะได้ URL แบบ `https://<ชื่อ>.netlify.app` เข้าได้จากทุกที่ ไม่ต้องพึ่ง hotspot หรือ Tailscale แล้ว เพราะข้อมูลอยู่บน Netlify Blobs ไม่ใช่ในเครื่องมือถือ

**ข้อควรรู้**
- ข้อมูลใน `data/commands.json` / `data/logs.json` (ที่รันบน Termux) จะ**ไม่ติดไปด้วย** ต้องเพิ่มคำสั่ง/บันทึกใหม่บนเว็บ Netlify เอง ถ้าอยากย้ายข้อมูลเดิมไปด้วย บอกได้ จะทำสคริปต์ import ให้
- Netlify free plan มี quota การเรียก function และพื้นที่ Blobs ต่อเดือน ถ้าใช้คนเดียว/กลุ่มเล็กเพียงพอสบาย ๆ

## ต่อยอด

- เพิ่ม auth ง่าย ๆ ด้วย middleware ตรวจ header token ก่อนเข้าถึง `/api/*`
- ผูกเข้ากับ SuperApp Launcher เป็น sub-app ตัวที่ 5 (รันคนละพอร์ต ผ่าน reverse proxy เดิม)
- เปลี่ยนจาก JSON file เป็น SQLite ถ้าข้อมูลเริ่มเยอะหรือมีคนแก้พร้อมกันหลายคน
