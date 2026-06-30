# Pilot Deployment Checklist (CRO Only)

โหมดที่ระบบกำลังทำงานอยู่: **pilot — CRO + admin เท่านั้น**.
หน้า doctor / nurse / lab_staff ยังไม่เปิดให้ login จริง — backend จะ
ตอบ 403 `ROLE_NOT_AVAILABLE` พร้อมข้อความขออภัย.

---

## 1. Pilot allowlist

`backend/services/auth_service.py` อ่าน env `LOGIN_ALLOWED_ROLES`
(default `admin,cro`). เมื่อพร้อมเปิด doctor:

```env
LOGIN_ALLOWED_ROLES=admin,cro,doctor
```

แล้ว restart bridge.

ไม่จำเป็นต้องลบ user เก่า — แค่ขยาย allowlist เมื่อพร้อม.

## 2. Rate limit /auth/login

In-memory sliding window: ทุก IP ลิมิตที่ **5 attempts ต่อ 15 นาที**.
เกินจะได้ HTTP 429 + `Retry-After` header. ค่านี้ hard-coded ใน
`auth_service._RATE_WINDOW_SEC` / `_RATE_MAX`.

Pilot scale (1-2 instance, น้อย user) ไม่ต้อง Redis ยัง. ถ้า scale
หลาย bridge ค่อยย้ายเข้า Redis เพื่อให้ counter shared.

## 3. Password policy

- ความยาวขั้นต่ำ **10 ตัวอักษร** (Pydantic schema + service check)
- ต้องมี ≥3 ประเภท: lowercase / uppercase / digit / symbol
- บล็อก common password ที่พบบ่อย (1234567890, password1234, ฯลฯ)

บังคับใน 3 จุด:
- POST `/api/users` (admin สร้าง user ใหม่)
- POST `/api/users/{id}/reset-password` (admin reset)
- POST `/auth/change-password` (user เปลี่ยนเอง)

## 4. Daily backup

Wrapper `tools/backup_daily.bat` รัน `tools/backup.py --out` ปลายทาง
+ rotation เก็บไฟล์ใหม่สุด 14 ไฟล์.

### ตั้ง Task Scheduler

```cmd
schtasks /Create /SC DAILY ^
    /TN "BBH Daily Backup" ^
    /TR "C:\Users\wisru\line-dify-bridge\tools\backup_daily.bat" ^
    /ST 02:00 /RL HIGHEST /F
```

ตรวจ log ที่ `C:\Users\wisru\backups\bbh\backup_daily.log`.

แนะนำ: copy ออก external (Google Drive / S3) สัปดาห์ละครั้ง.

## 5. Staging environment

แนะนำใช้ docker-compose override pattern — copy structure เดิมแล้ว
ตั้งค่า:

1. `.env.staging` — copy จาก `.env` แล้วแก้:
   - `BOT_OPS_DB_NAME=bbh_bot_ops_staging` (สร้าง DB ใหม่)
   - `JWT_SECRET=<staging-secret-คนละค่า-กับ-prod>`
   - `DIFY_API_URL=http://localhost:8001/v1` (ถ้ามี Dify แยก) หรือใช้
     prod Dify ก็ได้แต่ระวัง KB เดียวกัน
   - `LINE_*` — channel test แยก หรือ disable webhook
   - `GMAIL_*` — disable poller บน staging (ตั้ง `EMAIL_POLL_INTERVAL=0`
     หรือใช้ inbox ทิ้ง)
   - `SERVER_PORT=8001` กัน port ชน prod

2. **MySQL container แยก:**
   ```bash
   docker run -d --name hospital-bot-ops-db-staging \
     -e MYSQL_ROOT_PASSWORD=<staging-root-pw> \
     -e MYSQL_DATABASE=bbh_bot_ops_staging \
     -p 3308:3306 mysql:8.4
   ```

3. **Apply migrations 0001..0041** ลง staging DB.

4. **Restore mock data จาก backup** ล่าสุดของ prod:
   ```bash
   python tools/restore.py --target-mysql hospital-bot-ops-db-staging \
       backups/bbh-backup-XXXXXX.tar.gz
   ```
   (ใช้ snapshot ของ prod แต่ stage แยก เพื่อ test migration + UX)

5. `docker-compose.bridge.staging.yaml` — copy of main compose แต่
   port 8001 + env file `.env.staging`.

```bash
docker compose -f docker-compose.bridge.staging.yaml --env-file .env.staging up -d
```

### ใช้ staging ทำอะไร
- ทดสอบ migration ก่อน apply prod (สำคัญ!)
- ทดสอบ feature ใหม่ก่อน merge main
- รัน load test ที่จะ stress prod ไม่ได้
- ฝึก admin / CRO ใหม่โดยไม่กระทบ patient data

---

## Go-live checklist

- [ ] Apply migrations 0001..0041 ลง prod DB
- [ ] Set `LOGIN_ALLOWED_ROLES=admin,cro` ใน prod `.env`
- [ ] JWT_SECRET ≥32 chars + เก็บใน secret manager (ไม่ใช่ committed file)
- [ ] Create admin + CRO user ผ่าน `scratch/_create_admin.py` (gitignored)
- [ ] Test login 5 ครั้งติด → ครั้งที่ 6 ได้ 429
- [ ] Test password weak → 400 `WEAK_PASSWORD`
- [ ] Test doctor user → 403 `ROLE_NOT_AVAILABLE`
- [ ] Set up `BBH Daily Backup` Task Scheduler
- [ ] Smoke ทุก CRO workflow: create patient, create booking, approve,
       reschedule (cancel + new), upload report, AI chat
- [ ] Monitor `/system-health` + alert summary 24h หลัง launch
- [ ] เตรียม rollback plan (revert commit + restore latest backup)
