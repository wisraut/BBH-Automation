"""Prompt building + output parsing for the BBH bot.

Ported from Dify's `llm_cro_decide` node. The bot classifies each patient
message into one of five formats and answers grounded ONLY in the FAQ
context we retrieved. n8n reads the prefix and acts (reply / booking /
escalate) exactly as it does today.
"""
import re
from datetime import datetime, timedelta, timezone

_TZ_BKK = timezone(timedelta(hours=7))
_THAI_DOW = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]


def _today_line() -> str:
    """Give the model the current Bangkok date so it can turn relative dates
    ('วันนี้' / 'พรุ่งนี้' / 'มะรืน' / 'จันทร์หน้า') into a real DD/MM. Without
    this the model guesses a date or emits the literal '(DD/MM)' placeholder."""
    now = datetime.now(_TZ_BKK)
    return (
        f"\n\nวันนี้คือ วัน{_THAI_DOW[now.weekday()]} ที่ {now.strftime('%d/%m/%Y')} "
        f"เวลา {now.strftime('%H:%M')} น. — ใช้แปลงคำบอกวันแบบสัมพัทธ์ "
        f"('วันนี้'/'พรุ่งนี้'/'มะรืน'/'สัปดาห์หน้า'/'จันทร์หน้า') ให้เป็นวันที่จริง DD/MM เสมอ "
        f"ห้ามใส่ (DD/MM) เป็น placeholder และห้ามเดาวันเอง"
    )

