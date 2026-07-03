"""Embedding client — talks to the Infinity embedding server over HTTP.

The model lives in a separate container (bbh-embedder). The bridge only
sends text and gets vectors back — same shape as the old Ollama call.

Model swap (e5-small -> BGE-M3) changes only two things:
  1. EMBED_MODEL env var
  2. the prefix behaviour below — e5 models REQUIRE 'query:'/'passage:'
     prefixes, BGE-M3 needs none. NEEDS_PREFIX auto-detects from the name.
Callers never change.
"""
import os

import httpx

EMBED_URL = os.getenv("EMBED_URL", "http://bbh-embedder:7997")
EMBED_MODEL = os.getenv("EMBED_MODEL", "intfloat/multilingual-e5-small")

# e5 family was trained with input prefixes; bge-m3 was not.
NEEDS_PREFIX = "e5" in EMBED_MODEL.lower()


def _apply_prefix(texts: list[str], kind: str) -> list[str]:
    if not NEEDS_PREFIX:
        return texts
    p = "query: " if kind == "query" else "passage: "
    return [p + t for t in texts]


def embed(texts: list[str], kind: str = "passage") -> list[list[float]]:
    """Embed a batch. kind='query' for user questions, 'passage' for KB docs."""
    payload = {"model": EMBED_MODEL, "input": _apply_prefix(texts, kind)}
    resp = httpx.post(f"{EMBED_URL}/embeddings", json=payload, timeout=60)
    resp.raise_for_status()
    return [row["embedding"] for row in resp.json()["data"]]


def embed_one(text: str, kind: str = "query") -> list[float]:
    return embed([text], kind=kind)[0]
