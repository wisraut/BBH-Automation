# BBH UI — Design Principles

> อ่านก่อนแตะ UI ทุกครั้ง (คู่กับกฎข้อ 10 ใน root CLAUDE.md: research philosophy ก่อน design)
> หลักพวกนี้มาจาก research จริง ไม่ใช่รสนิยม — cite แหล่งท้ายไฟล์

---

## รากเดียวของทุกอย่าง

**คอขวดคือสมองของผู้ใช้ ไม่ใช่พื้นที่จอ**

อย่าถามว่า "จอนี้ใส่อะไรได้อีก" — ถามว่า **"สมองคนดูต้องทำงานน้อยที่สุดได้แค่ไหน"**
ขีดจำกัดสมองตายตัว เปลี่ยนไม่ได้ (usability = จิตวิทยามนุษย์ ซึ่งเปลี่ยนช้ากว่าเทคโนโลยีมาก)

**ปรัชญาแม่ (Dieter Rams):** *"น้อย แต่ดีกว่า"* — minimalism ไม่ใช่ว่างเปล่า แต่คือ **เอาเฉพาะแก่น ตัดส่วนไม่จำเป็นทิ้ง** ของทุกชิ้นที่เหลือต้องมีเหตุผล

---

## หลักปฏิบัติ (ทำไม + ใช้ยังไง)

### 1. Working memory มีแค่ ~4-7 ช่อง (Miller / Cognitive Load Theory)
ยัดของพร้อมกันเยอะ = สมองล้น = ตัดสินใจช้า **เป็นขีดจำกัดชีววิทยา ไม่ใช่รสนิยม**
→ chunk เป็นก้อน, progressive disclosure (พับของรอง), 1 หน้าจอโชว์เฉพาะงานที่ต้องทำ

### 2. สมองเห็น "สี" ก่อนคิด (< 250ms, Preattentive Processing)
สีถูกประมวลผล**ก่อน**ความคิดรู้ตัว = ช่องสัญญาณด่วน ถ้าทุกอย่างมีสี = ไม่มีอะไรเด่น
→ **สงวนสีไว้ให้สิ่งสำคัญจริง**

### 3. "อย่าทำให้ฉันต้องคิด" (Krug)
ทุก "เอ๊ะ?" (icon นี้แปลว่าอะไร / ทำไมสีนี้) = ภาษีสมองที่มองไม่เห็น สะสมเรื่อยๆ
ลำดับ: ชัดในตัว > อธิบายตัวเองได้ > ต้องคิด (แย่สุด)
→ ตัดของประดับที่ทำให้เกิด "เอ๊ะ ทำไมมีอันนี้"

### 4. กฎ UX ปฏิบัติ
- **Hick:** ตัวเลือกยิ่งเยอะ ตัดสินใจยิ่งช้า → ลดของที่แข่งกันเด่นต่อหน้าจอ
- **Fitts:** ปุ่มใหญ่+อยู่ใกล้ = กดง่าย → action หลักต้องเด่น/เข้าถึงง่าย; ปุ่มอันตราย (ลบ) เล็ก/กดยากโดยตั้งใจ
- **Jakob:** คนคาดหวังให้แอปเราเหมือนแอปที่เขาคุ้น → ใช้ convention อย่าประดิษฐ์ใหม่
- **Tesler (Conservation of Complexity):** ความซับซ้อนทำลายไม่ได้ ย้ายได้ → **ให้ระบบแบกแทนผู้ใช้** (curate/pre-select/auto-surface)

### 5. Recognition > Recall + Aesthetic-Usability Effect (Nielsen)
โชว์ตัวเลือกให้เห็น ดีกว่าให้จำเอง; หน้าที่ดูสะอาด คน**รู้สึก**ว่าใช้ง่ายกว่า + ให้อภัย bug เล็กมากกว่า
→ สำคัญกับ **โรงพยาบาล**: สะอาด = น่าเชื่อถือ = ไว้ใจ

---

## Palette discipline (BBH tokens)

ใช้ **4 บทบาทเท่านั้น** — สีนอกนี้ (sky/rose/orange/emerald/blue/pink/purple/teal/indigo) ห้ามใช้

| บทบาท | token | ใช้เมื่อ |
|-------|-------|---------|
| Neutral | `bbh-ink` / `bbh-muted` / `bbh-line` / `bbh-surface` | ข้อความ, เส้น, พื้นหลัง — ค่าเริ่มต้นของทุกอย่าง |
| Brand | `bbh-green` / `bbh-green-soft` / `bbh-green-dark` | action หลัก, active/selected |
| Warn | `amber-*` | ต้องระวัง/รอดำเนินการ (รอ review, ยังไม่ยืนยัน) |
| Danger | `red-*` | อันตราย/ทำลาย (แพ้ยา, ค่าผิดปกติวิกฤต, ลบ) |

---

## Icon test (เก็บ vs ตัด)

- **เก็บ** ถ้าอยู่ในปุ่ม/ลิงก์ (functional) — เพิ่ม/ลบ/แก้/upload/ค้นหา
- **เก็บ** ถ้า icon = สัญญาณที่สื่อความหมาย — ลูกศร ↑↓ (สูง/ต่ำ/เทรนด์), in/out, warning ของ safety alert
- **ตัด** ถ้าเป็น icon ประดับหัวข้อ/label ที่ text บอกอยู่แล้ว (โดยเฉพาะที่มีสีต่างกันต่อหัวข้อ)
- **ห้าม emoji ทุกที่** (กฎ user) — ใช้ lucide-react เท่านั้น

---

## Decision test สั้นๆ ก่อนใส่อะไรลงจอ

> "สิ่งนี้จ่ายค่าสมองของผู้ใช้แล้วคุ้มไหม" — ถ้าตอบไม่ได้ชัด = ตัดทิ้ง

---

## Sources
- Miller's Law / Cognitive Load — lawsofux.com/cognitive-load, blog.uxtweak.com/millers-law
- Preattentive Processing — ixdf.org (preattentive visual properties)
- Don't Make Me Think (Krug) — readingraphics.com/book-summary-dont-make-me-think
- Laws of UX (Hick/Fitts/Jakob/Tesler) — lawsofux.com, uxdesigninstitute.com/blog/laws-of-ux
- Nielsen 10 Heuristics / Recognition vs Recall — nngroup.com
- Dieter Rams "less but better" — vitsoe.com/us/about/good-design, ixdf.org (10 commandments)
