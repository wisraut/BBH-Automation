"""DB connection helper — context manager (กัน leak)."""
from contextlib import contextmanager
import psycopg2
from core.config import DB_CONFIG


@contextmanager
def get_db():
    """เปิด connection ไป hospital_db (PostgreSQL) แบบ context manager
    เพื่อการันตีว่า conn.close() ถูกเรียกเสมอ กัน connection leak เมื่อ handler พัง"""
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        yield conn
    finally:
        conn.close()
