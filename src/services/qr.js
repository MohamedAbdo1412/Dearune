import QRCode from 'qrcode'
import { publicMessageUrl } from './constants'

export async function qrDataUrl(content, size = 256) {
  return QRCode.toDataURL(content, {
    width: size,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#342717', light: '#ffffff' },
  })
}

export function qrContent(payload) {
  return publicMessageUrl(payload)
}