"""Deterministic safety gate — replaces Dify's if_else_emergency node.

The LLM (Gemini flash-lite) sometimes mis-routes a clear emergency as AUTO
(observed: "แน่นหน้าอก หายใจไม่ออก" -> AUTO). For a hospital that is
unacceptable, so we short-circuit on hard keywords BEFORE the LLM: if any
emergency term appears, force ESCALATE:emergency with the 1669 message,
regardless of what the model would say. Errs toward over-escalation.
"""

# High-precision Thai emergency terms (substring match). Kept specific to
# avoid over-triggering on mild symptoms, but inclusive of life-threatening signs.
EMERGENCY_TERMS = [
    # หัวใจ / หายใจ
    "เจ็บหน้าอก", "แน่นหน้าอก", "จุกหน้าอก",
    "หายใจไม่ออก", "หายใจไม่ทัน", "หายใจลำบาก", "หอบเหนื่อยมาก", "หายใจไม่สะดวก",
    # สติ
    "หมดสติ", "ไม่รู้สึกตัว", "สลบ", "เรียกไม่รู้เรื่อง",
    # ระบบประสาท / stroke
    "ชัก", "เกร็ง", "ปากเบี้ยว", "พูดไม่ชัด แขนขาอ่อนแรง", "แขนขาอ่อนแรงเฉียบพลัน",
    # เลือด
    "เลือดออกไม่หยุด", "เลือดออกมาก", "ตกเลือด", "อาเจียนเป็นเลือด",
    # อื่น ๆ ถึงชีวิต
    "สำลัก", "จมน้ำ", "ไฟดูด", "อุบัติเหตุรุนแรง",
    "แพ้ยารุนแรง", "แพ้รุนแรง", "ปากบวมคอบวม", "ช็อก",
    "กินยาเกินขนาด", "กินยาพิษ", "ฆ่าตัวตาย", "ทำร้ายตัวเอง",
]

EMERGENCY_ANSWER = (
    "หากมีอาการฉุกเฉิน เช่น เจ็บหน้าอกรุนแรง หายใจไม่ออก หมดสติ ชัก หรือเลือดออกไม่หยุด "
    "โปรดโทร 1669 หรือไปห้องฉุกเฉินที่ใกล้ที่สุดทันทีค่ะ ความปลอดภัยของคุณสำคัญที่สุด"
)


def is_emergency(text: str) -> bool:
    t = (text or "").lower()
    return any(term.lower() in t for term in EMERGENCY_TERMS)


def emergency_result(text: str) -> dict:
    """Short-circuit result matching service.answer()'s shape."""
    return {
        "answer": EMERGENCY_ANSWER,
        "route_prefix": "ESCALATE:EMERGENCY",
        "raw": f"ESCALATE:emergency: safety-gate keyword hit — {text[:60]}",
        "sources": [],
        "safety_gate": True,
    }
