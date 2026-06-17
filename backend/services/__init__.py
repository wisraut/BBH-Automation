"""Business logic layer.

Services orchestrate business rules and call repositories + integrations.
They don't know about HTTP (no FastAPI imports) and don't write raw SQL
(call repositories instead).

Phase 1 modules to add:
- auth_service.py
- booking_service.py
- patient_service.py
- report_service.py
- ai_service.py
"""
