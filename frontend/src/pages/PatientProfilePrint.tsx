import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Printer, Check as CheckIcon } from 'lucide-react'

import { usePatient } from '../hooks/usePatient'

// สีเขียวของฟอร์มกระดาษต้นฉบับ (แถบหัวข้อ + ชื่อฟอร์ม)
const FORM_GREEN = '#7fa04f'
const FORM_GREEN_DARK = '#5f7d2e'
// ฟอนต์ Sarabun = มาตรฐานเอกสารราชการ/การแพทย์ไทย (โหลดใน index.css); หัวใช้ Noto Serif Thai
const BODY_FONT = "'Sarabun', 'Noto Sans Thai', sans-serif"
// บังคับให้พื้นสีเขียวพิมพ์ออกมาจริง (เบราว์เซอร์ปกติไม่พิมพ์สีพื้นหลัง)
const PRINT_COLOR: React.CSSProperties = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }
const DOTTED = 'min-w-0 flex-1 self-stretch border-b border-dotted border-zinc-500 leading-6'

function ageFrom(dob?: string | null): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a -= 1
  return a >= 0 && a < 150 ? a : null
}

// เพศ → ป้ายสองภาษา (ฟอร์มเป็นเอกสารสองภาษาคงที่ ไม่ผูกกับปุ่มสลับภาษา)
function genderText(g?: string | null): string {
  switch (g) {
    case 'male': return 'ชาย / Male'
    case 'female': return 'หญิง / Female'
    case 'other': return 'อื่นๆ / Other'
    default: return ''
  }
}

// ป้าย "ไทย (English)" + ช่องเติมบนเส้นจุดไข่ปลา; มีค่าใน DB จะวางทับเส้น, ว่าง = เส้นเปล่าให้เขียนมือ
function Fill({ label, value, grow = 1 }: { label: ReactNode; value?: string | null; grow?: number }) {
  return (
    <div className="flex items-baseline gap-1.5" style={{ flexGrow: grow, flexBasis: 0, minWidth: 0 }}>
      {label ? <span className="shrink-0 whitespace-nowrap">{label}</span> : null}
      <span className={`${DOTTED} text-black`}>{value?.trim() ? value : ' '}</span>
    </div>
  )
}

// ช่องติ๊ก □ + ป้าย; checked = มีเครื่องหมายถูกในกล่อง (เติมจากข้อมูลใน DB)
function Box({ checked, children }: { checked?: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-black">
        {checked ? <CheckIcon size={12} strokeWidth={3} className="text-black" /> : null}
      </span>
      {children}
    </span>
  )
}

// แถบหัวข้อสีเขียวคาดขวางเต็มความกว้างกรอบ (ตัวขาว จัดกลาง) ตามฟอร์มต้นฉบับ
function Bar({ children }: { children: ReactNode }) {
  return (
    <div
      className="px-3 py-1 text-center text-[12.5px] font-bold text-white"
      style={{ backgroundColor: FORM_GREEN, ...PRINT_COLOR }}
    >
      {children}
    </div>
  )
}

// แถวประวัติสุขภาพแบบ "ไม่มี / มี(ระบุ)" — ติ๊ก "มี" + โชว์ข้อความถ้ามีข้อมูล, ว่าง = เว้นให้เขียนมือ
function YesNoDetail({ noLabel, yesLabel, detail }: { noLabel: string; yesLabel: string; detail?: string | null }) {
  const has = !!detail?.trim()
  return (
    <div className="flex items-baseline gap-6 px-5 py-3">
      <Box>{noLabel}</Box>
      <Box checked={has}>{yesLabel}</Box>
      <span className={DOTTED}>{has ? detail : ' '}</span>
    </div>
  )
}

