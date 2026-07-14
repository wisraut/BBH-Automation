"""Vector store on MySQL `kb_chunks` — brute-force cosine search.

The KB (hospital FAQ) is small (hundreds of chunks), so we load every
vector and rank in Python. This is <5ms at our size and dead simple to
debug. If the KB ever grows to tens of thousands of chunks, swap this
file for an indexed store (pgvector/Qdrant) — callers stay the same.
"""
import json
import math

from core.mysql import mysql_db


def clear(source: str) -> int:
    """Delete all chunks from one source (so re-ingest is idempotent)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM kb_chunks WHERE source = %s", (source,))
            n = cur.rowcount
        conn.commit()
    return n


def add(source: str, section: str | None, title: str | None,
        chunk_text: str, embedding: list[float], model: str, dim: int) -> None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO kb_chunks
                    (source, section, title, chunk_text, embedding, embed_model, dim)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (source, section, title, chunk_text,
                 json.dumps(embedding), model, dim),
            )
        conn.commit()


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def search(query_vec: list[float], top_k: int = 3) -> list[dict]:
    """Return top_k most similar chunks, highest score first."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, section, title, chunk_text, embedding FROM kb_chunks"
            )
            rows = cur.fetchall()

    scored = []
    for r in rows:
        emb = r["embedding"]
        if isinstance(emb, str):
            emb = json.loads(emb)
        scored.append((_cosine(query_vec, emb), r))
    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        {
            "score": round(s, 4),
            "section": r["section"],
            "title": r["title"],
            "text": r["chunk_text"],
        }
        for s, r in scored[:top_k]
    ]


def count() -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM kb_chunks")
            return cur.fetchone()["c"]


def search_books(query_vec: list[float], top_k: int = 4,
                 min_score: float = 0.45) -> list[dict]:
    """Top_k most similar *reference-book* chunks scoring >= min_score.

    Separate table (kb_book_chunks) from the FAQ search() above so a patient
    asking an FAQ never retrieves a textbook page. min_score gates out weak
    matches: a greeting scores low against every textbook chunk and returns
    nothing, so the caller adds no medical context to non-medical turns.

    Brute-force cosine like search() — books are ~a couple thousand chunks. If
    that grows large, swap for an indexed vector store (callers stay the same).
    """
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT source, title, page, chunk_text, embedding FROM kb_book_chunks"
            )
            rows = cur.fetchall()

    scored = []
    for r in rows:
        emb = r["embedding"]
        if isinstance(emb, str):
            emb = json.loads(emb)
        scored.append((_cosine(query_vec, emb), r))
    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        {
            "score": round(s, 4),
            "source": r["source"],
            "title": r["title"],
            "page": r["page"],
            "text": r["chunk_text"],
        }
        for s, r in scored[:top_k]
        if s >= min_score
    ]
