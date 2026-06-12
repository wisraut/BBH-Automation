"""
อัพเดต BBH workflow เข้า n8n ที่รันอยู่จริง (WAL-safe)

วิธีการ:
1. Stop container (SQLite WAL checkpoints อัตโนมัติ)
2. Copy workflow JSON เข้า n8n volume
3. Import + publish ผ่าน n8n CLI (temp container)
4. Start container

หมายเหตุ: ไม่ใช้ docker cp database.sqlite เพราะ WAL file override changes
"""
import subprocess
import sys
from pathlib import Path

CONTAINER      = "hospital-n8n"
VOLUME         = "n8n_hospital_n8n_data"
ENCRYPTION_KEY = "2Wnn+QmYnapnUoAQsUAU5/8JKpJ5KCcz"
WF_PATH        = Path(__file__).parent / "workflows" / "ops-health-alert.starter.json"
WF_ID          = "hospital-ops-health-alert-starter"
WF_DEST_IN_VOL = "/home/node/.n8n/bbh-workflow.json"
COPY_CONTAINER = "n8n_wf_copy_tmp"


def run(cmd: list[str], check=True, capture=True) -> subprocess.CompletedProcess:
    print(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, check=False, capture_output=capture, text=True)
    if result.stdout:
        print(f"    {result.stdout.strip()}")
    if result.stderr:
        print(f"    {result.stderr.strip()}")
    if check and result.returncode != 0:
        print(f"\nERROR: command failed (exit {result.returncode})")
        sys.exit(1)
    return result


def n8n_cli(*args: str) -> None:
    """รัน n8n CLI command ผ่าน temp container บน volume เดียวกัน"""
    run([
        "docker", "run", "--rm",
        "-v", f"{VOLUME}:/home/node/.n8n",
        "-e", f"N8N_ENCRYPTION_KEY={ENCRYPTION_KEY}",
        "n8nio/n8n:latest",
        *args,
    ])


def main() -> None:
    print("=== BBH n8n Workflow Updater (WAL-safe) ===\n")

    if not WF_PATH.exists():
        print(f"ERROR: workflow file not found: {WF_PATH}")
        sys.exit(1)
    print(f"[0] Workflow file: {WF_PATH.name}")

    # 1. Stop n8n (triggers WAL checkpoint, safe to modify DB)
    print("[1] Stopping hospital-n8n...")
    run(["docker", "stop", CONTAINER])

    # 2. Copy workflow JSON into the volume via temp container
    print("[2] Copying workflow JSON into n8n volume...")
    # Create a temporary container with the volume mounted
    result = run(["docker", "create", "--name", COPY_CONTAINER,
                  "-v", f"{VOLUME}:/home/node/.n8n", "alpine"], check=False)
    if result.returncode != 0:
        # Container might already exist — remove first
        run(["docker", "rm", COPY_CONTAINER], check=False)
        run(["docker", "create", "--name", COPY_CONTAINER,
             "-v", f"{VOLUME}:/home/node/.n8n", "alpine"])

    run(["docker", "cp", str(WF_PATH), f"{COPY_CONTAINER}:{WF_DEST_IN_VOL}"])
    run(["docker", "rm", COPY_CONTAINER])

    # 3. Import workflow (overwrites existing by ID)
    print("[3] Importing workflow via n8n CLI...")
    n8n_cli("import:workflow", f"--input={WF_DEST_IN_VOL}")

    # 4. Publish workflow (required for production webhooks in n8n v2.x)
    print("[4] Publishing workflow...")
    n8n_cli("publish:workflow", f"--id={WF_ID}")

    # 5. Start n8n
    print("[5] Starting hospital-n8n...")
    run(["docker", "start", CONTAINER])

    print("\nDone! n8n is starting up.")
    print("  Webhook endpoints:")
    print(f"    POST http://localhost:5678/webhook/bbh-line-main")
    print(f"    POST http://localhost:5678/webhook/bbh-line-cro")


if __name__ == "__main__":
    main()
