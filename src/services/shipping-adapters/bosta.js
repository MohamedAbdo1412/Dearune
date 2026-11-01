// Bosta adapter - maps normalized internal record to Bosta template fields
import { buildInternalShippingRecord, buildShipmentDescription } from '../shipping-mapping'

const clean = (value) => String(value ?? '').trim()

export function mapToBosta(internalOrSource, ctx = {}) {
  const source = internalOrSource?._original || internalOrSource || {}
  // For backward compatibility with existing tests, check if called with simple shape
  const isSimpleShape = source.addressLine1 !== undefined || source.recipientName !== undefined || source.customerPhone !== undefined
  
  if (isSimpleShape && !internalOrSource?.trace) {
    // Use simple mapping for backward compat
    const address = [String(source.addressLine1 || '').trim(), String(source.addressLine2 || '').trim()].filter(Boolean).join(', ')
    const reference = String(source.reference || source.canonical_id || source.unit_reference || '').trim()
    const wrapperName = source.wrapper_name || source.wrapperName || ctx.wrapperName
    const description = wrapperName ? `Dearune - ${wrapperName}` : (reference ? `Dearune letter - ${reference}` : 'Dearune letter')
    
    const row = {
      customerName: String(source.recipientName || source.recipient_name || '').trim(),
      phone: String(source.customerPhone || source.customer_phone || '').trim(),
      phone2: String(source.phone2 || source.recipient_phone_alt || '').trim(),
      city: String(source.city || source.governorate || '').trim(),
      area: String(source.district || source.governorate || source.stateProvince || source.area || '').trim(),
      address,
      landmark: String(source.landmark || '').trim(),
      isWorkAddress: String(source.isWorkAddress || '').trim(),
      locationLink: String(source.locationLink || '').trim(),
      notes: String(source.specialInstructions || source.special_instructions || source.notes || '').trim(),
      codValue: source.codValue ?? '',
      pieces: source.pieces ?? 1,
      description,
      reference,
      shipmentValue: source.shipmentValue ?? '',
      deposit: source.deposit ?? '',
      bostaPoints: source.bostaPoints ?? '',
      flexshipFees: source.flexshipFees ?? '',
      allowOpen: source.allowOpen ?? '',
      brand: source.brand ?? '',
      returnPieces: source.returnPieces ?? '',
      returnDescription: source.returnDescription ?? '',
      shipmentType: source.shipmentType ?? '',
      _internal: buildInternalShippingRecord(source, ctx),
    }
    
    const issues = []
    if (!row.customerName) issues.push('* اسم العميل: missing')
    if (!row.phone) issues.push('* تليفون: missing')
    if (!row.city) issues.push('* المدينة: missing')
    if (!row.address) issues.push('* العنوان: missing')
    
    return { row, issues, internal: row._internal }
  }
  
  const internal = internalOrSource?._original && internalOrSource?.trace ? internalOrSource : buildInternalShippingRecord(internalOrSource, ctx)
  const src = internal._original || {}
  
  // Build address - prefer address lines for backward compat
  let address = [internal.addressLine1, internal.addressLine2].filter(Boolean).join(', ')
  if (!address && internal.combinedAddress) address = internal.combinedAddress
  if (!address && internal.fullAddressRaw) address = internal.fullAddressRaw
  
  // Description
  const wrapperName = internal.wrapperName || src.wrapper_name || src.wrapperName
  const description = wrapperName ? `Dearune - ${wrapperName}` : buildShipmentDescription(internal, { includeRef: true })
  
  // References - prefer unit reference, then canonical/sold
  const reference = src.unit_reference || src.package_reference || internal.unitRef || internal.canonicalId || internal.soldId || ''
  
  const row = {
    customerName: internal.recipientName,
    phone: internal.phone,
    phone2: internal.phoneAlt || '',
    city: internal.city || internal.governorate || '',
    area: internal.area || internal.district || internal.city || internal.governorate || '',
    address,
    landmark: internal.landmark || '',
    isWorkAddress: '',
    locationLink: '',
    notes: internal.specialInstructions || '',
    codValue: src.codValue ?? '',
    pieces: 1,
    description,
    reference,
    shipmentValue: src.shipmentValue ?? '',
    deposit: src.deposit ?? '',
    bostaPoints: src.bostaPoints ?? '',
    flexshipFees: src.flexshipFees ?? '',
    allowOpen: src.allowOpen ?? '',
    brand: src.brand ?? '',
    returnPieces: src.returnPieces ?? '',
    returnDescription: src.returnDescription ?? '',
    shipmentType: src.shipmentType ?? '',
    _internal: internal,
  }
  
  const issues = []
  if (!row.customerName) issues.push('* اسم العميل: missing')
  if (!row.phone) issues.push('* تليفون: missing')
  if (!row.city) issues.push('* المدينة: missing')
  if (!row.address) issues.push('* العنوان: missing')
  
  return { row, issues, internal }
}

export default { mapToBosta }
