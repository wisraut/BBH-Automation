"""Pagination helpers."""
from typing import Any


def paginate(
    *, rows: list[dict[str, Any]], total: int, page: int, limit: int
) -> dict[str, Any]:
    """ห่อผลลัพธ์เป็น envelope มาตรฐาน {data, pagination} ให้ทุก list endpoint คืนรูปเดียวกัน
    total_pages ปัดขึ้น (ceil) และกัน div-by-zero เมื่อ limit<=0 คืน 0"""
    total_pages = (total + limit - 1) // limit if limit > 0 else 0
    return {
        "data": rows,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
        },
    }
