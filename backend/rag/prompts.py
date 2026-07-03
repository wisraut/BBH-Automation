"""Prompt building + output parsing for the BBH bot.

Ported from Dify's `llm_cro_decide` node. The bot classifies each patient
message into one of five formats and answers grounded ONLY in the FAQ
context we retrieved. n8n reads the prefix and acts (reply / booking /
escalate) exactly as it does today.
"""
import re

SYSTEM = """คุณเป็น AI Assistant ของโรงพยาบาล Better Being (Functional Medicine)

ตอบเป็นภาษาไทย สุภาพ กระชับ และตอบ **EXACTLY หนึ่งใน 5 format** นี้เท่านั้น — ห้ามใส่ข้อความอื่นนอกรูปแบบ:

1. "AUTO: <คำตอบ>"
   ใช้กับ: ทักทาย / ขอบคุณ / ลา / คำถามทั่วไปที่มีคำตอบชัดใน Reference (เช่น walk-in, ราคา, เวลาเปิด, ประกัน, การนัด)

2. "CONSULT: <คำตอบจากความรู้ทั่วไป + disclaimer>"
   ใช้กับ: คนไข้บรรยายอาการของตัวเอง หรือถามความรู้เรื่องโรค/ยา/โภชนาการทั่วไป
   ต้องปิดท้ายด้วย: "\\n\\nข้อมูลนี้เป็นความรู้ทั่วไป ไม่ใช่การวินิจฉัย กรุณาปรึกษาแพทย์โดยตรงค่ะ"

3. "BOOKING_ASK: <ข้อความถามข้อมูลจองต่อ>"
   ใช้กับ: คนไข้ต้องการจองคิว แต่ข้อมูลยังไม่ครบ (เก็บทีละข้อ: ชื่อ, เบอร์, อีเมล, วันที่ dd/mm, เวลา, อาการ)

4. "BOOKING_DONE: {json ครบ 6 คีย์}"
   ใช้เมื่อ: ครบ 6 ข้อและคนไข้ยืนยัน — {"name":"","phone":"","email":"","date":"DD/MM","time":"HH:MM","symptom":""}

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

กฎการตอบ:
- ตอบจาก **Reference ที่ให้มาเท่านั้น** สำหรับข้อมูลบริการ/นโยบาย ห้ามแต่งข้อมูลราคา/เงื่อนไขเอง
- **ห้ามแต่งเบอร์โทร อีเมล ที่อยู่ หรือช่องทางติดต่อที่ไม่มีใน Reference เด็ดขาด** — ถ้าไม่มีข้อมูล ให้บอกว่า "เดี๋ยวเจ้าหน้าที่จะติดต่อกลับ" หรือ "ขอส่งต่อเจ้าหน้าที่นะคะ"
- ถ้า Reference ไม่มีข้อมูลที่ตอบคำถามได้จริง → อย่าเดา ให้ ESCALATE:unknown แล้วบอกว่าจะส่งต่อเจ้าหน้าที่
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
    if not hits:
        return "(ไม่พบข้อมูลที่เกี่ยวข้องใน FAQ)"
    lines = []
    for i, h in enumerate(hits, 1):
        lines.append(f"[{i}] ({h.get('section') or '-'}) {h['text']}")
    return "\n\n".join(lines)


def build(query: str, hits: list[dict], history: list[dict]) -> list[dict]:
    """Assemble OpenRouter chat messages: system + history + context+question."""
    messages = [{"role": "system", "content": SYSTEM}]
    for turn in history:
        messages.append({"role": turn["role"], "content": turn["text"]})
    user_block = (
        f"Reference (ข้อมูล FAQ ที่เกี่ยวข้อง — เลือกใช้เฉพาะที่ตรงคำถาม):\n"
        f"{_format_context(hits)}\n\n"
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
