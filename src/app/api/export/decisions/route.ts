import { NextResponse } from "next/server"

import { requireUser } from "@/lib/auth"
import { hasEvalAccess } from "@/lib/billing/plan"
import { prisma } from "@/lib/prisma"

/**
 * MonetizationPlan.md Step 6.5 — the highest-leverage premium
 * differentiator per that step's own reasoning: the data (full decision
 * history, before/after content for edits) already exists and is
 * correctly modeled — this turns it into something a customer's own
 * compliance/leadership can be handed, which is the actual reason a
 * business pays for an "Observation + Approval" governance product.
 *
 * Gated identically to the Eval Dashboard (hasEvalAccess — Professional
 * and Enterprise only), since this is the same tier of "deeper analytics/
 * reporting" capability, not the base product. A Route Handler rather than
 * a Server Action because this needs to return a downloadable file with
 * real HTTP headers (Content-Disposition), which a Server Action cannot do.
 *
 * Optional `?from=` / `?to=` (ISO date strings) scope the export to a date
 * range — reuses the same date-range parameter shape lib/metrics.ts's
 * getApprovalRate() already accepts, rather than inventing a different
 * convention for this one endpoint.
 */
export async function GET(request: Request) {
  let user
  try {
    user = await requireUser()
  } catch {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 })
  }

  if (!hasEvalAccess(user)) {
    return NextResponse.json(
      { error: "Exporting the decision log requires the Professional or Enterprise plan." },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const fromParam = searchParams.get("from")
  const toParam = searchParams.get("to")
  const from = fromParam ? new Date(fromParam) : undefined
  const to = toParam ? new Date(toParam) : undefined

  const decisions = await prisma.decision.findMany({
    where: {
      task: { userId: user.id },
      ...(from || to
        ? {
            createdAt: {
              ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
              ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      editedText: true,
      createdAt: true,
      actorUser: { select: { email: true } },
      task: {
        select: {
          id: true,
          workflowType: true,
          createdAt: true,
          aiDrafts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { draftText: true, confidenceScore: true },
          },
        },
      },
    },
  })

  const csv = buildCsv(decisions)

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="decision-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

type DecisionRow = {
  id: string
  action: string
  editedText: string | null
  createdAt: Date
  actorUser: { email: string }
  task: {
    id: string
    workflowType: string
    createdAt: Date
    aiDrafts: { draftText: string; confidenceScore: number }[]
  }
}

function buildCsv(decisions: DecisionRow[]): string {
  const headers = [
    "Decision ID",
    "Task ID",
    "Workflow Type",
    "Task Created At",
    "Decision",
    "Decided By",
    "Decided At",
    "AI Confidence Score",
    "AI Draft Text",
    "Edited Text (if Edit & Approve)",
  ]

  const rows = decisions.map((d) => {
    const latestDraft = d.task.aiDrafts[0]
    return [
      d.id,
      d.task.id,
      d.task.workflowType,
      d.task.createdAt.toISOString(),
      d.action,
      d.actorUser.email,
      d.createdAt.toISOString(),
      latestDraft ? String(latestDraft.confidenceScore) : "",
      latestDraft?.draftText ?? "",
      d.editedText ?? "",
    ]
  })

  // Real CSV escaping — every field wrapped in quotes with internal quotes
  // doubled, per RFC 4180. Decision/draft text is free-form user/AI text
  // that WILL contain commas, quotes, and newlines — a naive join(",")
  // would silently produce a corrupt, misaligned CSV the moment any real
  // draft text contains a comma, which is virtually guaranteed.
  function escapeCsvField(value: string): string {
    return `"${value.replace(/"/g, '""')}"`
  }

  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","))
  return lines.join("\r\n")
}