// ฟอร์ม "บันทึกประวัติ / Health Record" แบบพิมพ์ได้ — เลียนแบบฟอร์มกระดาษทางการของ รพ.
// เปิดเป็นแท็บใหม่จากหน้าโปรไฟล์คนไข้ เติมข้อมูลที่มีใน DB ให้อัตโนมัติ ที่เหลือเว้นให้เขียนมือ
// render นอก dashboard shell (ไม่มี sidebar/topbar) เพื่อหน้า A4 สะอาด
export function PatientProfilePrint() {
  const { id } = useParams()
  const { t } = useTranslation()
  const q = usePatient(Number(id) || null)
  const p = q.data

  if (q.isLoading || !p) {
    return <div className="grid min-h-screen place-items-center text-sm text-zinc-500">{t('common.loading')}</div>
  }

  const age = ageFrom(p.dob)
  const dob = p.dob ? new Date(p.dob) : null
  const dd = dob && !Number.isNaN(dob.getTime()) ? String(dob.getDate()) : ''
  const mm = dob && !Number.isNaN(dob.getTime()) ? String(dob.getMonth() + 1) : ''
  const yyyy = dob && !Number.isNaN(dob.getTime()) ? String(dob.getFullYear()) : ''
  const smokingYears = p.smoking && p.smoking_years != null ? String(p.smoking_years) : ' '
  const drinkingYears = p.drinking && p.drinking_years != null ? String(p.drinking_years) : ' '

  return (
    <div
      className="min-h-screen bg-zinc-100 py-6 text-[12.5px] text-black print:bg-white print:py-0"
      style={{ ...PRINT_COLOR, fontFamily: BODY_FONT }}
    >
      <style>{`@media print { @page { size: A4; margin: 14mm; } .no-print { display: none !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }`}</style>

      {/* แถบควบคุม (เห็นบนจอเท่านั้น) */}
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark"
        >
          <Printer size={16} /> พิมพ์ / Print
        </button>
      </div>

      <div className="mx-auto max-w-[210mm] bg-white px-10 py-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {/* หัวฟอร์ม (อยู่นอกกรอบ) */}
        <h1 className="font-serif text-2xl font-bold" style={{ color: FORM_GREEN_DARK }}>
          บันทึกประวัติ / Health Record
        </h1>
        <div className="mt-4 mb-3 flex items-baseline gap-1.5" style={{ width: '55%' }}>
          <span className="shrink-0 font-semibold">HN:</span>
          <span className="min-w-0 flex-1 border-b border-dotted border-zinc-500 leading-6">{p.hn ?? ' '}</span>
        </div>

        {/* กรอบดำล้อมทั้งฟอร์ม — แถบเขียวชนขอบซ้าย/ขวา, ช่องกรอกมี padding ด้านใน */}
        <div className="border border-black">
          {/* ข้อมูลส่วนตัว */}
          <div className="space-y-2 px-5 py-4 leading-6">
            <div className="flex gap-4">
              <Fill label="ชื่อ (Name)" value={p.display_name} grow={2} />
              <Fill label="นามสกุล (Surname)" grow={2} />
            </div>
            <div className="flex gap-4">
              <Fill label="ชื่อภาษาอังกฤษ (English name)" value={p.english_name} grow={3} />
              <Fill label="เพศ (Sex)" value={genderText(p.gender)} grow={1} />
            </div>
            <div className="flex gap-4">
              <div className="flex items-baseline gap-1.5" style={{ flexGrow: 2, flexBasis: 0, minWidth: 0 }}>
                <span className="shrink-0 whitespace-nowrap">วัน เดือน ปีเกิด (Date of Birth)</span>
                <span className="w-10 border-b border-dotted border-zinc-500 text-center leading-6">{dd || ' '}</span>
                <span>/</span>
                <span className="w-10 border-b border-dotted border-zinc-500 text-center leading-6">{mm || ' '}</span>
                <span>/</span>
                <span className="w-14 border-b border-dotted border-zinc-500 text-center leading-6">{yyyy || ' '}</span>
              </div>
              <Fill label="อายุ (Age)" value={age != null ? `${age} ปี` : null} grow={1} />
              <Fill label="ศาสนา (Religion)" value={p.religion} grow={1} />
            </div>
            <div className="flex gap-4">
              <Fill label="สถานภาพสมรส (Marriage status)" value={p.marital_status} grow={1} />
              <Fill label="เชื้อชาติ (Nationality)" value={p.nationality} grow={1} />
            </div>
            <div className="flex gap-4">
              <Fill label="เลขที่บัตรประชาชน (ID NO. / PASSPORT NO)" value={p.national_id} grow={1} />
              <Fill label="อาชีพ (Occupation)" value={p.occupation} grow={1} />
            </div>
            <div className="flex gap-4">
              <Fill label="หมู่เลือด (Blood group)" value={p.blood_type} grow={1} />
              <Fill label="อีเมล์ (E-mail)" value={p.email} grow={2} />
            </div>
            <Fill label="ที่อยู่ที่สามารถติดต่อได้ (Address)" value={p.address} grow={1} />
            <div className="flex gap-4">
              <Fill label="" grow={2} />
              <Fill label="โทรศัพท์ (Telephone Number)" value={p.phone} grow={2} />
            </div>
            <div className="flex gap-4">
              <Fill label="ชื่อบิดา (Father's name)" value={p.father_name} grow={2} />
              <Fill label="โทรศัพท์ (Telephone Number)" value={p.father_phone} grow={1} />
            </div>
            <div className="flex gap-4">
              <Fill label="ชื่อมารดา (Mother's name)" value={p.mother_name} grow={2} />
              <Fill label="โทรศัพท์ (Telephone Number)" value={p.mother_phone} grow={1} />
            </div>
            <div className="flex gap-4">
              <Fill label="บุคคลที่ติดต่อได้ในกรณีฉุกเฉิน (Emergency Contact Person)" value={p.emergency_contact_name} grow={2} />
              <Fill label="เกี่ยวข้องเป็น" value={p.emergency_contact_relation} grow={1} />
            </div>
            <Fill label="โทรศัพท์ (Telephone Number)" value={p.emergency_contact_phone} grow={1} />
            <Fill label="ที่อยู่สามารถติดต่อได้ (Address)" value={p.emergency_contact_address} grow={1} />
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 whitespace-nowrap">อาการที่ต้องการปรึกษา (Chief complain)</span>
              <span className="min-w-0 flex-1 border-b border-dotted border-zinc-500 leading-6 text-black">{p.chief_complaint?.trim() ? p.chief_complaint : ' '}</span>
            </div>
            <div className="border-b border-dotted border-zinc-500 leading-6">{' '}</div>
            <div className="border-b border-dotted border-zinc-500 leading-6">{' '}</div>
          </div>

          {/* ประวัติการเจ็บป่วยในอดีต */}
          <Bar>ประวัติการเจ็บป่วยในอดีต (Current health problem)</Bar>
          <YesNoDetail noLabel="ไม่มี (No)" yesLabel="มี (Yes) โปรดระบุ (Please identify)" detail={p.past_illness} />

          {/* โรคประจำตัว */}
          <Bar>โรคประจำตัว (Congenital disease)</Bar>
          <YesNoDetail noLabel="ไม่มี (No)" yesLabel="มี (Yes) โปรดระบุ (Please identify)" detail={p.congenital_disease} />

          {/* การรับประทานยา หรือ อาหารเสริม */}
          <Bar>การรับประทานยา หรือ อาหารเสริม (Drugs / Supplements)</Bar>
          <div className="px-5 py-3">
            <p className="mb-1.5">ท่านรับประทานยา วิตามิน หรืออาหารเสริมหรือไม่ (Do you take any other drugs or supplements?)</p>
            <div className="flex items-baseline gap-6">
              <Box>ไม่มี (No)</Box>
              <Box checked={!!p.drugs_supplements?.trim()}>มี (Yes) โปรดระบุ (Please identify)</Box>
              <span className={DOTTED}>{p.drugs_supplements?.trim() ? p.drugs_supplements : ' '}</span>
            </div>
          </div>

          {/* ประวัติการแพ้ */}
          <Bar>ประวัติการแพ้ / Allergy</Bar>
          <div className="space-y-2 px-5 py-3">
            <div className="flex items-baseline gap-4">
              <span className="w-52 shrink-0">ประวัติการแพ้ยา (Drug Allergy)</span>
              <Box>ไม่มี (No)</Box>
              <Box checked={!!p.drug_allergy?.trim()}>มี (Yes) โปรดระบุ (Please identify)</Box>
              <span className={DOTTED}>{p.drug_allergy?.trim() ? p.drug_allergy : ' '}</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="w-52 shrink-0">ประวัติการแพ้อาหาร (Food Allergy)</span>
              <Box>ไม่มี (No)</Box>
              <Box checked={!!p.food_allergy?.trim()}>มี (Yes) โปรดระบุ (Please identify)</Box>
              <span className={DOTTED}>{p.food_allergy?.trim() ? p.food_allergy : ' '}</span>
            </div>
          </div>

          {/* การสูบบุหรี่ หรือ การดื่มสุรา */}
          <Bar>การสูบบุหรี่ หรือ การดื่มสุรา (Smoking / Drinking)</Bar>
          <div className="space-y-2 px-5 py-3">
            <div className="flex items-baseline gap-4">
              <span className="w-56 shrink-0">ท่านสูบบุหรี่หรือไม่ (Do you smoke?)</span>
              <Box checked={p.smoking === false}>ไม่สูบ (No)</Box>
              <Box checked={p.smoking === true}>สูบ (Yes)</Box>
              <span className="w-40 self-stretch border-b border-dotted border-zinc-500 text-center leading-6">{smokingYears}</span>
              <span className="shrink-0">ปี (Year)</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="w-56 shrink-0">ท่านดื่มสุราหรือไม่ (Do you drink?)</span>
              <Box checked={p.drinking === false}>ไม่ดื่ม (No)</Box>
              <Box checked={p.drinking === true}>ดื่ม (Yes)</Box>
              <span className="w-40 self-stretch border-b border-dotted border-zinc-500 text-center leading-6">{drinkingYears}</span>
              <span className="shrink-0">ปี (Year)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
