"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SkeletonShimmer } from "@/components/shared/SkeletonShimmer"
import { getCurrentPlanStatus } from "@/app/(app)/billing/actions"

type Status = "pending" | "active" | "timeout"

const POLL_INTERVAL_MS = 1500
const MAX_POLLS = 10 // ~15 seconds total — generous for a webhook that normally lands in under a second

/**
 * MonetizationPlan.md Step 3/5 — the redirect-vs-webhook race fix. Same
 * shape as DraftingStatus.tsx (poll, show an honest in-progress state,
 * never claim success before the real backend state confirms it): shows
 * an optimistic "activating your plan" message immediately, then polls
 * getCurrentPlanStatus() until the webhook has actually landed and updated
 * the database — never trusts "the browser reached this page" alone as
 * proof the payment was processed.
 */
function CheckoutSuccessStatus() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("pending")
  const pollCountRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function poll() {
      try {
        const result = await getCurrentPlanStatus()
        if (result.isPaid) {
          setStatus("active")
          router.refresh()
          return
        }
      } catch {
        // A transient failure here (e.g. this project's own known Neon
        // connection blips) should not immediately give up — just try
        // again on the next tick like a normal not-yet-ready poll.
      }

      pollCountRef.current += 1
      if (pollCountRef.current >= MAX_POLLS) {
        setStatus("timeout")
        return
      }
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [router])

  if (status === "active") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-status-approved-bg text-status-approved">
          <CheckCircle2 className="size-6" strokeWidth={1.75} />
        </span>
        <h1 className="text-h2 text-text-primary">You&apos;re all set!</h1>
        <p className="text-body text-text-secondary">Your plan is now active.</p>
        <Button size="lg" onClick={() => router.push("/dashboard")}>
          Go to Dashboard
        </Button>
      </div>
    )
  }

  if (status === "timeout") {
    // Never claim failure — the payment itself almost certainly succeeded
    // (Stripe only redirects here after a completed Checkout Session); this
    // is just an unusually slow webhook delivery, which Stripe's own retry
    // schedule will eventually resolve even if this page gives up watching.
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-h2 text-text-primary">Payment received</h1>
        <p className="max-w-sm text-body text-text-secondary">
          Your plan is still being activated — this can take a moment. Refresh this page in a minute, or check
          Settings for your updated plan.
        </p>
        <Button size="lg" variant="secondary" onClick={() => router.push("/settings")}>
          Go to Settings
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center" aria-busy="true">
      <p role="status" aria-live="polite" className="text-body text-text-secondary">
        Payment received — activating your plan…
      </p>
      <SkeletonShimmer className="h-10 w-48" />
    </div>
  )
}

export { CheckoutSuccessStatus }
