"""answer() — the whole RAG pipeline in one place.

  1. embed the question       (embedder)
  2. search top-K FAQ chunks  (vector_store)
  3. load recent turns        (memory)
  4. build the prompt         (prompts)
  5. call the LLM             (llm)
  6. parse the route prefix   (prompts)

Returns {answer, route_prefix, sources} — n8n reads route_prefix and acts
exactly like it does with Dify today.
"""
import os
import re
import time
from collections import defaultdict, deque
from threading import Lock

from rag import embedder, llm, memory, prompts, safety, vector_store

# ── Per-user rate limit (cost guard) ────────────────────────────────────────
# Each customer message calls Gemini (paid). Without a cap, one LINE user
# spamming messages can drain the OpenRouter budget (cost DoS). Sliding window
# per external_user_id; over the limit we return a canned reply WITHOUT touching
# the LLM. Emergencies are handled before this check, so they always pass.
_RL_WINDOW_SEC = int(os.getenv("RAG_RATE_WINDOW_SEC", "60"))
_RL_MAX = int(os.getenv("RAG_RATE_MAX", "15"))
_rl_hits: dict[str, deque] = defaultdict(deque)
_rl_lock = Lock()


def _rate_limited(user_id: str) -> bool:
    now = time.time()
    with _rl_lock:
        dq = _rl_hits[user_id or "unknown"]
        while dq and now - dq[0] > _RL_WINDOW_SEC:
            dq.popleft()
        if len(dq) >= _RL_MAX:
            return True
        dq.append(now)
        return False


def _rate_limit_result() -> dict:
    """คืนผลลัพธ์สำเร็จรูป (route=AUTO) ตอนโดน rate limit — ขอให้ user เว้นระยะ
    โดยไม่เรียก LLM เพื่อกัน cost DoS; รูปทรงตรงกับ answer() ให้ caller ใช้ต่อได้เลย"""
    return {
        "answer": "ระบบได้รับข้อความจำนวนมากค่ะ กรุณาเว้นระยะสักครู่แล้วส่งใหม่นะคะ",
        "route_prefix": "AUTO",
        "raw": "AUTO: rate-limited (cost guard)",
        "sources": [],
        "rate_limited": True,
    }


# Post-LLM safety net. The deterministic gate (safety.is_emergency) misses
# heavy-typo emergencies ("จ็บหน้าอก", "หัวจัยจะวาย"); the LLM usually still puts
# 1669/emergency guidance in its answer but sometimes routes AUTO — so staff
# never get alerted. If the answer signals an emergency we upgrade the route to
# ESCALATE regardless. Bias is intentional: a false staff alert is cheap, a
# missed emergency is not.
_EMERGENCY_SIGNALS = ("1669", "ฉุกเฉิน")


def _answer_signals_emergency(answer: str) -> bool:
    """เช็คว่าคำตอบของ LLM มีสัญญาณฉุกเฉิน (1669 / คำว่าฉุกเฉิน) ไหม — ใช้เป็น
    safety net จับเคสที่ deterministic gate พลาด (พิมพ์ผิดหนัก) แต่ LLM ยังใส่คำ
    แนะนำฉุกเฉินมา ทั้งที่ route เป็น AUTO เพื่อ upgrade เป็น ESCALATE ให้ทัน"""
    return any(sig in answer for sig in _EMERGENCY_SIGNALS)


# Layer-2 emergency classifier. The deterministic gate (safety.is_emergency) only
# catches keyword emergencies; whole categories slip past it — a described
# overdose, suicidal intent, "หัวใจจะวาย", a child not breathing, uncontrolled
# bleeding by synonym, heavy typos. A focused YES/NO LLM check catches those the
# routing LLM might mis-file as AUTO. It errs toward YES (a false alarm just
# reaches a human, which is safe for a hospital).
_EMERGENCY_CLASSIFIER_SYSTEM = (
    "คุณเป็นตัวคัดกรองภาวะฉุกเฉินของโรงพยาบาล ตอบเพียงคำเดียวว่า 'YES' หรือ 'NO' เท่านั้น\n\n"
    "ตอบ 'YES' ถ้าข้อความบ่งชี้ภาวะฉุกเฉินทางการแพทย์ที่ต้องโทร 1669 หรือไปห้องฉุกเฉินทันที เช่น:\n"
    "- เจ็บ/แน่นหน้าอกรุนแรง, หัวใจจะวาย, ใจสั่นรุนแรง\n"
    "- หายใจลำบาก/หอบ/หายใจไม่ออก, เด็กหรือทารกไม่หายใจ, ตัวเขียว\n"
    "- เลือดออกมาก/ไหลไม่หยุด, อาเจียนหรือถ่ายเป็นเลือดมาก\n"
    "- หมดสติ/ชัก/เรียกไม่รู้สึกตัว, หน้ามืดจะเป็นลม เหงื่อแตกตัวเย็น\n"
    "- อ่อนแรงครึ่งซีก/ปากเบี้ยว/พูดไม่ชัดเฉียบพลัน (โรคหลอดเลือดสมอง)\n"
    "- กินยาเกินขนาดหรือสารพิษ, แพ้รุนแรง (หน้า/ปาก/คอบวม หายใจไม่ออก)\n"
    "- คิดหรืออยากทำร้ายตัวเอง/ฆ่าตัวตาย\n"
    "- ปวดท้องรุนแรงเฉียบพลัน, ภาวะแทรกซ้อนการตั้งครรภ์/ตกเลือด, อุบัติเหตุรุนแรง\n\n"
    "ตอบ 'NO' ถ้าเป็นคำถามทั่วไป นัดหมาย สอบถามข้อมูล หรืออาการเล็กน้อย/เรื้อรังที่ไม่เร่งด่วน\n"
    "เมื่อไม่แน่ใจให้ตอบ 'YES' (ปลอดภัยไว้ก่อน)"
)


