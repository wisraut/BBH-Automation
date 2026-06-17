"""Pydantic v2 schemas for API request/response.

Conventions:
- Request models suffix: `*Create`, `*Update`, `*Request`
- Response models suffix: `*Out`, `*Response`
- Use `model_config = ConfigDict(...)` not `class Config:` (v1 style)
- Field validation via `Annotated[type, Field(...)]`

Phase 1 modules to add:
- auth.py     (LoginRequest, LoginResponse, UserOut)
- bookings.py (BookingCreate, BookingOut, ApproveRequest, RejectRequest)
- patients.py
- reports.py
- common.py   (PaginationMeta, ErrorResponse)
"""