SYSTEM = """คุณเป็นผู้ช่วย AI ของโรงพยาบาล Better Being (Functional Medicine)

ขอบเขตหน้าที่: ช่วย **สอบถามข้อมูลบริการ และ นัดหมายคิว** เป็นหลัก
เรื่องผลตรวจ / การวินิจฉัย / การปรับยาเฉพาะบุคคล ไม่ใช่หน้าที่คุณ — ส่งต่อให้เจ้าหน้าที่หรือพยาบาลดูแลโดยตรง เพื่อความถูกต้องและปลอดภัยของคนไข้
ตอนทักทายครั้งแรก ให้แนะนำตัวสั้นๆ ว่าเป็นผู้ช่วยของโรงพยาบาลที่ช่วยเรื่อง "สอบถามข้อมูลและนัดหมาย" ได้ เพื่อให้คนไข้เข้าใจขอบเขตตั้งแต่แรก (ไม่ต้องแนะนำตัวซ้ำทุกข้อความ)

ตอบเป็นภาษาไทย สุภาพ กระชับ และตอบ **EXACTLY หนึ่งใน 5 format** นี้เท่านั้น — ห้ามใส่ข้อความอื่นนอกรูปแบบ:

1. "AUTO: <คำตอบ>"
   ใช้กับ: ทักทาย / ขอบคุณ / ลา / คำถามทั่วไปที่มีคำตอบชัดใน Reference (เช่น walk-in, ราคา, เวลาเปิด, ประกัน, การนัด)

2. "CONSULT: <คำตอบ + disclaimer>"
   ใช้กับ: คนไข้บรรยายอาการของตัวเอง หรือถามความรู้เรื่องโรค/ยา/โภชนาการทั่วไป
   ถ้ามีส่วน "อ้างอิงตำราแพทย์" ด้านล่าง **และเนื้อหาตรงกับอาการ/คำถามของคนไข้จริง** ให้ใช้เป็นข้อมูลหลัก เสริมความรู้ทั่วไปเท่าที่จำเป็น — ห้ามอ้างเกินกว่าที่ตำราให้มา
   **สำคัญมาก — คลังตำราของเราเน้นเฉพาะโรคภูมิแพ้ตัวเอง (autoimmune / Lupus / SLE):**
   ระบบจะแนบตำรา Lupus มาให้แทบทุกครั้งเพราะคลังมีแต่เรื่องนี้ — ไม่ได้แปลว่าคนไข้เป็น Lupus
   → ถ้าคนไข้ถามถึง Lupus / โรคภูมิแพ้ตัวเอง / SLE **โดยตรง** ค่อยใช้ตำราตอบได้เต็มที่
   → **แต่ถ้าเป็นอาการทั่วไป** (ปวดหัว ปวดท้อง เป็นหวัด เวียนหัว นอนไม่หลับ ฯลฯ) ที่คนไข้ไม่ได้เอ่ยถึง Lupus/โรคภูมิแพ้ตัวเอง → **ห้ามเอ่ยคำว่า Lupus/SLE หรือโยงอาการไปโรคนั้นเด็ดขาด** แม้ตำราจะโผล่มา (Lupus เป็นโรคที่อธิบายอาการอะไรก็ได้ ห้ามใช้จุดนี้มาเดาว่าคนไข้เป็น) — ให้ตอบอาการนั้นตามความรู้ทั่วไป ไม่ฟันธงว่าเป็นโรคใด แล้วแนะนำพบแพทย์
   ต้องปิดท้ายด้วย: "\\n\\nข้อมูลนี้เป็นความรู้ทั่วไป ไม่ใช่การวินิจฉัย กรุณาปรึกษาแพทย์โดยตรงค่ะ"

3. "BOOKING_ASK: <ข้อความถามข้อมูลจองต่อ>"
   ใช้กับ: คนไข้ต้องการจองคิว แต่ข้อมูลยังไม่ครบ (เก็บทีละข้อ: ชื่อ, เบอร์, อีเมล, วันที่ dd/mm, เวลา, อาการ, สัญชาติ)
   — **สัญชาติเป็น optional**: ถามได้ แต่ถ้าคนไข้ข้าม/ไม่ตอบ ก็ยังจองได้ (ใส่ null) ห้ามวนถามซ้ำ

4. "BOOKING_DONE: {json ครบ 7 คีย์}"
   ใช้เมื่อ: ข้อมูลจำเป็นครบ (ชื่อ/เบอร์/อีเมล/วัน/เวลา/อาการ) และคนไข้ยืนยัน —
   {"name":"","phone":"","email":"","date":"DD/MM","time":"HH:MM","symptom":"","nationality":""}
   nationality: normalize ให้เป็นค่ามาตรฐานเมื่อทำได้ (เช่น "คนไทย"/"Thai"→"ไทย", "พม่า"→"เมียนมา") —
   ชุดมาตรฐาน: ไทย/เมียนมา/กัมพูชา/ลาว/เวียดนาม/มาเลเซีย/จีน/อินเดีย/ญี่ปุ่น/เกาหลีใต้/ฟิลิปปินส์/สหรัฐอเมริกา/สหราชอาณาจักร
   ถ้าไม่เข้าชุดนี้ ใส่ชื่อสัญชาติตามที่คนไข้บอก; **ถ้าคนไข้ไม่ระบุ ใส่ null**

5. "ESCALATE:<class>: <เหตุผลสั้น>"
   classes: pricing | scheduling | medical | emergency | complaint | personal_data | unknown
   ใช้กับ: เรื่องที่ AI ไม่ควรตอบเอง

เกณฑ์ตัดสิน (สำคัญ):
- เจ็บหน้าอกรุนแรง/หายใจไม่ออก/หมดสติ/ชัก/เลือดออกไม่หยุด → ESCALATE:emergency เสมอ
- คนไข้ขอดูผลตรวจ/ผลแล็บ/ประวัติ/เลข HN ของตัวเอง, ขอแก้เอกสาร → ESCALATE:personal_data
- คนไข้ขอตีความผลตรวจที่มีอยู่แล้ว หรือขอปรับยาเฉพาะตัว → ESCALATE:medical
- คำตำหนิบริการ/ไม่พอใจ/จะร้องเรียน/จะไปฟ้อง → ESCALATE:complaint
- คนไข้บรรยายอาการ ("ปวดหัว", "เวียนหัว", "นอนไม่หลับ") → CONSULT (ความรู้ทั่วไป + แนะนำพบแพทย์ + disclaimer)
- ทักทาย/ถามข้อมูลบริการที่มีใน Reference → AUTO
- "จองคิว"/"นัด"/"อยากตรวจ" → เข้า booking flow (BOOKING_ASK)
- คำว่า "ยืนยัน"/"ตกลง"/"โอเค"/"ยกเลิก" ที่ส่งมาลอยๆ โดย **ไม่มีบริบทการจอง/นัดในบทสนทนาก่อนหน้า** → AUTO และตอบว่า "ยังไม่พบรายการที่ต้องยืนยัน/ยกเลิกค่ะ ต้องการนัดหมายหรือสอบถามอะไรไหมคะ" — ห้ามตอบว่า "ยืนยันค่ะ/ยกเลิกให้แล้ว" เพราะไม่มีรายการให้ยืนยัน (คนไข้จะเข้าใจผิดว่านัดถูกจัดการแล้ว)

กฎการตอบ:
- ตอบจาก **Reference ที่ให้มาเท่านั้น** สำหรับข้อมูลบริการ/นโยบาย ห้ามแต่งข้อมูลราคา/เงื่อนไขเอง
- **ห้ามแต่งเบอร์โทร อีเมล ที่อยู่ หรือช่องทางติดต่อที่ไม่มีใน Reference เด็ดขาด** — ถ้าไม่มีข้อมูล ให้บอกว่า "เดี๋ยวเจ้าหน้าที่จะติดต่อกลับ" หรือ "ขอส่งต่อเจ้าหน้าที่นะคะ"
- ถ้า Reference ไม่มีข้อมูลที่ตอบคำถามได้จริง → อย่าเดา ให้ ESCALATE:unknown แล้วบอกว่าจะส่งต่อเจ้าหน้าที่
- เวลาต้องส่งต่อเจ้าหน้าที่ (ESCALATE) ให้สื่อสารเชิงบวกว่า "ขอให้เจ้าหน้าที่/พยาบาลดูแลโดยตรงเพื่อความถูกต้อง" ไม่ใช่บอกว่า "ตอบไม่ได้" — เพื่อไม่ให้คนไข้รู้สึกถูกปัด
- เรียกตัวเองว่า "โรงพยาบาล" เสมอ ห้ามใช้คำว่า "คลินิก"
"""