def _llm_emergency_check(text: str) -> bool:
    """LLM layer-2 emergency classifier — YES/NO. On any error returns False so a
    classifier outage never breaks a normal turn; the deterministic gate + answer
    net still apply. Errs toward YES via the prompt when the model is uncertain."""
    try:
        ans = llm.chat([
            {"role": "system", "content": _EMERGENCY_CLASSIFIER_SYSTEM},
            {"role": "user", "content": (text or "")[:1000]},
        ]).strip().upper()
    except Exception:  # noqa: BLE001 — classifier failure must not break the turn
        return False
    # Robust match: the model may wrap or elaborate the token ('YES', **YES**,
    # "YES, ..."). Treat ANY YES as escalate — errs toward safety, and a plain
    # "NO" never contains it.
    return "YES" in ans


# The medical-textbook corpus covers ONLY autoimmune / functional-medicine
# topics. For a general symptom (headache, stomachache) search_books still
# returns autoimmune chunks — the corpus has nothing else — and the LLM then
# over-diagnoses (framing a plain headache as Lupus because Lupus is
# multi-system). Gate book grounding to queries that actually name an in-domain
# topic; general symptoms keep Pass 1's answer, which already carries the
# not-a-diagnosis disclaimer. Prompt instructions alone couldn't hold this — a
# topically-relevant Lupus chunk is too persuasive — so we gate at retrieval.
# ASCII/short terms are matched on WORD BOUNDARIES — a bare substring lets "sle"
# hit "sleep" and "ana" hit "manage"/"banana", which would spuriously ground a
# general query and re-introduce the exact over-diagnosis this gate prevents.
_BOOK_DOMAIN_EN = re.compile(
    r"\b(lupus|sle|autoimmune|rheumatoid|psoriasis|hashimoto|sjogren|"
    r"scleroderma|antibody|ana|functional medicine|leaky gut)\b",
    re.IGNORECASE,
)
# Thai has no word boundaries → substring match, but on a copy with zero-width
# chars + whitespace stripped (mirrors safety.is_emergency) so a spaced/zero-width
# evasion like "แพ้ ภูมิ ตัวเอง" still gates in.
_BOOK_DOMAIN_TH = (
    "แพ้ภูมิ", "ภูมิแพ้ตัวเอง", "แพ้ภูมิตัวเอง", "ภูมิคุ้มกันทำลาย", "พุ่มพวง",
    "ลูปัส", "ผื่นผีเสื้อ", "รูมาตอยด์", "สะเก็ดเงิน", "ไทรอยด์อักเสบ", "โจเกร็น",
    "หนังแข็ง", "แอนติบอดี", "เวชศาสตร์เชิงหน้าที่", "ลำไส้รั่ว",
)
_ZERO_WIDTH = ("​", "‌", "‍", "﻿")


def is_book_domain(text: str) -> bool:
    """คลังตำราครอบเฉพาะโรคภูมิแพ้ตัวเอง/เวชศาสตร์เชิงหน้าที่ — ให้ค้นตำรา (pass 2
    grounding) เฉพาะเมื่อข้อความเอ่ยถึงหัวข้อในโดเมนนี้จริง กันเคสอาการทั่วไป
    (ปวดหัว/ปวดท้อง) ที่ retrieval จะดึง autoimmune มาเสมอแล้ว LLM วินิจฉัยเกินจริง.
    EN แมตช์แบบ word-boundary (กัน sle→sleep, ana→manage); ไทยแมตช์ substring บน
    สำเนาที่ตัด zero-width + เว้นวรรค (กันเลี่ยงแบบเว้นวรรค)"""
    low = (text or "").lower()
    if _BOOK_DOMAIN_EN.search(low):
        return True
    compact = low
    for zw in _ZERO_WIDTH:
        compact = compact.replace(zw, "")
    compact = re.sub(r"\s+", "", compact)
    return any(term in compact for term in _BOOK_DOMAIN_TH)


