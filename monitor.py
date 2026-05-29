#!/usr/bin/env python3
"""
monitor.py — TUI Monitor สำหรับ Hospital Bridge
รัน: python monitor.py
กด Q เพื่อออก, R เพื่อ refresh ด้วยมือ
"""
import os
from datetime import datetime, timezone

import httpx
import psycopg2
from dotenv import load_dotenv
from textual import work
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import DataTable, Footer, Header, Label, RichLog

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 5433)),
    "dbname":   os.getenv("DB_NAME", "hospital_db"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
}
DIFY_URL    = os.getenv("DIFY_API_URL", "http://localhost/v1")
DIFY_KEY    = os.getenv("DIFY_API_KEY", "")
BRIDGE_URL  = f"http://localhost:{os.getenv('SERVER_PORT', '8000')}"
REFRESH_SEC = 5


# ── Fetch helpers (sync — ทำงานใน thread) ─────────────────────────────────────

def _fetch_services() -> list[tuple]:
    rows = []

    # Bridge + Email Poller
    try:
        r    = httpx.get(f"{BRIDGE_URL}/", timeout=3)
        data = r.json()
        ngrok_url = data.get("ngrok_url", "")
        if "localhost" not in ngrok_url:
            rows.append(("Bridge",       "🟢 online",  "tunnel active"))
        else:
            rows.append(("Bridge",       "🟡 online",  "no tunnel"))
        rows.append(    ("Email Poller", "🟢 running", ""))
    except Exception:
        rows.append(("Bridge",       "🔴 offline", ""))
        rows.append(("Email Poller", "🔴 stopped", ""))

    # Dify
    try:
        r = httpx.get(
            f"{DIFY_URL}/info",
            headers={"Authorization": f"Bearer {DIFY_KEY}"},
            timeout=5,
        )
        rows.append(("Dify", "🟢 healthy" if r.status_code == 200 else f"🔴 HTTP {r.status_code}", ""))
    except Exception:
        rows.append(("Dify", "🔴 offline", ""))

    # PostgreSQL
    try:
        conn = psycopg2.connect(**DB_CONFIG, connect_timeout=3)
        cur  = conn.cursor()
        cur.execute(
            "SELECT COUNT(*), COUNT(*) FILTER (WHERE status='analyzing') FROM reports"
        )
        total, analyzing = cur.fetchone()
        conn.close()
        detail = f"{total} reports" + (f"  ⏳{analyzing}" if analyzing else "")
        rows.append(("PostgreSQL", "🟢 healthy", detail))
    except Exception:
        rows.append(("PostgreSQL", "🔴 offline", ""))

    # ngrok (ลอง port 4040 และ 4041)
    for port in [4040, 4041]:
        try:
            r       = httpx.get(f"http://localhost:{port}/api/tunnels", timeout=2)
            tunnels = r.json().get("tunnels", [])
            if tunnels:
                url = tunnels[0].get("public_url", "")
                rows.append(("ngrok", "🟢 active", url.replace("https://", "")))
            else:
                rows.append(("ngrok", "🟡 connected", "no tunnels"))
            break
        except Exception:
            continue
    else:
        rows.append(("ngrok", "🔴 offline", ""))

    return rows


def _fetch_doctors() -> list[tuple]:
    try:
        conn = psycopg2.connect(**DB_CONFIG, connect_timeout=3)
        cur  = conn.cursor()
        cur.execute(
            "SELECT hospital_id, name, line_uid FROM doctors ORDER BY hospital_id"
        )
        rows = [
            (r[0], r[1], "🟢 linked" if r[2] else "🔴 not linked")
            for r in cur.fetchall()
        ]
        conn.close()
        return rows
    except Exception:
        return [("—", "DB error", "")]


def _fetch_reports() -> list[tuple]:
    try:
        conn = psycopg2.connect(**DB_CONFIG, connect_timeout=3)
        cur  = conn.cursor()
        cur.execute(
            """SELECT r.report_id, p.name, r.status, r.submitted_at
               FROM reports r JOIN patients p ON r.patient_id = p.patient_id
               WHERE p.name != 'ผู้ป่วยทดสอบ'
               ORDER BY r.submitted_at DESC LIMIT 8"""
        )
        rows = []
        for r in cur.fetchall():
            status = "⏳ analyzing" if r[2] == "analyzing" else "○ ready"
            at     = r[3].strftime("%d/%m %H:%M") if r[3] else "—"
            rows.append((r[0], r[1], status, at))
        conn.close()
        return rows
    except Exception:
        return [("—", "DB error", "", "")]


