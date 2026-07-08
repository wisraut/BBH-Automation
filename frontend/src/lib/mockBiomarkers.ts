// DEMO-ONLY sample biomarker trends for the Biomarker page. Shown only in demo
// mode (button / ?demo=1) behind a visible banner. Each array is a patient's
// readings oldest→newest, aligned to MONTH_LABELS. Real per-patient values will
// come from GET /api/patients/{id}/biomarkers (backend, not built yet). Safe to
// delete once real data exists. Keys match MARKER_CATALOG in Biomarker.tsx.
export const MONTH_LABELS = ['ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.']

export const MOCK_BIOMARKER_SERIES: Record<string, number[]> = {
  // อักเสบ — trending down into optimal (0–1), good
  hscrp: [2.4, 2.1, 1.8, 1.5, 1.2, 0.9],
  // น้ำตาลสะสม — down into optimal (4.8–5.3)
  hba1c: [6.1, 5.9, 5.7, 5.5, 5.4, 5.2],
  // วิตามิน D — climbing up into optimal (40–60)
  vitd: [22, 28, 33, 38, 44, 52],
  // น้ำตาลอดอาหาร — down into optimal (75–90)
  glucose: [104, 100, 96, 92, 89, 88],
  // อินซูลิน — down into optimal (2–5)
  insulin: [9, 8, 7, 6, 5.5, 4.5],
  // เฟอร์ริติน — rising but still just below optimal (50–150) → shows "ต่ำกว่า"
  ferritin: [38, 40, 42, 45, 47, 48],
}