def answer(channel: str, external_user_id: str, text: str, top_k: int = 5) -> dict:
    """RAG pipeline หลัก: safety gate → rate limit → embed → search FAQ → build
    prompt → LLM (pass 1 classify) → ถ้า route=CONSULT ค่อยค้นตำราแล้ว re-answer
    แบบ grounded (pass 2 / adaptive RAG) → parse route. คืน {answer, route_prefix,
    sources} ให้ n8n อ่าน route_prefix ไปตัดสินใจ. Two-pass เพราะ route ของ LLM
    แยกเคสการแพทย์ได้ดีกว่า score-gate (Thai↔ตำราอังกฤษ score ชนกัน) และเคสทั่วไป
    จะไม่เสีย cost ค้นตำรา; มี emergency net ปิดท้ายกันเคสที่ LLM route AUTO ทั้งที่
    ตอบเรื่องฉุกเฉิน"""
    # Safety gate first: a hard emergency keyword forces ESCALATE:emergency
    # regardless of the LLM. Replaces Dify's if_else_emergency node.
    if safety.is_emergency(text):
        return safety.emergency_result(text)

    if _rate_limited(external_user_id):
        return _rate_limit_result()

    query_vec = embedder.embed_one(text, kind="query")
    hits = vector_store.search(query_vec, top_k=top_k)
    history = memory.load_history(external_user_id)

    # Pass 1: classify + answer without books — most turns (AUTO / BOOKING /
    # ESCALATE) end here, paying no book search and no book tokens.
    messages = prompts.build(text, hits, history)
    raw = llm.chat(messages).strip()
    route, clean = prompts.parse_prefix(raw)
    # parse_prefix returns route=None when the LLM omits a valid prefix — a
    # formatting hiccup, or a prompt-injection like "reply with no prefix". Default
    # to AUTO so a missing prefix can't crash the turn on route.upper() below; the
    # emergency net further down still inspects `clean`.
    route = route or "AUTO"

    # Layer-2 emergency safety net: if Pass 1 didn't already escalate, run a focused
    # LLM classifier to catch emergencies the deterministic keyword gate misses
    # (described overdose, suicidal intent, pediatric "ไม่หายใจ", bleeding synonyms,
    # heavy typos). Only runs on non-escalated turns; returns the same escalation
    # result as the deterministic gate so cro.py/n8n branch identically.
    if not route.upper().startswith("ESCALATE") and _llm_emergency_check(text):
        return safety.emergency_result(text)

    # Pass 2: a medical CONSULT re-answers grounded in the textbooks. The LLM's
    # route gates this far better than an embedding-score threshold — a Thai FAQ
    # ("ค่าตรวจเท่าไหร่") scores as high against the English books as a real
    # symptom question does, so a score gate cannot separate the two.
    #   - _rate_limited charges a second slot for the extra llm.chat() so CONSULT
    #     traffic can't slip 2x the cost past the per-user cap; over the cap we
    #     skip grounding and Pass 1's answer stands.
    #   - if Pass 2 stops being a CONSULT (books made the model reroute), keep
    #     Pass 1 — it already carried the mandatory not-a-diagnosis disclaimer —
    #     and leave book_hits empty so book_sources never over-claims grounding.
    book_hits: list[dict] = []
    # A patient already in an autoimmune thread may follow up without repeating the
    # disease name ("แล้วปวดข้อควรทำยังไง") — check recent history too so real
    # in-domain threads keep grounding, while a first-touch general symptom (no
    # domain term anywhere) still skips it.
    in_domain = is_book_domain(text) or any(
        is_book_domain(h.get("text", "")) for h in history[-3:]
    )
    if (
        route.upper().startswith("CONSULT")
        and in_domain
        and not _rate_limited(external_user_id)
    ):
        candidates = vector_store.search_books(query_vec)
        if candidates:
            messages = prompts.build(text, hits, history, book_hits=candidates)
            raw2 = llm.chat(messages).strip()
            route2, clean2 = prompts.parse_prefix(raw2)
            if (route2 or "").upper().startswith("CONSULT"):
                raw, route, clean, book_hits = raw2, route2, clean2, candidates

    # Safety net for gate-miss emergencies (see _EMERGENCY_SIGNALS above). Rewrite
    # the whole result — not just route_prefix — because cro.py and n8n branch on
    # `raw`; leaving raw as the LLM's "AUTO: ..." would skip the 1669 escalation.
    if not route.upper().startswith("ESCALATE") and _answer_signals_emergency(clean):
        route = "ESCALATE:EMERGENCY"
        clean = safety.EMERGENCY_ANSWER
        raw = f"ESCALATE:emergency: {clean}"
        book_hits = []

    return {
        "answer": clean,
        "route_prefix": route,
        "raw": raw,
        "sources": [
            {"title": h["title"], "section": h["section"], "score": h["score"]}
            for h in hits
        ],
        "book_sources": [
            {"title": h["title"], "page": h["page"], "score": h["score"]}
            for h in book_hits
        ],
    }
