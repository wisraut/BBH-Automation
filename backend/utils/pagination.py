"""Pagination helpers."""
from typing import Any


def paginate(
    *, rows: list[dict[str, Any]], total: int, page: int, limit: int
) -> dict[str, Any]:
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
