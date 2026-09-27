/**
 * Local (Client-Side) Weather Map Remaster / Translator using HTML5 Canvas.
 *
 * Runs 100% in the mobile browser / PWA. Zero backend or PC needed.
 * Works completely offline in Airplane mode.
 *
 * Reproduces the backend Pillow logic from backend/map_translator.py:
 *   1. Decodes the input map image (JPG, PNG, WEBP, etc.)
 *   2. Covers Indonesian legend bounding boxes with white rectangles
 *   3. Writes translated English text (PRECIPITATION, LEGEND, LOW, MEDIUM, etc.)
 *   4. Generates the 3-line centered title:
 *        PRECIPITATION ANALYSIS MAP
 *        [TARGET_MONTH] [TARGET_YEAR]
 *        INDONESIA
 *   5. Preserves map grid lines and borders
 *   6. Exports as JPEG Blob (quality: 0.95)
 */

export const CALIBRATION = { width: 1280, height: 912 }

export const LEGEND_BOXES = {
  title: {
    erase: [78, 664, 440, 736],
    centerX: 259,
    topY: 666,
    lineSpacing: 24,
    fontSize: 18,
    bold: true,
    dynamicTitle: true,
  },
  precip_header: {
    erase: [500, 644, 699, 661],
    text: 'PRECIPITATION (mm) :',
    anchor: [506, 652],
    fontSize: 16,
    bold: true,
  },
  legend_header: {
    erase: [800, 644, 968, 661],
    text: 'LEGEND :',
    anchor: [805, 652],
    fontSize: 16,
    bold: true,
  },
  low: {
    erase: [595, 692, 690, 713],
    text: 'LOW',
    anchor: [601, 702],
    fontSize: 16,
    bold: true,
  },
  medium: {
    erase: [594, 764, 696, 785],
    text: 'MEDIUM',
    anchor: [600, 774],
    fontSize: 16,
    bold: true,
  },
  high: {
    erase: [594, 824, 700, 847],
    text: 'HIGH',
    anchor: [599, 835],
    fontSize: 16,
    bold: true,
  },
  very_high: {
    erase: [592, 868, 738, 892],
    text: 'VERY HIGH',
    anchor: [601, 878],
    fontSize: 16,
    bold: true,
  },
  province_border: {
    erase: [838, 748, 970, 772],
    text: 'Province Border',
    anchor: [843, 760],
    fontSize: 15,
    bold: true,
  },
  overseas: {
    erase: [838, 791, 970, 814],
    text: 'Overseas',
    anchor: [843, 803],
    fontSize: 15,
    bold: true,
  },
}

const FONT_FAMILY = 'Arial, "Segoe UI", Helvetica, sans-serif'

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    let objectUrl = null

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = (err) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error('Gagal memuat gambar: ' + (err?.message || 'format tidak didukung')))
    }

    if (typeof source === 'string') {
      img.src = source
    } else if (source instanceof Blob || source instanceof File) {
      objectUrl = URL.createObjectURL(source)
      img.src = objectUrl
    } else {
      reject(new Error('Format sumber gambar tidak valid'))
    }
  })
}

/**
 * Remasters and translates the map image locally using HTML5 Canvas.
 * @param {Blob|File|string} source
 * @param {string} month e.g. "FEBRUARI" or "FEBRUARY"
 * @param {string} year e.g. "2026"
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<Blob>}
 */
export async function remasterMapLocally(source, month, year, onProgress) {
  if (onProgress) onProgress(20)

  const img = await loadImage(source)

  if (onProgress) onProgress(50)

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Tidak dapat membuat Canvas 2D di perangkat ini')

  // Draw background and original image
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)

  // Scale factor if image resolution is not exactly 1280x912
  const scaleX = canvas.width / CALIBRATION.width
  const scaleY = canvas.height / CALIBRATION.height

  for (const spec of Object.values(LEGEND_BOXES)) {
    const [x1, y1, x2, y2] = spec.erase
    const boxX = x1 * scaleX
    const boxY = y1 * scaleY
    const boxW = (x2 - x1) * scaleX
    const boxH = (y2 - y1) * scaleY

    // Erase old text area with solid white rectangle
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(boxX, boxY, boxW, boxH)

    const baseFontSize = (spec.fontSize || 16) * Math.min(scaleX, scaleY)
    let fontSize = baseFontSize
    const isBold = spec.bold ? 'bold ' : ''

    const lines = spec.dynamicTitle
      ? ['PRECIPITATION ANALYSIS MAP', `${month.toUpperCase()} ${year}`, 'INDONESIA']
      : [spec.text]

    // Auto-shrink guard: never collide with table borders
    const eraseWidth = boxW
    ctx.font = `${isBold}${fontSize}px ${FONT_FAMILY}`

    while (fontSize > 8) {
      ctx.font = `${isBold}${fontSize}px ${FONT_FAMILY}`
      let widest = 0
      for (const line of lines) {
        const metrics = ctx.measureText(line)
        if (metrics.width > widest) widest = metrics.width
      }
      if (widest <= eraseWidth - 4 * scaleX) break
      fontSize -= 1
    }

    ctx.fillStyle = '#000000'

    if (spec.dynamicTitle) {
      const centerX = spec.centerX * scaleX
      let curY = spec.topY * scaleY
      const lineSpacing = (spec.lineSpacing || 24) * scaleY

      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      for (const line of lines) {
        ctx.fillText(line, centerX, curY)
        curY += lineSpacing
      }
    } else {
      const [anchorX, anchorY] = spec.anchor
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(spec.text, anchorX * scaleX, anchorY * scaleY)
    }
  }

  if (onProgress) onProgress(80)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          if (onProgress) onProgress(100)
          resolve(blob)
        } else {
          reject(new Error('Gagal menghasilkan file gambar JPEG'))
        }
      },
      'image/jpeg',
      0.95,
    )
  })
}
