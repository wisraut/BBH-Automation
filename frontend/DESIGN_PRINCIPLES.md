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

## Visual Hierarchy & Zoning + เสาหลักที่เหลือ (research 2026-07-22)

> กรอบแม่ = **CRAP** (Robin Williams): **C**ontrast · **R**epetition · **A**lignment · **P**roximity
> ทุกหลักด้านล่างมี "ทำไม" + "implement ยังไงใน Tailwind + BBH tokens" — ห้ามยัดสี/ฟอนต์นอก token

### A. Visual Hierarchy — จุดนำสายตา (ตาไปไหนก่อน 1-2-3)
ทุกหน้าจอต้องตอบได้ว่า "ตาไปตรงไหนเป็นอันดับ 1, 2, 3" — ถ้าทุกอย่างเด่นเท่ากัน = ไม่มีอะไรเด่น = อาการ "รก"
เครื่องมือสร้างลำดับ เรียงตามพลัง: **ขนาด** (พระเอก 1 ตัว/โซน ใหญ่สุด) > **สี/คอนทราสต์** (สงวน green+amber+red ให้ของที่ต้องนำสายตาจริง) > **ตำแหน่ง** > **น้ำหนักฟอนต์**
Implement: heading `text-2xl font-semibold`, body `text-sm text-bbh-muted`, KPI พระเอก `text-3xl/4xl font-bold text-bbh-ink`; ปุ่มรอง = ghost/outline ไม่ใช่ solid สีเดียวกับปุ่มหลัก

### B. Scan pattern — F (ข้อมูลเยอะ) / Z (หน้าโล่ง)
ตาราง/รายชื่อ = ตากวาดรูป **F** → ของสำคัญ + action หลัก ไว้มุมบน-ซ้าย/บนขวาสุดของ header; filter/search อยู่ top strip
Dashboard การ์ด/หน้า login = **Z** → พาดสายตาซ้ายบน→ขวาล่าง ปุ่มหลักปลายทางขวาล่าง
Implement: page title + primary action bar อยู่บนสุดเสมอ; ปุ่ม "เพิ่ม/บันทึก" ชิดขวาของ header (ปลาย F แถวแรก)

### C. Zoning — Proximity + Common Region (ไม่ให้ปนกัน)
**กฎเหล็ก: ช่องไฟในกลุ่ม < ช่องไฟระหว่างกลุ่ม เสมอ** — สมองอ่าน "ของชิดกัน = พวกเดียวกัน" ในเสี้ยววินาทีก่อนคิด
- whitespace = เครื่องมือกั้นโซนอันดับ 1 (ไม่ต้องขีดเส้น/ใส่กล่องทุกอัน)
- card/border = common region ใช้เมื่อ whitespace ไม่พอ (จอแคบ/ข้อมูลแน่น)
- **กับดัก:** เอาปุ่มหลักไปกลืนในกลุ่มปุ่มอื่น = สมองมองข้าม → แยกโซนออกมา
Implement: ในการ์ด `gap-2/gap-3`; ระหว่างการ์ด `gap-6/gap-8`; section คั่นด้วย whitespace ก่อน แล้วค่อย border; เลี่ยงกล่องซ้อนกล่องซ้อนกล่อง

### D. Alignment — แนวเส้นล่องหน (ตัวชี้วัด "มืออาชีพ")
ขอบที่เรียงตรงแนวเดียว = สมองอ่านว่า "จงใจ/เป็นระเบียบ"; เยื้องนิดเดียว = ดูสมัครเล่นทันที
Implement: ทุก element เกาะ grid เดียว ขอบซ้ายตรงกัน; เลี่ยง center-align ข้อความยาว (ขอบซ้ายฟันปลา); label:value ในฟอร์มจัดแนวขอบเดียว; ใช้ `grid`/`flex`+`gap` แทนเว้น margin มือ

### E. Repetition / Consistency — ความสม่ำเสมอ = ความน่าเชื่อถือ
pattern เดียวซ้ำทั้งเว็บ (การ์ด/ปุ่ม/badge/ช่องไฟ หน้าตาเหมือนกันทุกหน้า) → สมองไม่ต้องเรียนรู้ใหม่ทุกหน้า + ดูเป็นระบบเดียว
Implement: ใช้ component กลาง (`Modal`/`StatusBadge`/Card) ซ้ำ ห้าม one-off; สี/ช่องไฟ/รัศมีขอบ มาจาก token ชุดเดียว ไม่ magic number

### F. Typography — ระบบตัวอักษร (เว็บเรายังไม่มีระบบนี้)
- body 16px; heading = 1.3-1.6x ของ body ไล่เป็น **scale** ไม่ใช่สุ่ม
- line-height: body 1.4-1.7, หัวข้อ 1.2-1.3
- **ความยาวบรรทัด (measure) 45-75 ตัวอักษร** — ยาวกว่านี้ตาหลงบรรทัด
- ฟอนต์ ≤ 2 ตระกูล, น้ำหนัก ≤ 3 (regular/medium/semibold)
Implement: ใช้เฉพาะค่าจาก type scale ของ tailwind (`text-xs`..`text-3xl`); content ยาวใส่ `max-w-prose leading-relaxed`

