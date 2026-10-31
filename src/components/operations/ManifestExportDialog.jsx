import { useState } from 'react'
import { Download, Loader2Icon, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { invokeFunction } from '@/lib/supabase'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

export function ManifestExportDialog({ open, onOpenChange, projectIds, onSuccess }) {
  const [carrier, setCarrier] = useState('egypt_post')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleExport = async () => {
    if (!projectIds.length) {
      toast.error('No orders selected')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await invokeFunction('admin-operations', {
        method: 'POST',
        body: {
          action: 'manifest-export',
          projectIds,
          carrier,
        },
      })

      if (!result.ok) {
        throw new Error(result.error ?? 'Export failed')
      }

      // Download the base64 Excel file
      const base64 = result.base64
      const filename = result.filename
      const byteCharacters = atob(base64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success(`${carrier === 'egypt_post' ? 'Egypt Post' : 'Bosta'} manifest exported (${result.rowCount} orders)`)
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Export Carrier Manifest</AlertDialogTitle>
          <AlertDialogDescription>
            Generate a <strong>{carrier === 'egypt_post' ? 'Egypt Post' : 'Bosta'}</strong> manifest workbook for{' '}
            <strong>{projectIds.length}</strong> selected order(s). Only physical orders with tracking codes will be included.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="carrier-select" className="text-sm font-medium">
              Carrier
            </Label>
            <Select value={carrier} onValueChange={setCarrier}>
              <SelectTrigger id="carrier-select" className="w-full">
                <SelectValue placeholder="Select carrier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="egypt_post">Egypt Post — Standard Egypt Post manifest format</SelectItem>
                <SelectItem value="bosta">Bosta — Bosta upload template (Arabic)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Digital orders and orders without tracking codes will be skipped.
          </p>

          {error && (
            <div className="flex items-center gap-2 rounded-md border bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleExport} disabled={loading}>
            {loading ? (
              <>
                <Loader2Icon className="size-4 animate-spin mr-2" />
                Generating…
              </>
            ) : (
              <>
                <Download className="size-4 mr-2" />
                Export & Download
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}