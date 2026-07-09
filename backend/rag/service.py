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

    messages = prompts.build(text, hits, history)
    raw = llm.chat(messages).strip()
    route, clean = prompts.parse_prefix(raw)

    return {
        "answer": clean,
        "route_prefix": route,
        "raw": raw,
        "sources": [
            {"title": h["title"], "section": h["section"], "score": h["score"]}
            for h in hits
        ],
    }
