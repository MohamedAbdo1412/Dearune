// Intelligent Shipping Data Mapping Engine for Dearune
// Normalizes order/shipping data into a provider-agnostic model with
// Arabic address intelligence, wrapper-aware descriptions, and full traceability.

const clean = (value) => String(value ?? '').trim()

const cleanArray = (values) => (Array.isArray(values) ? values : []).map((v) => clean(v)).filter(Boolean)

const normalizeWhitespace = (value) => clean(value).replace(/\s+/g, ' ')

const hasArabic = (value) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(clean(value))

const hasDigits = (value) => /[0-9\u0660-\u0669]/.test(clean(value))

// Normalize Arabic-Indic numerals to Western numerals
const normalizeArabicNumerals = (value) => {
  const map = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' }
  return clean(value).replace(/[\u0660-\u0669]/g, (d) => map[d] || d)
}

// Normalize common Arabic address abbreviations/spaces
const normalizeArabicText = (value) => {
  let s = normalizeWhitespace(value)
  // Common separators
  s = s.replace(/\s*[-–—]\s*/g, '، ')
  s = s.replace(/\s*,\s*/g, '، ')
  // Normalize repeated separators
  s = s.replace(/(،\s*){2,}/g, '، ')
  return s.trim().replace(/^،\s*|،\s*$/g, '')
}

