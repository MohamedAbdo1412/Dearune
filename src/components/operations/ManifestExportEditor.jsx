import { useState, useMemo, useEffect } from 'react'
import { Save, Loader2Icon, X, Maximize2, Minimize2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

const EGYPT_POST_FIELDS = [
  { key: 'packageSerial', label: 'Package Serial', type: 'number', required: false, editable: false, width: 'full' },
  { key: 'description', label: 'Description', type: 'text', required: false, editable: true, width: 'full' },
  { key: 'totalWeight', label: 'Total Weight (kg)', type: 'number', step: '0.01', required: false, editable: true, width: 'half' },
  { key: 'packageVolume', label: 'Package Volume', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'codValue', label: 'COD Value (EGP)', type: 'number', step: '0.01', required: true, editable: true, width: 'half' },
  { key: 'itemSpecialNotes', label: 'Item Special Notes', type: 'text', required: false, editable: true, width: 'full' },
  { key: 'customerName', label: 'Customer Name', type: 'text', required: true, editable: true, width: 'half' },
  { key: 'mobileNo', label: 'Mobile No', type: 'tel', required: true, editable: true, width: 'half' },
  { key: 'street', label: 'Street', type: 'text', required: true, editable: true, width: 'full' },
  { key: 'city', label: 'City', type: 'text', required: true, editable: true, width: 'half' },
  { key: 'packageRefNumber', label: 'Package Ref. Number', type: 'text', required: true, editable: false, width: 'half' },
  { key: 'merchantName', label: 'Merchant Name', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'warehouseName', label: 'Warehouse Name', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'hasPOD', label: 'Has POD', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'sellerName', label: 'Seller Name', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'postId', label: 'Post ID / Tracking', type: 'text', required: true, editable: true, width: 'half' },
]

const BOSTA_FIELDS = [
  { key: 'customerName', label: 'اسم العميل *', type: 'text', required: true, editable: true, width: 'half' },
  { key: 'phone', label: 'تليفون *', type: 'tel', required: true, editable: true, width: 'half' },
  { key: 'phone2', label: 'تليفون ثاني', type: 'tel', required: false, editable: true, width: 'half' },
  { key: 'city', label: 'المدينة *', type: 'text', required: true, editable: true, width: 'half' },
  { key: 'area', label: 'المنطقة', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'address', label: 'العنوان *', type: 'textarea', required: true, editable: true, width: 'full' },
  { key: 'landmark', label: 'علامة مميزة', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'isWorkAddress', label: 'عنوان عمل؟', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'locationLink', label: 'رابط المكان', type: 'url', required: false, editable: true, width: 'half' },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', required: false, editable: true, width: 'full' },
  { key: 'codValue', label: 'قيمة التحصيل النقدي', type: 'number', step: '0.01', required: false, editable: true, width: 'half' },
  { key: 'pieces', label: 'عدد القطع', type: 'number', required: false, editable: true, width: 'half' },
  { key: 'description', label: 'وصف الشحنة', type: 'text', required: false, editable: true, width: 'full' },
  { key: 'reference', label: 'مرجع الطلب', type: 'text', required: false, editable: false, width: 'half' },
  { key: 'shipmentValue', label: 'قيمة الشحنة', type: 'number', step: '0.01', required: false, editable: true, width: 'half' },
  { key: 'deposit', label: 'مبلغ الديبوزيت', type: 'number', step: '0.01', required: false, editable: true, width: 'half' },
  { key: 'bostaPoints', label: 'الدفع بواسطة نقاط بوسطة؟', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'flexshipFees', label: 'تطبيق رسوم Flexship', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'allowOpen', label: 'هل تسمح بفتح الشحنة؟', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'brand', label: 'العلامة التجارية', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'shipmentType', label: 'نوع الشحنة', type: 'text', required: false, editable: true, width: 'half' },
  { key: 'returnPieces', label: 'عدد قطع المرتجع', type: 'number', required: false, editable: true, width: 'half' },
  { key: 'returnDescription', label: 'وصف الشحنة المرتجعة', type: 'text', required: false, editable: true, width: 'full' },
]

function getFields(carrier) {
  return carrier === 'egypt_post' ? EGYPT_POST_FIELDS : BOSTA_FIELDS
}

function mapOrderToForm(order, carrier, index) {
  const address = [order.address_line1, order.address_line2].filter(Boolean).join(', ')
  const reference = order.canonical_id
  const phone = order.customer_phone ?? ''

  if (carrier === 'egypt_post') {
    return {
      packageSerial: index + 1,
      description: order.title ?? 'Dearune letter',
      totalWeight: 0.1,
      packageVolume: 'Small',
      codValue: Number(order.sale_price ?? 0),
      itemSpecialNotes: order.special_instructions ?? '',
      customerName: order.recipient_name ?? '',
      mobileNo: phone,
      street: address,
      city: order.city ?? '',
      packageRefNumber: reference,
      merchantName: 'Dearune Studio',
      warehouseName: 'Main Warehouse',
      hasPOD: 'yes',
      sellerName: 'Dearune Studio',
      postId: order.tracking_code ?? order.carrier_reference ?? '',
      _original: order,
      _index: index,
    }
  } else {
    return {
      customerName: order.recipient_name ?? '',
      phone: phone,
      phone2: '',
      city: order.city ?? '',
      area: order.district ?? order.governorate ?? order.state_province ?? '',
      address: address,
      landmark: '',
      isWorkAddress: '',
      locationLink: '',
      notes: order.special_instructions ?? '',
      codValue: Number(order.sale_price ?? 0),
      pieces: 1,
      description: `Dearune letter - ${reference}`,
      reference: reference,
      shipmentValue: Number(order.sale_price ?? 0),
      deposit: 0,
      bostaPoints: '',
      flexshipFees: '',
      allowOpen: '',
      brand: 'Dearune',
      shipmentType: 'normal',
      returnPieces: '',
      returnDescription: '',
      _original: order,
      _index: index,
    }
  }
}

function validateForm(form, fields) {
  const errors = {}
  fields.forEach((field) => {
    if (field.required && (!form[field.key] || String(form[field.key]).trim() === '')) {
      errors[field.key] = 'Required'
    }
  })
  return errors
}

function FieldInput({ field, value, onChange, error, disabled }) {
  const isRequired = field.required && field.editable
  const baseClass = 'w-full text-sm transition-colors'
  const errorClass = error ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : ''
  const disabledClass = disabled ? 'bg-muted/50 cursor-not-allowed' : ''
  const requiredMark = isRequired ? <span className="text-red-500 ml-1">*</span> : null

  if (!field.editable) {
    return (
      <Input
        value={value ?? ''}
        readOnly
        className={`${baseClass} bg-muted/50 text-muted-foreground ${disabledClass}`}
      />
    )
  }

  if (field.type === 'textarea') {
    return (
      <Textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${baseClass} min-h-[70px] resize-y ${errorClass} ${disabledClass}`}
        placeholder={isRequired ? 'Required' : ''}
        rows={3}
      />
    )
  }

  return (
    <Input
      type={field.type}
      step={field.step}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${baseClass} ${errorClass} ${disabledClass}`}
      placeholder={isRequired ? 'Required' : ''}
    />
  )
}

function OrderFormTab({ order, index, carrier, fields, onUpdate, errors, isValid, activeTab, setActiveTab }) {
  return (
    <TabsContent value={String(index)} className="h-full mt-0">
      <div className="h-full overflow-auto">
        <div className="p-6 space-y-5 max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between border-b pb-3">
            <CardTitle className="text-lg">
              {carrier === 'egypt_post' ? 'Egypt Post' : 'Bosta'} — Order {index + 1}
            </CardTitle>
            <div className="flex items-center gap-2">
              {!isValid && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3" />
                  Has Errors
                </Badge>
              )}
              {isValid && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="size-3" />
                  Valid
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {fields.map((field) => (
              <div
                key={field.key}
                className={`flex flex-col gap-1.5 ${field.width === 'full' ? 'sm:col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5 2xl:col-span-6' : ''}`}
              >
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  {field.label}
                  {field.required && field.editable && <span className="text-red-500">*</span>}
                  {!field.editable && <Badge variant="secondary" className="text-[10px] ml-1">Fixed</Badge>}
                </Label>
                <FieldInput
                  field={field}
                  value={order[field.key] ?? ''}
                  onChange={(val) => onUpdate(index, field.key, val)}
                  error={errors[field.key]}
                  disabled={!field.editable}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </TabsContent>
  )
}

export function ManifestExportEditor({
  open,
  onOpenChange,
  carrier,
  orders,
  onExport,
}) {
  const [forms, setForms] = useState([])
  const [activeTab, setActiveTab] = useState('0')
  const [expanded, setExpanded] = useState(true)
  const [validated, setValidated] = useState(false)
  const fields = useMemo(() => getFields(carrier), [carrier])

  // Initialize forms when orders change
  useEffect(() => {
    if (orders?.length) {
      const mapped = orders.map((order, i) => mapOrderToForm(order, carrier, i))
      setForms(mapped)
      setActiveTab('0')
      setValidated(false)
    }
  }, [orders, carrier])

  const updateField = (formIndex, key, value) => {
    setForms((prev) => {
      const next = [...prev]
      next[formIndex] = { ...next[formIndex], [key]: value }
      return next
    })
    setValidated(false)
  }

  const validateAll = () => {
    const allErrors = forms.map((form) => validateForm(form, fields))
    const allValid = allErrors.every((e) => Object.keys(e).length === 0)
    return { allErrors, allValid }
  }

  const handleExport = () => {
    const { allErrors, allValid } = validateAll()
    if (!allValid) {
      setValidated(true)
      toast.error('Please fix errors in the forms before exporting')
      // Switch to first tab with errors
      const firstErrorIndex = allErrors.findIndex((e) => Object.keys(e).length > 0)
      if (firstErrorIndex >= 0) setActiveTab(String(firstErrorIndex))
      return
    }
    onExport(forms)
    onOpenChange(false)
  }

  const { allErrors, allValid } = validateAll()
  const formValidity = forms.map((_, i) => ({
    isValid: Object.keys(allErrors[i] ?? {}).length === 0,
    errors: allErrors[i] ?? {},
  }))

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${expanded ? 'w-[98vw] max-w-[98vw]' : 'w-full max-w-[1600px]'} h-[95vh] max-h-[95vh] flex flex-col overflow-hidden p-0`}>
        <DialogHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-6 pt-6 pb-4 border-b">
          <div>
            <DialogTitle className="font-heading text-xl">
              {carrier === 'egypt_post' ? 'Egypt Post' : 'Bosta'} Manifest — Edit & Export
            </DialogTitle>
            <DialogDescription>
              Edit {orders?.length ?? 0} order(s) before exporting. Each tab is one order with all manifest fields.
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              {expanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Tabs for each order */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="w-full justify-start overflow-x-auto border-b bg-background rounded-none p-0 h-auto">
              {forms.map((form, i) => (
                <TabsTrigger
                  key={form._original?.id ?? i}
                  value={String(i)}
                  className={`relative px-4 py-2 text-xs font-medium min-w-[140px] whitespace-nowrap ${!formValidity[i].isValid && validated ? 'text-red-500' : ''}`}
                >
                  <span className="flex items-center gap-1.5">
                    #{i + 1}
                    {form.packageRefNumber || form.reference ? (
                      <span className="font-mono text-muted-foreground">
                        {form.packageRefNumber || form.reference}
                      </span>
                    ) : null}
                    {!formValidity[i].isValid && validated && (
                      <AlertTriangle className="size-3 text-red-500" title="Has validation errors" />
                    )}
                    {formValidity[i].isValid && validated && (
                      <CheckCircle2 className="size-3 text-emerald-500" title="Valid" />
                    )}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={activeTab} className="flex-1 min-h-0 overflow-hidden mt-0">
              {forms.map((form, i) => (
                <OrderFormTab
                  key={form._original?.id ?? i}
                  order={form}
                  index={i}
                  carrier={carrier}
                  fields={fields}
                  onUpdate={updateField}
                  errors={allErrors[i] ?? {}}
                  isValid={formValidity[i].isValid}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                />
              ))}
            </TabsContent>
          </Tabs>

          {/* Summary bar */}
          <div className="px-6 py-3 bg-muted/30 flex flex-wrap items-center justify-between gap-2 text-sm border-t">
            <div className="flex items-center gap-4">
              <span>{forms.length} order(s)</span>
              <span className="text-muted-foreground">
                {fields.filter((f) => f.required).length} required fields per order
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {validated && allValid && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="size-3" /> All valid
                </span>
              )}
              {validated && !allValid && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="size-3" /> Fix errors to export
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={validated && !allValid}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!allValid && validated}>
            {validated && !allValid ? (
              <>
                <AlertTriangle className="size-4 animate-spin mr-2" />
                Fix Errors First
              </>
            ) : (
              <>
                <Save className="size-4 mr-2" />
                Export {carrier === 'egypt_post' ? 'Egypt Post' : 'Bosta'} Manifest
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}