### G. Color proportion 60-30-10 (ต่อยอด Palette discipline ข้างบน)
สัดส่วนสีทั้งหน้า: **60% neutral** (พื้น/surface) · **30% โครงรอง** (muted/line/green-soft) · **10% accent** (green action + amber/red signal)
accent เกิน 10% = จอเริ่มตะโกน = ไม่มีอะไรเด่น (อาการรก)
Implement: พื้น `bbh-surface` เป็นหลัก; solid `bbh-green` เฉพาะ action หลัก 1 ตัว/โซน; ที่เหลือ ghost/neutral

### H. Contrast floor — WCAG AA (อ่านออกจริง)
text ปกติ ≥ **4.5:1**, ข้อความใหญ่/ไอคอน/ขอบ input ≥ **3:1**
low-contrast = ปัญหา accessibility อันดับ 1 ของเว็บทั้งโลก (79% ของ homepage ปี 2025 ตก); สำคัญกับ รพ. — คนอ่านทุกวัย/แสงห้องตรวจต่างกัน
Implement: verify `bbh-muted` บนพื้นขาวผ่าน 4.5:1 (WebAIM Contrast Checker); ห้ามเทาจางบนขาวสำหรับ text ที่ต้องอ่าน

### I. Data-ink ratio — ตาราง/ผลแล็บ (Tufte)
"หมึก" ทุกหยดที่ไม่ใช่ข้อมูล = ลบทิ้ง: เส้นตารางถี่, zebra ทุกแถว, กล่องซ้อน, สีพื้น cell
Implement: ตารางใช้ `divide-y` เส้นแนวนอนบางๆ แทนกริดเต็ม; ไม่ border รอบทุก cell; ตัวเลข align ขวา; หัวตาราง `text-xs text-bbh-muted uppercase`

### J. Elevation / depth — เงาแบบสำรวม (2025)
เงา = สื่อ "ชั้น" + "กดได้"; เทรนด์ปัจจุบัน = เงาบางเกือบมองไม่เห็น (เงาหนา = ดูเก่า/2015)
ระดับ: พื้น(0) < การ์ด(เงาบาง) < dropdown/hover(ขึ้นนิด) < modal(ชัดสุด)
Implement: card `shadow-sm` → hover `shadow-md` → modal `shadow-xl`; อย่าใส่เงาหนาทุกกล่อง (ทุกอย่างลอย = ไม่มีลำดับ)

### K. Interaction states & feedback — ทุกของกดได้ต้องตอบสนอง
ปุ่ม/แถว/ลิงก์ ต้องมี hover + focus(keyboard) + active + disabled + loading; งานที่รอต้องมี skeleton; ไม่มีข้อมูลต้องมี empty state ที่บอกทางต่อ
Implement: ปุ่มหลัก `hover:bg-bbh-green-dark focus-visible:ring`; ปุ่มโหลด "บันทึก"→"กำลังบันทึก..."+disabled; ตารางว่าง = empty state พร้อมปุ่ม "เพิ่มรายการแรก"; loading = skeleton ไม่ใช่จอขาว

### L. Spacing rhythm — 8pt grid (จังหวะช่องไฟ)
ทุกระยะเป็นทวีคูณ 8 (4/8/16/24/32/48); ค่าคี่ (5,7,20,28) เรนเดอร์เบลอที่ 1.5x + ทำลายจังหวะ (เคยพลาดมาแล้ว — ดู mistakes log ใน CLAUDE.md)
Implement: ใช้ `p-2/4/6/8`, `gap-4/6` เท่านั้น; ห้าม `p-5/p-7/mt-[13px]`; ช่องไฟ = ภาษาบอกความสัมพันธ์ (คู่กับ zoning)

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
- Visual Hierarchy (size/contrast/position) — ixdf.org/literature/topics/visual-hierarchy, uxpilot.ai/blogs/visual-hierarchy
- Gestalt Proximity / Common Region — nngroup.com/articles/gestalt-proximity, toptal.com/designers/ui/gestalt-principles-of-design
- F-pattern / Z-pattern scanning — medium.com/uxd-critical-software (F & Z reading patterns), 99designs.com/blog (F/Z visual hierarchy)
- CRAP (Contrast/Repetition/Alignment/Proximity) — Robin Williams, Non-Designer's Design Book; vwo.com/blog/crap-design-principles
- Typography system (scale/measure/line-height) — designsystem.digital.gov/components/typography, designsystems.surf/articles (typography 101)
- 60-30-10 + WCAG contrast — visionaustralia.org (60-30-10 accessible palettes), webaim.org/articles/contrast
- Data-ink ratio / density — Tufte; holistics.io/blog/data-ink-ratio; Stephen Few "Show Me the Numbers"
- Elevation / depth (restrained shadows) — atlassian.design/foundations/elevation, fluent2.microsoft.design/elevation
- 8pt grid / spacing tokens — atlassian.design/foundations/spacing, designsystems.com/space-grids-and-layouts
