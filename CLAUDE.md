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

# 🚧 LAUNCH STATUS: ยังไม่ launch — ยังไม่มีผู้ใช้จริง (2026-07-15)
# ระบบ deploy บน bbh-hospital.com เพื่อ **test/dev** เท่านั้น ยังไม่มี CRO/หมอ/คนไข้ใช้งานจริง
# → แก้/refactor/redesign ได้เต็มที่ ไม่ต้องกลัว "กระทบผู้ใช้บน prod" (ยังไม่มีใครใช้)
# → ตอน launch จริงค่อยเข้มเรื่อง migration ระวัง downtime; ตอนนี้เน้นทำให้ถูก+ดีก่อน

# ⚙️ TOOLING: เลิกใช้ Codex ถาวรแล้ว (2026-07-15) — Claude ทำงานเองทั้งหมด
# → ไม่ต้องเช็ค/review/แยก commit งาน Codex อีกต่อไป (กฎ "check Codex work first" ยกเลิก)
# → กฎห้ามใส่ Co-Authored-By Claude ยังคงอยู่ (แยกเรื่องกัน)

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
2. **บันทึกทุกสิ่งที่แก้ไข/เพิ่มทุกครั้งที่ทำงานเสร็จ** (bug fix / feature / refactor) — อัพเดต **Status checklist ใน `CLAUDE.md`** + เพิ่ม **Changelog entry บนสุดของตารางใน `CHANGELOG.md`** (แยกไฟล์แล้ว ไม่ auto-load เข้า spawn — ประหยัด token)
3. **[OBSOLETE ตั้งแต่ 2026-07-12 — Dify ถูกถอดออกจากทุก runtime path + โค้ดแล้ว]** ~~อ่านสถานะ Dify จริงทุกครั้งที่เริ่ม session~~ — ไม่มี Dify ให้อ่านอีกต่อไป (container หยุด + code purged). AI ปัจจุบัน = own-RAG (`backend/rag/`); ตรวจสถานะด้วยการอ่านโค้ด `backend/rag/service.py` + endpoint `POST /internal/rag/answer`. ขั้นตอน DB/API query ด้านล่างเก็บไว้เป็นประวัติเฉยๆ:

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

11. **ก่อน `git commit` ทุกครั้ง → รัน `/code-review` แล้วตามด้วย `/security-review`** — code-review จับโค้ดซ้ำ/คุณภาพ/ประสิทธิภาพ; security-review จับ secret หลุด/ช่องโหว่ (สำคัญเพราะเป็น hospital + HIPAA-like + เคยมี token หลุดในแชท) แก้ issue ที่เจอก่อน commit

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

### สถานะ Dify — ถอดออกครบแล้ว (2026-07-12): container หยุด + code purged; block ด้านล่างเก็บเป็นประวัติ

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
email_poller.py  ─────────┐         ┌──── main.py (FastAPI + Cloudflare Tunnel)
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
| Tunnel | Cloudflare Tunnel (`bridge.bbh-hospital.com`); URL อ่านจาก `PUBLIC_URL` ใน .env |
| Monitor | Web Dashboard หน้า System Health (`frontend/.../SystemHealth.tsx`) |

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
DIFY_API_URL          = (ลบแล้ว 2026-07-12 — ไม่มี Dify)
DIFY_API_KEY          = (ลบแล้ว 2026-07-12 — ไม่มี Dify)
GMAIL_EMAIL           = wisrutyaemprayur@gmail.com
GMAIL_APP_PASSWORD    = (.env — App Password)
EMAIL_POLL_INTERVAL   = 120 (วินาที)
SERVER_PORT           = 8000

PostgreSQL (hospital_db):
  Host: localhost  Port: 5433  User: postgres  Password: (DB_PASSWORD ใน .env)
  Port 5433 เพราะ 5432 ถูก local PostgreSQL จอง
