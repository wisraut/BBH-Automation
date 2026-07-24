"""MySQL connection helper for Bot Ops database.

Uses DBUtils.PooledDB so each request reuses a pre-warmed pymysql connection
instead of paying TCP+auth (~5-15ms) per query. Pool sizes are sized for a
single-instance pilot; bump POOL_MAX when scaling horizontally.

The mysql_db() public surface is unchanged — repositories still write
`with mysql_db() as conn: with conn.cursor() ...`. The wrapper returned
by .connection() exposes the standard pymysql API and returns the conn
to the pool on close().
"""
from contextlib import contextmanager
from collections.abc import Iterator

import pymysql
from dbutils.pooled_db import PooledDB

from core.config import BOT_OPS_DB_CONFIG


_POOL_MIN = 2
_POOL_MAX = 10
_POOL_RECYCLE_SEC = 3600   # close + reopen after 1h to dodge MySQL wait_timeout
_PING_BEFORE_USE = 1       # 1 = ping before borrow (catches stale conns)


_pool = PooledDB(
    creator=pymysql,
    mincached=_POOL_MIN,
    maxcached=_POOL_MAX,
    maxconnections=_POOL_MAX,
    blocking=True,
    ping=_PING_BEFORE_USE,
    maxusage=None,
    maxshared=0,
    reset=True,
    setsession=[],
    cursorclass=pymysql.cursors.DictCursor,
    **BOT_OPS_DB_CONFIG,
)


@contextmanager
def mysql_db() -> Iterator[pymysql.connections.Connection]:
    """ยืม connection จาก pool ไปใช้ (Bot Ops MySQL) แบบ context manager
    conn.close() ตอนจบไม่ได้ปิดจริงแต่คืน conn กลับเข้า pool — เรียก with-block เสมอกัน leak"""
    conn = _pool.connection()
    try:
        yield conn
    finally:
        conn.close()  # PooledDB intercepts close() and returns conn to the pool


# Exposed so admin endpoints / tests can inspect pool state if needed.
def pool_stats() -> dict[str, int]:
    """คืนสถานะ connection pool (min/max/idle) ให้ admin endpoint หรือ test ตรวจสุขภาพ pool
    ค่า idle เป็น best-effort อ่านจาก internal attr ของ PooledDB — คืน -1 ถ้าเวอร์ชันไม่มี attr นั้น"""
    return {
        "min_cached": _POOL_MIN,
        "max_cached": _POOL_MAX,
        "idle": getattr(_pool, "_idle_cache", []).__len__() if hasattr(_pool, "_idle_cache") else -1,
    }
