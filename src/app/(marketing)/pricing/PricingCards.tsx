"use client"

import { useState } from "react"
import { Check } from "lucide-react"

import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"
import { UpgradeButton } from "@/app/(marketing)/pricing/UpgradeButton"
import type { BillingInterval } from "@/lib/stripe"

/**
 * MonetizationPlan.md Step 4 (updated for confirmed pricing, 2026-09-27) —
 * a client component so the monthly/yearly toggle can live in one place and
 * drive both self-serve cards' displayed price AND the interval passed to
 * checkout, without prop-drilling toggle state back up into the Server
 * Component page. Enterprise never reads this toggle — its card has no
 * price at all (see PricingPage).
 *
 * Confirmed with the client: the yearly price is exactly 12x the monthly
 * price (Individual $100/mo = $1,200/yr, Professional $2,500/mo =
 * $30,000/yr) — there is no discount to advertise, so this component
 * deliberately never renders "save X%" copy near the toggle.
 */
function PricingCards({ isLoggedIn, currentPlan }: { isLoggedIn: boolean; currentPlan?: string }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly")

  return (
    <div className="flex flex-col items-center gap-10">
      <div
        role="tablist"
        aria-label="Billing interval"
        className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-surface-2 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={interval === "monthly"}
          onClick={() => setInterval("monthly")}
          className={cn(
            "rounded-full px-4 py-1.5 text-meta font-medium transition-colors duration-150",
            interval === "monthly"
              ? "bg-accent-primary text-text-on-accent"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={interval === "yearly"}
          onClick={() => setInterval("yearly")}
          className={cn(
            "rounded-full px-4 py-1.5 text-meta font-medium transition-colors duration-150",
            interval === "yearly"
              ? "bg-accent-primary text-text-on-accent"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Yearly
        </button>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
        <PricingCard
          name="Individual"
          description="For a single reviewer getting started with AI-assisted drafting."
          price={interval === "monthly" ? "$100" : "$1,200"}
          period={interval === "monthly" ? "/month" : "/year"}
          features={[
            "Unlimited task creation",
            "Full decision audit trail",
            "Approval rate & edit rate tracking",
          ]}
        >
          {currentPlan === "INDIVIDUAL" ? (
            <CurrentPlanBadge />
          ) : (
            <UpgradeButton
              plan="INDIVIDUAL"
              billingInterval={interval}
              isLoggedIn={isLoggedIn}
              variant="secondary"
            />
          )}
        </PricingCard>

        <PricingCard
          name="Professional"
          description="For teams that need deeper history and reporting."
          price={interval === "monthly" ? "$2,500" : "$30,000"}
          period={interval === "monthly" ? "/month" : "/year"}
          features={["Everything in Individual", "Extended history retention", "Priority support"]}
          highlighted
        >
          {currentPlan === "PROFESSIONAL" ? (
            <CurrentPlanBadge />
          ) : (
            <UpgradeButton plan="PROFESSIONAL" billingInterval={interval} isLoggedIn={isLoggedIn} />
          )}
        </PricingCard>

        <PricingCard
          name="Enterprise"
          description="Custom guardrails, dedicated support, and volume pricing for large teams."
          price="Contact Us"
          features={["Everything in Professional", "Custom guardrail policies", "Dedicated onboarding"]}
        >
          {/* Enterprise is confirmed "Contact Us" only, via email — no
              Stripe price, no toggle, no Checkout button. This link works
              for a logged-out visitor too — a prospect this early in
              evaluating the product should never be forced to create an
              account before they can even start a sales conversation. */}
          <a
            href="mailto:alexsontwin@gmail.com?subject=Enterprise%20Plan%20Inquiry"
            className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}
          >
            Contact Us
          </a>
        </PricingCard>
      </div>
    </div>
  )
}

function CurrentPlanBadge() {
  return (
    <div className="flex w-full items-center justify-center gap-2 rounded-md border border-border-subtle bg-bg-surface-2 py-2.5 text-meta font-medium text-text-secondary">
      <Check className="size-4 text-status-approved" strokeWidth={2} />
      Current Plan
    </div>
  )
}

function PricingCard({
  name,
  description,
  price,
  period,
  features,
  highlighted,
  children,
}: {
  name: string
  description: string
  price: string
  period?: string
  features: string[]
  highlighted?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-lg border p-8",
        highlighted ? "border-accent-primary bg-accent-soft-bg" : "border-border-subtle bg-bg-surface"
      )}
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-h3 text-text-primary">{name}</h2>
        <p className="text-meta text-text-secondary">{description}</p>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-h1 text-text-primary">{price}</span>
        {period && <span className="text-meta text-text-secondary">{period}</span>}
      </div>

      <ul className="flex flex-1 flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-body text-text-secondary">
            <Check className="mt-0.5 size-4 shrink-0 text-status-approved" strokeWidth={2} />
            {feature}
          </li>
        ))}
      </ul>

      {children}
    </div>
  )
}

export { PricingCards }
