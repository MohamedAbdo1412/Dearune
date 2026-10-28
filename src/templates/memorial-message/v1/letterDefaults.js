// The letter's opening and closing lines — what the paper says before the
// designer writes anything. Kept OUT of the renderer so sample data, tests
// and any future preview all ask one module what "the defaults" are.

const DEFAULT_AR = {
  greeting: 'عزيزي …،',
  closing: 'بكل الحب،',
}
const DEFAULT_EN = {
  greeting: 'Dear friend,',
  closing: 'Sincerely,',
}

export function memorialDefaults(language) {
  return language === 'ar' ? { ...DEFAULT_AR, body: '', senderName: '' } : { ...DEFAULT_EN, body: '', senderName: '' }
}
