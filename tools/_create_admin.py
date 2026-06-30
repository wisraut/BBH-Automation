"""
Bootstrap users in bbh_bot_ops.users for the CRO pilot launch.

Safety:
- Password input via getpass — not echoed, not in shell history
- Parameterized SQL via existing user_repo helpers (no injection risk)
- Enforces the SAME password policy as the live /api/users endpoint
  (services.auth_service._check_password_strength). Cannot create
  a user the server would later reject.
- Hashes via core.security.hash_password (same bcrypt config as login)
- Plain password wiped from memory immediately after hash
- No secrets in the file — all input is interactive

Run inside the bridge container so all imports + DB env are available:

    docker cp tools/_create_admin.py hospital-bridge:/tmp/_create_admin.py
    docker exec -it hospital-bridge sh -c "cd /app && python /tmp/_create_admin.py"

Pilot allowlist note:
  LOGIN_ALLOWED_ROLES default = "admin,cro". Users created with role
  doctor/nurse/lab_staff WILL exist in the DB but cannot log in until
  the env var is widened. The script warns about this before insert.
"""
import getpass
import os
import re
import sys

# Force UTF-8 on stdin/stdout/stderr so Thai input from Windows Docker exec
# doesn't get mangled.
for stream in (sys.stdin, sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

# When this script is `docker cp`'d into /tmp and executed, /app is not on
# sys.path by default. Add it so we can import the bridge code regardless of
# where the file actually lives on disk.
for candidate in ("/app", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))):
    if candidate and os.path.isdir(os.path.join(candidate, "core")) and candidate not in sys.path:
        sys.path.insert(0, candidate)

from core.security import hash_password
from repositories import user_repo
from services.auth_service import _check_password_strength


ROLES = ("admin", "doctor", "cro", "nurse", "lab_staff")
ROLES_PILOT_ALLOWED = ("admin", "cro")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clean(s: str) -> str:
    """Strip non-printable + BOM + zero-width junk that some terminals inject."""
    return "".join(c for c in s if c.isprintable() and ord(c) >= 0x20).strip()


def _print_separator() -> None:
    print("-" * 60)


def list_users() -> None:
    rows, total = user_repo.list_users(limit=100, page=1)
    print()
    _print_separator()
    print(f"  {total} users in users table")
    _print_separator()
    print(f"  {'id':<4} {'role':<10} {'email':<35} {'active':<6} {'name'}")
    _print_separator()
    for r in rows:
        active = "yes" if r.get("is_active") else "no"
        print(f"  {r['id']:<4} {r['role']:<10} {r['email']:<35} {active:<6} {r['display_name']}")
    print()


def prompt_user_data() -> dict | None:
    """Collect one user's fields from stdin. Returns None if the user aborts
    (Ctrl-C at any prompt) so the menu loop can continue cleanly."""
    try:
        print()
        print("=== Create user ===")
        email = _clean(input("Email: ")).lower()
        if not email:
            print("  cancelled (empty email).")
            return None
        if not EMAIL_RE.match(email):
            print(f"  invalid email '{email}'")
            return None
        if user_repo.find_user_by_email(email):
            print(f"  email already exists: {email}")
            return None

        display_name = _clean(input("Display name (e.g. 'CRO Suda'): "))
        if not display_name:
            print("  display name required")
            return None

        print(f"  Available roles: {', '.join(ROLES)}")
        print(f"  Pilot allowlist (can login now): {', '.join(ROLES_PILOT_ALLOWED)}")
        role = _clean(input("Role: ")).lower()
        if role not in ROLES:
            print(f"  role must be one of {ROLES} (got {role!r})")
            return None
        if role not in ROLES_PILOT_ALLOWED:
            print(
                f"  WARNING: role '{role}' is not in LOGIN_ALLOWED_ROLES — the user\n"
                f"  will be created but cannot log in until the env var widens."
            )
            ok = _clean(input("  Continue anyway? [y/N]: ")).lower()
            if ok not in ("y", "yes"):
                print("  cancelled.")
                return None

        specialty = ""
        if role == "doctor":
            specialty = _clean(input("Specialty (optional): ")) or None

        pw1 = getpass.getpass("Password (min 10 chars, mix of 3 of: lower/upper/digit/symbol): ")
        if not pw1:
            print("  cancelled (empty password)")
            return None
        pw2 = getpass.getpass("Confirm password: ")
        if pw1 != pw2:
            print("  passwords do not match")
            return None

        # Enforce the same policy as the live endpoint. Raises HTTPException
        # which we translate to a simple printed error.
        try:
            _check_password_strength(pw1)
        except Exception as exc:
            msg = getattr(exc, "detail", None) or str(exc)
            print(f"  weak password: {msg}")
            return None

        return {
            "email": email,
            "display_name": display_name,
            "role": role,
            "specialty": specialty,
            "password": pw1,
        }
    except (EOFError, KeyboardInterrupt):
        print()
        print("  aborted by user")
        return None


def create_one() -> None:
    data = prompt_user_data()
    if data is None:
        return
    password_hash = hash_password(data["password"])
    # Wipe plain password from memory ASAP.
    data["password"] = None
    try:
        new_id = user_repo.create_user(
            email=data["email"],
            password_hash=password_hash,
            display_name=data["display_name"],
            role=data["role"],
            specialty=data["specialty"],
        )
    except Exception as exc:
        print(f"  insert failed: {exc}")
        return
    print(
        f"  Created user id={new_id} email={data['email']} role={data['role']}"
        + ("  (locked out until allowlist widens)" if data["role"] not in ROLES_PILOT_ALLOWED else "")
    )


def reset_password() -> None:
    try:
        email = _clean(input("Email of user to reset: ")).lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return
    user = user_repo.find_user_by_email(email)
    if not user:
        print(f"  no such user: {email}")
        return
    try:
        pw1 = getpass.getpass("New password: ")
        if not pw1:
            print("  cancelled")
            return
        pw2 = getpass.getpass("Confirm new password: ")
        if pw1 != pw2:
            print("  passwords do not match")
            return
        _check_password_strength(pw1)
    except Exception as exc:
        msg = getattr(exc, "detail", None) or str(exc)
        print(f"  weak password: {msg}")
        return
    new_hash = hash_password(pw1)
    user_repo.update_password_hash(int(user["id"]), new_hash)
    print(f"  password reset for {email} (id={user['id']})")


def deactivate() -> None:
    try:
        email = _clean(input("Email of user to deactivate: ")).lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return
    user = user_repo.find_user_by_email(email)
    if not user:
        print(f"  no such user: {email}")
        return
    user_repo.update_user_fields(int(user["id"]), is_active=False)
    print(f"  user {email} (id={user['id']}) is now inactive")


def menu() -> None:
    actions = {
        "1": ("Create user", create_one),
        "2": ("List users", list_users),
        "3": ("Reset password", reset_password),
        "4": ("Deactivate user", deactivate),
        "q": ("Quit", None),
    }
    while True:
        print()
        _print_separator()
        print("  BBH user bootstrap")
        _print_separator()
        for k, (label, _) in actions.items():
            print(f"   [{k}] {label}")
        try:
            choice = _clean(input("  Choose: ")).lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if choice == "q" or choice == "quit" or choice == "exit":
            return
        action = actions.get(choice)
        if not action:
            print(f"  unknown choice: {choice!r}")
            continue
        action[1]()


if __name__ == "__main__":
    menu()
