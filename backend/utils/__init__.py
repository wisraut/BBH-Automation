"""Generic helpers — domain-agnostic only.

Rules:
- If used across 2+ files → goes here
- If tied to specific resource (booking/patient) → put in `services/`
- If tied to external service → put in `integrations/`
- Keep each file < 200 lines; split if grows

Suggested modules:
- datetime.py   (parse_thai_date, to_utc, format_thai_dt)
- pagination.py (paginate helper)
- validators.py (validate_thai_phone, validate_line_user_id)
"""
