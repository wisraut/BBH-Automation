"""Deterministic safety gate — replaces Dify's if_else_emergency node.

The LLM (Gemini flash-lite) sometimes mis-routes a clear emergency as AUTO
(observed: "แน่นหน้าอก หายใจไม่ออก" -> AUTO). For a hospital that is
unacceptable, so we short-circuit BEFORE the LLM: if any emergency signal
appears, force ESCALATE:emergency with the 1669 message. Errs toward
over-escalation (a false alarm just reaches a human — safe).

Matching is hardened against the ways real Thai messages evade a naive
substring search:
  - `_normalize` strips zero-width chars and ALL whitespace, so
    "เจ็บ หน้า อก" / "เจ็บ​หน้าอก" == "เจ็บหน้าอก".
  - co-occurrence rules (body/system word + distress word) survive word
    reordering and colloquial phrasing ("หน้าอกเจ็บมาก", "หายใจไม่ค่อยออก").
  - a small English set covers patients who type in English.

Known residual (deterministic limits): heavy typos ("เจบหน้าอก") and novel
synonyms can still slip. A dedicated LLM emergency check is the recommended
second layer for those — see red-team notes.
"""
import re
import unicodedata

_ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍⁠﻿"), None)


def _normalize(text: str) -> str:
    """Fold text so matching survives spacing / zero-width / case tricks."""
    t = unicodedata.normalize("NFC", text or "").lower()
    t = t.translate(_ZERO_WIDTH)
    t = re.sub(r"\s+", "", t)  # drop all whitespace
    return t


# Direct life-threatening terms (compared after normalization).
_DIRECT_TERMS = [
    "เจ็บหน้าอก", "แน่นหน้าอก", "จุกหน้าอก", "ปวดหน้าอก", "จุกลิ้นปี่",
    "หายใจไม่ออก", "หายใจไม่ทัน", "หายใจลำบาก", "หายใจไม่สะดวก",
    "หายใจไม่ค่อยออก", "หายใจติดขัด", "หอบเหนื่อยมาก",
    "หมดสติ", "ไม่รู้สึกตัว", "สลบ", "เรียกไม่รู้เรื่อง", "วูบหมดสติ",
    "ชัก", "เกร็งกระตุก", "ปากเบี้ยว", "แขนขาอ่อนแรง", "พูดไม่ชัด",
    "เลือดออกไม่หยุด", "เลือดออกมาก", "ตกเลือด", "อาเจียนเป็นเลือด", "ไอเป็นเลือด",
    "สำลัก", "จมน้ำ", "ไฟดูด", "อุบัติเหตุรุนแรง",
    "แพ้ยารุนแรง", "แพ้รุนแรง", "ปากบวมคอบวม", "ช็อก", "ช็อค",
    "กินยาเกินขนาด", "กินยาพิษ", "ฆ่าตัวตาย", "ทำร้ายตัวเอง",
]

# Co-occurrence: (any body/system word) AND (any distress word) -> emergency.
# Survives reordering + colloquial phrasing that exact terms miss.
_COOCCUR = [
    (["หน้าอก", "ลิ้นปี่", "หัวใจ"], ["เจ็บ", "แน่น", "จุก", "ปวด", "บีบ", "เสียด"]),
    (["หายใจ", "ลมหายใจ"], ["ไม่ออก", "ไม่ทัน", "ไม่สะดวก", "ลำบาก", "ไม่ค่อย", "ติดขัด", "หอบ"]),
    (["แขน", "ขา", "หน้า", "ปาก"], ["อ่อนแรง", "เบี้ยว", "ขยับไม่ได้", "ชาครึ่ง"]),
    (["เลือด"], ["ไม่หยุด", "ออกมาก", "พุ่ง", "ทะลัก"]),
]

# English (already whitespace-stripped by _normalize).
_ENGLISH = [
    "chestpain", "cantbreathe", "can'tbreathe", "cannotbreathe", "hardtobreathe",
    "difficultybreathing", "shortofbreath", "shortnessofbreath",
    "unconscious", "passedout", "seizure", "stroke", "heartattack",
    "bleeding", "choking", "overdose", "suicide",
]

# Backward-compat alias (old code imported EMERGENCY_TERMS).
EMERGENCY_TERMS = _DIRECT_TERMS

EMERGENCY_ANSWER = (
    "หากมีอาการฉุกเฉิน เช่น เจ็บหน้าอกรุนแรง หายใจไม่ออก หมดสติ ชัก หรือเลือดออกไม่หยุด "
    "โปรดโทร 1669 หรือไปห้องฉุกเฉินที่ใกล้ที่สุดทันทีค่ะ ความปลอดภัยของคุณสำคัญที่สุด"
)


def is_emergency(text: str) -> bool:
    """ตรวจว่าข้อความมีสัญญาณฉุกเฉินไหม โดยเช็ค 3 ชั้นบน text ที่ normalize แล้ว:
    คำตรงๆ (_DIRECT_TERMS), co-occurrence อวัยวะ+อาการ (กันสลับคำ/ภาษาพูด), และ
    ชุดคำอังกฤษ. คืน True = ระบบ short-circuit บังคับ ESCALATE:emergency ก่อนถึง
    LLM เพราะ LLM เคย mis-route เคสฉุกเฉินเป็น AUTO ซึ่งอันตรายกับโรงพยาบาล"""
    n = _normalize(text)
    if not n:
        return False
    if any(_normalize(term) in n for term in _DIRECT_TERMS):
        return True
    for bodies, distress in _COOCCUR:
        if any(b in n for b in bodies) and any(d in n for d in distress):
            return True
    if any(e in n for e in _ENGLISH):
        return True
    return False


def emergency_result(text: str) -> dict:
    """Short-circuit result matching service.answer()'s shape."""
    return {
        "answer": EMERGENCY_ANSWER,
        "route_prefix": "ESCALATE:EMERGENCY",
        "raw": f"ESCALATE:emergency: safety-gate keyword hit — {text[:60]}",
        "sources": [],
        "safety_gate": True,
    }
