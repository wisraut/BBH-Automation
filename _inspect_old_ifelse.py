import json
import sys
sys.stdout.reconfigure(encoding="utf-8")

with open(r"C:\Users\wisru\line-dify-bridge\.dify_graph_old.json", "r", encoding="utf-8-sig") as f:
    g = json.load(f)

print("=== Nodes overview ===")
for n in g.get("nodes", []):
    d = n.get("data", {})
    print(f"  id={n['id']:<35} type={d.get('type',''):<22} title={d.get('title','')}")

print()
print("=== IF-ELSE node full data ===")
for n in g.get("nodes", []):
    if n.get("data", {}).get("type") == "if-else":
        print(f"id: {n['id']}")
        print(json.dumps(n["data"], ensure_ascii=False, indent=2))
        print()
print()
print("=== Edges from if-else nodes ===")
for e in g.get("edges", []):
    for n in g["nodes"]:
        if n["id"] == e.get("source") and n["data"].get("type") == "if-else":
            print(f"  {e.get('source')} --[{e.get('sourceHandle')}]--> {e.get('target')}")
