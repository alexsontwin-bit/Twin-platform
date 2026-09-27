import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PricingCards } from "@/app/(marketing)/pricing/PricingCards"

/**
 * MonetizationPlan.md Step 4 — Server Component (like MarketingNavbar) so
 * the logged-in-vs-not check happens with `auth()`, which returns null
 * rather than throwing when unauthenticated. The actual card grid and
 * monthly/yearly toggle live in PricingCards (a client component, since the
 * toggle needs local state).
 *
 * Deliberately does NOT read `plan` from the session/JWT — per Step 1's
 * architectural note, session data can lag behind a real plan change for
 * the lifetime of a login (e.g. after a cancellation webhook fires). A
 * fresh, direct DB lookup here (only when a session exists at all) keeps
 * this page's "Upgrade" vs "Current Plan" display correct even for a user
 * whose plan changed since they last logged in.
 */
export default async function PricingPage() {
  const session = await auth()
  const isLoggedIn = !!session?.user

  // A public marketing page must never hard-crash for every visitor over a
  // transient DB hiccup — this project has hit real Neon connection blips
  // before. Falling back to `undefined` (same as a logged-out visitor)
  // just means a paid user sees an "Upgrade" button instead of "Current
  // Plan" for that one page load — a harmless cosmetic downgrade, not a
  // broken page, and not a security issue (no access decision is made
  // here; it's a display hint only).
  let currentPlan: string | undefined
  if (session?.user?.id) {
    try {
      currentPlan = (await prisma.user.findUnique({ where: { id: session.user.id }, select: { plan: true } }))?.plan
    } catch {
      currentPlan = undefined
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-16 px-6 py-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <span className="text-micro font-semibold uppercase tracking-wide text-accent-primary">Pricing</span>
        <h1 className="text-h1 text-text-primary">Choose the plan that fits your team</h1>
        <p className="text-body-lg text-text-secondary">
          Every plan includes the same core product — a policy-constrained AI draft, reviewed and approved by a
          human, every time. Nothing is ever sent, saved, or acted on without your explicit approval.
        </p>
      </div>

      <PricingCards isLoggedIn={isLoggedIn} currentPlan={currentPlan} />
    </main>
  )
}
