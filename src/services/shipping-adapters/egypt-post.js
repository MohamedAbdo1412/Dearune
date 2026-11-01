// Egypt Post adapter - maps normalized internal record to Egypt Post manifest fields
import { buildInternalShippingRecord } from '../shipping-mapping'

const clean = (value) => String(value ?? '').trim()

export function mapToEgyptPost(internalOrSource, ctx = {}, rowIndex = 0) {
  const source = internalOrSource?._original || internalOrSource || {}
  const isSimpleShape = source.addressLine1 !== undefined || source.recipientName !== undefined || source.customerPhone !== undefined
  
  if (isSimpleShape && !internalOrSource?.trace) {
    const addr1 = clean(source.addressLine1 || source.street)
    const addr2 = clean(source.addressLine2)
    const city = clean(source.city)
    const governorate = clean(source.governorate || source.stateProvince || source.state_province)
    const district = clean(source.district)
    const specialInstructions = clean(source.specialInstructions)
    
    // City must contain BOTH city and governorate together as "[City]، [Governorate]"
    let cityField = city
    if (governorate && city && city !== governorate) {
      cityField = `${city}، ${governorate}`
    } else if (governorate && !city) {
      cityField = governorate
    } else if (city && !governorate) {
      cityField = city
    }
    
    // Build detailed address
    const addressParts = []
    if (addr1) addressParts.push(addr1)
    if (addr2) addressParts.push(addr2)
    if (district && district !== city) addressParts.push(district)
    if (specialInstructions && !addressParts.some(p => p.includes(specialInstructions))) {
      addressParts.push(specialInstructions)
    }
    const street = addressParts.join('، ')
    
    // Description must be actual wrapper display name from database, NO Dearune prefix
    const wrapperName = clean(source.wrapper_name || source.wrapperName || source.wrapper_display_name) || 
                        clean(source.wrapper_type) || ''
    const description = wrapperName || clean(source.title) || ''
    
    // Package reference - use correct unique package reference
    const packageRefNumber = clean(source.unit_reference || source.package_reference || source.unitReference) ||
                             clean(source.reference) ||
                             clean(source.canonical_id) ||
                             clean(source.sold_id) || ''
    
    const postId = clean(source.trackingCode || source.carrier_reference || source.tracking_code || source.postId) || ''
    
    const row = {
      packageSerial: rowIndex + 1,
      description,
      totalWeight: 0.1,
      packageVolume: 'Small',
      codValue: 0.00,
      itemSpecialNotes: specialInstructions,
      customerName: clean(source.recipientName || source.recipient_name),
      mobileNo: clean(source.customerPhone || source.customer_phone || source.mobileNo),
      street,
      city: cityField,
      packageRefNumber,
      merchantName: 'Dearune Studio',
      warehouseName: 'Main Warehouse',
      hasPOD: 'yes',
      sellerName: 'Dearune Studio',
      postId,
      _internal: buildInternalShippingRecord(source, ctx),
    }
    
    const issues = []
    if (!row.customerName) issues.push('Missing customer name')
    if (!row.mobileNo) issues.push('Missing mobile number')
    if (!row.street) issues.push('Missing street address')
    if (!row.city) issues.push('Missing city')
    if (!row.packageRefNumber) issues.push('Missing package reference')
    if (!row.postId) issues.push('Missing tracking code / carrier reference')
    if (row.codValue === null || row.codValue === undefined || isNaN(Number(row.codValue))) issues.push('Missing or invalid COD value')
    
    return { row, issues, internal: row._internal }
  }
  
  const internal = internalOrSource?._original && internalOrSource?.trace ? internalOrSource : buildInternalShippingRecord(internalOrSource, ctx)
  const src = internal._original || {}
  
  const addr1 = clean(internal.addressLine1 || src.address_line1)
  const addr2 = clean(internal.addressLine2 || src.address_line2)
  const city = clean(internal.city || src.city)
  const governorate = clean(internal.governorate || src.governorate || src.state_province)
  const district = clean(internal.district || src.district)
  const specialInstructions = clean(internal.specialInstructions || src.special_instructions)
  
  let cityField = city
  if (governorate && city && city !== governorate) {
    cityField = `${city}، ${governorate}`
  } else if (governorate && !city) {
    cityField = governorate
  } else if (city && !governorate) {
    cityField = city
  }
  
  const addressParts = []
  if (addr1) addressParts.push(addr1)
  if (addr2) addressParts.push(addr2)
  if (district && district !== city) addressParts.push(district)
  if (specialInstructions && !addressParts.some(p => p.includes(specialInstructions))) {
    addressParts.push(specialInstructions)
  }
  const street = addressParts.join('، ')
  
  // Description must be actual wrapper display name from database, NO Dearune prefix
  const wrapperName = clean(internal.wrapperName || src.wrapper_name || src.wrapper_display_name) || 
                      clean(src.wrapper_type) || ''
  const description = wrapperName || clean(internal.title) || ''
  
  // Package reference - use correct unique package reference
  const packageRefNumber = clean(src.unit_reference || src.package_reference || src.unitReference) ||
                           clean(internal.unitRef) ||
                           clean(internal.canonicalId) ||
                           clean(internal.soldId) || ''
  
  const postId = clean(internal.trackingCode || internal.carrierRef || src.tracking_code || src.carrier_reference) || ''
  
  const row = {
    packageSerial: rowIndex + 1,
    description,
    totalWeight: 0.1,
    packageVolume: 'Small',
    codValue: 0.00,
    itemSpecialNotes: specialInstructions,
    customerName: internal.recipientName,
    mobileNo: internal.phone,
    street,
    city: cityField,
    packageRefNumber,
    merchantName: 'Dearune Studio',
    warehouseName: 'Main Warehouse',
    hasPOD: 'yes',
    sellerName: 'Dearune Studio',
    postId,
    _internal: internal,
  }
  
  const issues = []
  if (!row.customerName) issues.push('Missing customer name')
  if (!row.mobileNo) issues.push('Missing mobile number')
  if (!row.street) issues.push('Missing street address')
  if (!row.city) issues.push('Missing city')
  if (!row.packageRefNumber) issues.push('Missing package reference')
  if (!row.postId) issues.push('Missing tracking code / carrier reference')
  if (row.codValue === null || row.codValue === undefined || isNaN(Number(row.codValue))) issues.push('Missing or invalid COD value')
  
  return { row, issues, internal }
}

export default { mapToEgyptPost }
