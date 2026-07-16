"""Current user's personal integration settings (e.g. their own NotebookLM
notebook link). Always self-scoped — a user reads/writes only their own row."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.security import require_user
from integrations import calendar_client
from repositories import doctor_settings_repo

router = APIRouter(prefix="/api/account/settings", tags=["account-settings"])

_User = Annotated[dict, Depends(require_user())]


class SettingsOut(BaseModel):
    notebooklm_url: str | None = None
    google_calendar_id: str | None = None
    # Read-only: the address a doctor shares their Google Calendar with.
    service_account_email: str | None = None


class SettingsPut(BaseModel):
    notebooklm_url: str | None = Field(default=None, max_length=512)
    google_calendar_id: str | None = Field(default=None, max_length=255)


def _out(row: dict | None) -> dict:
    """ประกอบ response settings ของผู้ใช้ (notebooklm_url + google_calendar_id) และเติม
    service_account_email แบบ read-only ที่หมอต้องใช้แชร์ Google Calendar"""
    return {
        "notebooklm_url": (row or {}).get("notebooklm_url"),
        "google_calendar_id": (row or {}).get("google_calendar_id"),
        "service_account_email": calendar_client.service_account_email(),
    }


@router.get("", response_model=SettingsOut)
def get_settings(user: _User) -> dict:
    """คืนค่าตั้งค่าส่วนตัวของผู้ใช้ที่ล็อกอิน (NotebookLM link + Google Calendar id) —
    self-scoped อ่านได้เฉพาะของตัวเอง"""
    return _out(doctor_settings_repo.get(int(user["id"])))


@router.put("", response_model=SettingsOut)
def put_settings(body: SettingsPut, user: _User) -> dict:
    """บันทึกค่าตั้งค่าส่วนตัวของผู้ใช้ที่ล็อกอิน (NotebookLM link + Google Calendar id) —
    self-scoped; validate รูปแบบ URL/Calendar id ก่อน upsert, ผิด = 422"""
    url = (body.notebooklm_url or "").strip() or None
    if url and not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_URL", "message": "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://"},
        )
    cal = (body.google_calendar_id or "").strip() or None
    if cal and "@" not in cal:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_CALENDAR_ID", "message": "Calendar ID มักเป็นอีเมล Google ของคุณ"},
        )
    doctor_settings_repo.upsert(int(user["id"]), notebooklm_url=url, google_calendar_id=cal)
    return _out({"notebooklm_url": url, "google_calendar_id": cal})
