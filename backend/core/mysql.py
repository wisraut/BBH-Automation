"""MySQL connection helper for Bot Ops database."""
from contextlib import contextmanager
from collections.abc import Iterator

import pymysql

from core.config import BOT_OPS_DB_CONFIG


@contextmanager
def mysql_db() -> Iterator[pymysql.connections.Connection]:
    conn = pymysql.connect(**BOT_OPS_DB_CONFIG, cursorclass=pymysql.cursors.DictCursor)
    try:
        yield conn
    finally:
        conn.close()
