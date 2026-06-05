import json
import sys
sys.stdout.reconfigure(encoding="utf-8")

with open(r"C:\Users\wisru\line-dify-bridge\.dify_graph_published.json", "r", encoding="utf-8-sig") as f:
    g = json.load(f)

print("=" * 70)
print("=== START NODE (data only) ===")
print("=" * 70)
for n in g["nodes"]:
    if n["id"] == "1779775683966":
        print(json.dumps(n["data"], ensure_ascii=False, indent=2))

print()
print("=" * 70)
print("=== FORMAT_DOCS NODE (data only) ===")
print("=" * 70)
for n in g["nodes"]:
    if n["id"] == "format_docs":
        d = dict(n["data"])
        # truncate long code
        if "code" in d:
            d["code"] = d["code"][:500] + "... [truncated]"
        print(json.dumps(d, ensure_ascii=False, indent=2))

print()
print("=" * 70)
print("=== LLM NODE (data only, prompt truncated) ===")
print("=" * 70)
for n in g["nodes"]:
    if n["id"] == "llm":
        d = dict(n["data"])
        # show structure but truncate prompts
        if "prompt_template" in d:
            for p in d["prompt_template"]:
                if "text" in p and len(p["text"]) > 300:
                    p["text"] = p["text"][:300] + "... [truncated]"
        print(json.dumps(d, ensure_ascii=False, indent=2))

print()
print("=" * 70)
print("=== ANSWER NODE ===")
print("=" * 70)
for n in g["nodes"]:
    if n["id"] == "answer":
        print(json.dumps(n["data"], ensure_ascii=False, indent=2))

print()
print("=" * 70)
print("=== A sample node full (start) with position/measured etc ===")
print("=" * 70)
for n in g["nodes"]:
    if n["id"] == "1779775683966":
        sample = dict(n)
        sample["data"] = "...see above..."
        print(json.dumps(sample, ensure_ascii=False, indent=2))

print()
print("=== SAMPLE EDGE ===")
print(json.dumps(g["edges"][0], ensure_ascii=False, indent=2))
