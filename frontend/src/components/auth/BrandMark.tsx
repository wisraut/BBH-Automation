export function BrandMark() {
  return (
    <div className="flex items-center gap-4">
      <img
        src="/bbh-logo-mark.png"
        alt="Better Being Hospital"
        className="h-14 w-14 rounded-2xl object-contain"
      />
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-bbh-green">
          BBH Portal
        </p>
        <p className="text-sm text-bbh-muted">Better Being Hospital</p>
      </div>
    </div>
  )
}
