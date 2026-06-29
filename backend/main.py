"""LINE-Dify Hospital Bridge entry point."""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import admin_alerts, admin_audit, admin_system, ai, auth, booking, bookings_api, calendar_api, cro_webhook, health, line_webhook, medical_records_api, patients_api, reports_api, schedule_api, schedule_blocks_api, session, users_api
from core.config import SERVER_PORT
from core.lifespan import lifespan

app = FastAPI(title="LINE-Dify Hospital Bridge", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://bbh-hospital.com",
        "https://app.bbh-hospital.com",
    ],
    allow_origin_regex=r"^https?://(192\.168|10|172\.(1[6-9]|2[0-9]|3[01]))\..*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(ai.router)
app.include_router(line_webhook.router)
app.include_router(cro_webhook.router)
app.include_router(session.router)
app.include_router(booking.router)
app.include_router(bookings_api.router)
app.include_router(patients_api.router)
app.include_router(calendar_api.router)
app.include_router(reports_api.router)
app.include_router(users_api.router)
app.include_router(admin_alerts.router)
app.include_router(admin_alerts.rules_router)
app.include_router(admin_system.router)
app.include_router(admin_audit.router)
app.include_router(schedule_api.router)
app.include_router(schedule_blocks_api.router)
app.include_router(medical_records_api.router)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=SERVER_PORT, reload=False)


