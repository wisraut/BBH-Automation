"""LINE-Dify Hospital Bridge entry point."""
import uvicorn
from fastapi import FastAPI

from api import booking, cro_webhook, health, line_webhook, session
from core.config import SERVER_PORT
from core.lifespan import lifespan

app = FastAPI(title="LINE-Dify Hospital Bridge", lifespan=lifespan)
app.include_router(health.router)
app.include_router(line_webhook.router)
app.include_router(cro_webhook.router)
app.include_router(session.router)
app.include_router(booking.router)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=SERVER_PORT, reload=False)
