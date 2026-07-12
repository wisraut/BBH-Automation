"""
BBH full-system restore — reads a backup archive produced by tools/backup.py
and restores DBs, volumes, env files, and credentials.

Run:
    python tools/restore.py backups/bbh-backup-YYYYMMDD-HHMMSS.tar.gz

WARNING: destructive. Drops + recreates databases and overwrites .env files.
Run this on a fresh machine setup or after confirming you really mean it.

Order of operations:
    1. Extract archive to temp dir
    2. Restore env + credentials (host filesystem)
    3. Restore Postgres dump (dify + hospital_db)
    4. Restore MySQL dump (bbh_bot_ops)
    5. Restore volumes (dify_app_storage, n8n_data)
    6. Restore weaviate bind-mount dir
    7. Print follow-up actions (cloudflared, container restart)
"""
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT          = Path(__file__).resolve().parent.parent
PG_CONTAINER  = "docker-db_postgres-1"
MYSQL_CT      = "hospital-bot-ops-db"
WEAVIATE_DIR  = Path("C:/Users/wisru/dify/docker/volumes/weaviate")

VOLUMES = {
    "dify_app_storage": "docker_dify_app_storage",
    "n8n_data":         "n8n_hospital_n8n_data",
}


def sh(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, **kw)


def step(msg: str) -> None:
    print(f"\n>>> {msg}", flush=True)


def confirm(prompt: str) -> bool:
    return input(f"{prompt} [y/N]: ").strip().lower() == "y"


def restore_files(work: Path) -> None:
    step("env + credentials -> host filesystem")
    env_dir = work / "env"
    for src_name, dest in [
        ("bridge.env", ROOT / ".env"),
        ("n8n.env",    ROOT / "n8n" / ".env.n8n"),
        ("dify.env",   ROOT / "dify" / "docker" / ".env"),
    ]:
        src = env_dir / src_name
        if src.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            print(f"    restored {dest}")
        else:
            print(f"    [skip] {src_name} not in archive")

    creds_src = work / "credentials"
    if creds_src.exists():
        creds_dst = ROOT / "credentials"
        creds_dst.mkdir(exist_ok=True)
        for item in creds_src.iterdir():
            shutil.copy2(item, creds_dst / item.name)
            print(f"    restored credentials/{item.name}")


def restore_postgres(work: Path, dbname: str, sql_file: str) -> None:
    src = work / "db" / sql_file
    if not src.exists():
        print(f"    [skip] {sql_file} not in archive")
        return
    step(f"psql restore -> {dbname}")
    # Drop + recreate
    sh(["docker", "exec", PG_CONTAINER, "psql", "-U", "postgres", "-c",
        f"DROP DATABASE IF EXISTS {dbname};"])
    sh(["docker", "exec", PG_CONTAINER, "psql", "-U", "postgres", "-c",
        f"CREATE DATABASE {dbname};"])
    with src.open("rb") as f:
        sh(["docker", "exec", "-i", PG_CONTAINER,
            "psql", "-U", "postgres", "-d", dbname], stdin=f)
    print(f"    {dbname} restored from {src.name}")


def restore_mysql(work: Path) -> None:
    src = work / "db" / "mysql_bot_ops.sql"
    if not src.exists():
        print("    [skip] mysql_bot_ops.sql not in archive")
        return
    step("mysql restore -> bbh_bot_ops")
    pwd = _read_env_value("BOT_OPS_DB_ROOT_PASSWORD")
    if not pwd:
        raise RuntimeError("BOT_OPS_DB_ROOT_PASSWORD missing — restore env first")
    sh(["docker", "exec", MYSQL_CT, "mysql", "-uroot", f"-p{pwd}", "-e",
        "DROP DATABASE IF EXISTS bbh_bot_ops; CREATE DATABASE bbh_bot_ops CHARACTER SET utf8mb4;"])
    with src.open("rb") as f:
        sh(["docker", "exec", "-i", MYSQL_CT,
            "mysql", "-uroot", f"-p{pwd}", "bbh_bot_ops"], stdin=f)
    print("    bbh_bot_ops restored")


def restore_volume(work: Path, name: str, volume: str) -> None:
    src = work / "volumes" / f"{name}.tar"
    if not src.exists():
        print(f"    [skip] {name}.tar not in archive")
        return
    step(f"volume restore -> {volume}")
    # Ensure volume exists
    subprocess.run(["docker", "volume", "create", volume], check=False, capture_output=True)
    work_abs = str(src.parent).replace("\\", "/")
    sh(["docker", "run", "--rm",
        "-v", f"{volume}:/target",
        "-v", f"{work_abs}:/backup:ro",
        "alpine", "sh", "-c",
        f"cd /target && rm -rf ./* ./.* 2>/dev/null; tar xf /backup/{name}.tar"])
    print(f"    {volume} restored from {src.name}")


def restore_weaviate(work: Path) -> None:
    src = work / "volumes" / "weaviate.tar"
    if not src.exists():
        print("    [skip] weaviate.tar not in archive")
        return
    step("weaviate bind-mount restore")
    WEAVIATE_DIR.mkdir(parents=True, exist_ok=True)
    # Wipe target first to avoid stale shards
    for item in WEAVIATE_DIR.iterdir():
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=True)
        else:
            item.unlink(missing_ok=True)
    with tarfile.open(src, "r") as tar:
        tar.extractall(WEAVIATE_DIR)
    print(f"    extracted to {WEAVIATE_DIR}")


def _read_env_value(key: str) -> str:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return ""
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return ""


def print_followup(work: Path) -> None:
    step("Manual follow-up steps")
    print("""
    1. Re-install cloudflared service with the saved token:
         sc stop cloudflared
         sc delete cloudflared
         cloudflared service install <token from env/cloudflared_token.txt>

    2. Restart all stacks so they pick up the restored data:
         cd dify/docker && docker compose restart
         docker restart hospital-bot-ops-db hospital-n8n
         docker compose -f docker-compose.bridge.yaml up -d --build

    3. Verify by hitting:
         curl http://localhost:8000/        (bridge health)
         curl -X POST http://localhost:8000/internal/rag/answer \\
              -H "X-Internal-Token: $BRIDGE_INTERNAL_TOKEN" \\
              -H "Content-Type: application/json" -d '{"text":"สวัสดี"}'
    """)


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python tools/restore.py <path/to/bbh-backup-*.tar.gz>")
        return 2
    archive = Path(sys.argv[1]).resolve()
    if not archive.exists():
        print(f"Archive not found: {archive}")
        return 2

    print(f"Archive: {archive}")
    print(f"Size:    {archive.stat().st_size / 1024 / 1024:.1f} MB")
    if not confirm("This will OVERWRITE all DBs, volumes, and env files. Continue?"):
        print("Aborted.")
        return 1

    with tempfile.TemporaryDirectory(prefix="bbh-restore-") as tmp:
        step(f"Extract -> {tmp}")
        with tarfile.open(archive, "r:gz") as tar:
            tar.extractall(tmp)
        # Find the single top-level dir
        roots = [p for p in Path(tmp).iterdir() if p.is_dir()]
        if not roots:
            print("Empty archive")
            return 1
        work = roots[0]

        restore_files(work)
        restore_postgres(work, "dify",        "postgres_dify.sql")
        restore_postgres(work, "hospital_db", "postgres_hospital.sql")
        restore_mysql(work)
        for name, vol in VOLUMES.items():
            restore_volume(work, name, vol)
        restore_weaviate(work)

        print_followup(work)

    return 0


if __name__ == "__main__":
    sys.exit(main())
