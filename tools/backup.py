"""
BBH full-system backup — produces one timestamped tar.gz with everything
needed to restore the entire system on a fresh machine.

Run:
    python tools/backup.py
Output:
    backups/bbh-backup-YYYYMMDD-HHMMSS.tar.gz

Contains:
    db/postgres_dify.sql        (Dify apps, KB metadata, workflows)
    db/postgres_hospital.sql    (legacy hospital_db)
    db/mysql_bot_ops.sql        (bookings, sessions, users, patients, reports)
    volumes/dify_app_storage.tar (Dify uploaded KB files)
    volumes/weaviate.tar         (Dify KB vector embeddings)
    volumes/n8n_data.tar         (n8n workflows + credentials SQLite)
    env/bridge.env, env/n8n.env  (env files)
    env/cloudflared_token.txt    (extracted from Windows service config)
    credentials/                 (Google Calendar service account, etc.)
    manifest.json                (timestamp, host, container versions)
"""
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path

ROOT          = Path(__file__).resolve().parent.parent
BACKUP_DIR    = ROOT / "backups"
TIMESTAMP     = datetime.now().strftime("%Y%m%d-%H%M%S")
ARCHIVE_NAME  = f"bbh-backup-{TIMESTAMP}"

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


def dump_postgres(work: Path, dbname: str, outfile: str) -> None:
    step(f"pg_dump {dbname}")
    target = work / outfile
    with target.open("wb") as f:
        sh(["docker", "exec", PG_CONTAINER,
            "pg_dump", "-U", "postgres", "--clean", "--if-exists", dbname], stdout=f)
    print(f"    {outfile}: {target.stat().st_size:,} bytes")


def dump_mysql(work: Path) -> None:
    step("mysqldump bbh_bot_ops")
    target = work / "mysql_bot_ops.sql"
    pwd = os.getenv("BOT_OPS_DB_ROOT_PASSWORD") or _read_env("BOT_OPS_DB_ROOT_PASSWORD")
    if not pwd:
        raise RuntimeError("BOT_OPS_DB_ROOT_PASSWORD not found in env or .env")
    with target.open("wb") as f:
        sh(["docker", "exec", MYSQL_CT,
            "mysqldump", "-uroot", f"-p{pwd}", "--single-transaction",
            "--routines", "--triggers", "bbh_bot_ops"], stdout=f)
    print(f"    mysql_bot_ops.sql: {target.stat().st_size:,} bytes")


def dump_volume(work: Path, name: str, volume: str) -> None:
    step(f"docker volume {volume}")
    target = work / f"{name}.tar"
    # Mount work dir as /backup so alpine tar writes there
    work_abs = str(work).replace("\\", "/")
    sh(["docker", "run", "--rm",
        "-v", f"{volume}:/source:ro",
        "-v", f"{work_abs}:/backup",
        "alpine", "tar", "cf", f"/backup/{name}.tar", "-C", "/source", "."])
    print(f"    {name}.tar: {target.stat().st_size:,} bytes")


def dump_weaviate(work: Path) -> None:
    step("weaviate bind-mount dir")
    if not WEAVIATE_DIR.exists():
        print(f"    [WARN] {WEAVIATE_DIR} not found — skipping")
        return
    target = work / "weaviate.tar"
    with tarfile.open(target, "w") as tar:
        tar.add(WEAVIATE_DIR, arcname=".")
    print(f"    weaviate.tar: {target.stat().st_size:,} bytes")


def dump_files(work: Path) -> None:
    step("env + credentials")
    env_dir = work / "env"
    env_dir.mkdir(parents=True, exist_ok=True)
    creds_dir = work / "credentials"
    creds_dir.mkdir(parents=True, exist_ok=True)

    for src, dest in [
        (ROOT / ".env",                env_dir / "bridge.env"),
        (ROOT / "n8n" / ".env.n8n",    env_dir / "n8n.env"),
        (ROOT / "dify" / "docker" / ".env", env_dir / "dify.env"),
    ]:
        if src.exists():
            shutil.copy2(src, dest)
            print(f"    {src.name} -> {dest.relative_to(work)}")

    src_creds = ROOT / "credentials"
    if src_creds.exists():
        for item in src_creds.iterdir():
            shutil.copy2(item, creds_dir / item.name)
            print(f"    credentials/{item.name}")

    # cloudflared tunnel token (from Windows service binary path)
    token = _extract_cloudflared_token()
    if token:
        (env_dir / "cloudflared_token.txt").write_text(token, encoding="utf-8")
        print(f"    cloudflared_token.txt ({len(token)} chars)")


def _extract_cloudflared_token() -> str:
    try:
        out = subprocess.check_output(["sc", "qc", "cloudflared"], text=True, errors="ignore")
    except subprocess.CalledProcessError:
        return ""
    for line in out.splitlines():
        if "BINARY_PATH_NAME" in line and "--token" in line:
            parts = line.split("--token", 1)
            return parts[1].strip().strip('"')
    return ""


def _read_env(key: str) -> str:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return ""
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return ""


def write_manifest(work: Path) -> None:
    manifest = {
        "timestamp":  TIMESTAMP,
        "host":       os.environ.get("COMPUTERNAME", "unknown"),
        "user":       os.environ.get("USERNAME", "unknown"),
        "containers": {},
    }
    try:
        out = subprocess.check_output(
            ["docker", "ps", "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}"],
            text=True,
        )
        for line in out.strip().splitlines():
            parts = line.split("\t")
            if len(parts) >= 2:
                manifest["containers"][parts[0]] = {"image": parts[1], "status": parts[2] if len(parts) > 2 else ""}
    except Exception as e:
        manifest["containers_error"] = str(e)

    (work / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    out_archive = BACKUP_DIR / f"{ARCHIVE_NAME}.tar.gz"

    with tempfile.TemporaryDirectory(prefix="bbh-backup-") as tmp:
        work = Path(tmp) / ARCHIVE_NAME
        work.mkdir(parents=True)
        (work / "db").mkdir()
        (work / "volumes").mkdir()

        try:
            dump_postgres(work / "db", "dify",        "postgres_dify.sql")
        except Exception as e:
            print(f"    [WARN] dify dump failed: {e}")
        try:
            dump_postgres(work / "db", "hospital_db", "postgres_hospital.sql")
        except Exception as e:
            print(f"    [WARN] hospital_db dump failed: {e}")
        try:
            dump_mysql(work / "db")
        except Exception as e:
            print(f"    [WARN] mysql dump failed: {e}")

        for name, vol in VOLUMES.items():
            try:
                dump_volume(work / "volumes", name, vol)
            except Exception as e:
                print(f"    [WARN] volume {vol} failed: {e}")

        try:
            dump_weaviate(work / "volumes")
        except Exception as e:
            print(f"    [WARN] weaviate failed: {e}")

        dump_files(work)
        write_manifest(work)

        step(f"Packing -> {out_archive.name}")
        with tarfile.open(out_archive, "w:gz") as tar:
            tar.add(work, arcname=ARCHIVE_NAME)

    size_mb = out_archive.stat().st_size / 1024 / 1024
    print(f"\nDONE  {out_archive}")
    print(f"      {size_mb:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
