"""Own-RAG module — replaces Dify's retrieval + generation with plain Python.

Pipeline (see service.py): memory -> embed -> search -> prompt -> LLM -> parse.
Each piece is a small, independently testable file so we can debug and swap
parts (e.g. embedding model) without touching the rest.
"""
