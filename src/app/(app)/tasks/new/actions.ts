"use server"

import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/auth"
import { transitionTaskInTransaction } from "@/lib/workflow-engine"
import { getTaskLimit } from "@/lib/billing/plan"

const createTaskSchema = z.object({
  workflowType: z.enum(["SUPPORT_REPLY", "SALES_EMAIL", "CONTRACT_REVIEW"], {
    message: "Select a workflow type.",
  }),
  // .trim() before .min() so a whitespace-only paste (e.g. 20 spaces) can't
  // pass the length check, and so contextNotes below normalizes to "" for
  // the `contextNotes || null` check just below rather than storing
  // meaningless whitespace the task detail page would then render as an
  // empty-looking "Context: " line.
  inboundText: z.string().trim().min(20, "Paste at least 20 characters of the inbound message."),
  contextNotes: z.string().trim().optional(),
})

export type CreateTaskResult =
  | { success: true; taskId: string }
  | { success: false; error: string; capReached?: boolean }

// Thrown from inside the $transaction callback below to abort it cleanly
// (Prisma requires a throw, not a returned sentinel value, to roll back a
// transaction) — caught immediately after and turned into a normal
// { success: false } result. Never leaks past this file.
class CapReachedError extends Error {}

export async function createTask(input: unknown): Promise<CreateTaskResult> {
  const parsed = createTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }

  const { workflowType, inboundText, contextNotes } = parsed.data

  let user
  try {
    user = await requireUser()
  } catch {
    return { success: false, error: "You must be signed in to create a task." }
  }

  // ApplicationFlow.md 5.3 wants the task to genuinely exist at NEW first,
  // then transition to AI_DRAFTING — not skip straight to AI_DRAFTING — so
  // Step 8.3's task history timeline has a real "Created" moment distinct
  // from "drafting started." But doing these as two separate awaited calls
  // left a real gap: a crash/connection drop between them (this project has
  // hit Neon connection blips repeatedly) could leave a task permanently
  // stuck at NEW with no recovery path, since the Step 7.1 retry UI only
  // handles AI_DRAFTING failures. Wrapping both in one $transaction keeps
  // the spec's two-state sequence while guaranteeing they commit together
  // or not at all.
  //
  // MonetizationPlan.md Step 2 — the demo-cap count is the first
  // statement inside this same transaction, but a count-then-insert alone
  // is NOT actually race-safe under Postgres's default READ COMMITTED
  // isolation, despite that being the original assumption here — verified
  // by direct testing: two concurrent transactions' COUNT(*) queries can
  // both run (and both see the same pre-commit state) before either has
  // committed its INSERT, since READ COMMITTED only guarantees each
  // individual STATEMENT sees a fresh snapshot, not that concurrent
  // transactions serialize against each other's uncommitted writes. Fixed
  // with `pg_advisory_xact_lock` on a hash of the userId: this makes every
  // transaction for the SAME user queue up and run this count-then-insert
  // sequence one at a time (never blocking a DIFFERENT user's transactions,
  // since the lock key is user-specific), and the lock is automatically
  // released when the transaction commits or rolls back — no separate
  // unlock call needed, no risk of a stuck lock from a crashed request.
  const taskLimit = getTaskLimit(user)
  try {
    const task = await prisma.$transaction(async (tx) => {
      if (taskLimit !== null) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`
        const existingCount = await tx.task.count({ where: { userId: user.id } })
        if (existingCount >= taskLimit) {
          // Thrown (not returned) so it propagates out of $transaction and
          // is caught below — Prisma requires throwing to abort a
          // transaction cleanly rather than returning a sentinel value.
          throw new CapReachedError()
        }
      }

      const created = await tx.task.create({
        data: {
          userId: user.id,
          workflowType,
          inboundText,
          contextNotes: contextNotes || null,
          status: "NEW",
        },
      })

      // Routed through workflow-engine.ts (docs/CodingConventions.md Section 7 —
      // no parallel status-transition path) even though this is a fresh row
      // with no concurrent writer yet; keeps this the only place in the
      // codebase that ever writes Task.status.
      await transitionTaskInTransaction(tx, { taskId: created.id, from: "NEW", to: "AI_DRAFTING" })

      return tx.task.findUniqueOrThrow({ where: { id: created.id } })
    })

    // ApplicationFlow.md 5.3 — redirect happens NOW, immediately, before
    // drafting starts. The /tasks/[id] page (Step 7.1) triggers actual AI
    // generation via generateDraftForTask() once the user is already looking
    // at the skeleton there — Server Actions can't return a response early
    // while continuing work in the background, so drafting cannot happen
    // "during" this same request if the redirect is also supposed to be instant.
    return { success: true, taskId: task.id }
  } catch (error) {
    if (error instanceof CapReachedError) {
      // MonetizationPlan.md Step 2 — deliberately returned, not thrown
      // further and not redirected: the form's already-typed content must
      // stay intact so the user doesn't lose what they wrote just because
      // they hit the cap. `capReached: true` lets the client component
      // show the upgrade-prompt variant of the error instead of a generic
      // "something went wrong" message.
      return {
        success: false,
        error: `You've used all ${taskLimit} free tasks on the Demo plan. Upgrade to keep creating tasks.`,
        capReached: true,
      }
    }
    throw error
  }
}
