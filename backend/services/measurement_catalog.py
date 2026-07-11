"""Marker catalog — the single source of truth for structured lab/biomarker
values. LabResults uses ``ref`` (clinical normal range); Biomarker uses
``optimal`` (functional-medicine target zone). ``aliases`` drive deterministic
post-LLM code normalization; ``mmol_factor`` (when present) converts a value
reported in mmol/L to the catalog's canonical mg/dL unit.

Kept as a Python constant, not a DB table: these are clinical constants that
change with medical guidelines (git-reviewed diffs, no migration coupling) and
the set is small. Both views import this module so ranges never diverge.
"""
from typing import Any

# Each marker: label_th, unit (canonical), panel, ref (lo, hi), optimal (lo, hi),
# aliases (lowercase substrings matched against the report label), and optional
# mmol_factor (mg/dL per mmol/L) for lipids/glucose reported in SI units.
MARKERS: dict[str, dict[str, Any]] = {
    # ── Metabolic ──────────────────────────────────────────────────────────
    "glucose": {
        "label_th": "น้ำตาลในเลือด (FBS)", "unit": "mg/dL", "panel": "metabolic",
        "ref": (70, 99), "optimal": (75, 86), "mmol_factor": 18.0182,
        "aliases": ["fbs", "fasting glucose", "fasting blood sugar", "glucose", "น้ำตาล", "กลูโคส"],
    },
    "hba1c": {
        "label_th": "น้ำตาลสะสม (HbA1c)", "unit": "%", "panel": "metabolic",
        "ref": (4.0, 5.6), "optimal": (4.8, 5.2),
        "aliases": ["hba1c", "a1c", "hemoglobin a1c", "น้ำตาลสะสม"],
    },
    "insulin": {
        "label_th": "อินซูลิน (fasting)", "unit": "uIU/mL", "panel": "metabolic",
        "ref": (2.6, 24.9), "optimal": (2.0, 6.0),
        "aliases": ["insulin", "fasting insulin", "อินซูลิน"],
    },
    # ── Lipid ──────────────────────────────────────────────────────────────
    "chol": {
        "label_th": "คอเลสเตอรอลรวม", "unit": "mg/dL", "panel": "lipid",
        "ref": (0, 199), "optimal": (0, 180), "mmol_factor": 38.67,
        "aliases": ["total cholesterol", "cholesterol total", "chol", "คอเลสเตอรอล"],
    },
    "ldl": {
        "label_th": "ไขมัน LDL", "unit": "mg/dL", "panel": "lipid",
        "ref": (0, 129), "optimal": (0, 99), "mmol_factor": 38.67,
        "aliases": ["ldl", "ldl-c", "ldl cholesterol"],
    },
    "hdl": {
        "label_th": "ไขมัน HDL", "unit": "mg/dL", "panel": "lipid",
        "ref": (40, 200), "optimal": (60, 200), "mmol_factor": 38.67,
        "aliases": ["hdl", "hdl-c", "hdl cholesterol"],
    },
    "trig": {
        "label_th": "ไตรกลีเซอไรด์", "unit": "mg/dL", "panel": "lipid",
        "ref": (0, 149), "optimal": (0, 89), "mmol_factor": 88.57,
        "aliases": ["triglyceride", "triglycerides", "trig", "tg", "ไตรกลีเซอไรด์"],
    },
    # ── Inflammation ───────────────────────────────────────────────────────
    "crp": {
        "label_th": "การอักเสบ (hs-CRP)", "unit": "mg/L", "panel": "inflammation",
        "ref": (0, 3.0), "optimal": (0, 1.0),
        "aliases": ["hs-crp", "hscrp", "hs crp", "c-reactive protein", "crp"],
    },
    # ── Vitamins / minerals ────────────────────────────────────────────────
    "vitd": {
        "label_th": "วิตามินดี (25-OH)", "unit": "ng/mL", "panel": "vitamins",
        "ref": (30, 100), "optimal": (40, 60),
        "aliases": ["vitamin d", "25-oh", "25 oh", "vit d", "วิตามินดี"],
    },
    "b12": {
        "label_th": "วิตามินบี 12", "unit": "pg/mL", "panel": "vitamins",
        "ref": (200, 900), "optimal": (500, 900),
        "aliases": ["vitamin b12", "b12", "cobalamin", "บี 12", "บี12"],
    },
    "ferritin": {
        "label_th": "เฟอร์ริติน (เหล็กสะสม)", "unit": "ng/mL", "panel": "vitamins",
        "ref": (30, 300), "optimal": (50, 150),
        "aliases": ["ferritin", "เฟอร์ริติน"],
    },
    # ── Liver ──────────────────────────────────────────────────────────────
    "alt": {
        "label_th": "เอนไซม์ตับ ALT", "unit": "U/L", "panel": "liver",
        "ref": (0, 40), "optimal": (0, 25),
        "aliases": ["alt", "sgpt", "alanine aminotransferase"],
    },
    "ast": {
        "label_th": "เอนไซม์ตับ AST", "unit": "U/L", "panel": "liver",
        "ref": (0, 40), "optimal": (0, 25),
        "aliases": ["ast", "sgot", "aspartate aminotransferase"],
    },
    # ── Kidney ─────────────────────────────────────────────────────────────
    "creatinine": {
        "label_th": "ครีเอตินิน", "unit": "mg/dL", "panel": "kidney",
        "ref": (0.6, 1.3), "optimal": (0.7, 1.1),
        "aliases": ["creatinine", "cr", "ครีเอตินิน"],
    },
    "egfr": {
        "label_th": "การกรองของไต (eGFR)", "unit": "mL/min", "panel": "kidney",
        "ref": (90, 200), "optimal": (90, 200),
        "aliases": ["egfr", "gfr", "estimated gfr"],
    },
    # ── CBC ────────────────────────────────────────────────────────────────
    "wbc": {
        "label_th": "เม็ดเลือดขาว (WBC)", "unit": "10^3/uL", "panel": "cbc",
        "ref": (4.0, 10.0), "optimal": (4.5, 8.0),
        "aliases": ["wbc", "white blood cell", "เม็ดเลือดขาว"],
    },
    "hgb": {
        "label_th": "ฮีโมโกลบิน (Hgb)", "unit": "g/dL", "panel": "cbc",
        "ref": (12.0, 17.5), "optimal": (13.5, 15.5),
        "aliases": ["hemoglobin", "hgb", "hb", "ฮีโมโกลบิน"],
    },
    "hct": {
        "label_th": "ฮีมาโตคริต (Hct)", "unit": "%", "panel": "cbc",
        "ref": (36, 52), "optimal": (40, 48),
        "aliases": ["hematocrit", "hct", "ฮีมาโตคริต"],
    },
    "plt": {
        "label_th": "เกล็ดเลือด (Platelet)", "unit": "10^3/uL", "panel": "cbc",
        "ref": (150, 400), "optimal": (200, 350),
        "aliases": ["platelet", "plt", "เกล็ดเลือด"],
    },
}

