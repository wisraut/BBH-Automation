"""Ingest reference books (PDF / Markdown) into kb_book_chunks.

Separate table + separate retrieval from the customer FAQ (kb_chunks) so a
patient asking an FAQ never retrieves a textbook page. Same embedding model
and dim as the FAQ lane (BAAI/bge-m3, 1024) so vectors are comparable.

Chunking is section/paragraph-aware recursive packing to ~TARGET_CHARS with a
small overlap — the strategy clinical-RAG benchmarks favour over fixed-size
splitting (topic-boundary chunking ~87% vs ~13% fixed-size accuracy). Whole
paragraphs are packed together until the target size; an oversized paragraph
is hard-split with overlap.

Idempotent: re-running clears the book's previous chunks first.

Run inside the bridge container (reaches the embedder + MySQL):
    python -m rag.book_ingester "/app/books/<file>.pdf" "<Book Title>"
"""
import json
import os
import re
import sys
import time

from core.mysql import mysql_db
from rag import embedder

TARGET_CHARS = 1800     # ~500 tokens for bge-m3 — the retrieval sweet spot
OVERLAP_CHARS = 200     # carry context across chunk boundaries
MIN_CHUNK_CHARS = 120   # drop tiny trailing fragments (unless it is the only chunk)
EMBED_BATCH = 8         # small: the CPU BGE-M3 server OOM-crashes on large batches


def _embed_batch(texts: list[str], attempt: int = 0) -> list[list[float]]:
    """Embed with resilience: a too-big batch OOM-kills the CPU embedder, so on
    any transport error split the batch in half and retry; a failing singleton
    waits (the server may be restarting) and retries with backoff."""
    try:
        return embedder.embed(texts, kind="passage")
    except Exception:
        if len(texts) > 1:
            mid = len(texts) // 2
            return _embed_batch(texts[:mid]) + _embed_batch(texts[mid:])
        if attempt < 5:
            time.sleep(5 * (attempt + 1))
            return _embed_batch(texts, attempt + 1)
        raise


def _clean(text: str) -> str:
    """ทำความสะอาดข้อความก่อนแตก paragraph: ตัด null byte, แปลง CRLF/CR เป็น LF
    (สำคัญ เพราะตัวแตก paragraph ยึด '\\n{2,}' — ถ้าไม่แปลง CRLF จะรวมทั้งไฟล์เป็น
    ก้อนยักษ์), ยุบ whitespace และบรรทัดว่างซ้อนให้เหลือพอดี"""
    text = (text or "").replace("\x00", " ")
    # Normalize line endings first — the paragraph splitter keys on "\n{2,}",
    # which a CRLF blank line ("\r\n\r\n") would defeat, collapsing a whole file
    # into a couple of giant blocks.
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def _pdf_blocks(path: str):
    """Yield (page_no, section=None, paragraph) for each paragraph of a PDF."""
    from pypdf import PdfReader
    reader = PdfReader(path)
    for i, page in enumerate(reader.pages, 1):
        for para in re.split(r"\n{2,}", _clean(page.extract_text() or "")):
            para = para.strip()
            if para:
                yield i, None, para


def _md_blocks(path: str):
    """Yield (page=None, section, paragraph); markdown headings set section.

    A heading may be glued to its body in the same block (no blank line after
    it, as in "### Example 001\\n- Category: ..."); split it so the body is kept
    rather than swallowed whole as a heading and dropped.
    """
    with open(path, encoding="utf-8") as f:
        text = _clean(f.read())
    section = None
    for block in re.split(r"\n{2,}", text):
        block = block.strip()
        if not block:
            continue
        m = re.match(r"^#{1,6}\s+([^\n]*)(?:\n(.*))?$", block, re.DOTALL)
        if m:
            section = m.group(1).strip()[:180]
            body = (m.group(2) or "").strip()
            if not body:
                continue
            block = body
        yield None, section, block


def _pack(blocks) -> list[tuple]:
    """Greedy pack (page, section, para) blocks into ~TARGET_CHARS chunks.

    รวม paragraph ต่อกันจนใกล้ TARGET_CHARS แล้วตัดเป็น chunk (section-aware) เพื่อ
    ให้ขนาด chunk เหมาะกับ retrieval; paragraph ที่ยาวเกินเป้าจะถูก hard-split
    พร้อม overlap เพื่อไม่ให้ context ขาดตรงรอยต่อ"""
    chunks: list[tuple] = []
    cur: list[str] = []
    cur_len = 0
    cur_page = cur_section = None

    def flush() -> None:
        nonlocal cur, cur_len, cur_page, cur_section
        if cur:
            body = "\n\n".join(cur).strip()
            if len(body) >= MIN_CHUNK_CHARS or not chunks:
                chunks.append((cur_page, cur_section, body))
        cur, cur_len, cur_page, cur_section = [], 0, None, None

    for page, section, para in blocks:
        if not cur:
            cur_page, cur_section = page, section
        # Hard-split a single paragraph larger than the target, with overlap.
        while len(para) > TARGET_CHARS:
            if cur:
                flush()
                cur_page, cur_section = page, section
            chunks.append((page, section, para[:TARGET_CHARS]))
            para = para[TARGET_CHARS - OVERLAP_CHARS:]
        if cur and cur_len + len(para) > TARGET_CHARS:
            flush()
            cur_page, cur_section = page, section
        cur.append(para)
        cur_len += len(para) + 2
    flush()
    return chunks


def ingest(path: str, book_title: str) -> None:
    """ingest ตำราแพทย์ 1 เล่ม (PDF/Markdown) ลง kb_book_chunks: แตก block →
    pack เป็น chunk → embed ทั้งหมดก่อน แล้วค่อย DELETE ของเก่า+INSERT ใหม่ใน
    transaction เดียว (atomic) — embed ก่อนแตะ DB เพื่อว่าถ้า embedder ล่มกลางคัน
    chunk เดิมของเล่มนี้ยังอยู่ครบ ไม่มีช่วง ingest ค้างครึ่งๆ กลางๆ"""
    ext = os.path.splitext(path)[1].lower()
    blocks = list(_pdf_blocks(path) if ext == ".pdf" else _md_blocks(path))
    chunks = _pack(blocks)
    source = os.path.basename(path)
    print(f"[{book_title}] {len(blocks)} blocks -> {len(chunks)} chunks", flush=True)
    if not chunks:
        print("no chunks — check extraction")
        return

    # Embed everything BEFORE touching the DB, so a mid-run embedder failure
    # aborts with the book's existing chunks still intact. The replace below is
    # a single transaction — there is no partial-ingest window.
    rows = []
    for i in range(0, len(chunks), EMBED_BATCH):
        batch = chunks[i:i + EMBED_BATCH]
        texts = [f"{book_title}\n\n{body}" for _, _, body in batch]
        vecs = _embed_batch(texts)
        rows.extend(
            (source, book_title, section, page, text,
             json.dumps(vec), embedder.EMBED_MODEL, len(vec))
            for (page, section, _), text, vec in zip(batch, texts, vecs)
        )
        print(f"  embedded {len(rows)}/{len(chunks)}", flush=True)

    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM kb_book_chunks WHERE source = %s", (source,))
            cur.executemany(
                "INSERT INTO kb_book_chunks "
                "(source, title, section, page, chunk_text, embedding, embed_model, dim) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                rows,
            )
        conn.commit()

    print(f"done: {len(rows)} chunks stored for {source}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print('usage: python -m rag.book_ingester "<path>" "<Book Title>"')
        raise SystemExit(1)
    ingest(sys.argv[1], sys.argv[2])
