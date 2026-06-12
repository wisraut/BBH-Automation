"""Env vars + constants (loaded ครั้งเดียวตอน import)."""
import logging
import os
import re
from dotenv import load_dotenv

load_dotenv()

_REQUIRED = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ID", "DIFY_API_KEY", "DB_PASSWORD"]
_missing = [v for v in _REQUIRED if not os.getenv(v)]
if _missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(_missing)}")

# LINE
LINE_CHANNEL_ID         = os.getenv("LINE_CHANNEL_ID")
LINE_CHANNEL_SECRET     = os.getenv("LINE_CHANNEL_SECRET")
LINE_CRO_CHANNEL_ID     = os.getenv("LINE_CRO_CHANNEL_ID", "")
LINE_CRO_CHANNEL_SECRET = os.getenv("LINE_CRO_CHANNEL_SECRET", "")

# Dify
DIFY_API_URL = os.getenv("DIFY_API_URL", "http://localhost/v1")
DIFY_API_KEY = os.getenv("DIFY_API_KEY")

# Server
SERVER_PORT      = int(os.getenv("SERVER_PORT", 8000))
NGROK_PUBLIC_URL = os.getenv("NGROK_PUBLIC_URL", "")
BRIDGE_INTERNAL_TOKEN = os.getenv("BRIDGE_INTERNAL_TOKEN", "")
N8N_INTERNAL_BASE_URL = os.getenv("N8N_INTERNAL_BASE_URL", "")

# DB
DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 5433)),
    "dbname":   os.getenv("DB_NAME", "hospital_db"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
}

# Patterns
RPT_PATTERN = re.compile(r"RPT-\d{8}-\d{4}", re.IGNORECASE)

# Logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bridge")

CRO_CHANNEL_ENABLED = bool(LINE_CRO_CHANNEL_ID and LINE_CRO_CHANNEL_SECRET)
