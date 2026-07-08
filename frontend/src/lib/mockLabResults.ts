// DEMO-ONLY detailed lab results for the doctor's "ผลแล็บ (ละเอียด)" page. Shown
// only in demo mode (button / ?demo=1) behind a visible banner. Real structured
// lab values need a backend table + GET /api/patients/{id}/lab-results, which does
// not exist yet — today the system only stores lab reports as files. Safe to delete
// once real structured labs exist. Several patients so the picker can be exercised.

export interface Analyte {
  name: string
  value: number
  unit: string
  low: number // reference range low
  high: number // reference range high
  note?: string // e.g. functional/optimal hint
}

export interface LabPanel {
  key: string
  name: string
  analytes: Analyte[]
}

export interface MockLabPatient {
  id: number
  name: string
  hn: string
  collectedAt: string
  panels: LabPanel[]
}

export const MOCK_LAB_PATIENTS: MockLabPatient[] = [
  {
    id: 101,
    name: 'สมชาย ใจดี',
    hn: 'HN-2019-001',
    collectedAt: '8 ก.ค. 2026',
    panels: [
      {
        key: 'cbc',
        name: 'CBC — ความสมบูรณ์ของเม็ดเลือด',
        analytes: [
          { name: 'Hemoglobin', value: 13.5, unit: 'g/dL', low: 13, high: 17 },
          { name: 'Hematocrit', value: 40, unit: '%', low: 40, high: 50 },
          { name: 'WBC', value: 11.2, unit: '×10³/µL', low: 4, high: 10, note: 'เม็ดเลือดขาวสูงเล็กน้อย' },
          { name: 'Platelets', value: 250, unit: '×10³/µL', low: 150, high: 400 },
          { name: 'RBC', value: 4.8, unit: '×10⁶/µL', low: 4.5, high: 5.9 },
        ],
      },
      {
        key: 'lipid',
        name: 'Lipid Panel — ไขมันในเลือด',
        analytes: [
          { name: 'Cholesterol รวม', value: 215, unit: 'mg/dL', low: 0, high: 200 },
          { name: 'LDL', value: 140, unit: 'mg/dL', low: 0, high: 130, note: 'ไขมันเลว' },
          { name: 'HDL', value: 45, unit: 'mg/dL', low: 40, high: 100, note: 'ไขมันดี' },
          { name: 'Triglycerides', value: 180, unit: 'mg/dL', low: 0, high: 150 },
        ],
      },
      {
        key: 'metabolic',
        name: 'Metabolic — น้ำตาล / ไต',
        analytes: [
          { name: 'Fasting Glucose', value: 102, unit: 'mg/dL', low: 70, high: 99 },
          { name: 'HbA1c', value: 5.8, unit: '%', low: 4.0, high: 5.6, note: 'น้ำตาลสะสม 3 เดือน' },
          { name: 'Creatinine', value: 0.9, unit: 'mg/dL', low: 0.6, high: 1.2 },
          { name: 'eGFR', value: 95, unit: 'mL/min', low: 90, high: 200 },
        ],
      },
      {
        key: 'liver',
        name: 'Liver — การทำงานของตับ',
        analytes: [
          { name: 'AST (SGOT)', value: 28, unit: 'U/L', low: 0, high: 40 },
          { name: 'ALT (SGPT)', value: 45, unit: 'U/L', low: 0, high: 41 },
        ],
      },
      {
        key: 'micro',
        name: 'อักเสบ / วิตามิน / ต่อมไทรอยด์',
        analytes: [
          { name: 'hs-CRP', value: 2.1, unit: 'mg/L', low: 0, high: 3, note: 'optimal < 1.0' },
          { name: 'Vitamin D (25-OH)', value: 28, unit: 'ng/mL', low: 30, high: 100 },
          { name: 'Ferritin', value: 48, unit: 'ng/mL', low: 30, high: 300, note: 'optimal 50–150' },
          { name: 'TSH', value: 2.2, unit: 'mIU/L', low: 0.4, high: 4.0 },
        ],
      },
    ],
  },
  {
    id: 102,
    name: 'สมหญิง มีสุข',
    hn: 'HN-2020-014',
    collectedAt: '5 ก.ค. 2026',
    panels: [
      {
        key: 'cbc',
        name: 'CBC — ความสมบูรณ์ของเม็ดเลือด',
        analytes: [
          { name: 'Hemoglobin', value: 12.8, unit: 'g/dL', low: 12, high: 16 },
          { name: 'Hematocrit', value: 39, unit: '%', low: 36, high: 46 },
          { name: 'WBC', value: 6.4, unit: '×10³/µL', low: 4, high: 10 },
          { name: 'Platelets', value: 290, unit: '×10³/µL', low: 150, high: 400 },
          { name: 'RBC', value: 4.5, unit: '×10⁶/µL', low: 4.0, high: 5.4 },
        ],
      },
      {
        key: 'lipid',
        name: 'Lipid Panel — ไขมันในเลือด',
        analytes: [
          { name: 'Cholesterol รวม', value: 185, unit: 'mg/dL', low: 0, high: 200 },
          { name: 'LDL', value: 118, unit: 'mg/dL', low: 0, high: 130, note: 'ไขมันเลว' },
          { name: 'HDL', value: 62, unit: 'mg/dL', low: 40, high: 100, note: 'ไขมันดี' },
          { name: 'Triglycerides', value: 110, unit: 'mg/dL', low: 0, high: 150 },
        ],
      },
      {
        key: 'metabolic',
        name: 'Metabolic — น้ำตาล / ไต',
        analytes: [
          { name: 'Fasting Glucose', value: 88, unit: 'mg/dL', low: 70, high: 99 },
          { name: 'HbA1c', value: 5.2, unit: '%', low: 4.0, high: 5.6, note: 'น้ำตาลสะสม 3 เดือน' },
          { name: 'Creatinine', value: 0.8, unit: 'mg/dL', low: 0.5, high: 1.1 },
          { name: 'eGFR', value: 102, unit: 'mL/min', low: 90, high: 200 },
        ],
      },
      {
        key: 'liver',
        name: 'Liver — การทำงานของตับ',
        analytes: [
          { name: 'AST (SGOT)', value: 22, unit: 'U/L', low: 0, high: 40 },
          { name: 'ALT (SGPT)', value: 19, unit: 'U/L', low: 0, high: 33 },
        ],
      },
      {
        key: 'micro',
        name: 'อักเสบ / วิตามิน / ต่อมไทรอยด์',
        analytes: [
          { name: 'hs-CRP', value: 0.6, unit: 'mg/L', low: 0, high: 3, note: 'optimal < 1.0' },
          { name: 'Vitamin D (25-OH)', value: 24, unit: 'ng/mL', low: 30, high: 100, note: 'ควรเสริม' },
          { name: 'Ferritin', value: 65, unit: 'ng/mL', low: 15, high: 200, note: 'optimal 50–150' },
          { name: 'TSH', value: 3.1, unit: 'mIU/L', low: 0.4, high: 4.0 },
        ],
      },
    ],
  },
  {
    id: 103,
    name: 'ประยุทธ์ แข็งแรง',
    hn: 'HN-2021-008',
    collectedAt: '6 ก.ค. 2026',
    panels: [
      {
        key: 'cbc',
        name: 'CBC — ความสมบูรณ์ของเม็ดเลือด',
        analytes: [
          { name: 'Hemoglobin', value: 15.1, unit: 'g/dL', low: 13, high: 17 },
          { name: 'Hematocrit', value: 45, unit: '%', low: 40, high: 50 },
          { name: 'WBC', value: 7.8, unit: '×10³/µL', low: 4, high: 10 },
          { name: 'Platelets', value: 210, unit: '×10³/µL', low: 150, high: 400 },
          { name: 'RBC', value: 5.2, unit: '×10⁶/µL', low: 4.5, high: 5.9 },
        ],
      },
      {
        key: 'lipid',
        name: 'Lipid Panel — ไขมันในเลือด',
        analytes: [
          { name: 'Cholesterol รวม', value: 232, unit: 'mg/dL', low: 0, high: 200 },
          { name: 'LDL', value: 155, unit: 'mg/dL', low: 0, high: 130, note: 'ไขมันเลว' },
          { name: 'HDL', value: 38, unit: 'mg/dL', low: 40, high: 100, note: 'ไขมันดี' },
          { name: 'Triglycerides', value: 210, unit: 'mg/dL', low: 0, high: 150 },
        ],
      },
      {
        key: 'metabolic',
        name: 'Metabolic — น้ำตาล / ไต',
        analytes: [
          { name: 'Fasting Glucose', value: 118, unit: 'mg/dL', low: 70, high: 99, note: 'เข้าเกณฑ์ก่อนเบาหวาน' },
          { name: 'HbA1c', value: 6.2, unit: '%', low: 4.0, high: 5.6, note: 'น้ำตาลสะสม 3 เดือน' },
          { name: 'Creatinine', value: 1.0, unit: 'mg/dL', low: 0.6, high: 1.2 },
          { name: 'eGFR', value: 92, unit: 'mL/min', low: 90, high: 200 },
        ],
      },
      {
        key: 'liver',
        name: 'Liver — การทำงานของตับ',
        analytes: [
          { name: 'AST (SGOT)', value: 35, unit: 'U/L', low: 0, high: 40 },
          { name: 'ALT (SGPT)', value: 52, unit: 'U/L', low: 0, high: 41 },
        ],
      },
      {
        key: 'micro',
        name: 'อักเสบ / วิตามิน / ต่อมไทรอยด์',
        analytes: [
          { name: 'hs-CRP', value: 3.4, unit: 'mg/L', low: 0, high: 3, note: 'optimal < 1.0' },
          { name: 'Vitamin D (25-OH)', value: 34, unit: 'ng/mL', low: 30, high: 100 },
          { name: 'Ferritin', value: 180, unit: 'ng/mL', low: 30, high: 300, note: 'optimal 50–150' },
          { name: 'TSH', value: 1.8, unit: 'mIU/L', low: 0.4, high: 4.0 },
        ],
      },
    ],
  },
]
