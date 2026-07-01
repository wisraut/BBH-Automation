"""Shared HTML + plain-text shell for outbound BBH notification emails.

Design tokens mirror ``frontend/tailwind.config.js`` (``bbh.*``) so mail
matches the web dashboard. Layout follows transactional-email best
practice (Postmark, Litmus, Enchant 2026): 600px capped fluid table,
100% inline CSS, multipart/alternative pairing, and a plain-text body
that carries the same information hierarchy for accessibility and dark
mode fallback.
"""
from __future__ import annotations

# ── Palette (matches tailwind.config.js `bbh.*`) ────────────────────────────
COLOR_GREEN = "#00a96e"
COLOR_GREEN_DARK = "#007f5d"
COLOR_GREEN_SOFT = "#e8f7f1"
COLOR_INK = "#1f2a24"
COLOR_MUTED = "#706350"
COLOR_LINE = "#dfe8e3"
COLOR_SURFACE = "#f7fbf9"

# ── Font stacks (mirrors tailwind + Thai-safe substitutes) ──────────────────
FONT_BODY = (
    "'Noto Sans Thai','Inter',-apple-system,BlinkMacSystemFont,"
    "'Segoe UI',Arial,sans-serif"
)
FONT_SERIF = (
    "'Noto Serif Thai',Georgia,'Times New Roman',serif"
)
FONT_MONO = "'SFMono-Regular','IBM Plex Mono',Consolas,'Courier New',monospace"


def render_html_shell(
    *,
    eyebrow: str,
    title_html: str,
    subtitle: str,
    content_html: str,
    footer_html: str,
    preheader: str = "",
) -> str:
    """Return a full HTML document wrapped in the BBH email shell.

    ``preheader`` shows as the inbox preview text — kept off-screen via
    display:none so it does not repeat inside the message body.
    """
    return f"""<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>BBH</title>
</head>
<body style="margin:0;padding:0;background:{COLOR_SURFACE};font-family:{FONT_BODY};color:{COLOR_INK};">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
  {preheader}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{COLOR_SURFACE};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 22px 60px -32px rgba(0,169,110,0.28);">
        <tr>
          <td style="padding:24px 32px 20px;border-bottom:1px solid {COLOR_LINE};">
            <p style="margin:0;font-size:11px;letter-spacing:0.22em;color:{COLOR_MUTED};text-transform:uppercase;font-weight:600;">
              Better Being Hospital &middot; {eyebrow}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 12px;">
            <h1 style="margin:0;font-family:{FONT_SERIF};font-size:26px;line-height:1.35;color:{COLOR_INK};font-weight:600;">
              {title_html}
            </h1>
            <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:{COLOR_MUTED};">
              {subtitle}
            </p>
          </td>
        </tr>
        <tr><td>{content_html}</td></tr>
        <tr>
          <td style="padding:20px 32px 28px;background:{COLOR_SURFACE};">
            <p style="margin:0;font-size:11px;line-height:1.7;color:{COLOR_MUTED};">
              {footer_html}
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:{COLOR_MUTED};text-align:center;letter-spacing:0.06em;">
        Better Being Hospital &middot; bbh-hospital.com
      </p>
    </td>
  </tr>
</table>
</body>
</html>
"""


def render_text_shell(
    *,
    eyebrow: str,
    title: str,
    subtitle: str,
    content_text: str,
    footer_text: str,
) -> str:
    """Plain-text fallback with the same information architecture as the
    HTML shell — used by Apple Mail dark mode + spam-reputation heuristics."""
    bar = "=" * 40
    return (
        f"BETTER BEING HOSPITAL\n"
        f"{eyebrow}\n{bar}\n\n"
        f"{title}\n{subtitle}\n\n"
        f"{content_text}\n\n"
        f"---- Audit ----\n{footer_text}\n\n"
        f"Better Being Hospital · bbh-hospital.com\n"
    )


# ── Section renderers used by callers ───────────────────────────────────────


def render_stat_split(
    *,
    left_eyebrow: str,
    left_value_html: str,
    left_value_color: str = COLOR_MUTED,
    left_strike: bool = False,
    right_eyebrow: str,
    right_value_html: str,
    right_value_color: str = COLOR_GREEN_DARK,
    right_eyebrow_color: str = COLOR_GREEN,
) -> str:
    """Two-column comparison card (used for old-slot / new-slot)."""
    strike_css = "text-decoration:line-through;" if left_strike else ""
    return f"""
<div style="padding:0 32px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{COLOR_SURFACE};border-radius:12px;">
    <tr>
      <td width="50%" valign="top" style="padding:20px;border-right:1px solid {COLOR_LINE};">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:{COLOR_MUTED};font-weight:600;">{left_eyebrow}</p>
        <p style="margin:8px 0 0;font-family:{FONT_SERIF};font-size:18px;color:{left_value_color};font-weight:500;{strike_css}">{left_value_html}</p>
      </td>
      <td width="50%" valign="top" style="padding:20px;">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:{right_eyebrow_color};font-weight:600;">{right_eyebrow}</p>
        <p style="margin:8px 0 0;font-family:{FONT_SERIF};font-size:18px;color:{right_value_color};font-weight:600;">{right_value_html}</p>
      </td>
    </tr>
  </table>
</div>
"""


def render_kv_section(*, eyebrow: str, items: list[tuple[str, str]]) -> str:
    """Key-value list inside a section — labels in muted, values in ink."""
    rows = "".join(
        f'<tr>'
        f'<td style="padding:6px 12px 6px 0;color:{COLOR_MUTED};width:96px;vertical-align:top;">{k}</td>'
        f'<td style="padding:6px 0;color:{COLOR_INK};">{v}</td>'
        f'</tr>'
        for k, v in items
    )
    return f"""
<div style="padding:8px 32px 24px;">
  <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:{COLOR_MUTED};font-weight:600;">{eyebrow}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.6;">
    {rows}
  </table>
</div>
"""


def render_cta_button(*, label: str, url: str) -> str:
    """Bulletproof-ish button — table wrapper renders on Outlook too."""
    return f"""
<div style="padding:4px 32px 28px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="border-radius:12px;background:{COLOR_GREEN};">
        <a href="{url}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:{FONT_BODY};">{label} &rarr;</a>
      </td>
    </tr>
  </table>
</div>
"""


def render_steps_section(*, eyebrow: str, steps: list[str]) -> str:
    """Numbered list — same visual weight as kv_section but with a jade
    circle marker so users can scan the flow."""
    items = "".join(
        f'<tr>'
        f'<td style="padding:8px 12px 8px 0;vertical-align:top;width:28px;">'
        f'<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;'
        f'background:{COLOR_GREEN_SOFT};color:{COLOR_GREEN_DARK};border-radius:11px;font-size:12px;font-weight:600;">{i}</span>'
        f'</td>'
        f'<td style="padding:8px 0;color:{COLOR_INK};font-size:14px;line-height:1.55;">{step}</td>'
        f'</tr>'
        for i, step in enumerate(steps, start=1)
    )
    return f"""
<div style="padding:0 32px 24px;">
  <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:{COLOR_MUTED};font-weight:600;">{eyebrow}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{items}</table>
</div>
"""
