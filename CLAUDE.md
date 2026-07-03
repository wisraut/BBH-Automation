# LINE–Dify Hospital Bridge

---

# 🏥🏥🏥 BBH = Better Being **HOSPITAL** (โรงพยาบาล) 🏥🏥🏥
# ❌ ห้ามเรียก clinic / คลินิก / สถานพยาบาลเล็ก ❌
# ทุก design / คำแนะนำ / monitoring / admin tooling ต้อง scale ระดับ **โรงพยาบาล**:
#   • Multi-role (admin / doctor / nurse / cro / lab_staff) ไม่ใช่แค่ admin/cro
#   • Audit & compliance หนัก (ใครเข้าดู record ใครเมื่อไหร่)
#   • Volume สูง → ต้องมี proper monitoring (Prometheus/Grafana/alert) ไม่ใช่ดู log ตา
#   • Multi-doctor + patient assignment (Phase 2 = many-to-many)
#   • Data sensitivity ระดับ HIPAA-like → IP allowlist / 2FA สำหรับ admin

---

## Architecture Philosophy

**main.py คือ "พี่เลี้ยง" ของระบบ ไม่ใช่สมองของระบบ**

- **Dify รับผิดชอบ:** content ของข้อความทั้งหมด, validation logic, conversation flow, AI responses, Knowledge Base — อะไรที่ทำใน Dify node ได้ ทำที่ Dify
- **main.py รับผิดชอบ:** สิ่งที่ Dify ทำไม่ได้เท่านั้น — LINE webhook, signature verification, routing (doctor/patient), DB operations (hospital_db), notify doctor, enforce constraints ที่ต้องการ external state

**ตัวอย่างการตัดสินใจ:**
- ข้อความต้อนรับ → เนื้อหาอยู่ใน Dify (`answer_welcome` node), main.py แค่ trigger
- Validation ผิด → Dify บอก, main.py ไม่ hardcode error message เอง
- ห้ามใส่ text content, prompt, หรือ business logic ใน main.py ถ้า Dify node รับได้

---

## กฎสำหรับ Claude

0. **อธิบายให้เข้าใจง่าย ก่อนโยน technical decision ให้ user** — user เรียนรู้ไปพร้อมโปรเจค ไม่ใช่ senior dev; ก่อนถามให้ตัดสินใจ (เช่น "vector store อันไหน" / "single vs multi-stage") **ต้อง:**
   - อธิบายก่อนว่า **มันคืออะไร + ทำอะไร** ด้วย analogy ในชีวิตประจำวัน (ห้องสมุด, ล่ามภาษา, ถังเก็บของ)
   - บอก **ทำไมสำคัญ** ต่อระบบเรา
   - 1 concept ต่อ 1 turn — ห้ามยิง stack diagram รวดเดียว
   - Label ว่า **"recommended"** อันไหน + เหตุผลสั้นๆ
   - Trade-off เล่าเหมือนคุยกับเพื่อน ("ตัวนี้ประหยัดแต่ช้ากว่า") ไม่ใช่ตาราง benchmark ล้วน
   - Backup ให้เสมอ "ถ้าอยากเห็น code จริงๆก็บอกได้"
   - Suggest จุดที่ user hands-on ได้ (เขียน prompt เอง, tune param) เพราะ user code เองด้วย

1. **บันทึก error/bug ทุกอย่างลง `ERRORS.md` ทันทีที่เจอ** ตาม format ที่กำหนดไว้ในไฟล์นั้น
2. **บันทึกทุกสิ่งที่แก้ไขหรือเพิ่มลง `CLAUDE.md` ด้วย** — อัพเดต Status checklist และ Changelog ทุกครั้งที่ทำงานเสร็จ ไม่ว่าจะเป็น bug fix, feature ใหม่, หรือ refactor
3. **อ่านสถานะ Dify จริงทุกครั้งที่เริ่ม session** — ทำตาม 5 ขั้นตอนนี้ตามลำดับ:

   **ขั้นที่ 1 — อ่าน app info ผ่าน public API (ต้องทำเสมอ)**
   ```
   GET /v1/info
   Header: Authorization: Bearer <DIFY_API_KEY>
   → ได้: name, mode (advanced-chat / workflow / chatbot), author
   ```

   **ขั้นที่ 2 — อ่าน parameters (input variables, features)**
   ```
   GET /v1/parameters
   Header: Authorization: Bearer <DIFY_API_KEY>
   → ได้: user_input_form, file_upload, speech_to_text, retriever_resource ฯลฯ
   ```

   **ขั้นที่ 3 — หา app_id จาก Dify DB**
   ```sql
   docker exec docker-db_postgres-1 psql -U postgres -d dify -c \
     "SELECT id, name, mode FROM apps WHERE name='<ชื่อ app>';"
   → ได้: app_id (UUID)
   ```

   **ขั้นที่ 4 — ดู workflow versions ทั้งหมด**
   ```sql
   docker exec docker-db_postgres-1 psql -U postgres -d dify -c \
     "SELECT id, type, version, created_at FROM workflows
      WHERE app_id='<app_id>' ORDER BY created_at DESC;"
   → ได้: รายการ version ทั้งหมด (version = 'draft' คือที่กำลัง edit, อื่นคือ published)
   ```

   **ขั้นที่ 5 — ดึง node graph ของ version ล่าสุด**
   ```sql
   docker exec docker-db_postgres-1 psql -U postgres -d dify -t -c \
     "SELECT graph FROM workflows WHERE id='<workflow_id ล่าสุด>';"
   → ได้: JSON ครบทุก node (id, type, title, data.code, data.prompt_template, edges ฯลฯ)
   ```

   **หมายเหตุ:** console API (`/console/api/...`) ใช้ไม่ได้โดยตรงเพราะ password เป็น Base64 และไม่รู้ password จริง — ใช้วิธี DB query แทนเสมอ
4. **ห้ามแก้ code โดยไม่ได้รับคำสั่ง** — ถ้างานที่ได้รับคือแก้ที่ Dify ให้แก้ที่ Dify อย่างเดียว ห้ามแก้ไฟล์อื่นที่ไม่เกี่ยวจนกว่าจะได้รับคำสั่งชัดเจน
5. **เสนอ solution ที่ดีที่สุดเท่านั้น** — ห้ามเสนอ shortcut ชุ่ยๆ ให้เลือก solution ที่ถูกต้องที่สุดแล้ว implement เลย
6. **ห้าม mark ✅ ใน ERRORS.md หรือ Status checklist โดยไม่ได้แก้จริง** — ก่อน mark ✅ ต้องอ่านโค้ดจริงและยืนยันว่า fix นั้น deploy อยู่ใน file จริงแล้ว ห้าม mark ตามที่คาดว่าจะทำ
7. **ห้ามเขียน Changelog ว่าทำอะไรแล้วถ้ายังไม่ได้ทำจริง** — Changelog คือบันทึกสิ่งที่ commit ไปแล้ว ไม่ใช่ wishlist หรือ plan
8. **ห้ามทิ้ง script ชั่วคราวให้รกโปรเจค** — ถ้าเป็น patch/test/inspect ที่ใช้ครั้งเดียว ให้รันแบบ inline, stdin, temp file นอก repo, หรือทำผ่าน DB/UI โดยไม่สร้างไฟล์ถาวรในโปรเจค เว้นแต่ user สั่งชัดเจนว่าให้เก็บเป็น script ถาวร
9. **ถ้าจำเป็นต้องสร้าง script ในโปรเจค ต้องมีเหตุผลว่าใช้ซ้ำได้จริง** — เช่น idempotent recovery patch, startup/import script, maintenance script หรือ test harness ที่จะใช้ซ้ำ; หลังใช้เสร็จต้องรายงานว่าไฟล์ไหนถูกสร้างและทำหน้าที่อะไร
10. **ทุกครั้งที่จะ design หน้าตาเว็บ ต้องค้นคว้าอินเทอร์เน็ตก่อนเสมอ** — ห้าม design จากความคิดตัวเอง / mental model / ก็อป template คนอื่นตรงๆ

    **ขั้นตอน:**
    1. WebSearch หา design philosophy ของหน้า/component ที่จะทำ (dashboard, form, table, modal ฯลฯ) — keyword เช่น "admin dashboard design principles 2026", "form UX healthcare", "data table density minimal"
    2. อ่าน 2-4 แหล่ง (Stripe/Linear/Vercel/UXPin/Material/Apple HIG ฯลฯ) — ดู**เหตุผลว่าทำไมเขาถึงเลือกทำแบบนั้น** ไม่ใช่แค่ what
    3. สกัด **philosophy / principle** ออกมา (เช่น "whitespace is a feature", "progressive disclosure", "8pt grid", "2-second rule", "internal ≤ external padding") — ห้ามก็อป CSS code / template markup ของเขามาตรงๆ
    4. อธิบายให้ user ฟังก่อน implement — สรุปหลักการ 3-6 ข้อ + เหตุผลว่าทำไม + เชื่อมโยงกับปัญหาที่ user บ่น
    5. Implement แค่ **ตามหลักการ** ในบริบทของ Tailwind + BBH design tokens ที่มีอยู่ — ไม่ใช่ยัดสี/style ของ Stripe/Linear ลงเว็บเรา
    6. อ้างอิงแหล่งข้อมูลใน Sources section ตอนตอบ user

    **เหตุผล:** design จากความรู้สึกตัวเอง = subjective + inconsistent; ก็อป template = สไตล์ไม่เข้ากับ BBH tokens + copyright issues; รับ philosophy → apply ในบริบทเรา = ได้ผลที่ทั้ง principled และ own brand

11. **ก่อน `git commit` ทุกครั้ง → รัน `/code-review` แล้วตามด้วย `/security-review`** — code-review จับโค้ดซ้ำ/คุณภาพ/ประสิทธิภาพ (สำคัญเพราะมี Codex ทำขนานกัน); security-review จับ secret หลุด/ช่องโหว่ (สำคัญเพราะเป็น hospital + HIPAA-like + เคยมี token หลุดในแชท) แก้ issue ที่เจอก่อน commit

12. **หลังสร้าง feature หรือแก้ bug ที่กระทบพฤติกรรมแอป → รัน `/verify` หรือ `/run`** ยืนยันว่า change ทำงานจริงในแอป ไม่ใช่แค่ build ผ่าน (โปรเจคนี้มี Docker/n8n/Dify หลายชั้น — build ผ่านไม่ได้แปลว่า runtime ถูก)

13. **ใช้ agent `Explore` / `Plan` ได้เองเมื่อเหมาะ** (standing permission) — `Explore` ตอนหาโค้ดใน codebase ใหญ่ (backend+frontend+n8n+dify), `Plan` ตอนออกแบบ implementation ที่ซับซ้อน; ไม่ต้องขออนุญาตทุกครั้ง

---

### ความผิดพลาดของ Claude ที่เกิดขึ้นใน Session 2026-05-28 ← อ่านทุกครั้ง อย่าทำซ้ำ

- **ไม่อ่าน Dify ตามที่สั่งตั้งแต่ต้น session** — user สั่งให้อ่านทั้ง Dify และ local files แต่ Claude อ่านแค่ local files ไม่ได้เรียก Dify API จนกระทั่งถูกบังคับให้ทำ
- **แก้ code main.py โดยไม่ได้รับคำสั่ง** — user บอกให้แก้ flow ใน Dify แต่ Claude กลับไปเปลี่ยน Python code ให้ใช้ `/workflows/run` ทั้งที่ยังไม่รู้ว่า Dify app เป็น type อะไร ทำให้ code ที่แก้ไม่ compatible กับ app จริง (advanced-chat ≠ workflow)
- **โกหกใน ERRORS.md และ CLAUDE.md** — mark Bug 1 ว่า "แก้แล้ว ✅" และเขียน Changelog ว่าเปลี่ยนเป็น Workflow API แล้ว ทั้งที่ code จริงยังใช้ `/chat-messages` อยู่ — ทำให้ session ถัดไปเชื่อข้อมูลผิด

### ความผิดพลาดของ Claude — Session 2026-06-25

- **เรียก BBH ว่า "clinic" ตลอดหลาย turn** ทั้งที่ชื่อโปรเจคคือ "Hospital Bridge", domain คือ `bbh-hospital.com`, BBH = Better Being **Hospital** — เกิดจาก:
  1. เชื่อ summary ของ session ก่อนที่ถูก compact มา (เขียนว่า "Thai medical clinic chatbot") โดยไม่ verify
  2. **ไม่ได้อ่าน CLAUDE.md ใหม่ตอนเริ่ม session** — ละเมิดกฎข้อ 3 ซ้ำกับ pattern เดิมของ session 2026-05-28
  3. Bias จากการเห็นว่ามี CRO/admin คนเดียว → เผลอ mental model ว่าเป็นที่ขนาดเล็ก
- **ผลกระทบ:** คำแนะนำเรื่อง Admin page / Monitor / role design ทั้งหมดถูก scope เล็กเกินจริง (เสนอแค่ role admin/cro ทั้งที่ hospital ต้องมี doctor/nurse/lab_staff ด้วย)
- **บทเรียน:** ก่อนเสนอ architecture/design ทุกครั้ง — verify "scale" ของระบบจาก CLAUDE.md / repo จริง อย่าเชื่อ summary โดยไม่ตรวจ

### ความผิดพลาดของ Claude — Session 2026-07-01

- **ส่ง test email ไป address ที่ไม่มีอยู่จริง** — Claude เดา email เป็น `dr.ai@bbhhospital.com` (มโนขึ้นจากบริบท hospital) แล้วรายงานว่า "email delivered" ทั้งที่ SMTP return True ไม่ได้หมายถึง delivered ปลายทาง; ที่จริง email หมอในระบบคือ `dr.ai.bbh@gmail.com` (มี users table + `REPORT_NOTIFY_EMAIL` default ใน code) — ต้อง grep/query DB **ก่อน** ส่ง test ไม่ใช่เดาจาก mental model
- **ทำงานเสร็จ 15 task แล้วลืมอัพเดต CLAUDE.md** — user ต้องทัก "อัปเดต Claude.md รึยัง" ทั้งที่กฎข้อ 2 บอกชัด "บันทึกทุกสิ่งที่แก้ไขหรือเพิ่มลง CLAUDE.md ด้วย ทุกครั้ง"; ในอนาคตให้อัพเดต Changelog หลังทำ feature เสร็จแต่ละอัน อย่ารอจน commit หลาย commit
- **ลืมอัพเดต CLAUDE.md **ซ้ำเป็นครั้งที่ 2 ใน session เดียวกัน** — หลังทัก mistake ข้างบนไว้ในไฟล์ตัวเองแล้วยังทำผิดซ้ำ ทำอีก 5 features (Calendar reschedule button, gray pill, TBD marker fix, slate re-approve card, email v2 shell) แล้วไม่ได้จด user ต้องทัก "จดบน Claude.md รึยัง" ครั้งที่ 2; **สาเหตุ**: ผมเพิ่ม Changelog ตอน user ทักครั้งแรกเท่านั้น พอผ่านหลาย feature ต่อไปก็ลืม; **บทเรียนถาวร**: หลัง commit ทุกครั้งที่ commit message ขึ้นต้นด้วย `feat/fix/refactor` (ไม่ใช่ `chore/style/docs`) → อัพเดต CLAUDE.md Changelog ทันทีก่อนไปทำ task ถัดไป — treat เป็นส่วนหนึ่งของ definition-of-done ไม่ใช่ optional cleanup
- **เขียน SQL แล้ว assume ENUM value โดยไม่ตรวจ** — ใช้ `calendar_status='pending'` ในโค้ด reschedule_to_pending ตกที่ DataError 1265 เพราะ ENUM allow แค่ `not_created|pending_event|created|failed|cancelled`; ก่อน UPDATE/INSERT column ที่เป็น ENUM ต้อง `SHOW COLUMNS` ก่อนเสมอ
- **ใช้ค่า off-8pt (p-5=20px, p-7=28px)** ใน spacing pass รอบแรก ทั้งที่ควรใช้ทวีคูณของ 8 (p-4/p-6/p-8) — ค่าคี่ render เบลอที่ 1.5x density (Material Design foundation) — user ทัก "ทำไมถึงยัง cramped" จึงมาแก้รอบ 2

### ความผิดพลาดของ Claude — Session 2026-06-25 ครั้งที่ 2 (เรื่อง clinic ซ้ำสอง!)

- **ใช้คำว่า "คลินิก BBH" อีก** ทั้งที่ session เดียวกัน user เพิ่งทักแล้วครั้งหนึ่ง — เกิดจาก:
  1. **File pollution** — คำว่า "clinic/คลินิก" ยังมีอยู่ใน 7 ไฟล์ของ repo เอง (`README.md`, `frontend/CLAUDE.md`, `dify_patches/bbh_staff_assistant/system_prompt.md`, `dify_patches/bbh_staff_assistant/workflow_graph.json`, `dify_patches/patch_cro_branch.py`, `dify_patches/patch_bbh_routing_v2.py`, `docs/bbh-portal-extra-pages.html`, migrations comments 2 ไฟล์) — ทุกครั้งที่ Claude เปิดอ่านไฟล์พวกนี้ คำผิดเข้า context และชนะ root CLAUDE.md
  2. user มี hook ให้อ่าน root CLAUDE.md แล้ว แต่แก้ไม่ได้เพราะปัญหาไม่ได้อยู่ที่ "ไม่อ่าน" — อยู่ที่ source file มีคำผิดเอง
- **แก้ใน session นี้:** กวาด 7 ไฟล์ดังกล่าวเปลี่ยน clinic/คลินิก → hospital/โรงพยาบาล (เก็บไว้เฉพาะ 11 จุดที่อ้างถึง 3rd-party clinic ที่คนไข้เคยไปรักษามาก่อน + test fixtures)
- **บทเรียน:** ถ้า root CLAUDE.md บอกว่า "ห้ามใช้คำ X" → ต้องตรวจว่าคำ X มีอยู่ในไฟล์อื่นของ repo ไหม **ทุกครั้ง** ถ้ามี → ลบ/แก้เพื่อกัน context pollution ก่อนเริ่มงานอื่น
- **สำคัญสำหรับ session ถัดไป:** ก่อนพูดถึง "BBH" ในข้อความใดๆ → grep `clinic|คลินิก` ใน repo ก่อน ถ้ายังเจอแบบที่เป็น BBH (ไม่ใช่ 3rd-party) ให้แก้ทันที

### สถานะ Dify ณ ปัจจุบัน (verified 2026-06-24)

```
App 1 (LINE bot): Patient Summary
  App type : advanced-chat
  Author   : wisarut
  API key  : <redacted — DIFY_API_KEY ใน .env>
  app_id   : 64eb590e-4b27-4b10-aca2-44355e37ff40

App 2 (Web Dashboard /ai): BBH Staff Assistant  ← สร้าง 2026-06-24 ผ่าน DB
  App type : advanced-chat
  API key  : <redacted — DIFY_STAFF_API_KEY ใน .env>
  app_id   : a1b2c3d4-e5f6-7890-abcd-ef1234567890
  workflow : 5 nodes (start → kb → format → llm_staff → answer)
  KB       : Library (d3621299) เดียวกับ Patient Summary
  Model    : google/gemini-2.5-flash-lite via openrouter
```

ห้ามเปลี่ยนไปใช้ `/workflows/run` — ทั้งสอง app ใช้ `/chat-messages`

---
---

## Hospital Flow (Business Logic)

คนไข้ส่ง **ผลแล็บทาง Email** (text หรือ PDF attachment) → ระบบรับอัตโนมัติ → เก็บลง DB → แจ้งแพทย์ทาง LINE → แพทย์กด [🔍 วิเคราะห์] → ได้สรุปทาง LINE

> ระบบนี้เป็น **doctor-only LINE bot** — คนไข้ไม่ใช้ LINE เลย ใช้แค่ email

```
คนไข้ส่ง email + PDF ผลแล็บ
        ↓
email_poller.py (poll Gmail IMAP ทุก 120 วิ)
  ├── match sender กับ patients.email
  ├── แตก body + PDF text (pypdf)
  └── INSERT report (atomic, status=NULL)
        ↓
แจ้งแพทย์ประจำตัวใน LINE พร้อม Quick Reply [🔍 วิเคราะห์]
        ↓
        ... รอแพทย์กดปุ่ม หรือพิมพ์ชื่อคนไข้ / Report ID ...
        ↓
main.py._analyze_report
  ├── Atomic lock (UPDATE status='analyzing' WHERE status IS NULL)
  ├── JOIN ข้อมูลคนไข้ครบ 4 table (conditions, allergies, meds, report)
  └── ส่ง context ไป Dify
        ↓
Dify (advanced-chat mode)
  start → knowledge_retrieval → format_docs → llm (Gemini Flash) → answer
        ↓
LINE push สรุปกลับให้แพทย์ + reset status=NULL (วิเคราะห์ซ้ำได้)
```

