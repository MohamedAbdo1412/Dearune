// Client-side image optimization utilities for wrapper uploads

export async function optimizeImage(file, options = {}) {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.82,
    format = 'webp',
  } = options

  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image')
  }

  // Skip optimization if it's already webp and small enough? Still compress for consistency
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxWidth / Math.max(bitmap.width, bitmap.height), maxHeight / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Image compression timed out')), 30000)
      canvas.toBlob(
        (b) => {
          clearTimeout(timeout)
          if (!b) reject(new Error('Could not compress image'))
          else resolve(b)
        },
        format === 'webp' ? 'image/webp' : format,
        quality,
      )
    })

    const originalName = file.name ?? 'image'
    const baseName = originalName.replace(/\.[^.]*$/, '')
    const ext = format === 'webp' ? 'webp' : (format === 'jpeg' ? 'jpg' : 'png')
    const name = `${baseName}.${ext}`
    return new File([blob], name, { type: blob.type })
  } catch (err) {
    // If optimization fails, throw - we should not save if required uploads fail
    throw err
  }
}

export async function generateThumbnail(file, options = {}) {
  const {
    maxWidth = 400,
    maxHeight = 400,
    quality = 0.8,
    format = 'webp',
  } = options

  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image')
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxWidth / Math.max(bitmap.width, bitmap.height), maxHeight / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Thumbnail generation timed out')), 30000)
      canvas.toBlob(
        (b) => {
          clearTimeout(timeout)
          if (!b) reject(new Error('Could not generate thumbnail'))
          else resolve(b)
        },
        format === 'webp' ? 'image/webp' : format,
        quality,
      )
    })

    const originalName = file.name ?? 'image'
    const baseName = originalName.replace(/\.[^.]*$/, '')
    const ext = format === 'webp' ? 'webp' : (format === 'jpeg' ? 'jpg' : 'png')
    const name = `${baseName}-thumb.${ext}`
    return new File([blob], name, { type: blob.type })
  } catch (err) {
    throw err
  }
}

export async function optimizeAndThumbnail(file, opts = {}) {
  const [optimized, thumbnail] = await Promise.all([
    optimizeImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.82, format: 'webp', ...opts.optimized }),
    generateThumbnail(file, { maxWidth: 400, maxHeight: 400, quality: 0.8, format: 'webp', ...opts.thumbnail }),
  ])
  return { optimized, thumbnail }
}
