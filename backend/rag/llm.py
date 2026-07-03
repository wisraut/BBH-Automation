"""LLM client — calls Gemini via OpenRouter (same model Dify used).

Two functions: chat(messages) -> text (blocking) and chat_stream(messages)
-> Iterator[str] (token deltas). Model + key from env so we can swap models
without code changes.
"""
import json
import os
from collections.abc import Iterator

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


def chat_stream(
    messages: list[dict], temperature: float = 0.3, max_tokens: int = 1024
) -> Iterator[str]:
    """Yield content deltas as they arrive from OpenRouter (SSE).

    Same signature as chat() but streams. Each yielded str is a partial
    chunk of the answer; concatenating all yields gives the full text.
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set — add it to .env")
    with httpx.stream(
        "POST",
        OPENROUTER_URL,
        timeout=60,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://bbh-hospital.com",
            "X-Title": "BBH Own-RAG",
        },
        json={
            "model": OPENROUTER_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        },
    ) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line or not line.startswith("data:"):
                continue
            data = line[len("data:"):].strip()
            if data == "[DONE]":
                break
            try:
                delta = json.loads(data)["choices"][0]["delta"].get("content")
            except (json.JSONDecodeError, KeyError, IndexError):
                continue
            if delta:
                yield delta
