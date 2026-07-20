// Helpers for the AI chat image attachment (vision).
//
// Two representations come out of one file read:
//   - `data`  : full base64 (no data: prefix) sent to the backend for the model
//               to "see". Transient — never persisted (would blow localStorage).
//   - `thumb` : a small downscaled JPEG data URL kept in the message bubble and
//               persisted, so the chat still shows what was sent after reload.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB — mirrors backend cap
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export type ImageError = 'badType' | 'tooLarge'

export interface PreparedImage {
  name: string
  mime: string
  size: number
  data: string // full base64, no prefix — for the backend
  thumb: string // downscaled JPEG data URL — bubble (shown small via CSS) + lightbox
}

// Returns an error code (for the caller to translate) or null when the file is
// an accepted image within the size cap.
export function validateImage(file: File): ImageError | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'badType'
  if (file.size > MAX_IMAGE_BYTES) return 'tooLarge'
  return null
}

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function makeThumbnail(dataUrl: string, maxPx: number): Promise<string> {
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    // If the browser can't decode it for a thumbnail, fall back to the full
    // data URL — the backend still validates the real bytes.
    return dataUrl
  }
}

// Read the file once, deriving both the full payload and a downscaled preview.
// maxPx is large enough that the lightbox (click-to-enlarge) stays crisp, yet the
// JPEG re-encode keeps the persisted string ~100-200KB — the original 5MB image is
// never stored, only sent to the backend transiently.
// Keep in sync with the backend _MAX_THUMB_CHARS cap so a thumbnail can never
// bounce the whole send with a 422.
const MAX_THUMB_CHARS = 3_000_000

export async function prepareImage(file: File, maxPx = 1024): Promise<PreparedImage> {
  const dataUrl = await readAsDataURL(file)
  const comma = dataUrl.indexOf(',')
  const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  let thumb = await makeThumbnail(dataUrl, maxPx)
  // If the downscale fell back to the full-size image (canvas/decode failure) it
  // can exceed the cap; drop it rather than fail the send — the model still sees
  // the full image, only the persisted preview is skipped.
  if (thumb.length > MAX_THUMB_CHARS) thumb = ''
  return { name: file.name, mime: file.type, size: file.size, data, thumb }
}