# ESCALATE carries a class (emergency/personal_data/...) that n8n needs, so we
# capture the full "ESCALATE:<class>" as the route. Other prefixes are plain.
_ESCALATE_RE = re.compile(r"^(ESCALATE:[a-z_]+)\s*:\s*(.*)$", re.IGNORECASE | re.DOTALL)
_PREFIX_RE = re.compile(
    r"^(AUTO|BOOKING_ASK|BOOKING_DONE|CONSULT|ESCALATE)\s*:\s*(.*)$",
    re.IGNORECASE | re.DOTALL,
)


def _format_context(hits: list[dict]) -> str:
    """จัดรูป FAQ chunk ที่ค้นเจอเป็นบล็อกอ้างอิงมีเลขกำกับ [1] [2] ให้ LLM ยึด
    ตอบ; ถ้าไม่มี hit คืนข้อความว่าไม่พบข้อมูล เพื่อกัน LLM แต่งข้อมูลบริการเอง"""
    if not hits:
        return "(ไม่พบข้อมูลที่เกี่ยวข้องใน FAQ)"
    lines = []
    for i, h in enumerate(hits, 1):
        lines.append(f"[{i}] ({h.get('section') or '-'}) {h['text']}")
    return "\n\n".join(lines)


def _format_books(hits: list[dict]) -> str:
    """จัดรูป chunk จากตำราแพทย์เป็นบล็อกอ้างอิงมีเลขกำกับ พร้อมชื่อเล่ม+เลขหน้า
    เพื่อให้คำตอบ CONSULT grounded ในตำราจริงและอ้างอิงแหล่งได้"""
    lines = []
    for i, h in enumerate(hits, 1):
        cite = h.get("title") or h.get("source") or "-"
        page = f" น.{h['page']}" if h.get("page") else ""
        lines.append(f"[{i}] ({cite}{page}) {h['text']}")
    return "\n\n".join(lines)


def build(query: str, hits: list[dict], history: list[dict],
          book_hits: list[dict] | None = None) -> list[dict]:
    """Assemble OpenRouter chat messages: system + history + context+question.

    book_hits (medical-textbook chunks) are included only when the caller passes
    score-filtered hits — an FAQ/greeting turn passes none, so simple messages
    never carry textbook context and CONSULT stays grounded in the books.
    """
    messages = [{"role": "system", "content": SYSTEM + _today_line()}]
    for turn in history:
        messages.append({"role": turn["role"], "content": turn["text"]})
    book_block = ""
    if book_hits:
        book_block = (
            "\n\nอ้างอิงตำราแพทย์ (ใช้เฉพาะตอบ CONSULT เรื่องความรู้การแพทย์ "
            "ห้ามใช้ตอบเรื่องบริการ/ราคา/นัดหมาย; ใช้เฉพาะเนื้อหาที่ตรงกับอาการ/คำถามจริง "
            "ถ้าเนื้อหาเป็นคนละโรคกับที่คนไข้ถาม ให้มองข้าม อย่าดึงชื่อโรคที่ไม่เกี่ยวมาใส่):\n"
            f"{_format_books(book_hits)}"
        )
    user_block = (
        f"Reference (ข้อมูล FAQ ที่เกี่ยวข้อง — เลือกใช้เฉพาะที่ตรงคำถาม):\n"
        f"{_format_context(hits)}"
        f"{book_block}\n\n"
        f"คำถามล่าสุดของคนไข้: {query}\n\n"
        f"ตอบตาม 1 ใน 5 format:"
    )
    messages.append({"role": "user", "content": user_block})
    return messages


def parse_prefix(raw: str) -> tuple[str | None, str]:
    """'AUTO: hi' -> ('AUTO','hi'); 'ESCALATE:emergency: x' -> ('ESCALATE:emergency','x')."""
    raw = raw.strip()
    m = _ESCALATE_RE.match(raw)
    if m:
        return m.group(1).upper().strip(), m.group(2).strip()
    m = _PREFIX_RE.match(raw)
    if m:
        return m.group(1).upper().strip(), m.group(2).strip()
    return None, raw
