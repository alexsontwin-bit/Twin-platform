"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { createCheckoutSession } from "@/app/(app)/billing/actions"
import type { BillingInterval } from "@/lib/stripe"

/**
 * MonetizationPlan.md Step 4 — the actual "Upgrade" action on a pricing
 * card. A logged-out visitor is sent to /signup?next=/pricing first (this
 * app's checkout flow requires a real account — a Stripe customer must be
 * tied to a real internal userId, per Step 3's client_reference_id design)
 * rather than silently failing or being routed straight into Stripe.
 *
 * `billingInterval` comes from PricingCards' toggle state — passed straight
 * through to createCheckoutSession so the right one of the plan's two Price
 * IDs (monthly/yearly) is used.
 */
function UpgradeButton({
  plan,
  billingInterval,
  isLoggedIn,
  variant = "default",
}: {
  plan: "INDIVIDUAL" | "PROFESSIONAL"
  billingInterval: BillingInterval
  isLoggedIn: boolean
  variant?: "default" | "secondary"
}) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  async function handleClick() {
    if (!isLoggedIn) {
      router.push(`/signup?next=/pricing`)
      return
    }

    setIsPending(true)
    try {
      const result = await createCheckoutSession({ plan, billingInterval })
      if (!result.success) {
        toast.error(result.error)
        setIsPending(false)
        return
      }
      // Full browser navigation, not a client-side route change — Stripe
      // Checkout is a page it hosts, not a route in this app.
      window.location.href = result.checkoutUrl
    } catch {
      toast.error("Something went wrong — please try again.")
      setIsPending(false)
    }
  }

  return (
    <Button variant={variant} size="lg" className="w-full" onClick={handleClick} disabled={isPending}>
      {isPending ? "Redirecting…" : "Upgrade"}
    </Button>
  )
}

export { UpgradeButton }
