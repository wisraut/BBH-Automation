"""Data access layer.

Repositories contain DB queries (CRUD only — no business logic).
Each repository handles one table/aggregate. Use parameterized queries
(pymysql `cursor.execute(sql, params)`) to prevent SQL injection.

Phase 1 modules to add:
- user_repo.py
- booking_repo.py
- patient_repo.py
- report_repo.py
"""
