/**
 * Saving a file is not the same on a phone as on the desktop: iOS Safari often
 * ignores the anchor `download` attribute, and Android Chrome replaced the
 * download bar with the share sheet.
 *
 * So: prefer the native share sheet (which offers "Simpan ke Files" /
 * "Simpan ke Galeri") and fall back to the classic anchor download.
 */

export function canUseShareSheet() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof File !== 'undefined'
  )
}

/**
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export async function saveFile(blob, filename, { mime, title } = {}) {
  const type = mime || blob.type || 'application/octet-stream'

  if (canUseShareSheet()) {
    let file = null
    try {
      file = new File([blob], filename, { type })
    } catch {
      file = null
    }

    if (file && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: title || filename })
        return 'shared'
      } catch (error) {
        if (error && error.name === 'AbortError') return 'cancelled'
        // Anything else (e.g. NotAllowedError without a user gesture) → download.
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
