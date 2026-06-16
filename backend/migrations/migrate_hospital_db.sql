-- ============================================================
-- Hospital DB Migration — Full Redesign 2026-05-29
-- ============================================================

-- Drop all existing tables
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS analyses CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS current_medications CASCADE;
DROP TABLE IF EXISTS allergies CASCADE;
DROP TABLE IF EXISTS treatment_history CASCADE;
DROP TABLE IF EXISTS medical_conditions CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS doctors CASCADE;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE doctors (
    doctor_id   TEXT PRIMARY KEY,      -- LINE user_id
    name        TEXT NOT NULL,
    specialty   TEXT,
    license_no  TEXT,
    hospital    TEXT,
    created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE patients (
    patient_id  TEXT PRIMARY KEY,      -- HN format: HN-YYYY-NNN
    name        TEXT NOT NULL,
    dob         DATE,
    sex         TEXT,                  -- 'ชาย' | 'หญิง'
    blood_type  TEXT,
    phone       TEXT,
    address     TEXT,
    doctor_id   TEXT REFERENCES doctors(doctor_id),
    created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE medical_conditions (
    id              SERIAL PRIMARY KEY,
    patient_id      TEXT REFERENCES patients(patient_id),
    condition_name  TEXT NOT NULL,
    icd10           TEXT,
    diagnosed_year  INT,
    diagnosed_at    TEXT,              -- โรงพยาบาลที่วินิจฉัย
    status          TEXT DEFAULT 'active',  -- 'active' | 'chronic' | 'resolved'
    notes           TEXT
);

CREATE TABLE treatment_history (
    id              SERIAL PRIMARY KEY,
    patient_id      TEXT REFERENCES patients(patient_id),
    treatment_type  TEXT,              -- 'hospitalization' | 'surgery' | 'procedure'
    description     TEXT,
    hospital        TEXT,
    treated_date    TEXT,
    outcome         TEXT,
    notes           TEXT
);

CREATE TABLE allergies (
    id          SERIAL PRIMARY KEY,
    patient_id  TEXT REFERENCES patients(patient_id),
    allergen    TEXT NOT NULL,
    reaction    TEXT,
    severity    TEXT                   -- 'mild' | 'moderate' | 'severe'
);

CREATE TABLE current_medications (
    id           SERIAL PRIMARY KEY,
    patient_id   TEXT REFERENCES patients(patient_id),
    drug_name    TEXT NOT NULL,
    dose         TEXT,
    frequency    TEXT,
    indication   TEXT,
    started_year INT,
    is_active    BOOLEAN DEFAULT true
);

CREATE TABLE reports (
    report_id       TEXT PRIMARY KEY,  -- RPT-YYYYMMDD-XXXX
    patient_id      TEXT REFERENCES patients(patient_id),
    report_source   TEXT,              -- โรงพยาบาล/คลินิกที่ตรวจมา
    report_date     DATE,
    chief_complaint TEXT,
    report_text     TEXT,              -- lab values + อาการ + vital signs
    status          TEXT DEFAULT 'pending',  -- 'pending' | 'analyzed'
    submitted_at    TIMESTAMP DEFAULT now()
);

CREATE TABLE analyses (
    id                   SERIAL PRIMARY KEY,
    report_id            TEXT REFERENCES reports(report_id),
    dify_conversation_id TEXT,
    summary_text         TEXT,
    pdf_path             TEXT,
    created_at           TIMESTAMP DEFAULT now()
);

CREATE TABLE audit_logs (
    id          SERIAL PRIMARY KEY,
    actor_id    TEXT,
    actor_type  TEXT,                  -- 'doctor'
    action      TEXT,                  -- 'analysis_triggered' | 'pdf_requested'
    report_id   TEXT REFERENCES reports(report_id),
    created_at  TIMESTAMP DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_reports_patient    ON reports(patient_id, submitted_at);
CREATE INDEX idx_reports_status     ON reports(status);
CREATE INDEX idx_analyses_report    ON analyses(report_id);
CREATE INDEX idx_audit_report       ON audit_logs(report_id);
CREATE INDEX idx_audit_actor        ON audit_logs(actor_id);
CREATE INDEX idx_conditions_patient ON medical_conditions(patient_id);
CREATE INDEX idx_meds_patient       ON current_medications(patient_id, is_active);

-- ============================================================
-- SEED DATA — DOCTORS
-- ============================================================
INSERT INTO doctors VALUES
('U_doctor_001', 'นพ.วรพล สุขสมบูรณ์',  'อายุรศาสตร์ทั่วไป',           'ว.12345', 'โรงพยาบาลรามาธิบดี',        '2020-01-15'),
('U_doctor_002', 'พญ.นันทนา มีชัย',      'อายุรศาสตร์โรคหัวใจและหลอดเลือด', 'ว.23456', 'โรงพยาบาลศิริราช',    '2020-03-01'),
('U_doctor_003', 'นพ.ธนวัฒน์ รุ่งเรือง', 'อายุรศาสตร์ระบบการหายใจ',     'ว.34567', 'โรงพยาบาลจุฬาลงกรณ์',     '2021-06-01');

-- ============================================================
-- SEED DATA — PATIENTS
-- ============================================================
INSERT INTO patients VALUES
('HN-2019-001', 'สมชาย มีสุข',       '1968-03-14', 'ชาย',   'O',  '081-234-5678', '12/5 ถ.ลาดพร้าว แขวงลาดพร้าว กทม. 10230',       'U_doctor_001', '2019-08-20'),
('HN-2020-002', 'วิไลวรรณ จันทร์ดี', '1984-07-22', 'หญิง',  'A',  '082-345-6789', '33 ซ.สุขุมวิท 71 แขวงพระโขนงเหนือ กทม. 10110',  'U_doctor_002', '2020-02-14'),
('HN-2018-003', 'ประเสริฐ ทองมา',    '1959-11-05', 'ชาย',   'B',  '083-456-7890', '78/3 หมู่ 4 ต.บางแก้ว อ.เมือง สมุทรปราการ 10270','U_doctor_003', '2018-05-10'),
('HN-2022-004', 'นิภา สุขสวัสดิ์',   '1991-01-30', 'หญิง',  'AB', '084-567-8901', '5/12 ถ.พระราม 9 แขวงบางกะปิ กทม. 10240',        'U_doctor_001', '2022-09-05'),
('HN-2023-005', 'อานนท์ บุญเกิด',    '1997-05-18', 'ชาย',   'O',  '085-678-9012', '201 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมือง เชียงใหม่ 50200','U_doctor_003','2023-01-22');

-- ============================================================
-- SEED DATA — MEDICAL CONDITIONS
-- ============================================================
INSERT INTO medical_conditions (patient_id, condition_name, icd10, diagnosed_year, diagnosed_at, status, notes) VALUES
-- สมชาย — เบาหวาน + ความดัน + ไขมัน + CAD
('HN-2019-001', 'เบาหวานชนิดที่ 2',                       'E11',   2014, 'โรงพยาบาลรามาธิบดี',       'chronic', 'ควบคุมได้ระดับปานกลาง HbA1c ล่าสุด 8.2% เป้าหมาย <7.0%'),
('HN-2019-001', 'ความดันโลหิตสูง',                         'I10',   2012, 'คลินิกชุมชนเขตลาดพร้าว',   'chronic', 'BP เฉลี่ย 148/94 mmHg ยังควบคุมได้ไม่ดีนัก ปรับยาซ้ำหลายครั้ง'),
('HN-2019-001', 'ไขมันในเลือดผิดปกติ (Mixed Dyslipidemia)', 'E78.5', 2014, 'โรงพยาบาลรามาธิบดี',       'chronic', 'LDL เป้าหมาย <70 (ASCVD high risk) ล่าสุด LDL 112 TG 240'),
('HN-2019-001', 'โรคหลอดเลือดหัวใจตีบ (CAD, s/p PCI)',    'I25.1', 2020, 'โรงพยาบาลหัวใจกรุงเทพ',    'chronic', 'ใส่ DES stent เส้น LAD มิ.ย. 2563 ยังต้องกิน Dual Antiplatelet'),
('HN-2019-001', 'โรคไตเรื้อรัง CKD Stage G3a',             'N18.3', 2022, 'โรงพยาบาลรามาธิบดี',       'active',  'eGFR 58 mL/min, Microalbuminuria ACR 85 mg/g สัมพันธ์กับเบาหวาน+ความดัน'),

-- วิไลวรรณ — SLE + Lupus Nephritis
('HN-2020-002', 'โรคลูปัส SLE',                            'M32.9', 2016, 'โรงพยาบาลศิริราช',         'chronic', 'SLEDAI score 4–8 ช่วง flare ควบคุมด้วย HCQ + low-dose steroid'),
('HN-2020-002', 'Lupus Nephritis Class III',                'M32.14',2018, 'โรงพยาบาลศิริราช',         'active',  'Cr เพิ่มจาก 1.2 → 1.9 mg/dL ใน 6 เดือน Proteinuria 3+ eGFR 35'),
('HN-2020-002', 'โลหิตจาง Hemolytic Anemia (Autoimmune)',  'D59.0', 2019, 'โรงพยาบาลศิริราช',         'resolved','Hb ต่ำสุด 6.2 g/dL ปี 2562 รับเลือด 2 unit รักษาหายแล้ว'),

-- ประเสริฐ — COPD + HFrEF + DM2
('HN-2018-003', 'COPD GOLD Stage III',                      'J44.1', 2015, 'โรงพยาบาลจุฬาลงกรณ์',     'chronic', 'สูบบุหรี่ 30 pack-years เลิกปี 2561 FEV1 ล่าสุด 38% (ลดจาก 42%)'),
('HN-2018-003', 'ภาวะหัวใจล้มเหลว HFrEF',                 'I50.9', 2021, 'โรงพยาบาลจุฬาลงกรณ์',     'chronic', 'EF 30% (เม.ย. 2569) ลดจาก 35% NYHA Class II–III Admit 3 ครั้ง/ปีที่แล้ว'),
('HN-2018-003', 'เบาหวานชนิดที่ 2',                       'E11',   2017, 'โรงพยาบาลจุฬาลงกรณ์',     'chronic', 'HbA1c 8.2% ควบคุมยาก เพราะรับประทานอาหารไม่คุม ต้องใช้ Insulin'),
('HN-2018-003', 'ความดันโลหิตสูง',                         'I10',   2018, 'โรงพยาบาลจุฬาลงกรณ์',     'chronic', 'ควบคุมได้พอสมควรด้วย Sacubitril/Valsartan'),

-- นิภา — Graves Disease
('HN-2022-004', 'โรคไทรอยด์เป็นพิษ (Graves Disease)',     'E05.0', 2022, 'โรงพยาบาลกรุงเทพ',         'active',  'TSH 0.02 mIU/L FT4 2.8 ng/dL ยังควบคุมไม่ดี เคย Thyroid Storm ปี 2566'),

-- อานนท์ — Asthma + Allergic Rhinitis
('HN-2023-005', 'โรคหอบหืด Bronchial Asthma (Moderate Persistent)', 'J45.9', 2010, 'คลินิกกุมารเวช เชียงใหม่', 'chronic', 'ควบคุมได้บางส่วน Admit 2 ครั้งในปีที่ผ่านมา เพิ่งปรับยา controller'),
('HN-2023-005', 'โรคจมูกอักเสบจากภูมิแพ้',                'J30.1', 2010, 'คลินิกกุมารเวช เชียงใหม่', 'chronic', 'แพ้ฝุ่นบ้าน (house dust mite) ขนแมว PM2.5 กระตุ้นทั้งหอบและจมูก');

-- ============================================================
-- SEED DATA — TREATMENT HISTORY
-- ============================================================
INSERT INTO treatment_history (patient_id, treatment_type, description, hospital, treated_date, outcome, notes) VALUES
-- สมชาย
('HN-2019-001', 'surgery',         'ขยายหลอดเลือดหัวใจ (PCI) ใส่ Drug-Eluting Stent เส้น LAD', 'โรงพยาบาลหัวใจกรุงเทพ', 'มิ.ย. 2563', 'สำเร็จ ไม่มีภาวะแทรกซ้อน', 'ICU 1 วัน ward 2 วัน ใช้ premedication เพราะแพ้ contrast'),
('HN-2019-001', 'hospitalization', 'Admit HHS น้ำตาลสูงวิกฤต 680 mg/dL ขาดน้ำรุนแรง',        'โรงพยาบาลรามาธิบดี',    'ก.ย. 2560',  'รักษาหาย ปรับยา เพิ่ม insulin', '5 วัน ICU + ward'),
('HN-2019-001', 'procedure',       'ตรวจสวนหัวใจ Coronary Angiography พบตีบ 90% เส้น LAD',    'โรงพยาบาลหัวใจกรุงเทพ', 'พ.ค. 2563',  'นำไปทำ PCI ทันที', 'ใช้ CO2 angiography แทน contrast เพราะแพ้ iodine'),
('HN-2019-001', 'hospitalization', 'Admit ความดันสูงวิกฤต Hypertensive Crisis BP 210/120',     'โรงพยาบาลรามาธิบดี',    'ม.ค. 2565',  'ปรับยา IV labetalol ดีขึ้น', '2 วัน'),

-- วิไลวรรณ
('HN-2020-002', 'hospitalization', 'Admit SLE Flare + Lupus Nephritis กำเริบ ไข้ ปวดข้อ ปัสสาวะเป็นฟอง', 'โรงพยาบาลศิริราช', 'มี.ค. 2565', 'IV methylprednisolone pulse 3 วัน ดีขึ้น', '7 วัน'),
('HN-2020-002', 'hospitalization', 'Admit Hemolytic Anemia Hb 6.2 g/dL จาก SLE',              'โรงพยาบาลศิริราช',    'พ.ย. 2562',  'รับเลือด 2 unit + corticosteroid สูง หายดี', '4 วัน'),
('HN-2020-002', 'procedure',       'Renal Biopsy ยืนยัน Lupus Nephritis Class III',            'โรงพยาบาลศิริราช',    'ส.ค. 2561',  'ยืนยัน Class III เริ่ม MMF', NULL),
('HN-2020-002', 'hospitalization', 'Admit SLE Flare กำเริบ Hb 8.1 CBC pancytopenia',           'โรงพยาบาลศิริราช',    'ต.ค. 2567',  'ปรับ Prednisolone เพิ่ม ดีขึ้น', '5 วัน'),

-- ประเสริฐ
('HN-2018-003', 'hospitalization', 'Admit COPD Exacerbation + Respiratory Failure ใช้ NIV',    'โรงพยาบาลจุฬาลงกรณ์', 'ธ.ค. 2566',  'ดีขึ้น ออกจำหน่าย Home O2 2 L/min', 'ICU 3 วัน ward 7 วัน'),
('HN-2018-003', 'hospitalization', 'Admit Acute Decompensated Heart Failure น้ำท่วมปอด BNP 2,100', 'โรงพยาบาลจุฬาลงกรณ์', 'ก.ค. 2566', 'IV Furosemide ลดน้ำ 4 kg ดีขึ้น', '6 วัน'),
('HN-2018-003', 'hospitalization', 'Admit COPD Exacerbation จาก Community-acquired Pneumonia', 'โรงพยาบาลจุฬาลงกรณ์', 'ก.พ. 2566',  'IV Ceftriaxone + Azithromycin 7 วัน หาย', '9 วัน'),
('HN-2018-003', 'procedure',       'Spirometry PFT ติดตามสมรรถภาพปอด',                        'โรงพยาบาลจุฬาลงกรณ์', 'ม.ค. 2569',  'FEV1 38% (ลดจาก 42%), FEV1/FVC 0.55 GOLD III', NULL),
('HN-2018-003', 'procedure',       'Echocardiography ติดตาม HFrEF',                            'โรงพยาบาลจุฬาลงกรณ์', 'เม.ย. 2569', 'EF 30% (ลดจาก 35%) Mild Pulmonary HTN PASP 42 mmHg', NULL),

-- นิภา
('HN-2022-004', 'hospitalization', 'Admit Thyroid Storm หลังหยุดยาเองตอนรู้ว่าตั้งครรภ์', 'โรงพยาบาลกรุงเทพ', 'ต.ค. 2566', 'รักษาหาย ปรับยา PTU ช่วงตั้งครรภ์ไตรมาส 1', '3 วัน ICU'),
('HN-2022-004', 'procedure',       'Thyroid ultrasound พบ diffuse enlargement ไม่มี nodule', 'โรงพยาบาลกรุงเทพ', 'ก.ย. 2565', 'Confirmed Graves Disease เริ่ม Methimazole', NULL),

-- อานนท์
('HN-2023-005', 'hospitalization', 'Admit Acute Severe Asthma ได้ IV Salbutamol + Nebulizer + IV MgSO4', 'โรงพยาบาลเชียงใหม่ราม', 'มี.ค. 2567', 'ดีขึ้น ปรับยา controller เพิ่ม Montelukast', '2 วัน'),
('HN-2023-005', 'hospitalization', 'Admit Asthma attack กระตุ้นจาก PM2.5 สูง ค่า AQI 185',   'รพ.มหาราช เชียงใหม่',  'ธ.ค. 2566', 'ดีขึ้น แนะนำหน้ากาก N95 และ Air purifier', '1 วัน'),
('HN-2023-005', 'procedure',       'Allergy skin prick test ยืนยันสารก่อภูมิแพ้',             'คลินิกภูมิแพ้ มช.',    'มิ.ย. 2566', 'Positive: HDM, cat, cockroach, mold', NULL);

-- ============================================================
-- SEED DATA — ALLERGIES
-- ============================================================
INSERT INTO allergies (patient_id, allergen, reaction, severity) VALUES
('HN-2019-001', 'Penicillin',           'ผื่นลมพิษ (Urticaria) ทั่วตัว หน้าบวม',           'moderate'),
('HN-2019-001', 'Iodinated IV Contrast','Anaphylaxis หัวใจหยุดชั่วขณะ (ปี 2563 ก่อน angio)', 'severe'),
('HN-2020-002', 'Sulfonamides (Sulfa)', 'ผื่นคล้าย Stevens-Johnson ทั่วตัว',                'severe'),
('HN-2020-002', 'NSAIDs (Ibuprofen)',   'แน่นหน้าอก หายใจลำบาก หลอดลมหดตัว',              'moderate'),
('HN-2018-003', 'Aspirin',             'Bronchospasm รุนแรง หายใจไม่ออก',                  'severe'),
('HN-2023-005', 'NSAIDs (ทุกชนิด)',    'กระตุ้นหอบหืดรุนแรง Bronchospasm',                'severe'),
('HN-2023-005', 'แมว (Cat Dander)',    'น้ำมูกไหล คันตา จาม + กระตุ้นหอบ',               'moderate');

-- ============================================================
-- SEED DATA — CURRENT MEDICATIONS
-- ============================================================
INSERT INTO current_medications (patient_id, drug_name, dose, frequency, indication, started_year, is_active) VALUES
-- สมชาย (6 ยา)
('HN-2019-001', 'Metformin',             '1,000 mg',    'วันละ 2 ครั้ง หลังอาหาร',          'เบาหวานชนิดที่ 2',             2014, true),
('HN-2019-001', 'Empagliflozin (Jardiance)', '10 mg',   'วันละ 1 ครั้ง เช้า',               'เบาหวาน + ป้องกันหัวใจ/ไต',    2021, true),
('HN-2019-001', 'Amlodipine',            '10 mg',       'วันละ 1 ครั้ง เช้า',               'ความดันโลหิตสูง',              2012, true),
('HN-2019-001', 'Perindopril',           '8 mg',        'วันละ 1 ครั้ง เช้า',               'ความดัน + ป้องกันไต (ACEI)',    2014, true),
('HN-2019-001', 'Atorvastatin',          '40 mg',       'วันละ 1 ครั้ง กลางคืน',            'ไขมันในเลือดสูง (LDL <70)',     2014, true),
('HN-2019-001', 'Aspirin',               '100 mg',      'วันละ 1 ครั้ง',                    'ป้องกันลิ่มเลือด post-PCI',     2020, true),
('HN-2019-001', 'Clopidogrel',           '75 mg',       'วันละ 1 ครั้ง',                    'Dual Antiplatelet post-DES stent', 2020, true),

-- วิไลวรรณ (5 ยา)
('HN-2020-002', 'Hydroxychloroquine (Plaquenil)', '200 mg', 'วันละ 2 ครั้ง',                'SLE maintenance',              2016, true),
('HN-2020-002', 'Prednisolone',          '10 mg',       'วันละ 1 ครั้ง เช้า',               'SLE กดภูมิคุ้มกัน',            2016, true),
('HN-2020-002', 'Mycophenolate Mofetil (CellCept)', '1,000 mg', 'วันละ 2 ครั้ง',            'Lupus Nephritis',              2018, true),
('HN-2020-002', 'Losartan',              '50 mg',       'วันละ 1 ครั้ง',                    'ลด Proteinuria ป้องกันไต (ARB)', 2018, true),
('HN-2020-002', 'Calcium + Vitamin D3', '1,000 mg / 1,000 IU', 'วันละ 1 ครั้ง',            'ป้องกันกระดูกพรุน (on steroid)', 2016, true),

-- ประเสริฐ (7 ยา)
('HN-2018-003', 'Tiotropium inhaler (Spiriva)', '18 mcg', 'วันละ 1 ครั้ง (HandiHaler)',    'COPD — LAMA ขยายหลอดลม',       2015, true),
('HN-2018-003', 'Budesonide/Formoterol (Symbicort)', '160/4.5 mcg', '2 puff วันละ 2 ครั้ง','COPD — ICS/LABA',              2018, true),
('HN-2018-003', 'Furosemide',            '40 mg',       'วันละ 1 ครั้ง เช้า',               'HFrEF — ลดน้ำในร่างกาย',       2021, true),
('HN-2018-003', 'Bisoprolol',            '5 mg',        'วันละ 1 ครั้ง เช้า',               'HFrEF — Beta-blocker',         2021, true),
('HN-2018-003', 'Sacubitril/Valsartan (Entresto)', '49/51 mg', 'วันละ 2 ครั้ง',            'HFrEF — ลด mortality (ARNI)',   2022, true),
('HN-2018-003', 'Metformin',             '500 mg',      'วันละ 2 ครั้ง หลังอาหาร',          'เบาหวานชนิดที่ 2',             2017, true),
('HN-2018-003', 'Insulin Glargine (Lantus)', '20 units', 'ก่อนนอน SC',                      'เบาหวาน — ควบคุมไม่ได้ด้วยยากิน', 2023, true),

-- นิภา (2 ยา)
('HN-2022-004', 'Methimazole (Thyrozol)', '10 mg',      'วันละ 2 ครั้ง',                    'Graves Disease ลด thyroid hormone', 2022, true),
('HN-2022-004', 'Propranolol',           '20 mg',       'วันละ 2 ครั้ง',                    'ควบคุมใจสั่ง หัวใจเต้นเร็ว',   2022, true),

-- อานนท์ (4 ยา)
('HN-2023-005', 'Fluticasone/Salmeterol (Seretide)', '250/25 mcg', '2 puff วันละ 2 ครั้ง', 'Asthma controller — ICS/LABA', 2020, true),
('HN-2023-005', 'Salbutamol inhaler (Ventolin)', '100 mcg', '2 puff เมื่อมีอาการ PRN',     'Asthma reliever',              2010, true),
('HN-2023-005', 'Loratadine',            '10 mg',       'วันละ 1 ครั้ง',                    'Allergic Rhinitis',            2010, true),
('HN-2023-005', 'Montelukast',           '10 mg',       'วันละ 1 ครั้ง กลางคืน',            'Asthma + Allergic Rhinitis',   2021, true);

-- ============================================================
-- SEED DATA — REPORTS (ผลการตรวจที่คนไข้ส่งกลับมา)
-- ============================================================
INSERT INTO reports VALUES

-- สมชาย: ติดตาม DM+HT+CAD ประจำ 3 เดือน
('RPT-20260520-0001', 'HN-2019-001', 'คลินิกเบาหวาน โรงพยาบาลรามาธิบดี', '2026-05-20',
'ติดตามผลเลือดประจำ 3 เดือน เวียนศีรษะเล็กน้อยตอนลุกเร็ว ปัสสาวะบ่อยกลางคืน',
'ผลการตรวจเลือดและ Vital Signs (รพ.รามาธิบดี วันที่ 20/05/2569)
================================================================
CBC:
  Hb         : 12.8 g/dL      [L]   (ปกติ 13.5–17.5)
  Hct        : 38.4%           [L]   (ปกติ 41–53)
  WBC        : 7,200 /μL             (ปกติ 4,500–11,000)
  Platelet   : 210,000 /μL           (ปกติ 150,000–400,000)

Blood Glucose & HbA1c:
  FBS        : 194 mg/dL       [H]   (ปกติ 70–100)
  HbA1c      : 8.2%            [H]   (เป้าหมาย <7.0%)
  Post-meal  : 278 mg/dL       [H]   (2 ชม.หลังอาหาร, ปกติ <140)

Renal Function:
  BUN        : 24 mg/dL              (ปกติ 7–25)
  Creatinine : 1.3 mg/dL       [H]   (ปกติ 0.7–1.2)
  eGFR       : 58 mL/min/1.73m²     (CKD G3a — เท่าเดิม)
  Na         : 138 mEq/L             (ปกติ 135–145)
  K          : 4.1 mEq/L             (ปกติ 3.5–5.0)

Lipid Panel:
  Total Chol : 198 mg/dL
  LDL        : 112 mg/dL       [H]   (เป้าหมาย <70 เพราะ ASCVD high risk)
  HDL        : 38 mg/dL        [L]   (ปกติ >40)
  TG         : 240 mg/dL       [H]   (ปกติ <150)

Urine:
  Microalbumin/Creatinine (ACR): 85 mg/g   [H]   (ปกติ <30 → Microalbuminuria)

Vital Signs:
  BP         : 156/94 mmHg     [H]
  HR         : 82 bpm
  น้ำหนัก   : 84 kg  |  ส่วนสูง: 168 cm  |  BMI: 29.8 kg/m²

อาการที่คนไข้รายงาน:
  "เวียนหัวบ้างตอนลุกเร็ว ปัสสาวะมากขึ้นตอนกลางคืน 2–3 ครั้ง
   น้ำหนักลด 2 กิโลใน 1 เดือนโดยไม่ได้ตั้งใจ อ่อนเพลียง่ายกว่าเดิม"',
'pending', '2026-05-22 09:15:00'),

-- วิไลวรรณ: SLE flare สงสัย
('RPT-20260518-0002', 'HN-2020-002', 'แผนกอายุรกรรม โรงพยาบาลศิริราช', '2026-05-18',
'ผื่นมากขึ้น ปวดข้อ ไข้ต่ำ ขาบวม — สงสัย SLE flare',
'ผลการตรวจเลือดและปัสสาวะ (รพ.ศิริราช วันที่ 18/05/2569)
================================================================
CBC:
  Hb         : 9.6 g/dL        [L]   (ปกติ 11.5–15.5)
  WBC        : 3,100 /μL       [L]   (ปกติ 4,500–11,000) → Leukopenia
  Platelet   : 98,000 /μL      [L]   (ปกติ 150,000–400,000) → Thrombocytopenia

Lupus Serology:
  Anti-dsDNA : 480 IU/mL       [H]   (ปกติ <10) → สูงมากบ่งชี้ active disease
  C3         : 52 mg/dL        [L]   (ปกติ 90–180)
  C4         : 8 mg/dL         [L]   (ปกติ 16–47)
  ANA        : Positive 1:640 Homogeneous pattern
  Anti-Sm    : Positive (specific for SLE)

Renal Function:
  Creatinine : 1.9 mg/dL       [H]   (จากเดิม 1.6 mg/dL — แย่ลง)
  eGFR       : 35 mL/min/1.73m²      (CKD G3b)
  BUN        : 32 mg/dL        [H]

Urinalysis:
  Protein    : 3+               [H]
  RBC        : 15–20/HPF        [H]   → Hematuria
  RBC cast   : Detected               → Active Glomerulonephritis

Inflammatory Markers:
  CRP        : 48 mg/L         [H]   (ปกติ <5)
  ESR        : 85 mm/hr        [H]   (ปกติ <20)

Vital Signs:
  BP         : 142/88 mmHg     [H]
  Temp       : 37.8°C           [H]   (ปกติ <37.5)
  HR         : 96 bpm

อาการที่คนไข้รายงาน:
  "ผื่นผีเสื้อที่แก้มและจมูกแดงขึ้นชัดเจน ปวดข้อมือและนิ้วมือทั้ง 2 ข้าง
   ไข้ต่ำๆ 37.5–37.8 มา 5 วัน ขาบวมเล็กน้อยทั้ง 2 ข้าง
   ปัสสาวะเป็นฟองมากกว่าเดิม ล้าและอ่อนแรงมาก"',
'pending', '2026-05-19 14:30:00'),

-- ประเสริฐ: หายใจหอบ + ขาบวม
('RPT-20260515-0003', 'HN-2018-003', 'คลินิกโรคปอด โรงพยาบาลจุฬาลงกรณ์', '2026-05-15',
'หายใจหอบมากขึ้น ขาบวม น้ำหนักขึ้น 3 กิโลใน 1 สัปดาห์ นอนราบไม่ได้',
'ผลการตรวจ (รพ.จุฬาลงกรณ์ วันที่ 15/05/2569)
================================================================
CBC:
  Hb         : 13.2 g/dL
  WBC        : 9,800 /μL             (ปกติ — ไม่มี infection ชัดเจน)
  Platelet   : 178,000 /μL

Cardiac Biomarkers:
  BNP        : 1,240 pg/mL     [H]   (ปกติ <100) → Decompensated HF
  Troponin I : 0.04 ng/mL            (borderline — ไม่มี acute MI)

Metabolic:
  Na         : 132 mEq/L       [L]   (ปกติ 135–145) → Dilutional Hyponatremia
  K          : 3.8 mEq/L
  Creatinine : 1.6 mg/dL       [H]
  eGFR       : 42 mL/min/1.73m²
  Glucose    : 168 mg/dL       [H]
  HbA1c      : 8.2%            [H]

Arterial Blood Gas (room air):
  pH         : 7.36
  PaO2       : 58 mmHg         [L]   (ปกติ 80–100) → Hypoxemia
  PaCO2      : 52 mmHg         [H]   (ปกติ 35–45) → CO2 retention
  HCO3       : 29 mEq/L        [H]   (compensated respiratory acidosis)
  SpO2       : 88%              [L]   → ต้องการ O2 supplement

Spirometry (เทียบปีที่แล้ว):
  FEV1       : 38% predicted          (ลดจาก 42% ปี 2568)
  FVC        : 62%
  FEV1/FVC   : 0.55

Echo (30/04/2569):
  EF         : 30%                   (ลดจาก 35% ปี 2566)
  Diastolic Dysfunction Grade II
  PASP       : 42 mmHg               (Mild Pulmonary Hypertension)
  IVC        : dilated — fluid overload

CXR (15/05/2569):
  Cardiomegaly CTR 0.62
  Bilateral pleural effusion (R > L)
  Perihilar haziness

Vital Signs:
  BP         : 102/68 mmHg     [L]
  HR         : 110 bpm          [H]
  RR         : 26 /min          [H]
  SpO2       : 88% (room air)   [L]
  น้ำหนัก   : 68 kg (ปกติ 65 kg — ขึ้น 3 กิโลใน 1 สัปดาห์)

อาการที่คนไข้รายงาน:
  "หายใจหอบมากขึ้นเวลาเดิน ต้องนอนหัวสูง 2 หมอน นอนราบไม่ได้
   ขาบวมทั้ง 2 ข้าง น้ำหนักขึ้น 3 กิโลในอาทิตย์เดียว
   เสมหะเหลืองอ่อน ไม่มีไข้"',
'pending', '2026-05-16 10:00:00'),

-- นิภา: ติดตาม Graves — TSH ยังต่ำ
('RPT-20260510-0004', 'HN-2022-004', 'คลินิกต่อมไร้ท่อ โรงพยาบาลกรุงเทพ', '2026-05-10',
'ใจสั่ง มือสั่น น้ำหนักลด ร้อนง่าย — ติดตาม Graves Disease',
'ผลการตรวจ Thyroid Function และ Lab (รพ.กรุงเทพ วันที่ 10/05/2569)
================================================================
Thyroid Function Tests:
  TSH        : 0.01 mIU/L      [L]   (ปกติ 0.4–4.0) → Suppressed
  FT4        : 3.2 ng/dL       [H]   (ปกติ 0.8–1.8) → สูงมาก
  FT3        : 9.8 pg/mL       [H]   (ปกติ 2.3–4.2)
  TRAb       : 18.5 IU/L       [H]   (ปกติ <1.75) → Active Graves

CBC:
  Hb         : 11.8 g/dL       [L]   (ปกติ 11.5–15.5) — เล็กน้อย
  WBC        : 5,200 /μL
  Platelet   : 195,000 /μL

Liver Function (monitoring Methimazole):
  AST        : 42 U/L                (ปกติ <40) — เพิ่มเล็กน้อย ต้องติดตาม
  ALT        : 55 U/L          [H]   (ปกติ <35) — เพิ่ม (drug-induced?)
  ALP        : 88 U/L
  Total Bili : 0.9 mg/dL

Vital Signs:
  BP         : 128/76 mmHg
  HR         : 108 bpm          [H]   (ยังเร็วแม้กิน Propranolol)
  Temp       : 37.1°C
  น้ำหนัก   : 51 kg (ลดจาก 55 kg เมื่อ 3 เดือนก่อน)

อาการที่คนไข้รายงาน:
  "ใจสั่ง หัวใจเต้นเร็วอยู่ตลอด มือสั่น น้ำหนักลด 4 กิโลใน 3 เดือน
   ร้อนง่าย เหงื่อออกมาก ตาแห้งและระคายเคือง นอนไม่หลับ"',
'pending', '2026-05-12 08:45:00'),

-- อานนท์: ติดตามหอบหืด ฝุ่น PM2.5 ฤดูกาล
('RPT-20260508-0005', 'HN-2023-005', 'คลินิกภูมิแพ้ โรงพยาบาลมหาราช เชียงใหม่', '2026-05-08',
'หอบมากขึ้น ฝุ่น PM2.5 สูง ใช้ยา reliever บ่อยขึ้น',
'ผลการตรวจ Pulmonary Function และ Lab (รพ.มหาราช เชียงใหม่ วันที่ 08/05/2569)
================================================================
Spirometry (Pre/Post Bronchodilator):
  FEV1 Pre   : 68% predicted    [L]   (ปกติ >80%)
  FEV1 Post  : 82% predicted          (Reversibility +14% → Significant)
  FVC        : 88%
  FEV1/FVC   : 0.72             [L]   (ปกติ >0.75)

Asthma Control:
  ACT Score  : 14/25            [L]   (ปกติ ≥20 = well controlled)
  Reliever use: 4–5 ครั้ง/สัปดาห์ [H] (ปกติ <2 ครั้ง/สัปดาห์)

Blood & IgE:
  IgE Total  : 680 IU/mL        [H]   (ปกติ <100)
  Eos        : 8%               [H]   (ปกติ <5%) → Eosinophilia บ่งชี้ allergic
  CBC WBC    : 7,800 /μL              ปกติ ไม่มี infection

Nasal Peak Flow (PNIF): 80 L/min  [L] (ปกติ >120)

Vital Signs:
  SpO2       : 96% (room air)
  HR         : 88 bpm
  RR         : 18 /min
  Peak Flow  : 380 L/min        [L]   (คาดหวัง 520 L/min)

Environmental:
  AQI เชียงใหม่ วันตรวจ: 145 (Unhealthy for sensitive groups)
  PM2.5      : 58 μg/m³         [H]   (มาตรฐาน <25)

อาการที่คนไข้รายงาน:
  "หอบมากขึ้นช่วง 2 สัปดาห์ที่ผ่านมา ใช้ยาพ่น Ventolin เกือบทุกวัน
   ตื่นกลางดึกเพราะหอบ 3–4 คืน/สัปดาห์ น้ำมูกไหลตลอด จามบ่อย
   ออกกำลังกายได้น้อยลงมาก ฝุ่นช่วงนี้หนักมาก"',
'pending', '2026-05-09 11:20:00');