---

## Architecture

```
Gmail IMAP                                   LINE API
   ↓                                            ↕
email_poller.py  ─────────┐         ┌──── main.py (FastAPI + ngrok)
(PDF/text → report row)   │         │     ├── Doctor register / logout
                          ▼         ▼     ├── Patient name search → analyze
                       PostgreSQL hospital_db
                          ▲
                          │ context (patient + report + history)
                          ▼
                       Dify API (localhost/v1)
                          ├── Knowledge Base (หนังสือแพทย์ PDF)
                          └── Gemini Flash via OpenRouter
```

### Tech Stack

| ส่วน | เทคโนโลยี |
|------|-----------|
| Bridge | Python 3.11+ / FastAPI |
| Patient input | Gmail IMAP polling (`email_poller.py`) |
| PDF parsing | pypdf (text-based PDFs; scanned images ไม่รองรับ) |
| AI หลัก | Dify advanced-chat + Gemini Flash via OpenRouter |
| Knowledge Base | Dify KB (หนังสือแพทย์ PDF) |
| Database | PostgreSQL 5433 (Docker — `docker-db_postgres-1`) |
| Tunnel | ngrok (domain hardcode ใน main.py — ดู P1) |
| Monitor | Textual TUI (`monitor.py`) — refresh ทุก 5 วิ |

---

## Database Design (hospital_db)

เก็บข้อมูลคนไข้/แพทย์/ผลแล็บแบบ structured + audit trail
**ไม่เก็บ Knowledge Base** — หนังสือแพทย์อยู่ใน Dify KB เท่านั้น

```sql
doctors
  doctor_id    TEXT PK         -- internal ID (U_doctor_001 etc.)
  hospital_id  TEXT            -- รหัสที่แพทย์พิมพ์ใน LINE เพื่อ register (DR001/DR002)
  line_uid     TEXT            -- LINE user_id (NULL = logged out)
  name         TEXT
  specialty    TEXT
  license_no   TEXT
  hospital     TEXT
  created_at   TIMESTAMP

patients
  patient_id   TEXT PK         -- HN-YYYY-NNN
  name         TEXT
  dob          DATE
  sex          TEXT
  blood_type   TEXT
  phone        TEXT
  address      TEXT
  email        TEXT            -- ใช้ match ตอน email_poller รับ
  doctor_id    TEXT FK         -- แพทย์ประจำตัว (1-to-1 Phase 1)
  created_at   TIMESTAMP

reports
  report_id        TEXT PK     -- RPT-YYYYMMDD-XXXX (atomic generate ผ่าน advisory lock)
  patient_id       TEXT FK
  report_source    TEXT        -- email address หรือ คลินิก/รพ.
  report_date      DATE
  chief_complaint  TEXT        -- จาก email subject
  report_text      TEXT        -- body + PDF text รวมกัน
  status           TEXT        -- NULL = ready | 'analyzing' = locked
                               -- ⚠️ DB default คือ 'pending' แต่ INSERT ต้องใส่ NULL explicit
  submitted_at     TIMESTAMP

analyses
  id                    SERIAL PK
  report_id             TEXT FK
  dify_conversation_id  TEXT    -- ใช้ resume conversation ถ้าจะถามต่อ
  summary_text          TEXT    -- สรุปจาก Dify
  pdf_path              TEXT    -- TODO: reportlab output
  created_at            TIMESTAMP

medical_conditions       -- โรคประจำตัว
  id, patient_id, condition_name, icd10, diagnosed_year, diagnosed_at,
  status ('active'|'controlled'|'resolved'), notes

allergies                -- ประวัติแพ้
  id, patient_id, allergen, reaction, severity

current_medications      -- ยาที่ใช้อยู่
  id, patient_id, drug_name, dose, frequency, indication, started_year, is_active

treatment_history        -- ประวัติการรักษา/ผ่าตัด
  id, patient_id, treatment_type, description, hospital, treated_date, outcome, notes

audit_logs
  id          SERIAL PK
  actor_id    TEXT             -- patient_id หรือ doctor_id
  actor_type  TEXT             -- 'patient' | 'doctor'
  action      TEXT             -- 'report_submitted' | 'analysis_triggered'
  report_id   TEXT FK
  created_at  TIMESTAMP
```

### Indexes
```sql
idx_reports_patient  ON reports(patient_id, submitted_at)
idx_reports_status   ON reports(status)
idx_analyses_report  ON analyses(report_id)
idx_conditions_patient ON medical_conditions(patient_id)
idx_meds_patient     ON current_medications(patient_id, is_active)
```

### Future (Many-to-Many Phase 2)
- `patient_doctors` junction table (role: primary | specialist | consultant)
- `report_assignments` สำหรับส่งต่อระหว่างแพทย์
- Specialty-based routing

---

## Config สำคัญ

```
LINE_CHANNEL_ID       = 2010199885
LINE_CHANNEL_SECRET   = (.env)
DIFY_API_URL          = http://localhost/v1
DIFY_API_KEY          = (.env — Patient Summary app)
GMAIL_EMAIL           = wisrutyaemprayur@gmail.com
GMAIL_APP_PASSWORD    = (.env — App Password)
EMAIL_POLL_INTERVAL   = 120 (วินาที)
SERVER_PORT           = 8000

PostgreSQL (hospital_db):
  Host: localhost  Port: 5433  User: postgres  Password: (DB_PASSWORD ใน .env)
  Port 5433 เพราะ 5432 ถูก local PostgreSQL จอง
```

> ⚠️ `OLLAMA_API_URL` / `OLLAMA_MODEL` ใน .env เป็น dead config — code ไม่อ่านแล้ว
> ngrok domain ยัง hardcode ใน main.py:541 (P1 — ควรย้ายไป .env)

---

## Status (ระบบปัจจุบัน — BBH n8n Bot)

### ✅ ทำงานได้แล้ว

- [x] **LINE Main Bot (n8n webhook)** — รับข้อความคนไข้ → Dify BBH Bot → AUTO (ตอบ FAQ) / BOOKING_ASK / ESCALATE / CONSULT
- [x] **Multi-turn conversation** — `bot_sessions` MySQL เก็บ `dify_conversation_id` ต่อ user; Dify จำ context ข้ามข้อความ
- [x] **Booking flow** — BOOKING_DONE → bridge save → push CRO LINE พร้อม quick reply [✅ ยืนยัน] [❌ ไม่รับ]
- [x] **CRO text command** — CRO พิมพ์ "ยืนยัน/ok/confirm" หรือ "ไม่รับ/reject" แทนกดปุ่มได้ (สำหรับใช้คอม)
- [x] **CRO user tracking** — บันทึก CRO LINE user_id ลง `bot_sessions` ทุกครั้งที่ส่งข้อความ
- [x] **Bridge booking API** — `POST /internal/booking`, `GET /internal/booking/latest-pending`, `GET /internal/booking/{uid}`, `POST /internal/booking/{uid}/approve`, `POST /internal/booking/{uid}/reject`
- [x] **Dify BBH Bot routing** — 6 prefix: AUTO / BOOKING_ASK / BOOKING_DONE / ESCALATE / CONSULT / Emergency (โทร 1669)
- [x] **Cloudflare Tunnel** — `bridge.bbh-hospital.com` + `n8n.bbh-hospital.com` (แทน ngrok)
- [x] **Bot Ops MySQL** — `bot_sessions` + `booking_requests` + `booking_audit_logs`

### ⚠️ รอ Test / ปัญหาค้าง

- [x] **Google Calendar event creation** — ใช้งานได้; ปัญหา 18/6, 19/6 เวลาผิดแก้แล้ว (session 2026-07-01) — ทั้ง (a) runtime cache bug และ (b) day/month/year rollover ที่ 23:00 fix ครบ; new n8n versionId `14ba96f1` (verified executions ตั้งแต่ 2026-06-24 ใช้ correct versionId ทุก exec)
- [x] **n8n runtime workflow version cache** — resolved 2026-07-01; fix ผ่าน direct SQLite patch (import:workflow ของ n8n 2.x reports success แต่ไม่ persist nodes จริง — ต้อง UPDATE workflow_entity.nodes + gen new versionId + insert workflow_history + sync activeVersionId/publishedVersionId/dependency ตรงๆ)
- [x] **Reschedule flow** — ครบ 2 branches: มีเวลาใหม่ + TBD (ยังไม่รู้เวลา); email แจ้งแพทย์ทั้ง 2 branches (verified inbox `dr.ai.bbh@gmail.com`)
- [x] **Doctor assignment ตอน approve** — Web ApproveModal บังคับเลือก + amber panel สำหรับ LINE bookings ที่ยังไม่มี doctor + API `/assign-doctor` แก้ทีหลังได้
- [x] **Cloudflare WAF `/internal/*`** — deploy ที่ edge, external 403 HTML block, internal Docker call ยังทำงาน (defense-in-depth alongside InternalPathGuard)
- [x] **email_poller (deprecated)** — ปิดถาวรตั้งแต่ 2026-07-01; Reports page ใน Web Dashboard เป็นช่องทางรับ lab report แทน (CRO upload + assign doctor); ถ้าอนาคตต้องการรับ email อีกก็ restore import + task ใน `backend/core/lifespan.py`
- [ ] **Security housekeeping** — user ยังต้อง revoke (1) Gmail App Password `<redacted>` ที่แชร์ในแชท → สร้างใหม่ + update .env, (2) Cloudflare API token `<redacted>` ที่แชร์ในแชท → delete row "BBH WAF automation"
---

## AI Architecture — 2 เส้นแยกกัน (Dify ถอดออกครบแล้ว 2026-07-03)

ระบบมี **AI 2 เส้นแยกกัน** ห้ามปน — คนละ prompt คนละ persona; **ทั้งคู่ใช้ own LLM (Gemini via OpenRouter) ไม่มี Dify แล้ว**

| ใช้ที่ไหน | โค้ด | prompt/persona |
|-----------|------|----------------|
| LINE customer bot + n8n | `backend/rag/` (Own-RAG: embedder BGE-M3 + MySQL vector store + `rag/llm.py` + safety gate) | Routing classifier (AUTO / ESCALATE / BOOKING_ASK / CONSULT) สำหรับลูกค้า LINE |
| Web dashboard `/ai` (CRO) + pre-visit summary | `services/ai_service.py` + `services/patient_summary_service.py` → `rag/llm.py` ตรง | Free-form staff persona (`_SYSTEM_PROMPT`) ไม่มี routing prefix |

**เหตุผลแยก persona:**
- เส้น LINE มี routing prefix → ถ้าเอามาใช้กับ web จะตอบ "AUTO: สวัสดีค่ะ..." เหมือน bot ลูกค้า
- Staff ต้องการ chat แบบ free-form ไม่ใช่ classifier

**สถานะ Dify:** container ทั้ง stack หยุดแล้ว (เหลือ `docker-db_postgres-1` = legacy hospital_db); `DIFY_*` env + `dify_client.py` + n8n else-branch ยังเหลือเป็น dead code (ไม่มี runtime path วิ่งเข้า) — rollback ต้อง start Dify container กลับก่อน
- ปนกัน = prompt confuse, ตอบไม่ตรงเป้า

### AI ไม่มี DB access (security policy)
- AI **เห็นเฉพาะ context ที่ backend curate** ให้ใน prompt
- Backend ดึงผ่าน: `patient_repo` + `report_repo` + `booking_repo` + `calendar_client.list_events`
- AI **ไม่มี tool / function calling** — control plane อยู่ที่ backend ทั้งหมด
- ปลอดภัย: คนนอกที่ login ได้ ไม่สามารถใช้ AI ไปดูข้อมูลคนไข้ที่ไม่ได้ pin

### Context blocks ที่ backend inject
1. **Patient pin** (ถ้า user pin คนไข้) — profile + 5 booking ล่าสุด + 5 report ล่าสุด + total counts
2. **Schedule snapshot** (เสมอ) — วันนี้ + พรุ่งนี้: booking approved + Google Calendar events + slots ว่าง
3. **คำถาม user** (last)

---

## Changelog

