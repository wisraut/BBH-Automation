import type { ReactNode } from 'react'

// แถบปุ่มยืน (ยกเลิก/ยืนยัน) ที่ตรึงติดขอบล่างของ Modal เสมอ — เนื้อหาในฟอร์มเลื่อน
// อยู่ข้างหลัง แต่ปุ่มไม่หล่นหายใต้จอ แม้ข้อความจะยาว (เช่นตอนสลับเป็นภาษาอังกฤษ)
//
// ค่าติดลบ -mx / -mb ออกแบบให้ตรงกับ padding ของกล่อง Modal (`px-4 py-5 md:px-7`)
// เพื่อให้แถบยืดเต็มความกว้าง+แนบชิดขอบล่างพอดี; ปุ่มยังอยู่ในฟอร์ม → submit ทำงานปกติ
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-5 flex flex-col-reverse gap-2 border-t border-bbh-line bg-white px-4 pt-3 pb-5 shadow-[0_-6px_14px_-8px_rgba(15,23,42,0.15)] md:-mx-7 md:px-7 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      {children}
    </div>
  )
}
