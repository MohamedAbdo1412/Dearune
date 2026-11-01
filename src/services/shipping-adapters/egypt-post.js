// Egypt Post adapter - maps normalized internal record to Egypt Post manifest fields
import { buildInternalShippingRecord, buildShipmentDescription } from '../shipping-mapping'

const clean = (value) => String(value ?? '').trim()

export function mapToEgyptPost(internalOrSource, ctx = {}, rowIndex = 0) {
  const internal = internalOrSource?._original && internalOrSource?.trace ? internalOrSource : buildInternalShippingRecord(internalOrSource, ctx)
  
  // Build street/address - combine all relevant info
  const addressParts = []
  if (internal.combinedAddress) addressParts.push(internal.combinedAddress)
  else {
    if (internal.addressLine1) addressParts.push(internal.addressLine1)
    if (internal.addressLine2) addressParts.push(internal.addressLine2)
    if (internal.landmark) addressParts.push(internal.landmark)
  }
  if (internal.specialInstructions && !internal.combinedAddress?.includes(internal.specialInstructions)) {
    addressParts.push(internal.specialInstructions)
  }
  const street = addressParts.join(', ')
  
  // Description must start with Dearune - [Wrapper Name]
  const description = buildShipmentDescription(internal)
  
  // Reference - prefer canonical
  const packageRefNumber = internal.canonicalId || internal.soldId || internal.unitRef || internal.trackingCode || ''
  
  // Post ID / tracking
  const postId = internal.trackingCode || internal.carrierRef || ''
  
  const row = {
    packageSerial: rowIndex + 1,
    description,
    totalWeight: 0.1,
    packageVolume: 'Small',
    codValue: 0,
    itemSpecialNotes: internal.specialInstructions || '',
    customerName: internal.recipientName,
    mobileNo: internal.phone,
    street,
    city: internal.city || internal.governorate || '',
    packageRefNumber,
    merchantName: 'Dearune Studio',
    warehouseName: 'Main Warehouse',
    hasPOD: 'yes',
    sellerName: 'Dearune Studio',
    postId,
    _internal: internal,
  }
  
  // Validation
  const issues = []
  if (!row.customerName) issues.push('Missing customer name')
  if (!row.mobileNo) issues.push('Missing mobile number')
  if (!row.street) issues.push('Missing street address')
  if (!row.city) issues.push('Missing city')
  if (!row.packageRefNumber) issues.push('Missing package reference')
  if (!row.postId) issues.push('Missing tracking code / carrier reference')
  if (!row.codValue || Number(row.codValue) <= 0) issues.push('Missing or invalid COD value')
  
  return { row, issues, internal }
}

export default { mapToEgyptPost }