const joinParts = (parts) => {
  const seen = new Set()
  const out = []
  for (const p of parts) {
    const v = normalizeArabicText(p)
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out.join('، ')
}

// Extract useful tokens from unstructured address
const tokenizeAddress = (value) => {
  const s = normalizeWhitespace(value)
  if (!s) return []
  // Split by common separators
  return s
    .split(/[\n,،;\/\\|]+/)
    .map((t) => normalizeWhitespace(t))
    .filter(Boolean)
}

// Build a normalized internal shipping record from various order shapes
export function buildInternalShippingRecord(source, ctx = {}) {
  const row = source ?? {}
  const trace = []
  const warnings = []

  const addTrace = (field, value, meta = {}) => {
    if (value === undefined || value === null) return
    trace.push({ field, value: String(value), ...meta })
  }

  // References
  const canonicalId = clean(row.canonical_id || row.reference || row.project_reference || row.sold_id)
  const soldId = clean(row.sold_id)
  const unitRef = clean(row.unit_reference)
  const projectId = clean(row.project_id || row.id)
  const carrierRef = clean(row.carrier_reference || row.tracking_code || row.postId)
  const trackingCode = clean(row.tracking_code)

  // Recipient
  const recipientName =
    clean(row.recipient_name || row.recipientName || row.customer_name || row.customerName) || ''
  if (!recipientName) warnings.push({ code: 'missing_recipient_name', severity: 'critical' })

  const phone = normalizeArabicNumerals(clean(row.customer_phone || row.phone || row.mobileNo || row.mobile_no))
  if (!phone) warnings.push({ code: 'missing_phone', severity: 'critical' })
  else if (!/^01[0125][0-9]{8}$/.test(phone.replace(/[\s\-()+]/g, ''))) {
    warnings.push({ code: 'invalid_egypt_mobile', severity: 'warning' })
  }

  const phoneAlt = normalizeArabicNumerals(clean(row.recipient_phone_alt || row.phone2 || row.phone_alt))

  // Wrapper/product info
  const wrapperKey = clean(row.wrapper_type || row.wrapperType)
  const wrapperName = clean(row.wrapper_name || row.wrapperName || ctx.wrapperName || wrapperKey) || wrapperKey
  if (!wrapperName) warnings.push({ code: 'missing_wrapper_name', severity: 'warning' })

  // Template/title
  const templateSlug = clean(row.template_slug || row.templateSlug)
  const title = clean(row.title || row.project_title)
  const descriptionBase = wrapperName ? `Dearune - ${wrapperName}` : 'Dearune'

  // Address components - collect from all sources
  const addr1 = clean(row.address_line1 || row.addressLine1 || row.street || row.address)
  const addr2 = clean(row.address_line2 || row.addressLine2)
  const city = clean(row.city)
  const district = clean(row.district)
  const governorate = clean(row.governorate || row.state_province || row.stateProvince)
  const area = clean(row.area)
  const postalCode = clean(row.postal_code || row.postalCode)
  const country = clean(row.country) || 'Egypt'
  const landmark = clean(row.landmark)
  const specialInstructions = clean(row.special_instructions || row.specialInstructions || row.notes || row.itemSpecialNotes)

  // Try to extract from unstructured full address if present
  const fullAddressRaw = clean(row.full_address || row.address_full || row.fullAddress)
  const addressTokens = tokenizeAddress(fullAddressRaw || [addr1, addr2].filter(Boolean).join(', '))

  // For backward compatibility with existing tests, be conservative
  // Build structured address parts
  const structuredParts = []
  if (addr1) structuredParts.push(addr1)
  if (addr2) structuredParts.push(addr2)
  if (district && district !== city) structuredParts.push(district)
  if (landmark) structuredParts.push(landmark)
  if (specialInstructions) structuredParts.push(specialInstructions)

  // Combine intelligently - but for simple cases, prefer just addr1/addr2
  let combinedAddress = joinParts(structuredParts)
  if (!combinedAddress) {
    combinedAddress = joinParts([governorate, city, district, area, addr1, addr2, landmark, specialInstructions])
  } else if (governorate && city) {
    // Only add governorate/city if not present and it's a more complex address
    if (!combinedAddress.includes(governorate) && !combinedAddress.includes(city)) {
      combinedAddress = joinParts([governorate, city, combinedAddress])
    }
  } else if (governorate && !combinedAddress.includes(governorate)) {
    combinedAddress = joinParts([governorate, combinedAddress])
  } else if (city && !combinedAddress.includes(city)) {
    combinedAddress = joinParts([city, combinedAddress])
  }
  
  if (fullAddressRaw) {
    const normFull = normalizeArabicText(fullAddressRaw)
    if (normFull.length > 50 && normFull.length > combinedAddress.length) {
      combinedAddress = normFull
    }
  }

  // Tracing
  addTrace('recipientName', recipientName, { source: 'recipient_name', method: 'direct' })
  addTrace('phone', phone, { source: 'customer_phone', method: 'direct' })
  addTrace('governorate', governorate, { source: 'governorate/state_province', method: 'direct' })
  addTrace('city', city, { source: 'city', method: 'direct' })
  addTrace('address.combined', combinedAddress, { method: 'combined' })
  addTrace('wrapperName', wrapperName, { source: 'wrapper_types.name', method: 'lookup' })
  addTrace('references.canonicalId', canonicalId, { method: 'direct' })

  const record = {
    // Core
    projectId,
    canonicalId,
    soldId,
    unitRef,
    trackingCode,
    carrierRef,
    // Recipient
    recipientName,
    phone,
    phoneAlt,
    // Address
    governorate,
    city,
    district,
    area,
    addressLine1: addr1,
    addressLine2: addr2,
    landmark,
    specialInstructions,
    fullAddressRaw,
    combinedAddress,
    postalCode,
    country,
    // Product/Wrapper
    wrapperKey,
    wrapperName,
    templateSlug,
    title,
    descriptionBase,
    // Computed
    references: {
      canonicalId,
      soldId,
      unitRef,
      trackingCode,
      carrierRef,
    },
    // Meta
    trace,
    warnings,
    _original: row,
  }

  return record
}

// Build provider description per rules: "Dearune - [Wrapper Name]" + optional details
export function buildShipmentDescription(internal, options = {}) {
  const base = internal.descriptionBase || (internal.wrapperName ? `Dearune - ${internal.wrapperName}` : 'Dearune')
  const extras = []
  if (options.includeRef && internal.canonicalId) extras.push(`Order Ref: ${internal.canonicalId}`)
  else if (options.includeRef && internal.soldId) extras.push(`Order Ref: ${internal.soldId}`)
  if (options.extra) extras.push(options.extra)
  if (extras.length === 0) return base
  // Keep it concise
  return `${base} | ${extras.join(' | ')}`
}

export default {
  buildInternalShippingRecord,
  buildShipmentDescription,
  normalizeArabicText,
  joinParts,
  tokenizeAddress,
}
