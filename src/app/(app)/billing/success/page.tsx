import { requireUser } from "@/lib/auth"
import { CheckoutSuccessStatus } from "@/app/(app)/billing/success/CheckoutSuccessStatus"

// MonetizationPlan.md Step 3/5 — Stripe's success_url. This route previously
// did not exist at all (a real gap left over from Step 3 — createCheckoutSession
// already referenced it, but nothing was built here yet), meaning a real
// completed checkout would have redirected to a 404. requireUser() here
// just confirms a real signed-in session before rendering the polling UI —
// the actual plan-status check happens client-side in
// CheckoutSuccessStatus, which is what handles the real redirect-vs-webhook
// race documented there.
export default async function BillingSuccessPage() {
  await requireUser()

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center p-6">
      <CheckoutSuccessStatus />
    </div>
  )
}
