import type { Plan } from "@prisma/client"

import { cn } from "@/lib/utils"

/**
 * MonetizationPlan.md Step 6.5 — a lightweight "premium touch" differentiator:
 * a persistent reminder of the account's tier, visible everywhere the app
 * shell renders. Same pill shape as StatusBadge (ThemeGuideline.md Section
 * 4.3) so it reads as part of the existing design language rather than a
 * bolted-on marketing element. Demo intentionally renders as a plain
 * "Demo" pill with an Upgrade link rather than trying to reuse a semantic
 * status color that doesn't actually apply here.
 */
const PLAN_CONFIG: Record<Plan, { label: string; textClass: string; bgClass: string; dotClass: string }> = {
  DEMO: { label: "Demo", textClass: "text-text-tertiary", bgClass: "bg-bg-surface-3", dotClass: "bg-text-tertiary" },
  INDIVIDUAL: {
    label: "Individual",
    textClass: "text-accent-primary",
    bgClass: "bg-accent-soft-bg",
    dotClass: "bg-accent-primary",
  },
  PROFESSIONAL: {
    label: "Professional",
    textClass: "text-accent-primary",
    bgClass: "bg-accent-soft-bg",
    dotClass: "bg-accent-primary",
  },
  ENTERPRISE: {
    label: "Enterprise",
    textClass: "text-status-approved",
    bgClass: "bg-status-approved-bg",
    dotClass: "bg-status-approved",
  },
}

/**
 * `compact` renders just the color dot with no label — for the Sidebar's
 * collapsed 72px icon rail, where the full pill (e.g. "Professional") would
 * overflow. The Tooltip wrapping it in Sidebar.tsx is what still surfaces
 * the actual plan name in that state.
 */
function PlanBadge({ plan, compact, className }: { plan: Plan; compact?: boolean; className?: string }) {
  const config = PLAN_CONFIG[plan]

  if (compact) {
    return <span className={cn("size-2.5 rounded-full", config.dotClass, className)} aria-hidden />
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-micro normal-case tracking-normal",
        config.bgClass,
        config.textClass,
        className
      )}
    >
      {config.label}
    </span>
  )
}

export { PlanBadge }
