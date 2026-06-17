import os, sqlite3

# Defaults to a sibling file in n8n/; override with N8N_DB_PATH env var
db = os.environ.get(
    "N8N_DB_PATH",
    os.path.join(os.path.dirname(__file__), "database.inspect.sqlite"),
)
con = sqlite3.connect(db)
cur = con.cursor()

print(
    "tables",
    [
        r[0]
        for r in cur.execute(
            "select name from sqlite_master where type='table' "
            "and (name like '%webhook%' or name like '%workflow%')"
        )
    ],
)
print("workflow cols", cur.execute("pragma table_info(workflow_entity)").fetchall())
print("workflow rows", cur.execute("select id,name,active from workflow_entity").fetchall())
row = cur.execute(
    "select triggerCount,nodes from workflow_entity where id='hospital-ops-health-alert-starter'"
).fetchone()
print("triggerCount", row[0])
print("node types", [(n.get("name"), n.get("type")) for n in __import__("json").loads(row[1])])
print("webhook cols", cur.execute("pragma table_info(webhook_entity)").fetchall())
print("webhook rows", cur.execute("select * from webhook_entity").fetchall())
for table in ["workflow_published_version", "workflow_publish_history"]:
    print(table, cur.execute(f"pragma table_info({table})").fetchall())
    print(table, cur.execute(f"select * from {table}").fetchall())
