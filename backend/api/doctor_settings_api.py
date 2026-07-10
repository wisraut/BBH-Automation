"""Current user's personal integration settings (e.g. their own NotebookLM
notebook link). Always self-scoped — a user reads/writes only their own row."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.security import require_user
from repositories import doctor_settings_repo

router = APIRouter(prefix="/api/account/settings", tags=["account-settings"])

_User = Annotated[dict, Depends(require_user())]


class SettingsOut(BaseModel):
    notebooklm_url: str | None = None


class SettingsPut(BaseModel):
    notebooklm_url: str | None = Field(default=None, max_length=512)


@router.get("", response_model=SettingsOut)
def get_settings(user: _User) -> dict:
    row = doctor_settings_repo.get(int(user["id"]))
    return {"notebooklm_url": (row or {}).get("notebooklm_url")}


@router.put("", response_model=SettingsOut)
def put_settings(body: SettingsPut, user: _User) -> dict:
    url = (body.notebooklm_url or "").strip() or None
    if url and not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_URL", "message": "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://"},
        )
    doctor_settings_repo.upsert(int(user["id"]), notebooklm_url=url)
    return {"notebooklm_url": url}
