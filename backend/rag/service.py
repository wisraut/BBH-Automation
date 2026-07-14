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
    return any(sig in answer for sig in _EMERGENCY_SIGNALS)


def answer(channel: str, external_user_id: str, text: str, top_k: int = 5) -> dict:
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
    if route.upper().startswith("CONSULT") and not _rate_limited(external_user_id):
        candidates = vector_store.search_books(query_vec)
        if candidates:
            messages = prompts.build(text, hits, history, book_hits=candidates)
            raw2 = llm.chat(messages).strip()
            route2, clean2 = prompts.parse_prefix(raw2)
            if route2.upper().startswith("CONSULT"):
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
