import type { ReactNode } from 'react'

// แถบปุ่มยืน (ยกเลิก/ยืนยัน) ที่ตรึงติดขอบล่างของ Modal เสมอ — เนื้อหาในฟอร์มเลื่อน
// อยู่ข้างหลัง แต่ปุ่มไม่หล่นหายใต้จอ แม้ข้อความจะยาว (เช่นตอนสลับเป็นภาษาอังกฤษ)
//
// สำคัญ: **ห้ามใส่ -mb** ที่นี่ — negative bottom margin ทำให้ sticky ยื่น border-box
// เลยขอบล่าง scrollport → เผยเนื้อหาที่เลื่อนอยู่ "ใต้" แถบปุ่ม (bug ที่เจอ). ปล่อยให้
// `sticky bottom-0` ตรึงชิดขอบล่าง scrollport เอง; z สูง + bg ทึบ + เงาบน = คลุมเนื้อหา
// ที่ลอดใต้สนิท. -mx ยังใช้เพื่อยืดเต็มความกว้าง (ตรง padding ของ Modal body).
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 flex flex-col-reverse gap-2 border-t border-bbh-line bg-white px-4 py-3.5 shadow-[0_-8px_16px_-8px_rgba(15,23,42,0.18)] md:-mx-7 md:px-7 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      {children}
    </div>
  )
}
