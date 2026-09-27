import { requireUser } from "@/lib/auth"
import { getHistoryRetentionDays } from "@/lib/billing/plan"
import { prisma } from "@/lib/prisma"
import { ObservationFilters } from "@/app/(app)/observation/ObservationFilters"
import { ObservationFeed, type FeedEvent } from "@/app/(app)/observation/ObservationFeed"

type SearchParams = {
  workflowType?: string
  decisionType?: string
  from?: string
  to?: string
}

const VALID_WORKFLOW_TYPES = ["SUPPORT_REPLY", "SALES_EMAIL", "CONTRACT_REVIEW"] as const
const VALID_DECISION_TYPES = ["APPROVE", "REJECT", "EDIT_APPROVE", "ESCALATE"] as const

/**
 * `<input type="date">` gives a plain "YYYY-MM-DD" string with no timezone.
 * `new Date(value)` parses that as UTC midnight, but `Date.setHours` operates
 * in the SERVER's local timezone — mixing the two silently shifts the
 * boundary by the server's UTC offset (verified: in a UTC-5 or UTC+5 server
 * timezone, "from" and "to" both land on the wrong side of midnight,
 * excluding/including the wrong day's activity). Fixed by building the
 * boundary entirely in UTC via Date.UTC.
 */
function parseDateBoundary(value: string | undefined, endOfDay: boolean) {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (endOfDay) return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
}

/**
 * ApplicationFlow.md Section 8 — read-only chronological audit trail of
 * every AiDraft + Decision, reusing the existing Task/AiDraft/Decision
 * tables (no separate telemetry system). "decisionType" filtering only
 * makes sense against Decision events, so a filtered Draft-only view with
 * a decisionType filter set will correctly narrow to zero Draft rows.
 */
export default async function ObservationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  const params = await searchParams

  const workflowType = VALID_WORKFLOW_TYPES.find((w) => w === params.workflowType)
  const decisionType = VALID_DECISION_TYPES.find((d) => d === params.decisionType)
  const requestedFrom = parseDateBoundary(params.from, false)
  const to = parseDateBoundary(params.to, true)

  /**
   * MonetizationPlan.md Step 6.5 — history retention. retentionFloor is the
   * earliest timestamp this plan is entitled to see at all; the user's own
   * `from` filter can only narrow the window further, never widen it past
   * this floor. `retentionApplied` (the floor was actually the binding
   * constraint, not just present) drives the upgrade banner below — a
   * Professional/Enterprise account with `retentionFloor === null` never
   * sees it, and a Demo account whose own filter already starts later than
   * the floor doesn't see a banner claiming data was hidden when none was.
   */
  const retentionDays = getHistoryRetentionDays(user)
  const retentionFloor = retentionDays === null ? null : new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const from =
    retentionFloor && (!requestedFrom || requestedFrom < retentionFloor) ? retentionFloor : requestedFrom
  const retentionApplied = retentionFloor !== null && (!requestedFrom || requestedFrom < retentionFloor)

  const dateRangeWhere = from || to ? { gte: from, lte: to } : undefined

  // All 4 queries are fully independent (hasAnyActivity's two counts don't
  // depend on anything, and the drafts/decisions fetches don't depend on
  // the counts) — running them together instead of the counts sequentially
  // BEFORE the Promise.all below cuts up to 3 serial DB round-trips down to
  // effectively 1.
  const [draftCount, decisionCount, drafts, decisions] = await Promise.all([
    prisma.aiDraft.count({ where: { task: { userId: user.id } } }),
    prisma.decision.count({ where: { task: { userId: user.id } } }),
    decisionType
      ? Promise.resolve([])
      : prisma.aiDraft.findMany({
          where: {
            task: {
              userId: user.id,
              ...(workflowType ? { workflowType } : {}),
            },
            ...(dateRangeWhere ? { createdAt: dateRangeWhere } : {}),
          },
          include: { task: { select: { id: true, workflowType: true, inboundText: true } } },
          orderBy: { createdAt: "desc" },
        }),
    prisma.decision.findMany({
      where: {
        task: {
          userId: user.id,
          ...(workflowType ? { workflowType } : {}),
        },
        ...(decisionType ? { action: decisionType } : {}),
        ...(dateRangeWhere ? { createdAt: dateRangeWhere } : {}),
      },
      include: {
        task: { select: { id: true, workflowType: true, inboundText: true } },
        actorUser: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const hasAnyActivity = draftCount > 0 || decisionCount > 0

  const events: FeedEvent[] = [
    ...drafts.map((draft) => ({
      kind: "draft" as const,
      id: draft.id,
      createdAt: draft.createdAt,
      taskId: draft.task.id,
      workflowType: draft.task.workflowType,
      inboundText: draft.task.inboundText,
      confidenceScore: draft.confidenceScore,
      riskFlagCount: draft.riskFlags.length,
    })),
    ...decisions.map((decision) => ({
      kind: "decision" as const,
      id: decision.id,
      createdAt: decision.createdAt,
      taskId: decision.task.id,
      workflowType: decision.task.workflowType,
      inboundText: decision.task.inboundText,
      action: decision.action,
      actorName: decision.actorUser.name ?? decision.actorUser.email,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <h2 className="text-h2 text-text-primary">Observation Log</h2>
      {retentionApplied && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-status-pending-bg px-4 py-3 text-meta text-status-pending">
          <span>
            {user.plan === "DEMO" ? "The Demo plan" : "The Individual plan"} only shows the last {retentionDays}{" "}
            days of activity. Upgrade to Professional or Enterprise for full, unlimited history.
          </span>
          <a href="/pricing" className="shrink-0 font-medium underline underline-offset-2">
            Upgrade
          </a>
        </div>
      )}
      <ObservationFilters
        currentWorkflowType={workflowType}
        currentDecisionType={decisionType}
        currentFrom={params.from}
        currentTo={params.to}
      />
      <ObservationFeed
        events={events}
        isFiltered={Boolean(workflowType || decisionType || from || to)}
        hasAnyActivity={hasAnyActivity}
      />
    </div>
  )
}