# Panel display order + Thai labels for grouping in LabResults.
PANELS: list[tuple[str, str]] = [
    ("metabolic", "เมตาบอลิก / น้ำตาล"),
    ("lipid", "ไขมัน"),
    ("inflammation", "การอักเสบ"),
    ("vitamins", "วิตามิน / แร่ธาตุ"),
    ("liver", "ตับ"),
    ("kidney", "ไต"),
    ("cbc", "ความสมบูรณ์เม็ดเลือด"),
]

VALID_CODES = frozenset(MARKERS.keys())


def normalize_code(raw: str | None) -> str:
    """Map a report label (or a code) to a catalog code. Returns 'unknown' when
    nothing matches so the value is still stored as a draft for doctor review."""
    if not raw:
        return "unknown"
    text = raw.strip().lower()
    if text in MARKERS:
        return text
    for code, meta in MARKERS.items():
        if any(alias in text for alias in meta["aliases"]):
            return code
    return "unknown"


def normalize_value_unit(code: str, value: float, unit: str | None) -> tuple[float, str | None]:
    """Apply ONLY known fixed conversions (mmol/L -> canonical mg/dL for
    lipids/glucose). Any other unit is kept as-is (flagged for doctor attention
    on confirm) — never silently converted."""
    meta = MARKERS.get(code)
    if not meta or unit is None:
        return value, unit
    u = unit.strip().lower()
    factor = meta.get("mmol_factor")
    if factor and u in ("mmol/l", "mmol/liter", "mmol"):
        return round(value * factor, 4), meta["unit"]
    return value, unit


def flag_for(code: str, value: float | None) -> str:
    """high / low / normal vs the clinical reference range. 'unknown' if the
    code isn't in the catalog."""
    meta = MARKERS.get(code)
    if not meta or value is None:
        return "unknown"
    lo, hi = meta["ref"]
    if value < lo:
        return "low"
    if value > hi:
        return "high"
    return "normal"


def catalog_payload() -> list[dict[str, Any]]:
    """Flat list served to the frontend so it never hardcodes ranges."""
    out: list[dict[str, Any]] = []
    for code, meta in MARKERS.items():
        ref_lo, ref_hi = meta["ref"]
        opt_lo, opt_hi = meta["optimal"]
        out.append({
            "code": code,
            "label_th": meta["label_th"],
            "unit": meta["unit"],
            "panel": meta["panel"],
            "ref_low": ref_lo,
            "ref_high": ref_hi,
            "optimal_low": opt_lo,
            "optimal_high": opt_hi,
        })
    return out
