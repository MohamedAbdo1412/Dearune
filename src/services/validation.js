import { z } from 'zod'

export const emailSchema = z.string().trim().email().max(254).or(z.literal('').transform(() => null)).nullable()

// Keep schema flexible for catalog-driven wrappers; still allow legacy keys
export const wrapperTypeSchema = z.string().trim().min(1).max(64)

export const createOrderSchema = z.object({
  customerFirstName: z.string().trim().max(80).optional().nullable(),
  customerLastName: z.string().trim().max(80).optional().nullable(),
  customerEmail: emailSchema.optional(),
  customerPhone: z.string().trim().max(30).optional().nullable(),
  recipientName: z.string().trim().min(1, 'Recipient name is required').max(120),
  occasion: z.string().trim().max(120).optional().nullable(),
  eventDate: z.string().date('Enter a valid date').optional().nullable().or(z.literal('').transform(() => null)),
  recipientMessage: z.string().trim().max(2000).optional().nullable(),
  templateId: z.string().uuid('Template is required'),
  wrapperType: wrapperTypeSchema,
  designerCode: z.string().trim().regex(/^\d{6}$/, 'Designer code must be 6 digits').optional().nullable(),
})

export const designerLoginSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'),
  passcode: z.string().trim().regex(/^\d{6}$/, 'Passcode must be 6 digits'),
})

export const designerCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const passcodeResetSchema = z.object({
  designerId: z.string().uuid(),
})

export const messageEditSchema = z.object({
  headline: z.string().trim().max(200),
  body: z.string().trim().max(20000),
  signature: z.string().trim().max(200).optional().nullable(),
  fontFamily: z.string().trim().max(80).optional().nullable(),
  layout: z.record(z.string(), z.unknown()).optional(),
})

export const shippingUpsertSchema = z.object({
  recipientName: z.string().trim().max(120).optional().nullable(),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(120),
  stateProvince: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().min(1).max(30),
  country: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional().nullable(),
  specialInstructions: z.string().trim().max(1000).optional().nullable(),
})

export const settingsUpdateSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  allowNewOrders: z.boolean().optional(),
  businessName: z.string().trim().max(120).optional(),
  currency: z.string().trim().max(8).optional(),
  storageProvider: z.enum(['supabase', 'google_drive']).optional(),
})