```

> ⚠️ `OLLAMA_API_URL` / `OLLAMA_MODEL` ใน .env เป็น dead config — code ไม่อ่านแล้ว

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
- [x] **start.bat launcher sync หลังถอด Dify** — launcher ไม่เปิด Dify stack/ไม่รอ `/v1/info`/ไม่ restart `docker-nginx-1` แล้ว; flow ปัจจุบันคือ Docker → Bot Ops DB → Bridge → n8n → Frontend (อัปเดต 2026-07-07)
- [x] **Doctor Today frontend prototype** — `/schedule` เป็นหน้าแรกหมอแบบ clinical cockpit: next patient focus, pre-visit AI brief, clinical signals, appointment timeline, review queue; frontend-only reuse schedule API (อัปเดต 2026-07-07)
- [x] **Doctor Calendar frontend prototype** — เพิ่ม `/doctor-calendar` สำหรับหมอ: week calendar, appointment layer, unavailable/time-off blocks จาก `schedule_blocks`, inspector panel และ modal block time; frontend-only reuse schedule APIs (อัปเดต 2026-07-07)
- [x] **Doctor unavailable blocks protect CRO booking** - CRO Calendar shows `doctor_schedule_blocks`; ApproveModal warns/disables conflicting slots; backend approve/reschedule returns `DOCTOR_BLOCKED` for overlapping doctor blocks (updated 2026-07-07; **guard deployed to prod 2026-07-08** — container เดิมยังไม่มีจน rebuild)
- [x] **นัด CRO ขึ้นปฏิทินแพทย์ (DB = source of truth ต่อแพทย์)** — `approve_booking` เขียน `requested_date`/`requested_time`+`assigned_doctor_id` ลง `booking_requests` (เดิมวันจริงอยู่แค่ Google Calendar → หน้าหมอว่าง); `/api/schedule/me` filter per-doctor ทำงานทันที + รองรับหลายหมอ; backfill นัดเก่า 4 วัน + 9 ผูก Dr. AI BBH (id=2); Google Calendar = mirror, per-doctor sync = Phase 2 (multi-calendar เมลที่สอง) (2026-07-08)
- [x] **[Red-team] Emergency safety gate hardened** — `is_emergency` เพิ่ม `_normalize` (ตัด zero-width + ลบ whitespace) + co-occurrence (อวัยวะ+อาการ) + synonym/EN กัน bypass การพิมพ์ธรรมชาติ (เว้นวรรค/reorder/colloquial "หายใจไม่ค่อยออก"/อังกฤษ) ที่เดิมทำให้คนไข้ฉุกเฉินหลุด escalate; residual = พิมพ์ผิดหนัก → แนะนำ LLM emergency-classifier ชั้นสอง. **Red-team (2026-07-08): ทุก finding ที่เจอ fixed+deploy หมดแล้ว** — emergency gate, pii bypass, booking input-length, Batch A validation, rate-limit LLM path, report/lab upload hardening, + MED (Google thread-safety / stale-event self-heal). **cro อ่าน medical record = ตั้งใจตาม policy รพ. (read-only+audited) — อย่า tighten (มี comment กันไว้)**. **ยังไม่ได้เทส:** prompt injection กับ real KB hits, LINE webhook signature, admin/alert endpoints. ดู memory `project_red_team_findings_2026_07` + CHANGELOG
- [x] **Doctor Calendar month/week switch** — `/doctor-calendar` สลับสัปดาห์/เดือน; month view pattern แบบ CRO แต่ใช้ appointment/block ของหมอ พร้อม inspector รายวัน (อัปเดต 2026-07-07)
- [x] **Bot Ops MySQL** — `bot_sessions` + `booking_requests` + `booking_audit_logs`
- [x] **Dify dead code ถอดออกครบ (2026-07-12)** — ลบ `dify_patches/` (9 ไฟล์), `USE_OWN_RAG` flag (config+session+n8n → hardwire RAG), `_DIFY_TRIAGE_PATTERN` (dead), Dify docstrings/comments ที่บรรยาย runtime ผิด, DIFY env; n8n node "Ask Dify + Reply" → "Ask RAG + Reply" (ลบ else-branch Dify); เทส `call_dify` → `call_rag` ยิง `/internal/rag/answer`; regen-safe hand-edit `api-types.ts`. commit `df86157` บน DevFolk (pushed). **เก็บไว้:** คอลัมน์ DB `dify_conversation_id`/`dify_answer` (repurpose เป็น provider-agnostic id ใช้จริง), migrations, lineage comment ที่ถูกต้อง. **Deployed ครบ + verified (2026-07-13):** (1) **Frontend** build+`wrangler pages deploy --branch=main` → bbh-hospital.com; bundle ไม่เหลือคำว่า "Dify" เลย. (2) **n8n RAG-only** — จุดพลาด: patch SQLite ตรงแบบ**ไม่ sync pointer** โดน n8n revert (สร้าง version ใหม่ restore ของเดิม); **วิธีที่ persist จริง = recipe เต็ม** (สร้าง version ใหม่ + set `entity.versionId`=`activeVersionId`=`publishedVersionId` ให้ตรงกันหมด + UPDATE ทั้ง workflow_entity.nodes และ workflow_history[newV]) → n8n ไม่เจอ inconsistency เลยไม่ heal; verified persist ข้าม restart 2 รอบ + webhook จริง→`/internal/rag/answer 200`→AUTO. node **ไม่อ่าน use_own_rag แล้ว**. (3) **Bridge** rebuilt เอา flag ออกจริง (session ไม่ส่ง use_own_rag) + verified chain ทำงานโดยไม่มี flag. **บทเรียน:** ต้องแก้ n8n ผ่าน recipe เต็ม (ดู memory `reference_n8n_live_workflow_patch`); การ rebuild bridge ถอด flag **ก่อน** n8n เป็น RAG-only เคยทำบอตตอบ default ชั่วคราว (desync — แก้แล้ว). n8n DB backup = scratchpad `n8n_backup2_prerecipe.sqlite`
- [x] **Book RAG — ตำราแพทย์ 5 เล่ม + two-pass CONSULT grounding (deployed+verified live 2026-07-14)** — user ถามว่า RAG ใช้ตำราที่เคยอยู่ Dify KB ไหม → verify: ตำราไม่ได้ย้ายมาตอนถอด Dify. ingest 5 เล่ม (Lupus / Dermatology-autoimmune / AI-autoimmune / FM-New-Standard / IFM-textbook) → `kb_book_chunks` **1,655 chunks** (BGE-M3, section-aware ~500tok, **แยกตารางจาก FAQ** กันปน = Multi-Domain RAG). `service.answer` **two-pass**: pass1 classify (ไม่มีตำรา), ถ้า route=CONSULT → `vector_store.search_books` + re-answer grounded (**Adaptive RAG / route-gate**; score-gate ใช้ไม่ได้เพราะ Thai↔ตำราอังกฤษ score ชนกัน). + bot wording (scope-setting + positive handoff) + **emergency fallback fix** (cro.py escalate case-insensitive + 1669 ack; service.py emergency net เขียน raw+clean). `book_ingester.py` ใหม่ (reusable, atomic). **code-review (high, workflow) เจอ+แก้ 7 / security-review ไม่พบช่องโหว่ / rebuild bridge + verified live HTTP** (medical→CONSULT+4 books, FAQ/greeting→no books). ดู CHANGELOG 2026-07-14. **Deployed live + committed + merged to main (2026-07-15):** commit `1f32ccc` บน DevFolk → fast-forward merge เข้า main (`6984b6a`) + push origin/main; main = DevFolk sync กันเป๊ะ (พร้อม commit `6984b6a` docs handover staff manual ที่ merge ติดมาด้วย)

- [x] **Staff AI chat: แนบรูป vision + lightbox + layout + ประวัติย้ายไป server (2026-07-20)** — หน้า `/ai`: (1) แนบรูป/วางคลิปบอร์ด → Gemini vision เห็นภาพจริง (validate ≤5MB client+server, รูปเต็ม transient ไม่เก็บ, เตือน PDPA) + lightbox กดขยาย; (2) โซนสนทนาชิดซ้าย+ขยาย `max-w-3xl`; (3) **ประวัติย้าย localStorage→server** (endpoint `/api/ai/conversations*` owner-scoped, `aiStore` rewrite, thumbnail เก็บ DB migration 0055, redact-on-send: DB ต้นฉบับ/LLM masked) → ข้ามเครื่อง/ล้าง browser ไม่หาย. 2 code-review+security แก้ครบ+verified live
- [x] **Book RAG เข้า staff AI assistant (web `/ai`) + PDPA mask ชื่อคนไข้ (2026-07-20)** — staff AI ต่อ Book RAG (ตำรา 5 เล่ม): `is_book_domain` gate (โดเมน autoimmune/FM, เช็ค history 3 เทิร์น) → `search_books` → inject + `book_sources` ผ่าน SSE/`ChatResponse`; "โหมดแพทย์" อ้างตำราจริงพร้อม cite เล่ม/หน้า. + PDPA: `_all_patient_names()` seed `redact_text` known_names → mask ชื่อคนไข้ในบล็อก schedule (booking+Google Calendar summary) ก่อนส่ง OpenRouter (เดิมหลุด). code-review 6 แก้ครบ + security 0; deploy VM + verified live. **เหลือ Track 2 = frontend render footnote `book_sources` + UI polish**

### ⚠️ รอ Test / ปัญหาค้าง

- [x] **Google Calendar event creation** — ใช้งานได้; ปัญหา 18/6, 19/6 เวลาผิดแก้แล้ว (session 2026-07-01) — ทั้ง (a) runtime cache bug และ (b) day/month/year rollover ที่ 23:00 fix ครบ; new n8n versionId `14ba96f1` (verified executions ตั้งแต่ 2026-06-24 ใช้ correct versionId ทุก exec)
- [x] **n8n runtime workflow version cache** — resolved 2026-07-01; fix ผ่าน direct SQLite patch (import:workflow ของ n8n 2.x reports success แต่ไม่ persist nodes จริง — ต้อง UPDATE workflow_entity.nodes + gen new versionId + insert workflow_history + sync activeVersionId/publishedVersionId/dependency ตรงๆ)
- [x] **Reschedule flow** — ครบ 2 branches: มีเวลาใหม่ + TBD (ยังไม่รู้เวลา); email แจ้งแพทย์ทั้ง 2 branches (verified inbox `dr.ai.bbh@gmail.com`)
- [x] **Doctor assignment ตอน approve** — Web ApproveModal บังคับเลือก + amber panel สำหรับ LINE bookings ที่ยังไม่มี doctor + API `/assign-doctor` แก้ทีหลังได้
- [x] **Cloudflare WAF `/internal/*`** — deploy ที่ edge, external 403 HTML block, internal Docker call ยังทำงาน (defense-in-depth alongside InternalPathGuard)
- [x] **email_poller (deprecated)** — ปิดถาวรตั้งแต่ 2026-07-01; Reports page ใน Web Dashboard เป็นช่องทางรับ lab report แทน (CRO upload + assign doctor); ถ้าอนาคตต้องการรับ email อีกก็ restore import + task ใน `backend/core/lifespan.py`
- [ ] **Security housekeeping [เลื่อนไปทำทีเดียวตอน pre-launch MVP — user ตัดสินใจ 2026-07-15]** — ทำรวดเดียวตอนใกล้ launch (ไม่ต้องเตือนซ้ำก่อนหน้านั้น แต่ **ห้ามลืมก่อน go-live**): (1) revoke Gmail App Password `<redacted>` ที่แชร์ในแชท → สร้างใหม่ + update .env, (2) delete Cloudflare API token `<redacted>` ที่แชร์ในแชท → ลบ row "BBH WAF automation"
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

**สถานะ Dify:** ถอดออกครบแล้ว (2026-07-12) — `dify_client.py`, `DIFY_*` env, `USE_OWN_RAG` flag, n8n else-branch ลบหมด ไม่มี dead code เหลือ; container ทั้ง stack ยังหยุดอยู่ (เหลือ `docker-db_postgres-1` = legacy hospital_db); rollback ต้อง revert commit ที่ถอด + start Dify container กลับ (ไม่มี flag ให้สลับแล้ว)
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

Changelog อยู่ในไฟล์ `CHANGELOG.md` แยกต่างหาก (ไม่ auto-load = ประหยัด token). **ทุกครั้งที่ทำงานเสร็จ ไปเพิ่ม entry ที่ `CHANGELOG.md` บนสุดของตาราง** (กฎ 2) — ไม่ต้องเขียนที่นี่ ถ้าต้องอ่านประวัติค่อยเปิด `CHANGELOG.md`.

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

## Session Notes

Session notes เก่า (2026-06) ย้ายไป `CLAUDE_ARCHIVE.md` แล้ว เพื่อลด token ที่ auto-load ต่อ subagent spawn อ่านไฟล์นั้นถ้าต้องการ context งานเดือน มิ.ย.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