| วันที่ | ไฟล์ | สิ่งที่ทำ |
|--------|------|-----------|
| 2026-07-03 | flows/{cro,doctor,patient}.py, flows/routing.py (NEW), integrations/dify_client.py (DELETED), core/config.py | **Migrate LINE fallback flows → own RAG + ลบ dify_client (Dify ออกจาก runtime 100%)** — `dify_client.py` ไม่ใช่ dead จริง (audit ก่อนผมพลาด) ยังถูก legacy flows ใช้เป็น LINE fallback ตอน n8n ล่ม; (A) `flows/cro.handle_public_inquiry` (live fallback ผ่าน line_webhook/cro_webhook) เปลี่ยน `dify_client.ask_with_meta`+`parse_decision` → `rag.service.answer("line_main",uid,text)` + `routing.parse_decision` (ย้าย parser ออกมาเป็น `flows/routing.py` module อิสระ); ลบ `_update_dify_conv_id` (dead); (B) `flows/doctor.py` analyze (dead runtime—lifespan import แต่ไม่เรียก, email_poller ปิด) → `llm.chat` + `_DOCTOR_SYSTEM` + redact; (C) `flows/patient.py` advisor (tests เท่านั้น) → `rag.service.answer` + คง audit `advice_requested`; ลบ `dify_client.py` + `DIFY_*` vars จาก config.py (ไม่มี importer เหลือ นอกจาก ops/monitor+tests ที่ใช้ os.getenv ตรง); **ลบ emoji ใน LINE reply ของ 3 ฟังก์ชันที่แก้** (🤔📝✅⚠️💬 ใน cro, ❌🔍📊 ใน doctor, 🤔❌ ใน patient) ตาม no-emoji policy; verify: app boot ได้ไม่พัง, flows import clean, routing parser 4/4 format, dify_client = ModuleNotFoundError; **เหลือ emoji ใน handler อื่นของ flows (CRO team/booking notify) ที่ยังไม่แตะ** |
| 2026-07-03 | services/report_service.py, repositories/ai_message_repo.py (NEW), services/ai_service.py | **Web AI multi-turn memory + migrate report analysis ออกจาก Dify** — (A) **พบ Dify dependency ที่ audit แรกพลาด**: `report_service.analyze_report` (ปุ่มวิเคราะห์ lab report ของแพทย์) ยังเรียก `dify.ask_with_meta` (ใช้ default `DIFY_API_KEY` role=doctor เลยไม่โดน grep DIFY_STAFF) → พังตั้งแต่หยุด Dify; migrate เป็น `llm.chat` + `_DOCTOR_SYSTEM` prompt + **เพิ่ม PII redact** (เดิมส่ง context ดิบเข้า Dify→OpenRouter ไม่ได้ redact) + `_build_context` เลิกอ้าง Knowledge Base (KB หนังสือแพทย์อยู่ใน Dify หายไปแล้ว) → verify: มี Triage line, parse=review, HN redact เป็น [HN]; (B) **Web AI จำบทสนทนาได้** — reuse ตาราง `ai_conversations`+`ai_messages` เดิม (dead schema จาก migration 0018/0019 ไม่เคย wire) แทนสร้างใหม่; repo `ai_message_repo` (get_or_create ผ่าน string token เก็บใน `dify_conversation_id` = provider-agnostic id, frontend contract ไม่เปลี่ยน / load_history / save_turn best-effort); ai_service load history ก่อน + persist ทั้ง 2 ฝั่ง (user redact ก่อนเก็บ) หลังตอบ; verify E2E: turn1 บอก "ZEBRA-7" → turn2 จำได้ตอบ "ZEBRA-7", history 4 turns; **เหลือ**: `dify_client.py` ยังถูก legacy flows (cro/doctor/patient = LINE fallback ตอน n8n ล่ม) ใช้ → ลบ dify_client ไม่ได้จนกว่าจะตัดสินใจเรื่อง fallback (รอ user เลือก migrate→RAG / ตัดทิ้ง / คงไว้) |
| 2026-07-03 | backend/rag/llm.py, services/ai_service.py, services/patient_summary_service.py, core/config.py, api/health.py, api/admin_system.py, jobs/admin_alert_evaluator.py, migrations/0046 (NEW), frontend/pages/SystemHealth.tsx | **ถอด Dify ออกจาก runtime ที่เหลือ (Web AI + monitoring) — cutover สมบูรณ์** — cutover เมื่อวานถอด Dify เฉพาะเส้น LINE ลูกค้า แต่ **Web Dashboard AI (`/api/ai/chat` CRO chat + pre-visit patient summary) ยังผูก Dify Staff Assistant** พอหยุด container จึงพังเงียบ (502); แก้: (1) `rag/llm.py` เพิ่ม `chat_stream()` (OpenRouter SSE); (2) `ai_service.py` เลิก dify_client/DIFY_STAFF_API_KEY → เรียก `llm.chat/chat_stream` ตรง + เพิ่ม `_SYSTEM_PROMPT` staff (free-form ไม่มี routing prefix), conv_id gen เอง (uuid); (3) `patient_summary_service.py` เลิก dify → `llm.chat` (system=instruction, user=data); (4) **monitoring**: เอา Dify probe ออกจาก `health.py`/`admin_system.py`/`admin_alert_evaluator.py` (ลบ evaluator `eval_bridge_dify_disconnected` + globals) + migration 0046 ปิด rule `bridge_dify_disconnected` (enabled=0) + resolve alert ค้าง + `config._REQUIRED` เอา `DIFY_API_KEY` ออก (bridge boot ได้โดยไม่ต้องมี Dify key) + `SystemHealth.tsx` ลบ service card Dify; verify บนภาพใหม่ (rebuild+recreate): Web AI ตอบจริงผ่าน OpenRouter, stream มี delta+conv_id+done, health เหลือ bridge/db/tunnel, alert rule enabled=0; **หมายเหตุ**: dify_client.py + n8n else-branch (fallback Dify) ยังเหลือเป็น dead code ปลอดภัย (USE_OWN_RAG=true เสมอ ไม่มีทางวิ่งเข้า) — rollback ไป Dify ต้อง start container กลับก่อน |
| 2026-07-03 | backend/rag/safety.py (NEW), backend/rag/service.py | **Safety gate ฉุกเฉิน (deterministic) — แทน Dify if_else_emergency ที่หายไป** — พบว่าหลังถอด Dify, Gemini flash-lite พลาด route "แน่นหน้าอก หายใจไม่ออก" เป็น AUTO (1/4 เคสฉุกเฉินพลาด) = รับไม่ได้สำหรับ รพ.; `safety.is_emergency(text)` substring match keyword ฉุกเฉิน (เจ็บหน้าอก/แน่นหน้าอก/หายใจไม่ออก/หมดสติ/ชัก/ปากเบี้ยว/เลือดออกไม่หยุด/สำลัก/แพ้รุนแรง/ช็อก/กินยาเกินขนาด/ฆ่าตัวตาย ฯลฯ); `service.answer()` เช็คก่อน embed/LLM → ถ้าเจอ short-circuit return ESCALATE:EMERGENCY + ข้อความ 1669 ทันที (ไม่พึ่ง LLM); ทดสอบ: ฉุกเฉิน 4/4 → ESCALATE:EMERGENCY, walk-in → AUTO (ไม่ over-trigger); err toward over-escalation |
| 2026-07-03 | Dify docker stack (stop 11 containers), bbh-embedder (recreate BGE-M3), backend/rag re-ingest, .env EMBED_MODEL, .env.example | **ถอด Dify app + สลับ BGE-M3 (cutover)** — (A) หยุด Dify 11 containers (api/nginx/worker/weaviate/redis/...) คืน RAM ~1.5GB (3.58→5.06GB avail) **เก็บ docker-db_postgres-1** ไว้ (155MB, legacy hospital_db ยัง migrate ไม่เสร็จ + lifespan._startup_reset ต่อ pg แต่ห่อ try/except); RAG อิสระจาก Dify 100% (key ใน .env, embedder เอง, vector store MySQL) → LINE flow ยังตอบครบ; (B) recreate `bbh-embedder` Infinity เป็น `BAAI/bge-m3` CPU (โหลด 7.5 นาที, กิน 1.25GB จริง — Infinity ใช้ fp16), set `EMBED_MODEL=BAAI/bge-m3` (embedder.py NEEDS_PREFIX auto=False), re-ingest FAQ 19 chunks dim 1024; **BGE-M3 คมกว่า e5-small ชัด**: คะแนนกระจาย 0.48-0.67 (e5 กอง 0.82-0.90), เคส walk-in ยากถูก, นอกเรื่อง(ที่จอดรถ) 0.508 << ของจริง 0.66 → ตั้ง score threshold ตัดเคสนอกคลังได้ (Phase 2) |
| 2026-07-03 | backend/core/config.py, backend/api/session.py, n8n/workflows/bbh-workflow-live.json, work/build_workflow.py | **ก้าว 4 RAG — USE_OWN_RAG switch** (commit `7e40e9e`) — cutover mechanism วางที่ bridge ไม่ใช่ n8n → สลับ = แก้ .env + restart bridge (ไม่ต้อง n8n deploy dance); `USE_OWN_RAG` env (default false); `/internal/session` ส่ง `use_own_rag` กลับ; n8n Ask Dify node branch: true → POST `/internal/rag/answer`, false → Dify เดิม; ทั้งคู่ feed `raw` "PREFIX: text" เข้า parsing เดียวกัน (booking/escalate/consult ทำงานเหมือนเดิม); พิสูจน์: flag off → Dify, flag on → /rag ยิงจริง route=AUTO; **ตอนนี้ flag = true (RAG live) เพราะ Dify Ollama embedding พัง** rollback ทันทีได้ |
| 2026-07-03 | backend/rag/{__init__,embedder,vector_store,ingester,memory,llm,prompts,service}.py (NEW), backend/api/rag_api.py (NEW), backend/migrations/0045_kb_chunks.sql (NEW), backend/main.py | **ก้าว 1-3 Own-RAG แทน Dify** (commit `3ae85e6`) — Python ล้วน ไม่ใช้ framework (เห็นทุกขั้น debug ได้ ตรงข้าม Dify กล่องดำ); **Embedder**: Infinity container (`bbh-embedder`) รัน e5-small บน CPU (GPU GTX 1050 เก่าเกิน PyTorch ยุคใหม่ — TEI/Infinity รันไม่ได้; BGE-M3 เต็มกิน 4GB RAM ตึงตอน Dify ยังรัน → ใช้ e5-small 470MB ก่อน สลับ BGE-M3 ตอน cutover แค่แก้ env); **vector_store**: MySQL `kb_chunks` + brute-force cosine ใน Python (FAQ เล็ก <5ms, ไม่เพิ่ม service); **ingester**: FAQ.md → 1 chunk ต่อ `#### FAQ:` → embed → เก็บ (19 chunks); **memory**: 6 turns ล่าสุดจาก booking_messages; **llm**: Gemini via OpenRouter (key แกะจาก Dify provider_credentials ผ่าน encrypter ใน api container); **prompts**: port llm_cro_decide (AUTO/CONSULT/BOOKING/ESCALATE:class, ground จาก FAQ, ห้ามแต่งเบอร์, parse เก็บ class); ทดสอบ hard queries (ไม่มีคำตรง): walk-in/emergency/consult/off-topic/booking ถูกหมด — retrieval weakness แก้ด้วยส่ง top-5 ให้ LLM |
| 2026-07-03 | docs/BBH_MAIN_BOT_FAQ.md (gitignored *.md), Dify DB (คลินิก→รพ. verify) | FAQ ต้นฉบับ: แก้ "คลินิก" → "โรงพยาบาล" 10 จุด (ก่อน ingest เข้า kb_chunks — bot จะไม่พูดคลินิกใส่คนไข้) |
| 2026-07-03 | .claude/settings.json (NEW), .claude/settings.local.json, ~/.claude/hooks/{scan_secrets,remind_changelog}.py (NEW), CLAUDE.md rules 11-13 | **Guardrails (dev tooling — ไม่แตะ product)** — (1) permission allowlist +`where`/`docker stats` (docker exec/npm run มีอยู่แล้ว); (2) **PreToolUse hook `scan_secrets.py`** = block `git commit` ถ้าเจอ key/token (regex: sk-or/sk-/cfut_/private key/AKIA/AIza/gh_/xox — fail-open) — **hard guarantee** ตรงปัญหา token เคยหลุด, ทดสอบ deny+allow ผ่าน; (3) Stop hook `remind_changelog.py` เตือนถ้าโค้ด uncommit; (4) CLAUDE.md rule 11 (code-review+security-review ก่อน commit) / 12 (verify หลัง feature) / 13 (ใช้ Explore/Plan agent เองได้); rule 0 (อธิบายง่ายก่อนโยน decision) |
| 2026-07-03 | (dev tool, gitignored) graphify-out/, .claude/settings.json graphify hooks | **Graphify code-map** — knowledge graph ของ codebase (278 ไฟล์, 1811 nodes, 0 token, local tree-sitter); dev tool ล้วน **ไม่อยู่ใน product** (graphify-out/ gitignored, ไม่แตะ backend/frontend/Docker); PreToolUse hooks เตือนให้ query graph ก่อน grep (แก้ python3→python เพราะเครื่องไม่มี python3), post-commit auto-rebuild; ไม่ยัด DB schema (graphify รองรับแค่ postgres ไม่ใช่ MySQL ของเรา) |
| 2026-07-02→03 | Cloudflare WAF (dashboard), n8n charset/deploy fixes | **ปิดเว็บ public ชั่วคราว (dev mode)** — WAF Custom Rule block `http.host eq "bbh-hospital.com"` (เว็บ dashboard) แต่ **เก็บ LINE ไว้ test** (bridge./n8n. tunnel ไม่โดน); Pause ทั้งโดเมนใช้ไม่ได้เพราะจะพัง tunnel; เปิดกลับ = toggle rule off |
| 2026-07-03 | backend/core/config.py, repositories/message_repo.py, frontend/{ChatPane.tsx,ToastProvider.tsx,pages/Patients.tsx} | **Fix chat LINE↔web sync** (commit `97aab6b`) — (1) `message_repo.list_by_patient` `.reverse()` บน tuple → `list()[::-1]` (เดิม 500); (2) `BOT_OPS_DB_CONFIG` เพิ่ม `charset=utf8mb4` (Thai เพี้ยน latin1); (3) n8n import:workflow ไม่ persist → ต้อง SQL patch + import CLI + compose down/up ครบ; (4) Patients page Chat LINE → toggle เป็น ChatPane เต็มหน้า (แทน drawer); (5) toast cap 3 + ปุ่มปิด; (6) n8n compose รวม env → .env.n8n (DIFY_API_KEY ว่างทำ Dify fail) |
| 2026-07-02 | frontend/src/components/patients/PatientChatDrawer.tsx (NEW), SendMessageModal.tsx (DELETED), hooks/{usePatientMessages,usePatientAiMode,useSendPatientMessage}.ts, src/pages/Patients.tsx, src/lib/api-types.ts | **Frontend Chat drawer (LINE-style) + 3-mode toggle** — rewrite SendMessageModal → PatientChatDrawer (fixed right side, max-w 520px, full-height): banner strip 6 states (auto/copilot/silent/paused/after_hours/keyword_handoff) + segmented control Auto/Copilot/Silent + message bubbles (in=grey left, CRO=green right, AI=green-soft right, Copilot draft=sky blue), day-grouped separators (Thai date), auto-scroll to latest, Shift+Enter multiline; hooks: `usePatientMessages` poll 5s + `usePatientAiMode` poll 10s + `useSetPatientAiMode` mutation invalidate on set; useSendPatientMessage now invalidates messages + ai-mode (send auto-pauses 30 min); Patients page button "ส่ง LINE" → "Chat LINE"; build 564.74 kB gz 147.40, lint clean; SendMessageModal removed (orphan) |
| 2026-07-02 | work/build_workflow.py, n8n/workflows/bbh-workflow-live.json (regen), n8n SQLite direct patch (deploy_workflow.py) | **n8n Ask Dify + Reply node — Layer 1 keyword + 3-mode branch** — (1) prepend Layer 1 keyword detection: 14 Thai/English phrases ("คุยกับคน", "ขอเจ้าหน้าที่", "อยากคุยกับคน", "talk to human"...) — if match, force effective_mode='silent' + banner='keyword_handoff'; (2) fetch session includes `effective_mode`/`sticky_mode`/`banner` from bridge; (3) SILENT branch: skip Dify entirely + `pushCroAlert()` to CRO LINE with inbound text + patient uid, no reply to patient; (4) COPILOT branch: call Dify, log answer with `route_prefix='COPILOT_DRAFT:<class>'` to booking_messages via `/internal/message`, push CRO "Copilot draft" with AI's proposed reply — do NOT send to patient; (5) AUTO branch (default + after_hours): current flow + log outbound to `/internal/message` for chat history; (6) removed emoji per no-emoji policy (📅📋✅❌ from booking summary/answer strings); deployed via `python work/deploy_workflow.py` — n8n restart + activated OK |
| 2026-07-02 | backend/{utils/ai_mode.py (NEW), api/{session,ai_mode_api (NEW),patient_message_api,line_webhook}.py, repositories/message_repo.py (NEW), main.py, core/config.py}, .env.example, backend/migrations/0044_bot_ai_mode.sql (NEW) | **Backend AI Takeover — mode API + session response + auto-pause + chat log** — Migration 0044: `bot_sessions` add `ai_mode ENUM('auto','copilot','silent') DEFAULT 'auto'` + `ai_pause_until DATETIME` + `mode_changed_by/at`; new table `bot_mode_events` (audit); config new env: `AI_AUTO_PAUSE_MINUTES=30` + `CRO_BUSINESS_START=09:00` + `CRO_BUSINESS_END=18:00` + `CRO_TIMEZONE=Asia/Bangkok`; new util `compute_effective(ai_mode, ai_pause_until, db_says_paused)` returns `{effective_mode, reason, banner, sticky_mode, pause_until}` — MySQL-side `ai_pause_until > NOW()` comparison passed via `db_says_paused` to avoid tz drift between app container (UTC) and DB (Bangkok); `/internal/session/{ch}/{uid}` returns full mode object; `POST /internal/session/{ch}/{uid}/pause` slide 30-min window via `DATE_ADD(NOW(), INTERVAL n MINUTE)`; `POST /internal/message` (n8n calls after Dify reply) inserts booking_messages; new `/api/patients/{id}/ai-mode` GET+POST (CRO/admin) with audit event insert; `/api/patients/{id}/message` extended: auto-pause AI 30 min + log outbound as `CRO_MANUAL` + return `ai_paused_minutes`; new `/api/patients/{id}/messages` for chat history; `line_webhook.py` logs inbound via `message_repo.log_inbound` best-effort; smoke test PASS (pause round-trip returns effective_mode='silent'/reason='auto_pause'/banner='paused') |
| 2026-07-02 | Dify DB direct (BBH Bot 264edd76 + draft 5ab61b4b llm_cro_decide), scratch/_add_complaint_rule.py | **เพิ่มกฎ ESCALATE:complaint** ก่อน anchor `# Other routing` (708 chars) — cover คำ "บริการห่วย/แย่/ไม่พอใจ/ผิดหวัง", "รอนานเกิน/พนักงานหยาบ/หมอไม่ใส่ใจ", "อยากร้องเรียน/จะไปฟ้อง/รีวิวลง Google", "ขอเงินคืน" (บริบทตำหนิ); แยกจาก personal_data (sentiment vs data access) + medical (ตำหนิบริการ vs ตีความผล); Python patch idempotent (skip ถ้ามี marker แล้ว); ปิด gap ที่ ESCALATE:complaint class มีอยู่ใน format แต่ prompt ไม่ให้เกณฑ์ trigger — Bot จะเดามั่ว |
| 2026-07-02 | Dify DB direct (workflows: BBH Bot 264edd76 + draft 5ab61b4b, Patient Summary 8f10dd4d, BBH Staff f6a7b8c9 + draft e5f6a7b8), scratch/_fix_dify_clinic_wording.sql | **Compliance fix — คลินิก → โรงพยาบาล ใน Dify prompts** — snapshot backup `_workflow_graph_backup_20260702`; targeted REPLACE 3 patterns (`คลินิก Functional Medicine` → `โรงพยาบาล Better Being (Functional Medicine)`, `คลินิกรักษา` → `โรงพยาบาลรักษา`, `ของคลินิก` → `ของโรงพยาบาล`) เก็บ `ทางคลินิก` (clinical adjective, medical vocab) ไม่แตะ; ตรวจ 5 workflows: clinic_remaining == clinical_adj_remaining ทุกตัว → clean; นี่คือ compliance blocker ที่ค้างจาก session 2026-06-25 (แก้ repo แล้วแต่ยังไม่ได้แก้ Dify DB) — Bot ตอนนี้จะเรียกตัวเองว่า "โรงพยาบาล Better Being" แล้ว |
| 2026-07-02 | (design decision) | **AI Takeover Design finalized** — เลือก multi-trigger + 3-mode (Auto/Copilot/Silent) หลัง WebSearch industry (Intercom Fin / Standard Beagle Studio / My AskAI): pure on/off ไม่ practical; Design 4 layers: Layer 0 (Dify intent — มีอยู่แล้ว) + Layer 1 keyword ที่ n8n + Layer 3 mode toggle per-patient + Layer 4 business hours 09:00-18:00 override; config: `AI_AUTO_PAUSE_MINUTES=30`, `CRO_BUSINESS_START=09:00`, `CRO_BUSINESS_END=18:00`; Silent = sticky (industry default ไม่ auto-timeout), Copilot = AI draft + CRO confirm; Notify: badge in web + LINE push CRO group; Phase 1 tasks 2-7 = migration bot_sessions.ai_mode + booking_messages log + n8n branch + Chat UI |
| 2026-07-01 | backend/core/email_templates.py (NEW), backend/core/email_service.py, backend/services/{booking_service,report_service}.py | **Professional email redesign + shared shell + apply to Report notification** — Research philosophy จาก Postmark/Litmus/Enchant/Sender 2026 (transactional email best practices): typography hierarchy 3 levers (size/weight/placement), minimalism with intent, table-based layout (fluid 600px capped), 100% inline CSS (Gmail strips `<link>`), multipart/alternative (text+html for Apple Mail dark mode + spam reputation), healthcare-shaped footer with audit trail; New `email_templates.py` shared module: palette **ยก tokens ตรงจาก tailwind.config.js** `bbh.*` (bbh-green #00a96e, bbh-green-dark #007f5d, bbh-green-soft #e8f7f1, bbh-ink #1f2a24, bbh-muted #706350, bbh-line #dfe8e3, bbh-surface #f7fbf9) — เดิมใช้สีเก่าจาก design doc (clay #8A7B63, jade #16A77C); Font: 'Noto Sans Thai' + 'Noto Serif Thai' นำ Inter/Georgia (ตรงกับ frontend); 5 renderers: `render_html_shell` + `render_text_shell` (paired multipart), `render_stat_split` (comparison card เก่า/ใหม่), `render_kv_section` (key-value list), `render_cta_button` (bulletproof table-wrapped button), `render_steps_section` (numbered list with jade circles); email_service.send_email gained `html`, `from_name` params, sends multipart/alternative when html set, multipart/mixed with alt sub-part when attachment also present, `_from_header` shows "Better Being Hospital <address>" instead of raw gmail; booking reschedule: TBD renders new time in muted (not jade) — reader instantly sees slot not committed; Report notification: KV details + CTA button "เปิดใน BBH Portal" (deep link) + numbered NotebookLM 3-step section, attachment behavior unchanged; 5 preview emails delivered to dr.ai.bbh@gmail.com; commits `8fc9ba2` (booking) + `3574c87` (shared shell + report) |
| 2026-07-01 | frontend/src/pages/Calendar.tsx | Calendar day-detail panel: (1) เพิ่มปุ่ม **"เลื่อนนัด"** บน hover ของ approved booking card (2-col grid: เลื่อน\|ยกเลิก) + Google Calendar event card (3-col grid: เปิดปฏิทิน\|เลื่อน\|ยกเลิก) เปิด RescheduleModal เดียวกับ Bookings page; (2) TBD rescheduled bookings ขึ้นเป็น slate-colored card ในแผงขวาพร้อม "เลื่อนนัด · รอเวลาใหม่" ring badge + "คนไข้ยังไม่ยืนยันเวลา" chip + ปุ่มเขียว "กำหนดวัน-เวลาใหม่" (hover-reveal animation — `lg:group-hover:max-h-16 lg:group-hover:opacity-100` เหมือน card อื่น) เปิด ApproveModal (prefill doctor เดิมจาก preserved assigned_doctor_id); (3) onSuccess invalidate ทั้ง `bookings-all` + `calendar-events` + `rescheduled-marks`; commits `4a01a6a` (button) + `4b4a188` (slate card + re-approve) + `4ac1d6f` (hover-reveal) |
| 2026-07-01 | backend/repositories/booking_repo.py | Fix **TBD marker หายเมื่อ audit old_date เป็น NULL** — LINE bookings เก็บ requested slot เป็น free text อย่างเดียว (`requested_datetime_text = "25/6 11:00"`), `requested_date` DATE column เป็น NULL; ตอน `reschedule_to_pending` capture `old_date` ก็เลย null → repo query คืน `display_date = ""` → Calendar ไม่มี pill; แก้: เพิ่ม `_parse_thai_date_text` (regex `dd/mm(/yyyy)?`) fallback parse `old_text` เมื่อ `old_date` ว่าง, ทั้ง 2 branches (`rescheduled` + `rescheduled_pending`) ใช้ปีของ audit row เป็น fallback; verify กับ live DB: 2 TBD markers surface ถูกที่ 2026-06-19 และ 2026-06-25; commit `21c5da5` |
| 2026-07-01 | backend/{schemas,repositories,services,api}/bookings*.py, backend/repositories/booking_repo.py, frontend/src/hooks/useRescheduledMarks.ts (NEW), frontend/src/lib/api-types.ts, frontend/src/pages/Calendar.tsx | **Gray "เลื่อนนัด" pill บน Calendar day cell** — visual marker สำหรับ booking ที่กำลังอยู่ในสถานะ rescheduled; Backend: `booking_repo.list_rescheduled_in_range()` JOIN latest audit per booking + filter action ∈ (rescheduled, rescheduled_pending) + guard status ต้องตรงกับ audit (TBD → re-approved กรณีจะไม่แสดงผิด); with-time → display บน `requested_date`, TBD → display บน `old_date` จาก audit `detail_json`; `booking_service.list_rescheduled_marks` passthrough; new endpoint `GET /api/bookings/rescheduled?from=YYYY-MM-DD&to=YYYY-MM-DD` (route ใส่ก่อน "" ห้าม collision กับ list); new `RescheduledMark` schema; Frontend: `useRescheduledMarks` hook (staleTime 30s); Calendar day cell มี pill สี slate-200 "N เลื่อนนัด" คู่กับ pill อื่น + legend swatch; reschedule onSuccess invalidate `rescheduled-marks`; commit `ce4bbc4` |
| 2026-07-01 | backend/repositories/booking_repo.py | Fix `calendar_status='pending'` → `'not_created'` ใน `reschedule_to_pending()` — value ที่ใช้เดิมไม่อยู่ใน ENUM (`not_created|pending_event|created|failed|cancelled`) ทำให้ Reschedule TBD flow ตก DataError 1265 เจอจาก E2E test; commit `1558d43` |
| 2026-07-01 | backend/api/bookings_api.py, backend/services/booking_service.py, backend/repositories/booking_repo.py, backend/schemas/bookings.py, frontend/src/components/bookings/{ApproveModal,RescheduleModal}.tsx, frontend/src/hooks/useAssignDoctor.ts (NEW), frontend/src/pages/Bookings.tsx, frontend/src/lib/api-types.ts | **Reschedule TBD + Doctor assign + Email doctor** — (1) `RescheduleRequest.new_start_at` เปลี่ยนเป็น optional; `reschedule_to_pending()` ใหม่ ย้าย approved → pending_approval, ล้าง requested_date/time, calendar_event_id/url, approved_at/by, reminder flags; audit `rescheduled_pending` เก็บ old slot; (2) `reschedule_booking` branch: มีเวลา → เดิม + email doctor, ไม่มีเวลา → cancel calendar + LINE push "รอยืนยัน" + email doctor; (3) `_notify_doctor_reschedule` ใช้ user_repo.find_user_by_id + send_email — subject/body ครบ; (4) fix `reschedule_approved` SELECT ให้ใช้ `_DETAIL_COLUMNS` (เดิมคืน 7 columns ทำให้ BookingOut validation จะ fail); (5) `ApproveRequest.assigned_doctor_id` optional (Web บังคับเลือก, LINE CONFIRM ไม่ต้อง); `update_approved` ใช้ COALESCE preserve doctor เดิม; (6) new `POST /api/bookings/{uid}/assign-doctor` + `AssignDoctorRequest` + validate role='doctor'+is_active + audit `doctor_assigned` เก็บ old/new; (7) frontend `ApproveModal` เพิ่ม dropdown แพทย์ (required), `RescheduleModal` เพิ่ม toggle "ยังไม่กำหนดเวลา", `Bookings` detail panel amber warning + inline picker บน approved-unassigned, new hook `useAssignDoctor`; commit `b41c8fd` — E2E 6/6 pass |
| 2026-07-01 | .env, .env.backup-before-gmail-regen-* | Regen `GMAIL_APP_PASSWORD` ใหม่ (16 char) — ตัวเดิม `pbctbtjdniskotgs` โดน Google auto-revoke ทำให้ทั้ง IMAP (email_poller) และ SMTP (report/reschedule email) fail; SMTP test ผ่าน + email เข้า `dr.ai.bbh@gmail.com` แล้ว; password ไม่ commit (.env gitignored); TODO: user ยัง**ต้อง revoke** password ที่แชร์ในแชท + สร้างใหม่ (best practice) |
| 2026-07-01 | frontend/src/{pages/*.tsx,components/**/*.tsx} | **Design philosophy pass** ครบทั้ง frontend (49+21+28 replacements ใน 21+9+15 ไฟล์) รอบ 1 (hierarchy + 8pt grid): outer shell `rounded-[28px] border shadow-bbh-card` → `rounded-2xl bg-white/70`, page titles `text-2xl md:text-3xl` → `text-3xl md:text-4xl`, section h2 `text-lg` → `text-xl md:text-2xl` font-serif, uppercase tracking 0.16/0.18em → 0.2em; รอบ 2 (refined interactions): interactive card `border` → `ring-1` + `transition-all duration-200 hover:ring-bbh-green/40 hover:shadow-sm` (ไม่มี layout shift ตอน hover), stat grid `gap-4` → `gap-6` (internal ≤ external rule), off-grid padding `p-5/p-7` → `p-6/p-8` (8pt grid — Material Design foundation, ค่าคี่ render เบลอที่ 1.5x density); AdminDashboard specific: MetricCard number `text-4xl` → `text-5xl leading-none tracking-tight` (Stripe 2s rule), helper text progressive disclosure (`opacity-70 group-hover:opacity-100`), active severity filter ใช้ `ring-2 + bg tint` แทน double border+ring; RescheduleModal has TBD toggle; commits `87e7128` + `4999632` |
| 2026-07-01 | frontend/index.html, frontend/public/{bbh-favicon.png (NEW),favicon.svg (DELETED)} | Favicon เดิมเป็นโลโก้ Vite (violet lightning bolt) → เปลี่ยนเป็น `bbh-logo-dashboard.png` (ตัวเดียวกับใน sidebar) + `<link rel="apple-touch-icon">` สำหรับ iOS |
| 2026-07-01 | frontend/src/components/Sidebar.tsx, frontend/src/pages/AdminDashboard.tsx | Fix **view-as query lost on navigation**: Sidebar NavLink `to={item.to}` → `to={withViewAs(item.to)}` — preserve `?as=<role>` เมื่อ admin navigate ระหว่างหน้าใน view-as mode (เดิมกลับ `/patients` ทันที = admin sidebar โผล่แทน CRO items); AdminDashboard: right panel stack ทุก alert ของ severity ที่ filter (แทนที่จะแสดง detail 1 ตัว), empty state สีเขียว "ไม่มี X alert เปิดอยู่" เมื่อกรองแล้วว่าง, Role workspaces grid adaptive (`md:grid-cols-{2 or 3 or 4}` ตามจำนวน visible), aside width tune 380 xl:440 (จากเดิม 420) |
| 2026-07-01 | n8n workflow BBH (SQLite direct patch), work/build_workflow.py | Fix **Google Calendar day/month/year rollover** ใน Handle CRO Postback: line 82 เดิม `pad(parseInt(h)+1)` ทำให้ booking 23:00 ได้ endLocal `T24:00:00` (invalid); ใหม่ compute `startBkkTicks = Date.UTC(...) + 3600000` → `fmtLocal(endBkkTicks)` handle rollover 20/6 23:00→next-day 00:00, 30/6→7/1, 31/12→next year; **พบ n8n 2.x `import:workflow` bug**: reports "Successfully imported" แต่ไม่ persist nodes จริง (`workflow_entity.nodes` ยังเก่า) — ต้อง patch SQLite ตรงๆ: UPDATE workflow_entity.nodes + gen new versionId + insert workflow_history + sync `activeVersionId`/`publishedVersionId`/`workflow_dependency.publishedVersionId`; new versionId `14ba96f1`; verified 8 test cases run in n8n Node runtime — commit `3718b53` |
| 2026-07-01 | backend/core/lifespan.py | ปิด **email_poller ชั่วคราว** (Gmail App Password revoked ตั้งแต่ session ก่อน) — ลบ import + `poller_task` + shutdown cancel line, มี comment ระบุวิธี re-enable หลัง regen password; Reports page ใน Web Dashboard ทดแทนได้ครบ (upload + assign doctor); commit `e8bbd99` |
| 2026-07-01 | Cloudflare Rulesets API (WAF custom rule) | Deploy WAF block `/internal/*` at edge — zone `bbh-hospital.com`, ruleset `85a81bf9`, rule `33812d84`, expression `(http.host eq "bridge.bbh-hospital.com" and starts_with(http.request.uri.path, "/internal/"))` action=block; verify external `/internal/booking/latest-pending` → 403 HTML block page, internal docker n8n→bridge:8000 พร้อม X-Internal-Token ยัง 200 OK; defense-in-depth alongside InternalPathGuard middleware; **TODO**: user ต้อง revoke Cloudflare API token ที่แชร์ในแชท |
| 2026-07-01 | bbh_bot_ops.notifications (DB direct migration) | Apply migration `0032_notifications_hospital_roles.sql` ที่ค้างจาก 2026-06-25 — `notifications.role` ENUM เพิ่ม `nurse`, `lab_staff` (จาก 3 → 5 roles ให้ตรงกับ users.role) — ก่อนหน้านี้ตรวจพบ admin_alert tables 3 ตัว + line_push_log apply บน live MySQL อยู่แล้ว, 6 rules seeded, evaluator ทำงานปกติ (log GET Dify /v1/info ทุก 60s) |
| 2026-06-25 | frontend/src/pages/AdminDashboard.tsx, frontend/src/App.tsx, frontend/src/components/Sidebar.tsx | Add Admin Dashboard thin slice — admin default route now `/admin`; sidebar has Admin item for admin only; new `/admin` page follows CRO visual language but does not duplicate CRO/doctor operational lists; it is an admin control room with access/system/compliance cards, role workspace launchers (`Go as CRO/Doctor/Nurse/Lab`), admin-only task table, desktop detail panel, and mobile detail modal. Data is currently mock/static; backend admin API/evaluator remains next phase. Verified: npm.cmd run build PASS. |
| 2026-06-25 | backend/migrations/0030_admin_alert_tables.sql, 0032_notifications_hospital_roles.sql, backend/schemas/auth.py, frontend/src/{App.tsx,components/Sidebar.tsx,components/Topbar.tsx,components/auth/SignedInPreview.tsx,lib/auth.ts,lib/api-types.ts,pages/Account.tsx} | Continue admin foundation after Claude limit: fix `admin_alerts` active duplicate constraint by adding generated `active_subject_key` + `uq_active_alert` so resolved history can repeat; add `0032_notifications_hospital_roles.sql` so notifications.role matches hospital roles; extend backend/frontend role types to `admin/doctor/cro/nurse/lab_staff`; set nurse default route to Patients and lab_staff default route to Reports; update sidebar/labels/access gates. Verified: `npm.cmd run build` PASS, `python -m compileall backend\schemas backend\api backend\repositories` PASS. Live MySQL admin tables still not applied. |
| 2026-06-25 | backend/api/admin_system.py, main.py, frontend/src/hooks/useSystemHealth.ts, pages/SystemHealth.tsx, App.tsx, lib/api-types.ts | หน้า "สถานะระบบ" (`/system-health`) — replace Placeholder ด้วย live monitoring page; backend `GET /api/admin/system/health` (admin JWT) probe MySQL bot_ops (SELECT 1 + latency), Dify (/v1/info), n8n (/healthz), + report static ของ bridge uptime / LINE main+CRO channel; รวม `db_stats` (patients, active_users, active_doctors, pending_bookings, today_bookings, today_reports, open_alerts) + `recent_activity` (union ของ booking + report + alert event 10 รายการล่าสุดเรียง ts DESC); overall = error ถ้ามี service error, warn ถ้ามี warn, else ok; frontend page ใช้ `useSystemHealth` (refetchInterval 5000) + `refetchIntervalInBackground: false`; UI: ServiceCard grid 3 col (icon + status dot + latency_ms), DB stats grid 7 col, activity table มี kind badge (BOOK/REP/ALRT) + relative time, overall pill มุมขวาบน + refresh button, "ตรวจล่าสุด" timestamp; build+lint PASS (443.82 kB gz 125.47); smoke test direct call: all 6 services OK, MySQL 14ms, Dify 243ms, n8n 685ms |
| 2026-06-25 | backend/migrations/0032_admin_alert_rule_dify_health.sql, backend/jobs/admin_alert_evaluator.py | เพิ่ม rule `bridge_dify_disconnected` (critical/integration/auto_close) — probe `GET {DIFY_API_URL}/info` ทุกรอบ evaluator; module-level counter `_dify_fail_count` กัน false positive จาก network glitch (HTTP 200 หรือ 401 = Dify alive; timeout/connect error = fail); threshold default `consecutive_fails=2` × recheck 60s = ~2 min downtime before alert; auto_close clears alert เมื่อ probe กลับมา 200; E2E test ผ่าน 5/5: healthy→no alert / run1 fail→count=1 no alert / run2 fail→count=2 ALERT critical open / recovery→auto_state_cleared + audit trail opened→resolved |
| 2026-06-25 | frontend/src/components/Topbar.tsx, App.tsx | เพิ่มปุ่ม "← กลับ Admin · ดูในมุม X" บน Topbar ทุก viewport (เห็นชัดกว่า pill ใน Sidebar) — admin ใน view-as mode มี 2 ทางกลับ: Topbar button (desktop+mobile) + Sidebar pill เดิม; build PASS (434.84 kB gz 123.20) |
| 2026-06-25 | frontend/src/lib/aiStore.ts, contexts/AuthProvider.tsx | Per-user AI session isolation — fix bug ที่ user A logout/user B login ใน browser เดิม → user B เห็น chat history ของ A; `aiStore` เปลี่ยน fixed key `bbh_ai_sessions`/`bbh_ai_current` → namespaced `${base}:${userId}` (anon = `:_anon`); เริ่ม snapshot ว่างตอน module load (ไม่ auto-load); เพิ่ม `setOwner(ownerKey)` reload/clear ตาม owner; `AuthProvider` useEffect on user → `setAiOwner(String(user.id))` หรือ null ตอน logout; ผลคือทุก user มี AI history ของตัวเองแยก, admin view-as CRO ยังเห็น history ของ admin เอง (ไม่ใช่ของ CRO จริง — ตามที่ควรเป็นเพราะคุยจาก browser admin); old global key data orphan (ไม่ migrate) |
| 2026-06-25 | frontend/src/App.tsx, components/Sidebar.tsx, pages/AdminDashboard.tsx | Sidebar role isolation + "view as" mode — admin sidebar เห็นเฉพาะ admin items (Admin/AI/ผู้ใช้/สถานะระบบ/บัญชี) ไม่เห็น CRO/doctor/nurse/lab menu items อีก; เมื่อ admin คลิก "Go as X" card บน AdminDashboard → URL เพิ่ม `?as=cro|doctor|nurse|lab_staff` → DashboardLayout `computeViewAs(pathname, asParam, actualRole)` คำนวณ effective role; Sidebar รับ `actualRole`+`viewAs` แสดง "← กลับ Admin · กำลังดูในมุม X" pill ที่หัว nav เมื่อ viewAs active; ADMIN_PATHS = ['/admin','/users','/system-health'] บังคับ admin sidebar; ROLE_OF_PATH fallback /bookings,/calendar=cro, /schedule=doctor (สำหรับ admin ที่พิมพ์ URL ตรงไม่มี ?as=); build + lint PASS (433.84 kB gz 122.98) |
| 2026-06-25 | frontend/src/hooks/{useAdminAlerts,useAdminAlertSummary,useAdminAlertRules,useAcknowledgeAlert,useResolveAlert}.ts, src/pages/AdminDashboard.tsx, src/lib/api-types.ts | Admin Dashboard wired to real backend — (1) regen `api-types.ts` ดึง 9 admin endpoints จาก openapi.json; (2) 5 hooks ตาม pattern (1 resource = 1 file, TanStack Query, no select/placeholderData): `useAdminAlerts(filters)` + `useAdminAlertSummary` + `useAdminAlertRules` (staleTime 5min — definitions static) + `useAcknowledgeAlert` + `useResolveAlert` (mutations invalidate ['admin-alerts'] + ['admin-alert-summary']); (3) rewrite `AdminDashboard.tsx` แทน ADMIN_TASKS mock array ด้วย live data: 4 MetricCard (Critical/Warning/Info/Roles) จาก summary by_severity, alert table จาก useAdminAlerts ครบ filters + states (loading/error/empty/list), side panel `AlertDetail` รับ alert object → แสดง rule description, context (detail_json kv), first/last seen relative time, action forms (Acknowledge: note + snooze hours / Resolve: reason dropdown + note); เก็บ Role workspaces section + Modal mobile bottom-sheet เดิม; ใช้ lucide-react icons (AlertTriangle/Activity/CheckCircle2/RefreshCw/BellRing/Loader2 ฯลฯ) ไม่มี emoji; build PASS (vite 6.4.3, 432.51 kB gz 122.55), lint PASS; AdminDashboard route gate `allow={['admin']}` เดิมของ Codex ใช้ได้ |
| 2026-06-25 | backend/repositories/alert_repo.py, schemas/admin_alerts.py, services/alert_service.py, api/admin_alerts.py, jobs/admin_alert_evaluator.py, main.py, core/lifespan.py | Admin alerts Phase 2 backend — (1) `alert_repo.py` CRUD layer (list_rules, get_alert, list_open_alerts with JOIN rules + severity FIELD ordering, count_by_rule/severity, get_active_alert dedup, insert/touch/ack/reopen/resolve, insert_event, recent_events for dashboard); (2) `admin_alerts.py` schemas (Pydantic v2: RuleOut/AlertOut/AlertSummary/AlertEventOut/AckRequest/ResolveRequest/RuleEnableRequest/RuleThresholdRequest); (3) `alert_service.py` business logic (list/get/summary/recent_events + acknowledge with race-safe rowcount check + resolve + rule management); (4) `api/admin_alerts.py` 9 endpoints (GET list/summary/recent/detail, POST ack/resolve, GET rules, PATCH enabled/threshold) ทั้งหมด `Depends(require_user(['admin']))`; (5) `admin_alert_evaluator.py` cron job (async loop 60s) + 5 evaluator functions (eval_stuck_reports = patient_report_analyses.triage_decision='pending' > 5min, eval_stale_cro_approvals = booking_requests pending > 24h, eval_failed_line_pushes = line_push_log aggregated by channel, eval_unassigned_patients = patients without doctor on any report > 1 day old, eval_disabled_user_sessions = users.is_active=0 + recent last_login_at) + upsert + auto_close + sticky reopen logic; (6) register routers + start evaluator task ใน lifespan; rebuild + verify: all 9 routes return 401 unauth, evaluator runs without exception, 0 alerts (correct — mock DB clean); **ยังไม่ wire frontend** (AdminDashboard.tsx ยังใช้ mock — รอ Codex update มาดึง API จริง) |
| 2026-06-25 | backend/migrations/0029_users_add_nurse_lab_staff.sql, 0030_admin_alert_tables.sql, 0031_admin_alert_rules_seed.sql | Admin dashboard "Action Required" foundation — (1) ขยาย `users.role` ENUM เพิ่ม `nurse`, `lab_staff` (hospital scale, รวม 5 roles); (2) สร้าง 4 ตาราง: `admin_alert_rules` (rule definitions + JSON threshold + ack_policy auto_close/manual/sticky), `admin_alerts` (open/acked instances, UNIQUE `uq_active_alert(rule_key,subject_type,active_subject_key)` กัน duplicate, FK `ack_by`→users.id), `admin_alert_events` (audit trail ทุก transition), `line_push_log` (source data สำหรับ rule `failed_line_push` ซึ่งเดิมไม่มี log); (3) seed 5 rules: `stuck_report` (auto_close, threshold 5min), `cro_approval_stale` (auto_close, 24h), `failed_line_push` (manual, window 60min), `unassigned_patient` (sticky, 60min recheck), `disabled_user_active_session` (manual, security/critical); ทั้งหมดอยู่ใน `bbh_bot_ops` schema เดียว (decision: ไม่แยก schema เพื่อไม่กระทบ patient_reports/patients ที่มีอยู่แล้ว); NOT applied to live MySQL yet; live check returned no admin_alert*/line_push_log tables, and temp-DB SQL validation was skipped because root create/drop was blocked by safety review; **ยังไม่มี code layer** (repository/service/api/evaluator) เป็น Phase ถัดไป |
| 2026-06-24 | tools/backup.py, tools/restore.py, dify_patches/bbh_staff_assistant/{apply.py,workflow_graph.json,system_prompt.md,README.md}, .gitignore | Full-system version control — (1) `tools/backup.py` one-command tar.gz รวม postgres dify+hospital_db dumps, mysql bot_ops dump, dify_app_storage/n8n_data docker volumes, weaviate bind-mount, .env+credentials/+cloudflared token (~130MB); (2) `tools/restore.py` รับ tar.gz path → confirm prompt → restore ทุกอย่าง + print follow-up steps (cloudflared service install + container restart); (3) `dify_patches/bbh_staff_assistant/` source of truth สำหรับ Dify Staff app — prompt/graph แยกไฟล์ (clean diff), `apply.py` idempotent UPSERT (stable UUIDs, ON CONFLICT DO UPDATE); .gitignore whitelist `dify_patches/**/*.md` + ignore `backups/*.tar.gz`; tested: backup 129.5MB ครบ, apply.py re-run ไม่พัง, Dify ยังตอบหลัง re-apply |
| 2026-06-24 | Dify DB direct (apps + app_model_configs + app_dataset_joins + api_tokens + workflows × 2), .env, CLAUDE.md | สร้าง Dify app "BBH Staff Assistant" ผ่าน DB UPSERT — app_id `a1b2c3d4-...`, API key `<redacted>`, 5-node workflow (start → kb → format → llm_staff → answer), KB Library, Gemini Flash via openrouter; debug fixes ระหว่างทาง: required fields enable_site/updated_at, apps.workflow_id ต้องตั้งให้ชี้ published workflow, Python f-string + `\n` inside string literals ใน sandbox code node ใช้ไม่ได้ (ต้อง `chr(10)`); end-to-end test ผ่าน: "Leaky Gut คืออะไร" → ตอบจาก KB พร้อม citation, "นายทำไรได้บ้าง" → free-form ไม่มี AUTO:/ESCALATE: prefix |
| 2026-06-23 | backend/core/config.py, backend/integrations/dify_client.py, backend/repositories/booking_repo.py, backend/services/ai_service.py, .env.example | BBH Staff Assistant backend wiring — เพิ่ม `DIFY_STAFF_API_KEY` ใน config; `dify_client.ask()`/`stream()` รับ `api_key` + `inputs` override; `booking_repo.list_by_date_range(start, end)` คืน approved bookings ในช่วงวัน; `ai_service` rewire ทั้งหมด: ใช้ staff key, ไม่มี role routing, ไม่มี prefix strip, inject schedule context (วันนี้+พรุ่งนี้ bookings+calendar) + patient context ทุก request; รอ user สร้าง Dify app "BBH Staff Assistant" + add DIFY_STAFF_API_KEY ใน .env |
| 2026-06-23 | backend/core/email_service.py, backend/services/report_service.py | เพิ่ม attachment support ใน `send_email()` (MIMEMultipart + base64 encode + 20MB cap); report upload → email หาหมอแนบไฟล์จริงด้วย (PDF/JPG/PNG/TXT); doctor download ไฟล์จาก email ได้ตรง ไม่ต้องเข้า web |
| 2026-06-23 | backend/services/report_service.py, backend/services/.env, .env.example, frontend/src/pages/Patients.tsx | Email มี deep link `{FRONTEND_BASE_URL}/patients?patient=N&report=M`; frontend `useSearchParams` รับ query → auto-select patient+report; เพิ่มปุ่ม "ดาวน์โหลด" (proper filename + save dialog) + "คัดลอกลิงก์" (toast confirm); strip query หลัง consume เพื่อกัน back loop |
| 2026-06-23 | bbh_bot_ops.users (DB), DB direct UPDATE/INSERT | Restructure user roles: `dr.ai.bbh@gmail.com` → role=**doctor** (specialty='General', display_name='Dr. AI BBH') so appears in doctor dropdown; INSERT `folkadmin@gmail.com` → role=**admin** (display_name='Folk Admin', password=<redacted> bcrypt hash); existing 3 logins ยังใช้ได้ + เพิ่ม folkadmin |
| 2026-06-23 | backend/migrations/0026_patient_reports_doctor.sql, 0027_patient_reports_notebooklm.sql | apply migrations ที่ commit 9170328 ค้างไม่ได้รัน — เพิ่ม `assigned_doctor_id` (FK users) + `notebooklm_url` ใน `patient_reports` |
| 2026-06-22 | backend/main.py CORS, Windows Firewall | LAN dev setup: CORS regex รองรับ 192.168/10/172.16-31; Windows Firewall rule "BBH Bridge LAN (8000)" inbound TCP 8000 จาก 172.25.0.0/16; LAN IP เครื่อง office ปัจจุบัน = 172.25.20.189 (DHCP เปลี่ยนเองได้); Wi-Fi BBH-OPD |
| 2026-06-22 | start.bat, stop.bat (NEW) | 7-step launcher: Docker → Dify → nginx restart → Bot Ops MySQL → Bridge → n8n → Frontend Vite (`npm run dev` ใน window แยก) + auto-open browser; stop.bat tears down ตามลำดับ; Cloudflare Tunnel เป็น Windows Service ไม่แตะ |
| 2026-06-22 | backend/api/ai.py, backend/services/ai_service.py, backend/integrations/dify_client.py, frontend/src/hooks/useAiChat.ts | AI streaming + total counts + prefix strip — POST /api/ai/chat/stream ส่ง text/event-stream; backend buffer 80 chars แรกแล้ว strip CRO prefix (AUTO:/ESCALATE:/etc) ก่อน yield delta; context block เพิ่ม total bookings/reports count; frontend ใช้ fetch+ReadableStream parse SSE, assistant bubble โผล่ตอน delta แรก (ไม่มี empty bubble แล้ว); perceived latency ดีขึ้นมาก |
| 2026-06-22 | frontend/src/App.tsx, Sidebar.tsx, Topbar.tsx, Modal.tsx, AuthCard.tsx, ApproveModal/RejectModal/NewBookingModal/PatientFormModal/ReportUploadModal.tsx, pages/Account.tsx, AiAssistant.tsx, Bookings.tsx, Calendar.tsx, Patients.tsx | Responsive + sidebar collapse + lucide nav icons — drawer <lg, static lg, collapse w-20↔w-64 (persist localStorage); NavLink ใช้ lucide icons จริงไม่ใช่อักษรไทยตัวแรก; modals = bottom-sheet <md, centered ≥md |
| 2026-06-22 | frontend/src/hooks/useAiSessions.ts, components/ai/AiSessionsList.tsx, PatientPickerModal.tsx, pages/AiAssistant.tsx | AI multi-session history + per-session pinned patient — localStorage `bbh_ai_sessions` + `bbh_ai_current`; ChatGPT-style sidebar (create/switch/delete); patient picker per session (search ผ่าน `usePatients`); pin → backend inject context |
| 2026-06-22 | backend/api/auth.py, services/auth_service.py, repositories/user_repo.py, core/security.py, schemas/auth.py | Account page + Full auth — POST /auth/change-password (verify old → bcrypt new → audit), GET /auth/audit-logs (own user), MeResponse.last_login_at; frontend pages/Account.tsx (profile + change password + 15-row activity log) |
| 2026-06-21 | backend/api/booking.py | n8n approve booking ผ่าน booking_repo.update_approved → auto-link patient + assign HN เหมือน /api/bookings/{uid}/approve; response มี patient_id + hn |
| 2026-06-21 | backend/migrations/0024 + 0025, backend/api/{patients_api,reports_api}, backend/services/{patient_service,report_service}, backend/repositories/{patient_repo,report_repo}, backend/schemas/{patients,reports}, backend/utils/pagination + 10 frontend hooks + 4 components + pages/Patients.tsx | Phase MVP — Patients + Reports + AI Analyze; layered structure (api → service → repo); upload PDF/TXT/JPG/PNG ≤10MB; pypdf extract; assign doctor (Codex commit 9170328); NotebookLM URL paste-back; Dify analyze with triage classification |
| 2026-06-20 | backend/api/bookings_api.py (NEW) + repositories/booking_repo.py + services/booking_service.py + schemas/bookings.py + utils/pagination.py | Phase 2 CRO Bookings API — JWT-protected `/api/bookings*` (list+search+pagination, detail, approve, reject, cancel); race-safe via SELECT FOR UPDATE + status guard; Google Calendar integration; LINE push patient on approve/reject/cancel |
| 2026-06-19 | frontend/src/components/* (Sidebar/Topbar/ProtectedRoute/StatusBadge/SourceBadge/Modal/ApproveModal/RejectModal/NewBookingModal/PatientForm/PatientTimeline/AnalysisPanel/ReportUploadModal) + lucide-react@1.21.0 + queryClient + ToastProvider + 10 TanStack Query hooks + pages/Bookings.tsx + Calendar.tsx + AiAssistant.tsx + Patients.tsx + Account.tsx | Phase 2 Web Dashboard ครบ 4 หน้าหลัก + Auth flow + React Router v7 + State Management (TanStack Query) + No-emoji policy (lucide icons only) |
| 2026-06-19 | frontend/package.json, frontend/CLAUDE.md, frontend/src/components/Modal.tsx, frontend/src/pages/Bookings.tsx | กฎใหม่: ห้ามใช้ emoji ใน Web UI เด็ดขาด ต้อง import icon component จาก library; install `lucide-react@1.21.0` (tree-shake friendly); แทน emoji 5 จุด (Modal `✕`, Bookings `✅`/`❌` approve/reject, pagination `←`/`→`) ด้วย `<X/>`/`<Check/>`/`<ChevronLeft/>`/`<ChevronRight/>`; เพิ่มกฎใน `frontend/CLAUDE.md` section ❌ Don't; memory: `feedback_no_emoji_in_ui` |
| 2026-06-19 | frontend/src/hooks/* (5 NEW), frontend/src/components/* (8 NEW), frontend/src/contexts/ToastProvider.tsx (NEW) + toast-context.ts (NEW), frontend/src/pages/Bookings.tsx (NEW), frontend/src/App.tsx | Phase 2 CRO Bookings inbox page — hooks useBookings/useBooking/useApproveBooking/useRejectBooking/useToast (TanStack Query standard pattern, 1 hook = 1 file); components Sidebar (role-based nav) + Topbar (user chip + logout) + ProtectedRoute (`allow=Role[]` gate + 403 page) + StatusBadge + SourceBadge + Modal base + ApproveModal (datetime-local input → ISO+07:00) + RejectModal (textarea reason); ToastProvider + useToast hook (split per fast-refresh lint rule); App.tsx rewire เป็น Shell→Dashboard switch + role-based default page; build + lint PASS; Codex Playwright test 5/5 PASS (Network 4 calls 200, sidebar/list/detail/filter visible, screenshots saved) |
| 2026-06-19 | backend/schemas/bookings.py (NEW), backend/repositories/booking_repo.py (NEW), backend/utils/pagination.py (NEW), backend/services/booking_service.py (NEW), backend/api/bookings_api.py (NEW), backend/main.py, frontend/src/lib/api-types.ts | Phase 2 CRO Portal backend — เพิ่ม JWT-protected `/api/bookings*` 4 endpoints (list w/ filter+pagination, detail, approve, reject) ผ่าน layered structure (schemas/repositories/services/utils/api); approve = parse `start_at` ISO (Asia/Bangkok) → `calendar_client.check_availability` → `book_event` → atomic UPDATE (`AND status='pending_approval'`) → ถ้า UPDATE 0 rows ตัด race → `cancel_event` + 409; LINE push patient ผ่าน `line_client.push(ch=PRIMARY)` ห่อ try/except; auth = `Depends(require_user(['cro','admin']))`; rebuild image + recreate container; smoke test: unauth 401, folkcro JWT list 3 pending PASS; regenerate frontend `api-types.ts` + build PASS |
| 2026-06-19 | frontend/src/App.tsx, frontend/src/lib/queryClient.ts (NEW), frontend/src/routes/Login.tsx, frontend/src/lib/mock-auth.ts (DELETED), frontend/package.json, frontend/CLAUDE.md | Phase 2 Auth E2E ผ่าน + ติดตั้ง TanStack Query — (1) `npm i @tanstack/react-query@^5.101 @tanstack/react-query-devtools`; (2) `lib/queryClient.ts` singleton (staleTime 30s, retry 1, no refetchOnFocus); (3) `App.tsx` wrap `<QueryClientProvider>` + DEV `<ReactQueryDevtools>`; (4) ลบ `lib/mock-auth.ts` (dead — `roleDestinations` อยู่ใน `SignedInPreview.tsx`); (5) `Login.tsx` ลบ default email `folkcro@gmail.com` ออกจาก `useState` → empty (placeholder `name@bbh-hospital.com` แสดงแทน); (6) เพิ่ม section "State Management" + กฎ TanStack Query ใน `frontend/CLAUDE.md` (memory: `feedback_tanstack_query_guardrails`); E2E browser test ผ่าน 5/5 (login fail 401 + Thai error, login success + token, F5 รักษา session ผ่าน `/auth/me`, logout + clear token, Devtools icon visible) |
| 2026-06-19 | bbh_bot_ops.users (DB) | Reset password ของ 3 test users (`dr.ai.bbh@gmail.com`, `folkdoctor@gmail.com`, `folkcro@gmail.com`) เป็น `<redacted>` สำหรับ E2E test — gen bcrypt cost=12 ผ่าน `docker exec hospital-bridge python -c` แล้ว UPDATE ตรง (inline, ไม่ทิ้ง script); display_name เพี้ยน (`ฤ�Admin` / `??Admin`) เป็น UTF-8 encoding issue ตอน seed ครั้งแรก ยังไม่แก้ |
| 2026-06-16 | (no code change) | Manual fix: nginx ของ Dify (`docker-nginx-1`) cache IP เก่าของ `api` container — เมื่อ docker assign IP ใหม่ให้ `docker-api-1` (172.19.0.3) แต่ nginx worker ยังต่อ 172.19.0.7 → 502 Bad Gateway → n8n Ask Dify + Reply ตก catch → ตอบ default fallback "ระบบไม่พร้อม"; workaround: `docker restart docker-nginx-1`; long-term fix: เพิ่ม `resolver 127.0.0.11 valid=10s;` ใน nginx config ของ Dify (`/v1` location) — แต่ตอนนี้ยังไม่แก้เพราะเป็นของ Dify project |
| 2026-06-16 | (manual ops) | ลบ test users (`Ucro-*`, `Utest-*`) จาก `bot_sessions` หลังรัน `_test_t12_t13.py` เพราะ test sessions ค้างทำให้ `cro-user/latest` คืน fake user → CRO push silently fail (ก่อนจะมี REGEXP filter ใน Changelog ข้างบน) |
| 2026-06-17 | dify_patches/patch_general_symptoms.py (NEW), Dify BBH Bot CRO Decide prompt (draft + published) | Fix general-symptom routing — user รายงานว่าถาม "ปวดหัว"/"ตัวร้อน" Bot ตอบ ESCALATE:medical ("รอเจ้าหน้าที่ติดต่อ") แทนที่จะให้คำแนะนำเบื้องต้นจาก KB; เพิ่ม rule ใน `ROUTING FIXES` section ของ prompt: "ถ้าถามอาการทั่วไปแบบกว้างๆ ที่ไม่ใช่ฉุกเฉิน (ปวดหัว/ตัวร้อน/เป็นไข้/ปวดท้องนิดหน่อย/ปวดเมื่อย/นอนไม่หลับ/เครียด/คัดจมูก/ไอ) → CONSULT: ตอบจาก KB + วิธีดูแลตัวเอง + สัญญาณเตือนที่ควรพบแพทย์ + disclaimer"; ESCALATE:medical สงวนเฉพาะกรณีขอวินิจฉัยส่วนตัวอย่างชัดเจน (ฉันเป็น cancer ใช่ไหม, ต้องกินยาอะไร); test pass — "ปวดหัวต้องทำยังไง" → CONSULT, "Leaky Gut คืออะไร" → CONSULT, "ฉันเป็นมะเร็งใช่ไหม" → ESCALATE:medical |
| 2026-06-17 | _legacy/ (NEW), root | Cleanup root files — ย้าย `reset_nipa.py`, `test_fixes.py`, `test_pipeline.py`, `update_dify_flow.py`, `hospital_db_backup.sql`, `setup_guide.md`, `Setup.md`, `setup.bat/ps1`, `start.bat` ไป `_legacy/` (ส่วนใหญ่ untracked ใช้ `mv` ปกติ + `git mv start.bat`); root เหลือเฉพาะ markdown หลัก + `bbh.ico` + `docker-compose.bridge.yaml`; เพิ่ม `_legacy/README.md` ระบุห้าม import |
| 2026-06-17 | frontend/package.json, tsconfig.app.json, tsconfig.node.json | Fix Codex-hallucinated package versions — downgrade React 19.2.6→19.0, Vite 8→6.0, TypeScript 6→5.7, ESLint 10→9.17, @vitejs/plugin-react 6→4.3, @types/node 24→22, eslint-plugin-react-hooks 7→5; ลบ `erasableSyntaxOnly` (TS 5.8+ option ไม่มีใน 5.7) ออกจาก tsconfig.app.json + tsconfig.node.json; `npm install` + `npm run build` ผ่าน (Vite 6.4.3) |
| 2026-06-17 | backend/ (NEW from restructure), docker-compose.bridge.yaml | Restructure: รวม Python backend ทั้งหมด (`api/`, `core/`, `flows/`, `integrations/`, `jobs/`, `migrations/`, `ops/`, `tests/`, `main.py`, `requirements.txt`, `Dockerfile`) เข้า `backend/` folder เดียว; `docker-compose.bridge.yaml` ตั้ง `context: ./backend`; imports ไม่เปลี่ยน (uvicorn รันใน `cwd=/app` ใน container resolve ได้); Codex ทำ restructure ตาม prompt ใน `plans/joyful-tumbling-koala.md` |
| 2026-06-16 | work/deploy_workflow.py (NEW), api/booking.py | (1) Add `work/deploy_workflow.py` — รวม build → import → patch SQLite (`workflow_published_version` + `workflow_dependency.publishedVersionId`) → restart → wait healthz → verify activation ในคำสั่งเดียว เพราะ `n8n publish:workflow` CLI ของ 2.23 รายงานว่า publish สำเร็จ แต่ไม่ update `workflow_published_version` row จริง ต้อง patch SQLite ตามเสมอ; (2) Fix `GET /internal/booking/cro-user/latest` — เพิ่ม `REGEXP '^U[0-9a-f]{32}$'` กรอง test users (Ucro-*, Utest-*) ออก ไม่งั้นถ้ารัน test ค้าง booking ใหม่จะ push ไปหา fake user แล้ว LINE silently fail |
| 2026-06-16 | work/build_workflow.py, n8n/workflows/bbh-workflow-live.json | Fix Google Calendar timezone — event แสดงเป็น UTC (4 AM) แทน Bangkok (11 AM) เพราะ `CRO_POSTBACK_PREP_CODE` ส่ง `startISO` เป็น UTC ISO (`...Z`) ให้ Create Calendar Event แม้จะตั้ง `timeZone:'Asia/Bangkok'` ก็ตาม Google ตีความเป็น UTC moment; fix: เพิ่ม `startLocal`/`endLocal` (เป็น `YYYY-MM-DDTHH:MM:SS` ไม่มี Z) ใช้กับ event creation, เก็บ `startISO`/`endISO` (UTC) ไว้สำหรับ Check Calendar conflict query เท่านั้น |
| 2026-06-16 | work/build_workflow.py, tests/test_line_features.py, n8n/workflows/bbh-workflow-live.json | T12/T13 PASS — (1) wrap LINE API calls (reply + push) ใน try/catch ใน 3 nodes (`Reject Handler`, `Conflict Reply`, `Approve + Notify`) เพื่อกัน 400 จาก invalid reply_token ทำให้ workflow crash แล้ว Approve ไม่ทันเรียก; (2) เปลี่ยน T13 test date จาก `timedelta(days=180)` (ชน event จริงใน calendar 13/12/2026) → fixed `2030-01-15` (slot ว่างแน่นอน); (3) ใช้ `n8n publish:workflow --id=...` แทนการ patch SQLite ตรงๆ — n8n CLI 2.x มีคำสั่งนี้ที่ update workflow_published_version + workflow_dependency.publishedVersionId ครบถ้วน ไม่ทำให้ activation runtime ค้าง (วิธี patch SQLite ตรงๆ ที่ทำใน Changelog ก่อนหน้าทำให้ workflow ไม่ activate จริง — "Processed 0 published workflows") |
| 2026-06-16 | api/booking.py | เพิ่ม `GET /internal/booking/latest-pending` — returns latest `pending_approval` booking สำหรับ CRO text command lookup; route ต้องอยู่ก่อน `/{request_uid}` เพื่อป้องกัน FastAPI match "latest-pending" เป็น path param |
| 2026-06-16 | work/build_workflow.py, n8n/workflows/bbh-workflow-live.json | เพิ่ม `CRO Text Command` node (n14) — รองรับ CRO พิมพ์ "ยืนยัน/confirm/ok/ตกลง/ใช่/รับ" หรือ "ไม่รับ/ปฏิเสธ/reject/cancel" แทนกดปุ่ม quick reply (สำหรับ CRO ใช้คอม); node fetch `/internal/booking/latest-pending` แล้ว synthesize `CONFIRM:{uid}` หรือ `REJECT:{uid}` ส่งต่อ Handle CRO Postback |
| 2026-06-16 | work/build_workflow.py, n8n/workflows/bbh-workflow-live.json | Fix Google Calendar — แตก monolithic `Handle CRO Postback` ออกเป็น 9 nodes: Prep → Route Action → [Reject Handler | Check Calendar (HTTP Request+OAuth) → Process Conflicts → Route Conflicts → [Conflict Reply | Create Calendar Event (HTTP Request+OAuth) → Approve + Notify]]; ใช้ n8n HTTP Request node ที่ตั้ง `predefinedCredentialType: googleCalendarOAuth2Api` แทน `getCredentials()` ใน Code node — n8n จัดการ OAuth token refresh เองอัตโนมัติ; patch SQLite DB โดยตรง (insert workflow_history + update workflow_entity + workflow_published_version) เพราะ `n8n import:workflow` CLI ไม่ update published version ใน n8n 2.x |
| 2026-06-15 | n8n/workflows/bbh-workflow-live.json (Ask Dify+Reply node) | T04 fix: เพิ่ม date validation ใน BOOKING_DONE handler — ถ้า date field ไม่ match `\d{1,2}/\d{1,2}` (เช่น "วันเสาร์") ให้ตอบขอวันที่ใหม่แทน save booking; Gemini Flash ไม่ enforce dd/mm ใน output แม้ prompt จะบอก — fix ที่ n8n layer แทน |
| 2026-06-15 | Dify BBH Bot CRO Decide prompt (draft + published) | T04 fix v2: เพิ่ม invalid date examples (❌เสาร์/วันเสาร์ ✅21/6) ใต้ ข้อบังคับ date; T10 fix v2: เพิ่ม CONSULT routing rule ใน ROUTING FIXES section สำหรับคำถาม omega-3/Leaky Gut/FM supplement |
| 2026-06-15 | Dify BBH Bot CRO Decide prompt (draft + published), n8n/workflows/bbh-workflow-live.json | เพิ่ม `CONSULT:` prefix สำหรับคำถามความรู้เรื่องโรค/อาการ/ยาทั่วไปที่ตอบจาก KB ได้ (แยกออกจาก `ESCALATE:medical` ซึ่งใช้เฉพาะถามวินิจฉัยส่วนตัว); เพิ่มรองรับ CONSULT: ใน n8n Ask Dify+Reply node; แก้ LINE #1 webhook responseMode จาก `lastNode` → `onReceived` เพื่อ return 200 ทันที (ไม่รอ Dify) ป้องกัน LINE 5s timeout |
| 2026-06-15 | api/booking.py, api/session.py (dify_conversation_id optional), main.py | เพิ่ม booking lifecycle API: `POST /internal/booking` (create, return request_uid), `GET /internal/booking/cro-user/latest`, `GET /internal/booking/{uid}`, `POST /internal/booking/{uid}/approve` (store calendar_event_id/url), `POST /internal/booking/{uid}/reject`; session.py ทำ dify_conversation_id optional (สำหรับ CRO user tracking ที่ไม่มี conv_id); ลงทะเบียน booking router ใน main.py |
| 2026-06-15 | n8n/workflows/bbh-workflow-live.json (booking + calendar feature) | เพิ่ม full Google Calendar booking flow: (1) Ask Dify+Reply node ตรวจ BOOKING_DONE → save to bridge → get CRO user_id → push CRO LINE message พร้อม quick reply [✅ ยืนยัน] / [❌ ไม่รับ]; (2) node n11 Track CRO User — บันทึก CRO user_id ลง bot_sessions ทุกครั้ง; (3) node n12 Is CRO Postback? — IF branch event_type==postback; (4) node n13 Handle CRO Postback — CONFIRM path: parse dd/mm date → Google Calendar check conflicts → ถ้าไม่ว่าง push CRO + alternative slots 3 วัน, ถ้าว่าง create event + approve bridge + push patient confirmation; REJECT path: reject bridge + push patient apology; Dify CRO Decide prompt patched: ต้องการ dd/mm format เสมอ; workflow import + activate สำเร็จ |
| 2026-06-15 | n8n/workflows/bbh-workflow-live.json (fetch shim) | Fix Thai UTF-8 corruption ใน n8n Code node — เปลี่ยน fetch shim จาก `JSON.parse(body) + json:true` (ทำให้ n8n re-serialize แล้ว Thai เป็น `?`) เป็น raw string body + `json:false` แทน; root cause พบจาก debug early-return (Thai text ถึง Code node เป็น `?` เพราะ Windows curl encoding ไม่ใช่ n8n bug — แก้โดย test ผ่าน Docker container แทน); Thai emergency "เจ็บหน้าอกมาก หายใจไม่ออก" → "Emergency symptoms detected. Please call 1669" ผ่านแล้ว; full test suite A-D ผ่านทุก case |
| 2026-06-15 | bot_sessions (MySQL) | ลบ test sessions ทั้งหมด (Utest-*, Ut-*) หลัง full test suite ผ่าน |
| 2026-06-15 | n8n BBH workflow, n8n SQLite | Fix webhook ไม่ register — revert responseMode กลับ onReceived; เพิ่ม process.env fallback สำหรับ DIFY_API_KEY/URL และ BRIDGE vars ใน Code node เพราะ $vars ไม่ return ค่าใน runtime; import + activate workflow ผ่าน n8n CLI + SQLite |
| 2026-06-15 | n8n/credentials/bot-ops-mysql.json | สร้าง MySQL credentials สำหรับ n8n (ไม่ถูก commit เพราะ credentials/ อยู่ใน .gitignore แล้ว) |
| 2026-06-15 | bot_sessions (MySQL) | ลบ test rows (external_user_id LIKE 'test%' / 'Utest%') ที่สร้างระหว่าง test session endpoint |
| 2026-06-15 | api/session.py, main.py, core/config.py, requirements.txt, .env, n8n BBH workflow | Multi-turn conversation_id: เพิ่ม `GET/POST /internal/session/{channel}/{user_id}` บน bridge (pymysql → Bot Ops MySQL `bot_sessions`); เพิ่ม `BOT_OPS_DB_*` config; n8n "Ask Dify + Reply" node อ่าน conv_id ก่อนส่ง Dify แล้ว upsert กลับหลังได้ผล — Dify จำ context ข้ามข้อความได้แล้ว |
| 2026-06-15 | n8n BBH workflow (Ask Dify + Reply node) | เปลี่ยน prefix detection เป็น case-insensitive regex (`/^AUTO:/i`, `/^BOOKING_ASK:/i` ฯลฯ) — ป้องกัน Dify ส่ง mixed-case กลับมาแล้วคำว่า AUTO/BOOKING_ASK หลุดออกไปให้คนไข้เห็น; import workflow ผ่าน n8n CLI |
| 2026-06-15 | api/line_webhook.py | ปิด DR/PT login system — ลบ `_handle_doctor_registration`, `_handle_patient_registration`, doctor/patient routing ออกทั้งหมด; ทุกข้อความจาก LINE Main Bot วิ่งไป n8n → fallback Dify CRO แทน |
| 2026-06-15 | CLAUDE.md | ลบ "Current Planning Source" และ "Current Plan / Phase Log" sections ออก — redundant กับ docs/BBH_SYSTEM_PLAN.md |
| 2026-06-15 | .env, docker-compose.bridge.yaml | เปลี่ยน tunnel bridge จาก ngrok → Cloudflare Tunnel: ลบ `NGROK_AUTHTOKEN` ออก, เปลี่ยน `NGROK_PUBLIC_URL` เป็น `https://bridge.bbh-hospital.com`; cloudflared รันเป็น Windows Service อยู่แล้ว tunnel `bbh-hospital` Healthy ตลอด; อัปเดต LINE Developers Console webhook URL ให้ชี้มาที่ URL ใหม่ |
| 2026-06-12 | start.bat | Rewrite unified launcher รวม start.bat + n8n/start-n8n.bat เป็นไฟล์เดียว 7 ขั้นตอน: Docker → Dify (wait 401) → nginx restart → Bridge (--build เฉพาะครั้งแรก image ไม่มี) → Bot Ops DB MySQL → n8n (--force-recreate --remove-orphans) → summary + open browser. ลบ ngrok ออก, ใช้ Cloudflare Tunnel, ใช้ ping wait แทน timeout, health endpoint bridge ใช้ `/` แทน `/health`. Test ผ่าน 7/7 steps. |
| 2026-06-12 | n8n/docker-compose.n8n.yaml, n8n/.env.n8n, n8n/.env.n8n.example, n8n/mysql/init/001_bot_ops_schema.sql, n8n/BOT_OPS_DB.md, n8n/start-n8n.bat | Added Bot Ops MySQL database for real booking/session state separate from hospital MySQL and n8n SQLite. Created tables `bot_sessions`, `booking_requests`, `booking_messages`, `booking_audit_logs`; started `hospital-bot-ops-db`; verified schema; recreated n8n with Bot Ops DB env; updated start-n8n to launch DB before n8n. |
| 2026-06-12 | Dify BBH Bot graph, docs/BBH_SYSTEM_PLAN.md | Added deterministic `if_else_cost_consult` gate after Personal Data Gate to distinguish treatment-cost questions from consult-fee questions. Graph is now 17 nodes / 16 edges. Verified through n8n 10/10: treatment cost answers say costs depend on symptoms/doctor assessment; 2,300 THB is consult fee, not total treatment cost. No permanent patch/test script was added. |
| 2026-06-12 | CLAUDE.md | Added working rule to avoid leaving one-off patch/test/inspect scripts in the project; temporary work should use inline/stdin/temp outside repo unless the user explicitly asks for a reusable permanent script. |
| 2026-06-12 | Dify BBH Bot (published + draft workflow), work/patch_llm_cro_rules_v2.py | Added 2 routing rules to `llm_cro_decide` prompt: (1) day/time availability questions ("วันศุกร์ว่างไหม", "อาทิตย์หน้าว่างไหม") → BOOKING_ASK; (2) general clinic scope questions ("รักษาโรคอะไรได้บ้าง") → AUTO. Verified 8/8: 2 fixes + 6 regression PASS. |
| 2026-06-12 | Dify BBH Bot (published + draft workflow), work/patch_personal_data_gate_utf8.py | Fixed encoding corruption in `if_else_personal_data` node — Thai keywords were stored as `?` (ASCII literal) making the personal data gate non-functional for Thai queries. Re-ran patch script inside `hospital-bridge` container with correct UTF-8 psycopg2 connection. Verified 6/6 test cases: เลข HN / HN ของฉัน / ประวัติการรักษา / ผลแล็บออก all → ESCALATE:personal_data; walk-in / ราคา still → AUTO from FAQ. |
| 2026-06-12 | docs/BBH_SYSTEM_PLAN.md | Recorded Main Bot 100-question n8n test result: 100 webhooks sent, 95 Dify responses comparable, 64 pass, 14 mismatch, 17 blank answers, 5 missing. Removed mistakenly-created static 100-test markdown file. |
| 2026-06-12 | Dify BBH Bot workflow | Updated `llm_cro_decide` prompt in both published and draft workflows with FAQ overrides/facts so price, foreign insurance, and file-attachment questions can return `AUTO` from FAQ instead of forced `ESCALATE`; graph remains 12 nodes / 11 edges. Verified through n8n webhook: all 3 cases returned `AUTO`. |
| 2026-06-12 | Dify Dataset, docs/BBH_SYSTEM_PLAN.md, ERRORS.md | Uploaded `docs/BBH_MAIN_BOT_FAQ.md` to BBH Bot KB and verified indexing completed; initial n8n webhook test showed `walk in ได้ไหม` returned AUTO from FAQ while pricing/insurance/file attachment still routed to ESCALATE before the later prompt-routing fix. |
| 2026-06-12 | CLAUDE.md, docs/BBH_SYSTEM_PLAN.md | ย้ายแผนงานระบบใหม่และ Phase Log ออกจาก CLAUDE.md ไปใช้ `docs/BBH_SYSTEM_PLAN.md` เป็น source of truth; CLAUDE.md เหลือกติกา/สถานะเดิม/session notes/changelog |
| 2026-06-09 | n8n/workflows/ops-health-alert.starter.json | Replaced monitor-only workflow with main n8n orchestration workflow `BBH`: manual sample + webhook intake, normalize, Gmail report route, AI routing placeholder, decision parser, AUTO/BOOKING/manual review outputs, and execution log terminal. Workflow imported into local n8n and kept inactive; no LINE/Gmail production side effects. |
| 2026-06-09 | n8n monitor workflow, api/health.py, core/config.py | Added read-only internal monitor endpoint `GET /internal/health/full` protected by `X-Internal-Token`; checks bridge, DB report counts/stale analyzing reports, Dify `/info`, and ngrok state. Updated n8n monitor workflow to call this endpoint and summarize overall health. Imported workflow into local n8n as `Hospital Ops Health Monitor`. No Dify app/KB changes. |
| 2026-06-09 | n8n branch scaffold | Created `feature/n8n-automation-layer`; added optional n8n compose (`n8n/docker-compose.n8n.yaml`), n8n-only env template (`n8n/.env.n8n.example`), workflow starter exports (`gmail-report-intake`, `ops-health-alert`, `manual-review-queue`), n8n README, and `.env.example` variables for n8n/basic auth/internal bridge token. No FastAPI/Dify runtime behavior changed. |
| 2026-05-28 | main.py:471 | แก้ bug routing — เปลี่ยนจากเช็ค RPT pattern มาเช็ค `_is_doctor(user_id)` เพื่อให้แพทย์ส่งข้อความอะไรก็เข้า doctor flow เสมอ |
| 2026-05-28 | main.py, DB | แก้ wasted LLM call — เพิ่ม `patient_text` ใน reports table, ลบ `_ask_dify` ออกจาก patient flow, Doctor trigger เป็นจุดเดียวที่เรียก Dify |
| 2026-05-28 | CLAUDE.md, ERRORS.md | แก้ข้อมูลเท็จจาก session ก่อน — ลบ entry เท็จ "เปลี่ยน Chatbot → Workflow แล้ว" ออก, แก้ Bug 1 ใน ERRORS.md กลับเป็น ⏳, เพิ่มกฎ rule 6-7 ห้าม mark ✅ โดยไม่ได้แก้จริง |
| 2026-05-28 | Dify graph (DB) | เปลี่ยน welcome trigger จาก dialogue_count=1 เป็น query=="__welcome__" เพิ่ม if_else_welcome + answer_welcome (text อยู่ใน Dify) |
| 2026-06-04 | CLAUDE.md | เพิ่ม Roadmap section — ทิศทางใหม่ 3 Phase: Phase 1 AI Triage / Phase 2 NotebookLM integration / Phase 3 Unified Inbox + business context (Functional Medicine clinic, manual flow ของ counter+แพทย์) |
| 2026-06-05 | CLAUDE.md | Renumber phases — Phase 1 CRO Assistant (สัปดาห์นี้) / Phase 2 AI Triage (สัปดาห์หน้า) / Phase 3 NotebookLM / Phase 4 Unified Inbox |
| 2026-06-05 | Dockerfile, .dockerignore, docker-compose.bridge.yaml | สร้างไฟล์สำหรับ Option B — wrap bridge เป็น container hospital-bridge (python:3.12-slim + uvicorn) + ngrok เป็น container hospital-ngrok (image ngrok/ngrok), join external network docker_default ของ Dify |
| 2026-06-05 | main.py, requirements.txt, .env | เอา pyngrok ออก (lifespan ลบ ngrok.connect/disconnect) → อ่าน NGROK_PUBLIC_URL จาก env แทน; เพิ่ม NGROK_AUTHTOKEN + NGROK_PUBLIC_URL ใน .env |
| 2026-06-05 | start.bat | Rewrite — เลิก start Python host process + taskkill ngrok, ใช้ docker compose -f docker-compose.bridge.yaml up แทน; เพิ่ม docker restart docker-nginx-1 หลัง bridge up เพื่อ fix IP shuffle bug (502 issue บันทึก ERRORS.md) |
| 2026-06-05 | filesystem | ลบ `$staging` folder recursive ที่ทำให้ Docker build error file name too long (artifact จาก setup.ps1 เก่า) ผ่าน .NET Directory.Delete กับ long-path prefix |
| 2026-06-05 | Setup.md | เขียน install guide สำหรับเครื่องใหม่ — 2 ทาง (A=ลงจาก backup 30-45 นาที / B=ลงสด 3-5 ชม.) + Prerequisites + .env checklist 12 vars + Troubleshooting + Backup script |
| 2026-06-05 | backups/bbh-backup-2026-06-05.zip | รัน backup ครั้งแรก — postgres_full.sql (75 MB) + dify_storage.tar.gz (65 MB) + .env + migration SQL + patch script → ZIP 98 MB เก็บไว้ใช้ติดตั้งเครื่องใหม่ทาง A; แก้ Setup.md volume name `dify_app_storage` → `docker_dify_app_storage` |
| 2026-06-05 | .gitignore, git history | ขยาย .gitignore (ครอบคลุม venv/logs/IDE/Dify graph snapshots/Automate Library/hospital_db_backup.sql) + untrack server_err.log + Automate Library/ + commit Option B+Patient flow+Setup |
| 2026-06-05 | GitHub | สร้าง private repo `wisraut/line-dify-bridge` (gh CLI) + push main branch — bridge code พร้อม clone ที่เครื่องใหม่ (data/backup ยังเก็บแยกใน Google Drive) |
| 2026-06-05 | Setup.md | Rewrite ให้ใช้ git clone repo URL ตรงๆ — A1/B1 ใช้ `git clone https://github.com/wisraut/line-dify-bridge.git`, เพิ่ม Resources section, ลด confusion เรื่อง "copy folder จากเครื่องเก่า", เพิ่ม troubleshooting `git clone private repo ถามรหัส` + คำอธิบาย `gh auth setup-git` |
| 2026-06-05 | repo cleanup, README.md, .env.example, tests/ | Clean repo — untrack 12 ไฟล์ debug/legacy (_inspect_*, _test_dify_*, reset_nipa.py, update_dify_flow.py, setup.bat/ps1/guide.md, CLAUDE_SETUP.md, test_fixes.py, test_pipeline.py, hospital_db_backup.sql); ย้าย test_*.py → `tests/` folder; เขียน README.md ใหม่ (Features/Architecture/Quick Start/Tech Stack/Project Structure/Dev/Roadmap); เพิ่ม `.env.example` template; ขยาย .gitignore — repo เหลือ 21 ไฟล์ จาก 30 |
| 2026-06-05 | LINE test (manual) | ✅ Verify Option B end-to-end — user ทดสอบส่งข้อความใน LINE จริง พบว่า doctor/patient flow ตอบกลับปกติ ผ่าน ngrok container → bridge container → Dify api container → DB ทุก hop ทำงานครบ |
| 2026-06-05 | BBH-Hospital-Bridge folder | ย้าย `OneDrive\Desktop\BBH-Hospital-Bridge\` (มี symlinks ที่ทำให้ OneDrive sync recursive ไม่จบ) → `C:\Users\wisru\backups\BBH-Hospital-Bridge\` ด้วย robocopy /MOVE — fix "Path too long" warning ตอน Windows boot; ของจริงทั้ง dify\ + line-dify-bridge\ ยังอยู่ครบ |
| 2026-06-05 | migrate_cro_assistant.sql | สร้าง schema Phase 1A — `cro_users` (4 slots ว่าง), `cro_queue` (ticket + status pending/claimed/replied), `audit_log` (cro_auto_answered/cro_escalated/cro_claimed/cro_replied) |
| 2026-06-05 | main.py (Phase 1A backend) | เพิ่ม LINE_CRO_CHANNEL_ID/SECRET config + 5 LINE helpers (_get_cro_token/_verify_cro_signature/_cro_reply/_cro_push/_cro_push_ticket) + 6 DB functions (_is_cro_team/_try_register_cro/_insert_cro_ticket/_notify_cro_team/_try_claim_ticket/_reply_ticket) + 2 handlers (_handle_cro_inquiry/_handle_cro_team_message) + _ask_dify_with_meta + endpoint POST /webhook/cro + startup reset cro_users + health endpoint แสดง webhook_cro |
| 2026-06-05 | .env.example | เพิ่ม LINE_CRO_CHANNEL_ID + LINE_CRO_CHANNEL_SECRET (optional) สำหรับ Phase 1A |
| 2026-06-05 | Phase 1A v2 — Re-design CRO Monitoring + Override | สลับ role ของ LINE channels — LINE #1 (BBH BOT TEST) = public bot (anonymous Q&A + AI ตอบ + escalate); LINE #2 (CRO) = CRO staff login (CRO001-004) + monitoring + override commands; CRO take over conversation ได้ทุกเมื่อ (ไม่ต้องรอ Bot escalate) |
| 2026-06-05 | migrate_cro_v2.sql | Alter cro_users + cro_code (CRO001-004) + seed 4 ชื่อผู้หญิงสั้น (น้อง/แนน/อ้อม/ปุ๊ก); Drop cro_queue (ticket-based เดิม); Add conversations + conversation_messages tables (track ทุก session ลูกค้า + log ทุก message ของ customer/bot/cro) |
| 2026-06-05 | main.py CRO section (refactor) | ลบ ticket-based functions (insert_ticket/claim/reply/push_ticket); เพิ่ม conversation-based: _get_or_create_conversation, _save_message, _take_over_conversation (atomic + race-safe), _end_take_over, _list_active_conversations, _get_conversation_history, _conv_owned_by; _try_register_cro รับ cro_code (CRO001-004) แทน name; _handle_public_inquiry (LINE #1 anonymous Q&A + take-over forward); _handle_cro_team_command (active/list/queue/view/take/end + forward) |
| 2026-06-05 | webhook /webhook + /webhook/cro | LINE #1 — add fallback _handle_public_inquiry สำหรับคนไม่ใช่ DR*/PT*; LINE #2 — เปลี่ยน register จาก "CRO <name>" → "CRO001-004" (รหัสจริงจาก DB) + ลบ anonymous Q&A flow ออก (เป็น CRO login only) |
| 2026-06-05 | _patch_cro_branch.py | Rename `cro_inquiry` → `public_inquiry` ใน Dify graph: start role variable options + if_else_role case (migrate in place) + edge sourceHandle + edge id; idempotent — รัน 2+ ครั้งได้ |
| 2026-06-05 | refactor: split main.py → modules | main.py: 1400→225 บรรทัด; แยกเป็น config.py (env+constants 44), db.py (get_db 13), line_client.py (2-channel helpers 117), dify_client.py (ask+parse 67), flows/__init__.py + flows/doctor.py (293), flows/patient.py (100), flows/cro.py (422); ทุกไฟล์ <500 บรรทัด อ่านง่ายขึ้น — bridge ยังทำงานปกติ (healthy หลัง restart); tests/ อาจ broken รอ commit ถัดไป |
| 2026-06-05 | repo organization | จัด folder: `migrations/` (4 SQL files), `dify_patches/` (2 patch scripts — rename `_patch_*` → `patch_*`), `tools/` (ask_patient.py); root เหลือเฉพาะ runtime + docker + docs; update Setup.md + README.md paths |
| 2026-06-05 | Phase 1A.5 — Booking flow (multi-turn) | DB: bookings table + add conversations.dify_conversation_id (multi-turn session); Dify patch: enable LLM memory window (10 turns) + update prompt with 4 output formats (AUTO/ESCALATE/BOOKING_ASK/BOOKING_DONE); dify_client: parse_decision returns 'auto'|'escalate'|'booking_ask'|'booking_done'; flows/cro: track dify_conv_id per conversation + handle 4 decisions + save_booking + notify_booking (push to CRO team พร้อม "take N" cmd); CRO เปิด Google Calendar ยืนยันเอง (Level B = AI ช่วยรวบรวม, ยังไม่ auto book) |
| 2026-05-28 | main.py | เพิ่ม RESET_KEYWORDS + _send_welcome(); follow event → _send_welcome(); reset keyword → _ask_dify("__welcome__") → reply; ลบ WELCOME_TEXT hardcode ออก |
| 2026-05-29 | start.bat | เพิ่ม auto-start Docker Desktop — เช็คก่อนว่า Docker รันอยู่ไหม ถ้าไม่รันให้เปิด Docker Desktop อัตโนมัติแล้ววนรอจนพร้อมก่อน start Ollama และ Bridge |
| 2026-05-29 | hospital_db (full redesign) | Drop ทุก table แล้วสร้างใหม่ทั้งหมด — เพิ่ม medical_conditions, treatment_history, allergies, current_medications แยก table; reports เปลี่ยนเป็นรับ lab report จากคนไข้แทน free-text อาการ; เพิ่ม report_source, report_date, chief_complaint; ย้าย dify_conversation_id ไป analyses table |
| 2026-05-29 | hospital_db (seed data) | เพิ่มข้อมูลจำลองแพทย์ 3 คน คนไข้ 5 คน ครบ: โรคประจำตัว (15 records), ประวัติการรักษา/ผ่าตัด (18 records), แพ้ยา (7 records), ยาปัจจุบัน (25 records), lab report ละเอียด (5 reports) |
| 2026-05-29 | email_poller.py | สร้างใหม่ — รับ email จากคนไข้ผ่าน Gmail IMAP, match sender กับ patients.email, บันทึกลง reports table, callback แจ้งแพทย์ผ่าน LINE |
| 2026-05-29 | main.py | Rewrite — ตัด patient LINE flow ออกทั้งหมด (validation/welcome/reset), เพิ่ม _build_patient_context (JOIN 4 tables), _line_push_with_quick_reply, _notify_new_report; doctor flow ใช้ quick reply button แทนพิมพ์ report_id เอง; เพิ่ม email poller เป็น background task ใน lifespan |
| 2026-05-29 | .env | เพิ่ม GMAIL_EMAIL=wisrutyaemprayur@gmail.com, GMAIL_APP_PASSWORD (App BBH), EMAIL_POLL_INTERVAL=120 |
| 2026-05-29 | hospital_db | เพิ่ม email column ใน patients table + seed test emails (+patient1 ถึง +patient5) |
| 2026-05-29 | Dify graph (DB) | Redesign flow ใหม่สำหรับแพทย์อย่างเดียว — ลบ if_else_welcome, answer_welcome, llm_validate, if_else_1, answer_incomplete ออก; เหลือ start → knowledge_retrieval → format_docs → llm → answer; เปลี่ยน system prompt จาก "วินิจฉัย" เป็น "สรุป report" พร้อม template แพทย์ครบ 5 หัวข้อ |
| 2026-05-29 | test_pipeline.py | สร้างใหม่ — automated end-to-end test ครบ 5 steps: DB connection → insert test report (สมชาย HN-2019-001) → build patient context (JOIN 4 tables) → call Dify API จริง (Gemini Flash) → save analysis to DB; ผล 15/15 PASS; แก้ EOFError จาก input() ใน non-interactive shell ด้วย try/except |
| 2026-05-29 | main.py | แก้ bug: wrap _line_reply + _line_push ใน _handle_doctor_message ด้วย try/except — ป้องกัน background task ตายเงียบเมื่อ LINE API fail (fake reply_token หรือ fake user_id) |
| 2026-05-29 | main.py | แก้ lifespan: ครอบ ngrok.connect ด้วย try/except — server start ได้แม้ ngrok tunnel ยังค้างอยู่ (ERR_NGROK_334) |
| 2026-05-29 | test_full_flow.py | สร้างใหม่ — Full Doctor Flow Test ครบวงจร 6 phases ไม่ส่ง LINE จริง: Services health → Insert 2 reports → Build context → Notification capture → Direct trigger (LINE mocked, Dify+DB real) → HTTP Webhook POST with valid HMAC → Verify DB; ผล 28/28 PASS |
| 2026-05-29 | hospital_db (doctors) | เพิ่ม hospital_id (DR001-003) และ line_uid column — แพทย์ผูก LINE UID ผ่านการส่ง hospital_id ใน LINE แทนการ hardcode |
| 2026-05-29 | main.py | เปลี่ยน _is_doctor() ให้เช็ค line_uid แทน doctor_id; เพิ่ม _try_register_doctor(); แก้ _notify_new_report() ให้ push ไปที่ line_uid จริง; เปลี่ยน non-doctor webhook path เป็น registration flow (ส่ง DR001 → ผูก LINE อัตโนมัติ) |
| 2026-05-29 | main.py | เพิ่ม patient-name search — แพทย์พิมพ์ชื่อคนไข้แทน Report ID; refactor _handle_doctor_message เป็น router → _analyze_report (reusable pipeline); เพิ่ม _get_doctor_id_from_line_uid() |
| 2026-05-29 | main.py | เพิ่ม logout feature — แพทย์พิมพ์ "logout" → UPDATE doctors SET line_uid=NULL; state เก็บใน DB ไม่มี in-memory |
| 2026-05-29 | setup_guide.md | สร้างใหม่ — Architecture ครบวงจร + Installation Guide ครบ 10 sections: system diagram, DB schema, sequence diagram, Dify config, prerequisites, step-by-step install, manual steps checklist, daily start, troubleshooting, env reference |
| 2026-05-29 | monitor.py, start.bat | สร้าง TUI Monitor ด้วย Textual — แสดง Services / Doctors / Reports / Activity แบบ real-time refresh ทุก 5 วิ; start.bat เพิ่ม step 4 เปิด monitor window หลัง bridge start 5 วิ |
| 2026-05-29 | Dify graph (DB) | แก้ {{book_names}} ไม่ถูก substitute — Dify ไม่รองรับ {{var}} syntax สำหรับ pipeline variable ใน LLM prompt; แก้โดย: (1) format_docs รวม book_names ไว้ท้าย formatted_context เป็นส่วน "=== แหล่งอ้างอิง ===" (2) LLM prompt ลบ {{book_names}} ออก ใช้ {{#context#}} เดียวที่ครอบทุกอย่าง (3) ลบ variables array ออกจาก LLM node |
| 2026-05-29 | main.py, email_poller.py, DB | Redesign report status: ลบ 'analyzed' ออก — status มีแค่ NULL (พร้อมวิเคราะห์/วิเคราะห์ซ้ำได้เสมอ) กับ 'analyzing' (lock ชั่วคราวป้องกัน concurrent call); name search ดึง latest report ทุกสถานะ ไม่กรอง; _save_analysis คืน status → NULL แทน 'analyzed'; email_poller INSERT ไม่ส่ง status แล้ว (default NULL) |
| 2026-05-29 | monitor.py | แก้ bug timezone: เปลี่ยน `datetime.now()` → `datetime.utcnow()` ใน `_relative_time()` — DB เก็บ UTC แต่ now() ใช้ UTC+7 ทำให้แสดง "7 ชม.ที่แล้ว" แทนที่จะเป็น "เมื่อกี้" |
| 2026-05-29 | monitor.py | แก้ Activity display order: ดึง DESC LIMIT 30 (เพิ่มจาก 12) → reverse → เขียน RichLog oldest-first ให้ newest อยู่ล่าง (visible); analyzing entries ต่อท้ายเสมอ |
| 2026-05-29 | monitor.py | revert mouse=False: ลบ `mouse=False` ออกจาก `run()` — การตั้งค่านี้ทำให้ mouse escape sequence รั่วออกมาเป็น raw text (`^[[<35;86;30M`) เพราะ terminal protocol ยังเปิดอยู่จาก session ก่อน |
| 2026-05-29 | start.bat | Rewrite ASCII-only: แทนที่ภาษาไทยทุก echo ด้วยภาษาอังกฤษ — Thai UTF-8 characters ทำให้ CMD batch parser พัง (`'ning' is not recognized`); เปลี่ยน exit เป็น pause |
| 2026-05-29 | BBH Automate.lnk | แก้ shortcut เปล่า: ตั้ง Target = `cmd.exe /k "C:\Users\wisru\line-dify-bridge\start.bat"`, WorkingDir = `C:\Users\wisru\line-dify-bridge` — shortcut เดิมไม่มี Target เลยกดแล้วไม่มีอะไรเกิดขึ้น |
| 2026-05-29 | hospital_db | ลบ RPT-20260529-0002 ที่ซ้ำ: cascade delete audit_logs (3 rows) + analyses (2 rows) + report — email_poller process email ซ้ำ 2 ครั้งห่างกัน 0.14 วิ |
| 2026-05-29 | main.py | เพิ่ม startup session reset ใน lifespan(): `UPDATE doctors SET line_uid = NULL` + `UPDATE reports SET status = NULL WHERE status = 'analyzing'` — ล้าง login ค้างและปลดล็อค stuck reports ทุกครั้งที่ server start |
| 2026-05-29 | main.py | แก้ connection leak: เปลี่ยน `_get_db()` เป็น `@contextmanager` ที่ `finally: conn.close()` — psycopg2 `with conn:` ไม่ได้ปิด connection อัตโนมัติ ทำให้ connections สะสมจนถึง limit |
| 2026-05-29 | main.py | แก้ race condition ใน `_analyze_report()`: ใช้ `UPDATE...AND status IS NULL` + rowcount check แทน SELECT แล้ว UPDATE แยก (TOCTOU); เพิ่ม try/except รอบ `_save_analysis` ที่ reset lock ถ้า DB fail |
| 2026-05-29 | main.py | แก้ race condition ใน `_try_register_doctor()`: เพิ่ม `AND line_uid IS NULL` ใน UPDATE + rowcount check — ป้องกัน 2 request register hospital_id เดียวกันพร้อมกัน |
| 2026-05-29 | main.py | แก้ NameError ตอน shutdown: initialize `public_url = None` ก่อน try block, guard `ngrok.disconnect` ด้วย `if public_url:` — ป้องกัน crash เมื่อ ngrok connect fail ตอน startup |
| 2026-05-29 | main.py | เพิ่ม fail-fast env validation ตอน import: raise RuntimeError ถ้า required vars ขาด (LINE_CHANNEL_SECRET, LINE_CHANNEL_ID, DIFY_API_KEY, DB_PASSWORD) |
| 2026-06-03 | email_poller.py | แก้ race condition `_generate_report_id` — รวม generate+INSERT ใน transaction เดียวด้วย `pg_advisory_xact_lock(date_int)` ป้องกัน 2 email พร้อมกัน collide; เพิ่ม `_insert_report()` atomic แทนการเรียก SELECT แล้ว INSERT แยก connection |
| 2026-06-03 | email_poller.py | เพิ่ม PDF attachment support — `_get_pdf_attachments()` ใช้ pypdf แตก text จากทุก PDF attachment, รวมเข้ากับ body เป็น report_text; ข้าม PDF ที่เป็น scanned image พร้อม log warning |
| 2026-06-03 | email_poller.py | แก้ status default mismatch — INSERT ใส่ `status=NULL` explicit เพราะ schema DEFAULT 'pending' ทำให้ `main.py._analyze_report()` lock ไม่ได้ (เช็ค `status IS NULL`); เพิ่ม `_db()` contextmanager ปิด connection ตามแบบ main.py; skip email ที่ไม่มี content (no body + no readable PDF) |
| 2026-06-03 | requirements.txt | เพิ่ม `pypdf` สำหรับ PDF text extraction |
| 2026-06-03 | test_pdf_email.py | สร้างใหม่ — end-to-end test: สร้าง minimal valid PDF (ASCII) → MIME multipart email → ผ่าน `_get_body` + `_get_pdf_attachments` + `_insert_report` → verify DB row (status=NULL, audit_log สร้าง, marker อยู่ใน report_text); ผ่าน 5/5 |
| 2026-06-03 | CLAUDE.md (sync) | Rewrite Hospital Flow / Architecture / Tech Stack / DB Design / Config / Status / Dify section ให้ตรงกับ code จริง — ลบ Ollama / patient LINE flow / 2-LLM-node references; เพิ่ม Deprecated section บอกว่าอะไรถูกลบ |
| 2026-06-03 | ERRORS.md (Bug 1) | Mark resolved ✅ — verify ผ่าน Dify DB ว่า welcome/validate nodes ถูกลบหมดจาก graph ตั้งแต่ redesign 2026-05-29, main.py เรียก _ask_dify แค่ 1 ครั้งใน _analyze_report |
| 2026-06-04 | test_full_flow.py | Sync test assumptions กับ flow ปัจจุบัน — INSERT `status=NULL` (ไม่ใช่ 'pending'); เพิ่ม `set_doctor_line_uid()` helper ตั้ง line_uid=doctor_id ก่อน test เพื่อให้ `_is_doctor()` match (และ HTTP webhook ใช้ doctor_id เป็น userId ได้); Phase 6 verify ใหม่: รอ `analyses` row + status reset NULL (ไม่ใช่ status='analyzed'); polling deadline 180→240s; cleanup reset line_uid=NULL เสมอ; ผล 28/28 PASS |
| 2026-06-04 | .env | เพิ่ม `DIFY_DATASET_API_KEY` + `DIFY_DATASET_ID` สำหรับ Dataset API (upload เอกสารเข้า KB ผ่าน script); สร้าง dataset API key ใน Dify DB โดยตรง (table `api_tokens`, type='dataset') tenant_id เดียวกับ chat key เดิม |
| 2026-06-04 | dify/docker/docker-compose.yaml | Migrate `/app/api/storage` จาก bind mount → Docker named volume `dify_app_storage` แก้ใน 3 services (init_permissions, api, worker) + เพิ่ม top-level `volumes: dify_app_storage:` — แก้ Docker Desktop containerd snapshotter + WSL2 bind-mount bug ที่ container เขียนไฟล์ไม่ sync กลับ Windows NTFS ทำให้ Dify upload ไฟล์ใหม่ทุกชนิด (UI/API/text) fail "File not found" ตอน indexing |
| 2026-06-04 | dify storage data migration | Backup bind-mount volume → `dify/docker/storage-backup-20260604-111701.zip` (3,553 files, 65MB); หลัง compose up: extract zip → `docker cp` เข้า named volume → `chown -R 1001:1001` ให้ user dify; ทดสอบ upload 2 PDFs/MD ใหม่ → indexing completed ทั้งคู่; KB "Library" ตอนนี้มี 5 documents (3 เก่า + 2 ใหม่: Functional Medicine The New Standard, Textbook of Functional Medicine 2010) |
| 2026-06-04 | monitor.py | `_fetch_reports()` เปลี่ยน query เป็น `DISTINCT ON (patient_id)` + outer ORDER BY submitted_at DESC — Reports panel แสดง 1 row ต่อคนไข้ (latest report) ไม่ปรากฏชื่อซ้ำเมื่อคนไข้เดียวมีหลาย reports; subquery จำเป็นเพราะ DISTINCT ON บังคับ ORDER BY ขึ้นด้วย patient_id ก่อน |
| 2026-06-04 | hospital_db (patients) | Migration เพิ่ม 3 columns: `patient_code TEXT UNIQUE` (สำหรับ register LINE — PT001-005), `line_uid TEXT UNIQUE` (LINE UID หลัง register, NULL = ยังไม่ผูก), `dify_conversation_id TEXT` (resume Dify context); index: `idx_patients_line_uid`, `idx_patients_patient_code`; seed 5 คนไข้จริง (HN-2019-001=PT001 ... HN-2023-005=PT005), ข้าม HN-TEST-001; SQL ใน `migrate_patient_register.sql` |
| 2026-06-04 | Dify graph (Patient Summary) | Patch graph จาก linear (5 nodes/4 edges) เป็น branched (10 nodes/9 edges): เพิ่ม `role` select variable ใน start node (doctor/patient), แทรก `if_else_role` หลัง format_docs (case patient_role→patient branch, false→doctor `llm` เดิม), patient branch มี `if_else_emergency` (7 keywords: เจ็บหน้าอก, หายใจไม่ออก, เลือดออกมาก, หมดสติ, ชัก, อาเจียนเป็นเลือด, ปวดหัวรุนแรง), emergency case→`answer_emergency` (hardcoded "โทร 1669"), false→`llm_patient_advisor` (Gemini Flash, prompt template 3 หัวข้อ+disclaimer)→`answer_patient`; แก้ทั้ง published workflow `8f10dd4d` (runtime) + draft `e0a912fd` (UI editor); test 3 paths ผ่าน Dify API ผ่านทุกเส้น: doctor 73s (1270 chars), patient 5.7s (980 chars), emergency 41s (152 chars hardcoded แต่ยังผ่าน KB retrieval ก่อน — optimize ทีหลังได้โดยย้าย if_else_emergency ขึ้นก่อน knowledge_retrieval); script ใน `_patch_dify_graph.py` |
| 2026-06-04 | main.py | เพิ่ม Patient flow: `_is_patient(line_uid)` (เช็ค patients.line_uid), `_try_register_patient(line_uid, patient_code)` (atomic UPDATE...WHERE line_uid IS NULL+rowcount เหมือน doctor), `_handle_patient_message()` (รับ logout/อาการ, เรียก `_ask_dify(role='patient')`, update `dify_conversation_id` ใน DB เพื่อ resume context, audit log 'advice_requested'); แก้ `_ask_dify` รับ `role` param (default 'doctor') ส่ง `inputs.role` + ใช้ `user=f"{role}:{user_id}"` ป้องกัน conversation ปนกัน; webhook router เพิ่มเช็ค `_is_patient` หลัง `_is_doctor` + แยก register flow ตาม prefix (DR*→doctor, PT*→patient, อื่นๆ→prompt); startup reset เพิ่ม `UPDATE patients SET line_uid=NULL, dify_conversation_id=NULL` |
| 2026-06-04 | test_patient_flow.py | สร้างใหม่ — Patient Flow Test 7 phases: health → register (4 cases: not_found/registered/already_me/already_taken) → patient normal (Dify role=patient, disclaimer + 1️⃣2️⃣3️⃣ template) → emergency keyword (answer_emergency hardcoded "โทร 1669") → logout (line_uid=NULL, conv_id=NULL) → HTTP webhook with HMAC sig → DB verify (conv_id + audit_logs 'advice_requested'); ผล **31/31 PASS**; regression test ครบ: test_pdf_email 5/5, test_pipeline 15/15, test_full_flow 28/28 — รวม **79/79 PASS** (doctor flow ไม่พัง) |
| 2026-06-11 | n8n/start-n8n.bat | เพิ่ม step [3/5] Bridge startup — `docker compose -f docker-compose.bridge.yaml up -d --build` + health poll `localhost:8000/health` (timeout 60s, warn-and-continue); renumber steps เป็น 5 steps รวม n8n [4/5] + Browser [5/5] |
| 2026-06-04 | start.bat | Rewrite ใหม่ 6 steps แก้ "Dify ไม่ขึ้น/เปิดยาก" — (1) Docker check + auto-launch + wait loop 120s, (2) **เพิ่ม `docker compose up -d` ที่ dify/docker** (เดิมไม่มี — เป็นเหตุที่ Dify ไม่ขึ้นเอง), (3) **wait Dify API healthy** (poll `localhost/v1/info` รอ HTTP 200/401, timeout 120s), (4) **kill stale ngrok processes** (ป้องกัน ERR_NGROK_334 endpoint already online), (5) start bridge → wait 12s ngrok tunnel, (6) start monitor TUI; ตัด Ollama auto-start ออก (user ขอเก็บไฟล์ Ollama ไว้แต่ไม่ start เพราะกิน 4-5GB RAM, ใช้น้อย); ASCII-only echo ป้องกัน CMD parser พังจากภาษาไทย |

---

## Notes

- Machine: RAM 16GB / GPU GTX 1050 4GB (เคยใช้ Ollama CPU — ตอนนี้ไม่ใช้แล้ว)
- OpenRouter balance: ~$1 (Gemini Flash ~$0.075/1M token ≈ รับได้ 3,000+ เคส)
- PostgreSQL เดียวกับ Dify แต่แยก database (hospital_db บน port 5433)
- เครื่องมี PostgreSQL ติดตั้งโดยตรงด้วย (port 5432) จึงใช้ 5433 สำหรับ Docker
- 1 คนไข้ → 1 แพทย์ประจำตัว (Phase 1)
- Report ID: `RPT-YYYYMMDD-XXXX` — generate atomic ด้วย `pg_advisory_xact_lock(date_int)` ใน email_poller `_insert_report()`
- hospital_db เก็บ **ข้อมูลคนไข้ structured** (conditions/allergies/meds) — content วิเคราะห์อยู่ใน `analyses.summary_text` + `dify_conversation_id`
- PDF parsing: pypdf รองรับเฉพาะ text-based PDF — scanned image จะ log warning และใช้แค่ body แทน

---

## Session Note — 2026-06-16 Backend Source Of Truth + Frontend Setup

### What changed

- Made `main` the single source of truth for the repo.
  - Merged backend restructure into `main`.
  - Deleted stale local branch `feature/n8n`.
  - Deleted remote branches `origin/feature/n8n` and `origin/restructure/backend-folder`.
- Consolidated Python FastAPI bridge into `backend/`.
  - `api/`, `core/`, `flows/`, `integrations/`, `jobs/`, `ops/`, `migrations/`, `tests/`, `main.py`, `requirements.txt`, and `Dockerfile` now live under `backend/`.
  - Python imports intentionally remain root-style (`from api...`, `from core...`) because the container runs with `/app` as the backend root.
  - `docker-compose.bridge.yaml` build context now points to `backend/`.
- Refreshed `README.md` to match the current n8n + Dify + Bridge + Bot Ops MySQL architecture.
  - Added current webhook endpoints, internal API endpoints, test commands, n8n SQLite permission fix, and branch policy.
- Added `frontend/` React + TypeScript scaffold.
  - Vite + React + TypeScript build passes.
  - ESLint passes.
  - Tailwind CSS setup fixed inside `frontend/`.
  - Root-level accidental npm files were removed (`package.json`, `package-lock.json`, root `node_modules/`).
  - Frontend package now owns its own `package.json`, `package-lock.json`, and `node_modules/`.

### Verification completed

- Backend restructure:
  - `docker compose -f docker-compose.bridge.yaml build bridge` — PASS
  - `docker compose -f docker-compose.bridge.yaml up -d bridge` — PASS
  - `docker exec hospital-bridge curl -fsS http://localhost:8000/` — PASS
  - Bridge logs checked; no startup error/traceback in tail.
  - `pytest` inside bridge image could not run because `pytest` is not installed in the container.
- Git/branch cleanup:
  - Local branches now only include `main`.
  - Remote branches now only include `origin/main`.
  - `main` is synced with `origin/main` after README updates.
- Frontend:
  - `npm.cmd run build` in `frontend/` — PASS
  - `npm.cmd run lint` in `frontend/` — PASS
  - Tailwind emits a warning that no utility classes are detected yet; expected because current UI is still the Vite starter screen and does not use Tailwind utility classes yet.

### Commits created

- `f517bfa` — `wip: pre-restructure snapshot`
- `b86b93c` — `refactor: consolidate Python backend into backend/ folder`
- `853c3b3` — `docs: update README for backend folder layout`
- `49264e3` — `docs: refresh README for current n8n bridge architecture`
- `41d5238` — `feat: add React TypeScript frontend scaffold`

### Current checkpoint

- Current repo structure is:
  - `backend/` — FastAPI bridge
  - `frontend/` — React + TypeScript web app
  - `n8n/` — n8n workflows and Bot Ops MySQL schema
- Next frontend step should replace the Vite starter UI with an actual clinic operations dashboard.
- Do not recreate root-level backend folders (`api/`, `core/`, `tests/`, root `main.py`, root `Dockerfile`, root `requirements.txt`).

---

## Session Note — 2026-06-08 Repo Refactor + Launcher Hardening

### What changed

- Refactored the bridge repo from root-level runtime scripts into package folders:
  - `api/` — FastAPI routers: health, primary LINE webhook, CRO webhook
  - `core/` — config, DB helper, lifespan/startup reset
  - `integrations/` — LINE, Dify, Google Calendar clients
  - `jobs/` — Gmail/email poller
  - `ops/` — Textual monitor
- Reduced `main.py` to app wiring only: create FastAPI app, include routers, attach lifespan, run uvicorn.
- Kept existing `flows/doctor.py`, `flows/patient.py`, and `flows/cro.py` as business-flow modules to avoid changing behavior.
- Updated imports across flows/tests to use the new package paths.
- Made Google Calendar imports lazy in `integrations/calendar_client.py` so `import main` does not fail when Calendar deps/config are unused.
- Rewrote `start.bat` for more reliable startup:
  - waits for Docker Desktop up to 180s
  - starts Dify stack
  - waits for Dify API and treats 200/401 as ready, retries 502 while Dify warms up
  - validates bridge compose config
  - runs `docker compose ... up --build -d`
  - restarts Dify nginx to refresh Docker DNS/IP-shuffle issue
  - waits for bridge health before opening monitor
  - prints useful log/debug commands on failure
- Updated `docker-compose.bridge.yaml` to use `NGROK_PUBLIC_URL` and `NGROK_DOMAIN` env defaults instead of only hardcoded values.
- Updated `.env.example` with `NGROK_DOMAIN`, Google Calendar ID, and service account path.
- Updated `.gitignore` policy: local Markdown working docs are ignored except `README.md`; credentials/logs/debug artifacts stay ignored.
- Updated README project structure to match the new service layout.
- Adjusted tests to call flow modules directly instead of old private helpers from `main.py`.

### Files/folders involved

- New folders: `api/`, `core/`, `integrations/`, `jobs/`, `ops/`
- Main runtime files moved/rewired:
  - `config.py` -> `core/config.py`
  - `db.py` -> `core/db.py`
  - `line_client.py` -> `integrations/line_client.py`
  - `dify_client.py` -> `integrations/dify_client.py`
  - `calendar_client.py` -> `integrations/calendar_client.py`
  - `email_poller.py` -> `jobs/email_poller.py`
  - `monitor.py` -> `ops/monitor.py`
- Updated: `main.py`, `start.bat`, `docker-compose.bridge.yaml`, `.env.example`, `.gitignore`, `README.md`, `flows/*`, `tests/*`, `requirements.txt`

### Verification completed

- `python -m compileall main.py api core integrations jobs ops flows tests` — PASS
- Import smoke test for all new modules — PASS
- `docker compose -f docker-compose.bridge.yaml --env-file .env config` — PASS
- `python tests\test_pdf_email.py` — PASS
- `python tests\test_patient_flow.py` — PASS, 31/31
- `python tests\test_full_flow.py` — PASS, 28/28
- Bridge container rebuilt and recreated successfully.
- `hospital-bridge` container status: running + healthy.
- `hospital-ngrok` container status: running.
- `curl http://localhost:8000/` returned HTTP 200.
- Dify `/v1/info` returned HTTP 200 with auth header.
- `start.bat` was tested via CMD; fixed a batch label issue by using explicit `goto :bridge_ready` and converting the file to CRLF/ASCII for CMD label compatibility.

### Commit note

- This is ready to commit as a cohesive refactor: repo structure + launcher reliability + test alignment.
- Suggested commit message: `Refactor bridge service structure and stabilize launcher`
- `CLAUDE.md`, `ERRORS.md`, `Setup.md`, and other local Markdown working docs are intentionally ignored/untracked by `.gitignore`; keep this file as a local working note unless the user explicitly wants to track it again.
- `migrations/migrate_bookings_calendar.sql` was still untracked at the end of the session; include it only if the calendar booking migration should be part of the commit.

---

## Session Note — 2026-06-08 CRO KB Dataset + Routing Verification

### What changed

- Converted the CRO popular patient-question attachments into a Dify KB document:
  - `CRO Patient FAQ Intent Dataset - 2026-06-08`
  - Dify document id: `dfc9381a-6e10-4bf9-8c55-b2caeb241282`
  - Parsed 200 questions total from the two non-duplicate attachment sets.
  - Indexed status: `completed`, display status: `available`, tokens: 62,565.
- Added a focused correction KB document for high-risk routing:
  - `CRO Critical Routing Rules Override - 2026-06-08`
  - Dify document id: `8b11e76f-d72c-43a7-92a3-34333891860d`
  - Indexed status: `completed`, display status: `available`.
- Patched Dify node `llm_cro_decide` prompt in both runtime published workflow and draft workflow:
  - published: `8f10dd4d-de2c-44a7-92fa-8a5c05a77224`
  - draft: `e0a912fd-4153-4144-b4fd-ec22ad68ff0e`
  - Added deterministic rules for walk-in questions and personal medical document/status questions.
  - No Python runtime code was changed.

### Verification completed

- Dify 5-step verification before work:
  - `/v1/info` returned `Patient Summary`, `advanced-chat`.
  - `/v1/parameters` confirmed role options: `doctor`, `patient`, `public_inquiry`, retriever resource enabled.
  - Dify DB app id confirmed: `64eb590e-4b27-4b10-aca2-44355e37ff40`.
  - Workflow versions confirmed; latest published workflow is `8f10dd4d-de2c-44a7-92fa-8a5c05a77224`.
  - Graph inspection confirmed public inquiry branch routes to `llm_cro_decide` and strict output prefixes.
- Final CRO bot tests through `/chat-messages`, role `public_inquiry`: PASS 6/6.
  - `วอล์คอินได้เลยป่ะ` -> `AUTO` and includes `ไม่รับ walk-in`.
  - `อยากจองคิวตรวจ Functional Medicine` -> `BOOKING_ASK`.
  - `ส่งรูปผลเลือด ค่าตับ SGOT SGPT สูง อันตรายไหม` -> `ESCALATE:medical`.
  - `แน่นหน้าอก หายใจไม่ออก` -> `ESCALATE:emergency`.
  - `แพ้ยาเพนิซิลลิน กินตัวนี้ได้ไหม` -> `ESCALATE:medical`.
  - `ผลแล็บออกยัง ขอให้ส่งทางอีเมล` -> `ESCALATE:personal_data`.

### Local artifacts

- Dataset markdown generated for review:
  - `C:\Users\wisru\Documents\Codex\2026-06-08\functional-medicine-walk-in-online-line\outputs\cro_patient_faq_intent_dataset_20260608.md`
- Test result JSON:
  - `C:\Users\wisru\Documents\Codex\2026-06-08\functional-medicine-walk-in-online-line\outputs\cro_kb_test_results_20260608.json`
- Temporary helper scripts stayed in the Codex workspace `work/` folder, not in the project repo.

---

## Session Note - 2026-06-09 BBH Bot n8n Phase 1

### What changed

- Created/confirmed separate Dify app `BBH Bot` for the n8n product path, separate from `Patient Summary`.
- Confirmed `BBH Bot` is linked to the same `Library` KB dataset used by `Patient Summary`:
  - dataset id: `d3621299-360a-4b04-899a-82899b4e9721`
- Fixed Dify runtime private-key error by restarting runtime containers only:
  - `docker-api-1`
  - `docker-worker-1`
  - `docker-nginx-1`
- Patched only `BBH Bot` Dify graph, both draft and published workflow, to set Start `role` default to `public_inquiry`.
- Confirmed role branch wiring in `BBH Bot`:
  - `public_inquiry` -> `llm_cro_decide` -> `answer_cro`
  - `patient` -> `if_else_emergency` -> `answer_emergency` or `llm_patient_advisor` -> `answer_patient`
  - `doctor` -> `llm` -> `answer`
- No Patient Summary graph, API key, or runtime code was changed for this Phase 1 patch.

### Verification completed

- `BBH Bot` `/v1/info` returned HTTP 200: name `BBH Bot`, mode `advanced-chat`.
- `BBH Bot` `/v1/parameters` returned HTTP 200.
- Dify DB confirmed `BBH Bot` has `Library` KB linked.
- Dify graph verification confirmed `default=public_inquiry`, 12 nodes, 11 edges, and 3 role branches.
- Public inquiry runtime test through `/v1/chat-messages` passed:
  - input role: `public_inquiry`
  - query: `walk in?`
  - result: HTTP 200, answer starts with `AUTO:` and includes no walk-in acceptance.

### Current checkpoint

- Phase 1 first pass is complete for the public inquiry path.
- Remaining Phase 1 checks before moving to n8n integration:
  - test doctor path with n8n-style report context
  - test patient path with patient question context
  - test emergency path
  - adjust prompts only if any tested path fails

### Phase 1 emergency keyword update - 2026-06-09

- Patched only `BBH Bot` Dify graph, both draft and published workflow.
- Added English emergency keywords to `if_else_emergency`:
  - `chest pain`
  - `cannot breathe`
  - `shortness of breath`
  - `unconscious`
  - `seizure`
  - `heavy bleeding`
- Verification:
  - emergency condition count is now 13 in draft graph.
  - `/v1/chat-messages` with role `patient` and query `Patient question: chest pain and cannot breathe` returned HTTP 200.
  - answer routed to fixed emergency escalation and includes `โทร 1669`.
- No Patient Summary graph or runtime code was changed.

---

## Session Note - 2026-06-10 n8n Variables + Workflow Publish

### Changelog

| Date | File | Change |
|------|------|--------|
| 2026-06-11 | `n8n/.env.n8n`, `n8n/docker-compose.n8n.yaml` | เปลี่ยน tunnel จาก ngrok → Cloudflare Tunnel: `N8N_WEBHOOK_URL=https://n8n.bbh-hospital.com`, ลบ `NGROK_AUTHTOKEN`/`NGROK_DOMAIN`/`N8N_TUNNEL`, ลบ service `ngrok` และ `hospital-ngrok-n8n` ออกจาก compose |
| 2026-06-10 | `n8n/workflows/ops-health-alert.starter.json` | เปลี่ยน `$env` → `$vars` สำหรับ `DIFY_API_KEY`, `DIFY_API_URL`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` ใน Code nodes ทั้งหมด เพื่อหลีกเลี่ยง `N8N_BLOCK_ENV_ACCESS_IN_NODE` restriction; n8n Variables 4 ตัวสร้างใน DB แล้ว; workflow publish สำเร็จ; แก้ connections LINE #1 Webhook → Parse Events → Is Follow? (เดิมเชื่อมตรงไป Ask Dify + Reply ข้าม Parse/Follow logic) |

---

## Session Note - 2026-06-21 BBH Portal Calendar + Booking Cancellation

### What changed

- Continued Phase 2 Web Dashboard work on branch `DevFolk`.
- Wired Google Calendar into the CRO Calendar page:
  - Added JWT-protected `GET /api/calendar/events`.
  - Added backend router `backend/api/calendar_api.py`.
  - Included the calendar router in `backend/main.py`.
  - Added `calendar_client.list_events(...)` to normalize Google Calendar events for the frontend.
  - Added frontend hook `frontend/src/hooks/useCalendarEvents.ts`.
  - Calendar page now merges booking rows from MySQL with Google Calendar events for the selected month.
- Added CRO appointment cancellation flow:
  - Added backend `POST /api/bookings/{request_uid}/cancel`.
  - Added schema `CancelRequest`.
  - Added service `booking_service.cancel_booking(...)`.
  - Added repository helper `booking_repo.update_cancelled(...)`.
  - Added migration `backend/migrations/0023_booking_calendar_cancelled_status.sql` to allow `calendar_status='cancelled'`.
  - Cancel flow deletes/cancels the Google Calendar event first, then marks the booking row as `status='cancelled'` and `calendar_status='cancelled'`.
- Added frontend cancel UI on the Calendar page:
  - Confirmed/approved appointment cards expand on hover.
  - The expanded area shows a `ยกเลิกนัด` button.
  - The button asks for browser confirmation before calling the cancel API.
  - Successful cancel invalidates bookings and calendar queries so the page refreshes.
- Improved Calendar readability for CRO:
  - Reworded event counters from Google wording to appointment wording such as `1 นัด`.
  - Google Calendar cards now parse BBH event descriptions and show CRO-friendly fields: patient name, time, phone, symptom, and request UID when present.
- Refined modal/layout details from the same session:
  - `Modal.tsx` supports `size="md" | "lg"`, constrained height, scrollable body, and cleaner header/footer behavior.
  - `NewBookingModal.tsx` was compacted so inputs/buttons no longer sink below the viewport.
  - `Topbar.tsx` was reduced in height to give working pages more vertical room.
- Fixed two integration bugs found while testing:
  - `frontend/src/hooks/useAllBookings.ts` now uses page size 100 because backend max `limit` is 100.
  - `booking_repo.get_by_uid(...)` now serializes MySQL `DATE`/`TIME` values to strings before FastAPI response validation.

### Backend files touched

- `backend/api/bookings_api.py`
- `backend/api/calendar_api.py`
- `backend/integrations/calendar_client.py`
- `backend/main.py`
- `backend/repositories/booking_repo.py`
- `backend/schemas/bookings.py`
- `backend/services/booking_service.py`
- `backend/migrations/0023_booking_calendar_cancelled_status.sql`

### Frontend files touched

- `frontend/src/components/Modal.tsx`
- `frontend/src/components/Topbar.tsx`
- `frontend/src/components/bookings/NewBookingModal.tsx`
- `frontend/src/hooks/useAllBookings.ts`
- `frontend/src/hooks/useCalendarEvents.ts`
- `frontend/src/hooks/useCancelBooking.ts`
- `frontend/src/pages/Calendar.tsx`

### Verification completed

- Frontend:
  - `npm.cmd run lint` - PASS
  - `npm.cmd run build` - PASS
  - Playwright hover test - PASS:
    - Login page loaded.
    - CRO login succeeded.
    - Calendar page loaded.
    - Selected day with appointments.
    - Found 4 cancel buttons in DOM.
    - Before hover: action area `opacity=0`, `height=0`.
    - After hover: action area `opacity=1`, `height=34`.
  - Screenshots kept for visual reference:
    - `C:\Users\wisru\AppData\Local\Temp\bbh_calendar_before_hover.png`
    - `C:\Users\wisru\AppData\Local\Temp\bbh_calendar_after_hover.png`
- Backend:
  - Python compile smoke test for changed modules - PASS.
  - Bridge health `http://localhost:8000/` - PASS.
  - API smoke test - PASS:
    - Login CRO - `200`
    - Create test booking - `200`
    - Approve test booking - `200` and created a Google Calendar event.
    - Cancel test booking - `200`.
    - Detail after cancel - `status='cancelled'`, `calendar_status='cancelled'`.
    - Test booking/patient rows were cleaned up.

### Current checkpoint

- The cancellation feature is implemented and locally verified end-to-end.
- Docker Desktop must be running for bridge/database tests.
- `backend/migrations/0023_booking_calendar_cancelled_status.sql` must be applied in any environment before using cancel flow, otherwise MySQL enum will reject `calendar_status='cancelled'`.
- No commit was made for this session.

### Bugfix follow-up - 2026-06-21

Fixed review issues found after the initial Calendar cancellation implementation:

- Fixed `cancel_booking` race/leak risk:
  - Old flow cancelled Google Calendar before DB update.
  - New flow updates DB from `approved` to `cancelled` first.
  - Only the request that wins the DB transition cancels the Google Calendar event.
  - Calendar cleanup is best-effort and logs exceptions instead of rolling DB state back.
- Fixed reject/cancel audit semantics:
  - `update_rejected` and `update_cancelled` no longer write to `approved_by`.
  - Both transitions now write `booking_audit_logs` rows with `actor_type='cro'`, `actor_id`, action, from/to status, and JSON detail reason.
- Added LAN dev CORS support in `backend/main.py`:
  - `allow_origin_regex` now accepts private network origins for office testing (`192.168.*`, `10.*`, `172.16-31.*`).
- Refactored AI endpoint to follow backend layered rules:
  - Added `backend/schemas/ai.py`.
  - Added `backend/services/ai_service.py`.
  - `backend/api/ai.py` is now a thin router that imports schemas + service only.
- Fixed TanStack Query hook guardrail:
  - Removed `select` from `frontend/src/hooks/useCalendarEvents.ts`.
  - Added the required one-line hook comment.
  - `Calendar.tsx` now reads `googleQ.data?.data` explicitly.

Verification for this follow-up:

- Backend compile smoke test - PASS.
- Frontend `npm.cmd run lint` - PASS.
- Frontend `npm.cmd run build` - PASS.
- Bridge rebuilt with Docker - PASS.
- Cancel API smoke test - PASS:
  - Create booking `200`.
  - Approve booking `200` and create Google Calendar event.
  - Cancel booking `200`.
  - Cancel same booking again `409`.
  - DB row reached `status='cancelled'`, `calendar_status='cancelled'`.
  - `booking_audit_logs` contained action `cancelled`, `from_status='approved'`, `to_status='cancelled'`, actor `folkcro@gmail.com`.
  - Test booking/patient rows were cleaned up.
- Reject API smoke test - PASS:
  - Create booking `200`.
  - Reject booking `200`.
  - DB row reached `status='rejected'`, `approved_by=NULL`.
  - `booking_audit_logs` contained action `rejected`, `from_status='pending_approval'`, `to_status='rejected'`, actor `folkcro@gmail.com`.
  - Test booking row was cleaned up.
- LAN CORS preflight from `http://192.168.1.50:5173` - PASS, returned matching `Access-Control-Allow-Origin`.
- `/api/ai/chat` smoke test after refactor - PASS, returned answer + conversation_id.

Remaining minor note:

- `_serialize_booking_row` still lives in `booking_repo.py`; it is a small API serialization helper and can be moved to `utils/` later if repo purity becomes stricter.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
