"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { createPortalSession } from "@/app/(app)/billing/actions"

/**
 * MonetizationPlan.md Step 5 — takes a paying customer to Stripe's hosted
 * Billing Portal. Same client-side pattern as UpgradeButton.tsx (a full
 * browser navigation to a Stripe-hosted page, not a client-side route).
 */
function ManageBillingButton() {
  const [isPending, setIsPending] = useState(false)

  async function handleClick() {
    setIsPending(true)
    try {
      const result = await createPortalSession()
      if (!result.success) {
        toast.error(result.error)
        setIsPending(false)
        return
      }
      window.location.href = result.portalUrl
    } catch {
      toast.error("Something went wrong — please try again.")
      setIsPending(false)
    }
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={isPending}>
      {isPending ? "Opening…" : "Manage Billing"}
    </Button>
  )
}

export { ManageBillingButton }
