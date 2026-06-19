import { BrandMark } from './BrandMark'

export function AuthBrandPanel() {
  return (
    <div className="relative hidden overflow-hidden border-r border-bbh-line bg-gradient-to-br from-white via-bbh-green-soft to-white px-12 py-10 lg:flex lg:flex-col">
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-bbh-green/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-bbh-green/5 blur-3xl"
        aria-hidden
      />

      <BrandMark />

      <div className="relative flex flex-1 items-center">
        <div className="max-w-xl">
          <p className="mb-5 inline-flex rounded-full border border-bbh-green/20 bg-bbh-green-soft px-4 py-2 text-sm font-semibold text-bbh-green-dark">
            Staff workspace
          </p>
          <h1 className="auth-heading text-5xl font-semibold leading-tight text-bbh-ink">
            ศูนย์กลางการทำงานของทีมโรงพยาบาล BBH
          </h1>
          <p className="mt-5 text-lg leading-8 text-bbh-muted">
            เข้าสู่ระบบครั้งเดียว แล้วระบบจะพาไปยังหน้าที่ตรงกับสิทธิ์ของผู้ใช้จากฐานข้อมูล
          </p>
        </div>
      </div>

      <div className="relative text-sm text-bbh-muted">
        Asia&apos;s First and Finest Functional Medicine Hospital
      </div>
    </div>
  )
}
