# Dev Setup — LAN mode (เครื่องอื่นใน office)

คู่มือสำหรับ **dev ร่วมทีม** ที่จะเข้ามาทำงานบน frontend BBH Portal โดยไม่ต้องลง Docker / MySQL / Python ทั้งหมด

## สถาปัตยกรรม

```
┌─ Office Server (คอม "หลัก") ─────────────────────┐
│  Docker: MySQL + bridge + n8n + Dify              │
│  LAN IP: 172.25.10.71  ← ขอจาก owner ทุกเช้า     │
│  Port 8000 → bridge API                           │
└───────────────────────────────────────────────────┘
                ↑   ↑   ↑
                │   │   │   (Wi-Fi: BBH-OPD)
        ┌───────┴───┴───┴────────┐
        │  Dev เครื่อง laptop      │
        │  ลงเฉพาะ Node.js + git  │
        │  npm run dev → :5173    │
        └─────────────────────────┘
```

---

## ขั้นเตรียมเครื่องครั้งเดียว

### 1. Prerequisites
- **Node.js** ≥ 20 LTS  ([nodejs.org](https://nodejs.org/) → LTS)
- **Git** ([git-scm.com](https://git-scm.com/))
- เครื่องอยู่ใน Wi-Fi **`BBH-OPD`** เดียวกับ office server
- ขอ access GitHub repo จาก owner

### 2. Clone repo
```bash
git clone https://github.com/wisraut/line-dify-bridge.git
cd line-dify-bridge/frontend
npm install
```

### 3. ตั้ง backend URL
สร้างไฟล์ `frontend/.env.local` (gitignored — เฉพาะเครื่องตัวเอง):
```
VITE_API_BASE=http://172.25.10.71:8000
```
> ⚠️ ถ้า office server เปลี่ยน IP / Wi-Fi → ขอ IP ใหม่จาก owner แล้วแก้ค่านี้

### 4. ขอ login จาก owner
- Email + password ของบัญชี dev/cro/doctor
- ตัวอย่าง: `dr.ai.bbh@gmail.com` (admin)
- ห้ามใช้บัญชี production จริง

---

## รันทุกวัน

```bash
cd line-dify-bridge/frontend
git pull
npm install          # เผื่อ deps เปลี่ยน
npm run dev          # http://localhost:5173
```

เปิดเบราว์เซอร์ → `http://localhost:5173` → login ด้วย email/password

---

## Troubleshooting

### ❌ "Network Error" หรือ login กดแล้วไม่เกิดอะไร
สาเหตุไล่ตามลำดับ:

1. **เครื่องไม่ได้อยู่ Wi-Fi `BBH-OPD`** → เช็คมุมขวาล่างของ Windows
2. **Office server ปิด / รีบูต** → ทักไถ้ owner ในแชท
3. **IP เปลี่ยน** — รัน `curl http://172.25.10.71:8000/` จาก terminal เครื่องตัวเอง:
   - ถ้า 200 OK → bridge OK; ปัญหาอยู่ frontend
   - ถ้า timeout → IP เปลี่ยนหรือ firewall block → ขอ IP ใหม่
4. **CORS error ใน browser console** → owner ต้องอัพเดต `allow_origin_regex` ใน `backend/main.py`
5. **Vite dev server cache เก่า** → ลบ `frontend/node_modules/.vite` แล้วรัน `npm run dev` ใหม่

### ❌ 401 Unauthorized หลัง login
- Token หมดอายุ (24 ชม.) — กด logout แล้ว login ใหม่
- ถ้าหลัง login ใหม่ยัง 401 — แจ้ง owner ว่าอาจ `JWT_SECRET` ที่ bridge เปลี่ยน

### ❌ "ECONNREFUSED 172.25.10.71:8000"
- Office server ปิด docker/bridge — ขอ owner เปิด

---

## สิ่งที่ห้ามทำ

- ❌ **ห้าม commit `.env.local`** (gitignored แล้ว แต่ตรวจซ้ำ)
- ❌ **ห้ามรัน `npm run gen-types`** ถ้า backend ยังไม่ deploy version ใหม่ — จะ overwrite ของคนอื่น
- ❌ **ห้ามแก้ไฟล์ใน `backend/`** ถ้าไม่ได้รับมอบหมาย
- ❌ **ห้ามแชร์ IP/credentials office server** ออกนอกทีม

---

## งานที่ทำได้ทันที (Phase 2)

- Frontend pages: Bookings inbox / Calendar / Patients / Login
- ห้องทดลอง UI ใหม่ใน `src/pages/`
- เพิ่ม TanStack Query hook ใน `src/hooks/` (1 resource = 1 file, ดู `frontend/CLAUDE.md`)

## งานที่ต้องคุยกันก่อน

- เพิ่ม React library ใหม่ (ตาม `frontend/CLAUDE.md` "❌ Don't")
- เพิ่ม route ใหม่ใน `App.tsx`
- แก้ design tokens / Tailwind config

---

## Reference

- `frontend/CLAUDE.md` — convention ของ frontend (TanStack Query rules, no-emoji, layered structure)
- `backend/CLAUDE.md` — convention ของ backend (เผื่ออ่านเข้าใจ API)
- `docs/BBH_SYSTEM_PLAN.md` — แผนระบบรวม
- `ERRORS.md` — bug log ที่เคยเจอ — เช็คก่อนแจ้ง bug ใหม่
