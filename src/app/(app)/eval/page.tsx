import { BarChart3, Download } from "lucide-react"

import { requireUser } from "@/lib/auth"
import { hasEvalAccess } from "@/lib/billing/plan"
import {
  getApprovalRateOverTime,
  getApprovalRateByWorkflowType,
  getEvalTagDistribution,
  getConfidenceVsOutcome,
  getEditRate,
} from "@/lib/metrics"
import { EvalCharts } from "@/app/(app)/eval/EvalCharts"
import { EmptyState } from "@/components/shared/EmptyState"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

/**
 * ApplicationFlow.md Section 9 — approval-rate-over-time, quality-tag
 * distribution, per-workflow-type breakdown, confidence-vs-outcome
 * correlation. All numbers computed from real Task/Decision/EvalTag
 * records via lib/metrics.ts (Step 5.2's shared module) — no second,
 * slightly-different calculation lives here.
 *
 * MonetizationPlan.md Step 6 — gated to Professional/Enterprise only
 * (Individual and Demo do not get Eval Dashboard access). The gate check
 * runs BEFORE the metrics queries below, not after — no reason to compute
 * or expose any of this user's decision data to a plan that isn't entitled
 * to see it, even momentarily.
 *
 * Deliberate, considered exception (not an inconsistency): the Dashboard's
 * single "Approval Rate" stat card (a top-line number, no trends, no
 * per-workflow breakdown, no charts) stays visible to every plan including
 * Demo. Only the deeper analytics HERE — trend-over-time, per-workflow
 * breakdown, quality-tag distribution, edit rate — are the actual paid
 * feature. This distinction was reviewed explicitly during Step 6, not
 * discovered as a gap later.
 */
export default async function EvalPage() {
  const user = await requireUser()

  if (!hasEvalAccess(user)) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
        <h2 className="text-h2 text-text-primary">Eval Dashboard</h2>
        <EmptyState
          icon={BarChart3}
          heading="Upgrade to unlock Eval Dashboard"
          description="Approval rate, edit rate, and quality trends are available on the Professional and Enterprise plans."
          cta={{ label: "View plans", href: "/pricing" }}
        />
      </div>
    )
  }

  const [approvalOverTime, byWorkflowType, tagDistribution, confidenceVsOutcome, editRate] = await Promise.all([
    getApprovalRateOverTime(user.id),
    getApprovalRateByWorkflowType(user.id),
    getEvalTagDistribution(user.id),
    getConfidenceVsOutcome(user.id),
    getEditRate(user.id),
  ])

  const hasAnyDecisions = approvalOverTime.length > 0

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 text-text-primary">Eval Dashboard</h2>
        {/* Plain browser-native download link, not a client component —
            a GET request to a file-returning Route Handler needs no
            client-side state or interactivity. Only rendered once
            hasEvalAccess() has already gated the whole page above, so
            there's no separate visibility check needed here. */}
        <a
          href="/api/export/decisions"
          download
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "gap-2")}
        >
          <Download className="size-4" strokeWidth={1.75} />
          Export CSV
        </a>
      </div>
      <EvalCharts
        approvalOverTime={approvalOverTime}
        byWorkflowType={byWorkflowType}
        tagDistribution={tagDistribution}
        confidenceVsOutcome={confidenceVsOutcome}
        editRate={editRate}
        hasAnyDecisions={hasAnyDecisions}
      />
    </div>
  )
}
