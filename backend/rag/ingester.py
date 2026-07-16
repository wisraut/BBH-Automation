"""Turn the FAQ markdown into Q&A chunks, embed them, store in kb_chunks.

Chunking: one chunk per '#### FAQ:' block (question + its answer), tagged
with the nearest '##'/'###' section heading above it. Each block is a
self-contained Q&A, which is the ideal retrieval unit.

Run inside the bridge container:
    python -m rag.ingester /app/docs/BBH_MAIN_BOT_FAQ.md
"""
import re
import sys

from rag import embedder, vector_store


def parse_chunks(md_text: str) -> list[tuple[str | None, str, str]]:
    """Return list of (section, title, chunk_text)."""
    section: str | None = None
    chunks: list[tuple[str | None, str, str]] = []
    cur_title: str | None = None
    cur_body: list[str] = []

    def flush() -> None:
        if cur_title and cur_body:
            body = "\n".join(cur_body).strip()
            if body:
                chunks.append((section, cur_title, f"{cur_title}\n{body}"))

    for line in md_text.splitlines():
        m_faq = re.match(r"^####\s+FAQ:\s*(.*)", line)
        m_hdr = re.match(r"^(#{2,3})\s+(.*)", line)  # ## or ### (not ####)
        if m_faq:
            flush()
            cur_title = m_faq.group(1).strip()
            cur_body = []
        elif m_hdr:
            flush()
            cur_title = None
            cur_body = []
            section = m_hdr.group(2).strip()
        elif cur_title is not None:
            cur_body.append(line)
    flush()
    return chunks


def main(path: str) -> None:
    """อ่าน FAQ markdown ตาม path → แตกเป็น chunk → embed → ล้างของเก่าจาก
    source เดิมแล้ว insert ใหม่ลง kb_chunks (idempotent) — entry point ตอนสั่ง
    ingest FAQ ผ่าน python -m rag.ingester"""
    with open(path, encoding="utf-8") as f:
        md = f.read()

    chunks = parse_chunks(md)
    source = path.replace("\\", "/").split("/")[-1]
    print(f"parsed {len(chunks)} chunks from {source}")
    if not chunks:
        print("no chunks found — check the markdown headings")
        return

    vector_store.clear(source)
    texts = [c[2] for c in chunks]
    vecs = embedder.embed(texts, kind="passage")

    for (section, title, text), vec in zip(chunks, vecs):
        vector_store.add(source, section, title, text, vec,
                         embedder.EMBED_MODEL, len(vec))

    print(f"stored {vector_store.count()} chunks "
          f"(model={embedder.EMBED_MODEL}, dim={len(vecs[0])})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/app/docs/BBH_MAIN_BOT_FAQ.md")
