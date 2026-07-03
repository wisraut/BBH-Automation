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
from rag import embedder, llm, memory, prompts, safety, vector_store


def answer(channel: str, external_user_id: str, text: str, top_k: int = 5) -> dict:
    # Safety gate first: a hard emergency keyword forces ESCALATE:emergency
    # regardless of the LLM. Replaces Dify's if_else_emergency node.
    if safety.is_emergency(text):
        return safety.emergency_result(text)

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