def _relative_time(dt: datetime) -> str:
    """แปลง datetime เป็น relative time เช่น 'เมื่อกี้', '3 นาทีที่แล้ว'"""
    now     = datetime.now()
    diff    = now - dt.replace(tzinfo=None)
    seconds = int(diff.total_seconds())
    if seconds < 10:
        return "[bold green]เมื่อกี้[/bold green]"
    if seconds < 60:
        return f"[green]{seconds} วิที่แล้ว[/green]"
    if seconds < 3600:
        return f"[yellow]{seconds // 60} นาทีที่แล้ว[/yellow]"
    if seconds < 86400:
        return f"[dim]{seconds // 3600} ชม.ที่แล้ว[/dim]"
    return f"[dim]{dt.strftime('%d/%m %H:%M')}[/dim]"


def _fetch_activity() -> list[str]:
    try:
        conn = psycopg2.connect(**DB_CONFIG, connect_timeout=3)
        cur  = conn.cursor()
        cur.execute(
            """SELECT al.action, al.report_id, al.created_at,
                      COALESCE(d.name, al.actor_id), d.hospital_id
               FROM audit_logs al
               LEFT JOIN doctors d ON al.actor_id = d.doctor_id
               ORDER BY al.created_at DESC LIMIT 12"""
        )
        action_th = {
            "analysis_triggered": "วิเคราะห์",
            "report_submitted":   "ส่ง report",
            "pdf_requested":      "ขอ PDF",
        }
        lines = []
        for r in cur.fetchall():
            rel_time = _relative_time(r[2]) if r[2] else "[dim]—[/dim]"
            action   = action_th.get(r[0], r[0])
            actor    = f"{r[3]} ({r[4]})" if r[4] else r[3]
            report   = r[1] or ""
            lines.append(
                f"{rel_time}  [cyan]{actor}[/cyan]  {action}"
                + (f"  [yellow]{report}[/yellow]" if report else "")
            )
        conn.close()
        return lines or ["[dim]ยังไม่มี activity[/dim]"]
    except Exception:
        return ["[red]ไม่สามารถดึงข้อมูล Activity[/red]"]


# ── TUI App ────────────────────────────────────────────────────────────────────

class MonitorApp(App):
    TITLE = "🏥 Hospital Bridge Monitor"
    CSS = """
    Screen { background: $surface; }

    #main {
        height: 1fr;
        layout: horizontal;
    }
    #left-col {
        width: 52;
        layout: vertical;
    }
    #right-col {
        width: 1fr;
        layout: vertical;
    }
    .section {
        border: solid $primary-darken-2;
        margin: 0 0 1 0;
        padding: 0 1 1 1;
    }
    #activity-section {
        height: 1fr;
    }
    .title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }
    DataTable {
        height: auto;
    }
    """
    BINDINGS = [
        ("q", "quit",    "Quit"),
        ("r", "refresh", "Refresh"),
    ]

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="main"):
            with Vertical(id="left-col"):
                with Vertical(classes="section"):
                    yield Label("⚙️  Services", classes="title")
                    yield DataTable(id="svc-tbl", show_header=False, cursor_type="none")
                with Vertical(classes="section"):
                    yield Label("👨‍⚕️  Doctors", classes="title")
                    yield DataTable(id="doc-tbl", show_header=False, cursor_type="none")
            with Vertical(id="right-col"):
                with Vertical(classes="section"):
                    yield Label("📋  Reports (ล่าสุด)", classes="title")
                    yield DataTable(id="rpt-tbl", cursor_type="none")
                with Vertical(classes="section", id="activity-section"):
                    yield Label("📜  Activity", classes="title")
                    yield RichLog(id="activity-log", markup=True, highlight=False)
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#svc-tbl", DataTable).add_columns("Service", "Status", "Detail")
        self.query_one("#doc-tbl", DataTable).add_columns("ID", "Name", "LINE")
        self.query_one("#rpt-tbl", DataTable).add_columns("Report ID", "Patient", "Status", "Submitted")
        self.set_interval(REFRESH_SEC, self.do_refresh)
        self.do_refresh()

    @work(thread=True)
    def do_refresh(self) -> None:
        services = _fetch_services()
        doctors  = _fetch_doctors()
        reports  = _fetch_reports()
        activity = _fetch_activity()
        self.call_from_thread(self._update_ui, services, doctors, reports, activity)

    def _update_ui(
        self,
        services: list,
        doctors:  list,
        reports:  list,
        activity: list,
    ) -> None:
        now = datetime.now().strftime("%H:%M:%S")
        self.title = f"🏥 Hospital Bridge Monitor  —  {now}"

        svc = self.query_one("#svc-tbl", DataTable)
        svc.clear()
        for row in services:
            svc.add_row(*row)

        doc = self.query_one("#doc-tbl", DataTable)
        doc.clear()
        for row in doctors:
            doc.add_row(*row)

        rpt = self.query_one("#rpt-tbl", DataTable)
        rpt.clear()
        for row in reports:
            rpt.add_row(*row)

        log = self.query_one("#activity-log", RichLog)
        log.clear()
        for line in activity:
            log.write(line)

    def action_refresh(self) -> None:
        self.do_refresh()


if __name__ == "__main__":
    MonitorApp().run()
