import { Check, Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      toast.error('The clipboard is not available in this browser')
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-all font-mono text-sm font-semibold">{value}</p>
      </div>
      <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
      </Button>
    </div>
  )
}

/**
 * A credential is shown exactly once. The edge function returns it in the
 * response and never stores the readable password; closing this dialog cannot
 * reveal it again, which is why reset is an explicit action.
 */
export function CredentialOnceDialog({ open, title, description, items = [], onClose }) {
  return (
    <Dialog open={Boolean(open)} onOpenChange={(next) => !next && onClose?.()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          {items.map((item) => (
            <CopyRow key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
          This is shown once. Store it in your password manager or share it privately with the worker.
          The studio cannot show this value again.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>I have shared it securely</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
