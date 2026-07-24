import bbhLogoFull from '../../assets/bbh-logo-full.jpg'

// โลโก้ BBH แบบเต็ม — ใช้ซ้ำในแผงแบรนด์และการ์ด auth บนมือถือ
export function BrandMark() {
  return (
    <div className="flex items-center">
      <img
        src={bbhLogoFull}
        alt="Better Being Hospital"
        className="h-24 w-auto max-w-[260px] object-contain"
      />
    </div>
  )
}
