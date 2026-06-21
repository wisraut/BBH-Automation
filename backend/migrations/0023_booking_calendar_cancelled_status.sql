-- Phase 2 - Allow calendar events to be marked cancelled after CRO cancellation.

ALTER TABLE booking_requests
    MODIFY calendar_status ENUM('not_created','pending_event','created','failed','cancelled')
    NOT NULL DEFAULT 'not_created';
