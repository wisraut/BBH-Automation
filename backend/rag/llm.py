"""LLM client — calls Gemini via OpenRouter (same model Dify used).

One function: chat(messages) -> text. Model + key from env so we can
swap models without code changes.
"""
import os

import httpx

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash-lite")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def chat(messages: list[dict], temperature: float = 0.3, max_tokens: int = 1024) -> str:
    """messages = [{'role': 'system'|'user'|'assistant', 'content': str}, ...]."""
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set — add it to .env")
    resp = httpx.post(
        OPENROUTER_URL,
        timeout=60,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            # OpenRouter likes these for attribution; harmless if omitted.
            "HTTP-Referer": "https://bbh-hospital.com",
            "X-Title": "BBH Own-RAG",
        },
        json={
            "model": OPENROUTER_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]
