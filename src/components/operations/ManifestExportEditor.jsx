import { useState, useMemo, useEffect } from 'react'
import { Save, Loader2Icon, X, Maximize2, Minimize2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'


// Column definitions for each carrier
const EGYPT_POST_COLUMNS = [
  { key: 'packageSerial', label: 'Package Serial', width: '80px', editable: false },
  { key: 'description', label: 'Description', width: '140px', editable: true },
  { key: 'totalWeight', label: 'Weight (kg)', width: '90px', editable: true },
  { key: 'packageVolume', label: 'Volume', width: '90px', editable: true },
  { key: 'codValue', label: 'COD Value (EGP)', width: '120px', editable: true },
  { key: 'itemSpecialNotes', label: 'Special Notes', width: '160px', editable: true },
  { key: 'customerName', label: 'Customer Name', width: '140px', editable: true, required: true },
  { key: 'mobileNo', label: 'Mobile No', width: '120px', editable: true, required: true },
  { key: 'street', label: 'Street', width: '160px', editable: true, required: true },
  { key: 'city', label: 'City', width: '120px', editable: true, required: true },
  { key: 'packageRefNumber', label: 'Pkg Ref #', width: '110px', editable: false },
  { key: 'merchantName', label: 'Merchant', width: '120px', editable: true },
  { key: 'warehouseName', label: 'Warehouse', width: '120px', editable: true },
  { key: 'hasPOD', label: 'Has POD', width: '80px', editable: true },
  { key: 'sellerName', label: 'Seller', width: '120px', editable: true },
  { key: 'postId', label: 'Post ID / Tracking', width: '140px', editable: true, required: true },
]

const BOSTA_COLUMNS = [
  { key: 'customerName', label: 'اسم العميل', width: '140px', editable: true, required: true },
  { key: 'phone', label: 'تليفون', width: '120px', editable: true, required: true },
  { key: 'phone2', label: 'تليفون ثاني', width: '120px', editable: true },
  { key: 'city', label: 'المدينة', width: '120px', editable: true, required: true },
  { key: 'area', label: 'المنطقة', width: '120px', editable: true },
  { key: 'address', label: 'العنوان', width: '180px', editable: true, required: true },
  { key: 'landmark', label: 'علامة مميزة', width: '140px', editable: true },
  { key: 'isWorkAddress', label: 'عنوان عمل؟', width: '100px', editable: true },
  { key: 'locationLink', label: 'رابط المكان', width: '140px', editable: true },
  { key: 'notes', label: 'ملاحظات', width: '160px', editable: true },
  { key: 'codValue', label: 'قيمة التحصيل', width: '120px', editable: true },
  { key: 'pieces', label: 'عدد القطع', width: '100px', editable: true },
  { key: 'description', label: 'وصف الشحنة', width: '160px', editable: true },
  { key: 'reference', label: 'مرجع الطلب', width: '140px', editable: false },
  { key: 'shipmentValue', label: 'قيمة الشحنة', width: '120px', editable: true },
  { key: 'deposit', label: 'مبلغ الديبوزيت', width: '120px', editable: true },
  { key: 'bostaPoints', label: 'نقاط بوسطة', width: '110px', editable: true },
  { key: 'flexshipFees', label: 'رسوم Flexship', width: '120px', editable: true },
  { key: 'allowOpen', label: 'تسمح بالفتح', width: '110px', editable: true },
  { key: 'brand', label: 'العلامة التجارية', width: '140px', editable: true },
  { key: 'shipmentType', label: 'نوع الشحنة', width: '110px', editable: true },
  { key: 'returnPieces', label: 'قطع المرتجع', width: '110px', editable: true },
  { key: 'returnDescription', label: 'وصف المرتجع', width: '140px', editable: true },
]

function getColumns(carrier) {
  return carrier === 'egypt_post' ? EGYPT_POST_COLUMNS : BOSTA_COLUMNS
}

function mapOrderToRow(order, carrier, index) {
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
      // Keep original for validation
      _original: order,
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
    }
  }
}

export function ManifestExportEditor({
  open,
  onOpenChange,
  carrier,
  orders,
  onExport,
}) {
  const [rows, setRows] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const columns = useMemo(() => getColumns(carrier), [carrier])

  // Initialize rows when orders change
  useEffect(() => {
    if (orders?.length) {
      const mapped = orders.map((order, i) => mapOrderToRow(order, carrier, i))
      setRows(mapped)
    }
  }, [orders, carrier])

  const updateCell = (rowIndex, key, value) => {
    setRows((prev) => {
      const next = [...prev]
      next[rowIndex] = { ...next[rowIndex], [key]: value }
      return next
    })
  }

  const validateRows = () => {
    const errors = []
    rows.forEach((row, i) => {
      columns.forEach((col) => {
        if (col.required && (!row[col.key] || String(row[col.key]).trim() === '')) {
          errors.push({ row: i + 1, field: col.label, message: 'Required' })
        }
      })
    })
    return errors
  }

  const handleExport = () => {
    const errors = validateRows()
    if (errors.length > 0) {
      toast.error(`${errors.length} required field(s) missing`)
      console.table(errors)
      return
    }
    onExport(rows)
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${expanded ? 'max-w-[98vw]' : 'max-w-6xl'} max-h-[90vh] overflow-hidden`}>
        <DialogHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <DialogTitle className="font-heading text-xl">
              {carrier === 'egypt_post' ? 'Egypt Post' : 'Bosta'} Manifest — Edit & Export
            </DialogTitle>
            <DialogDescription>
              Edit {orders?.length ?? 0} order(s) before exporting. Required fields marked with *
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              {expanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>
        </DialogHeader>

        <div className="h-[calc(100%-140px)] flex flex-col overflow-hidden">
          {/* Column visibility legend */}
          <div className="px-4 py-2 text-xs text-muted-foreground border-b flex flex-wrap gap-4">
            <span>Required fields marked with <span className="text-red-500">*</span></span>
            <span>Non-editable fields shown in muted</span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <Table className="w-full">
              <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className="text-left font-medium"
                      style={{ width: col.width, minWidth: col.width }}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {col.required && <span className="text-red-500">*</span>}
                        {!col.editable && (
                          <Badge variant="secondary" className="text-xs ml-1">Fixed</Badge>
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, rowIndex) => (
                  <TableRow key={row._original?.id ?? rowIndex}>
                    <TableCell className="text-center text-sm font-mono text-muted-foreground w-10">
                      {rowIndex + 1}
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        style={{ width: col.width, minWidth: col.width }}
                        className={!col.editable ? 'bg-muted/30' : ''}
                      >
                        {col.editable ? (
                          <Input
                            value={row[col.key] ?? ''}
                            onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                            placeholder={col.required ? 'Required' : ''}
                            className={col.required ? 'border-red-200 focus:border-red-400' : ''}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground font-mono">
                            {row[col.key] ?? '—'}
                          </span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Summary bar */}
          <Separator />
          <div className="p-3 bg-muted/30 flex items-center justify-between text-sm">
            <span>{rows.length} order(s)</span>
            <span className="text-muted-foreground">
              Required: {columns.filter((c) => c.required).length} fields per row
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={saving}>
            {saving ? <Loader2Icon className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
            Export {carrier === 'egypt_post' ? 'Egypt Post' : 'Bosta'} Manifest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}