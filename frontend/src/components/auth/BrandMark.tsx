import bbhLogoFull from '../../assets/bbh-logo-full.jpg'

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
