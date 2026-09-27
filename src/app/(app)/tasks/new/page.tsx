import { TaskCreateForm } from "@/app/(app)/tasks/new/TaskCreateForm"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getTaskLimit } from "@/lib/billing/plan"

// This route was statically prerendered by default, which bakes Base UI's
// useId()-derived element ids into the build artifact — those can never
// match the ids React generates on the client, causing a hydration mismatch
// (harmless in effect, but noisy) on every visit. The page is already
// auth-gated (no anonymous visitor ever sees the prerendered HTML), so there
// is no caching/perf benefit to prerendering it — forcing it dynamic removes
// the mismatch at its source instead of only recovering from it client-side.
export const dynamic = "force-dynamic"

export default async function NewTaskPage() {
  // MonetizationPlan.md Step 2 — this page previously rendered
  // <TaskCreateForm /> with zero server data (auth was handled entirely by
  // proxy.ts at the route level). To show "2 of 3 used" before the user
  // even tries to submit, it now fetches the user + their real task count
  // itself and passes the result down as props.
  const user = await requireUser()
  const taskLimit = getTaskLimit(user)
  const tasksUsed = taskLimit === null ? null : await prisma.task.count({ where: { userId: user.id } })

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="text-h2 text-text-primary">New Task</h2>
      <p className="mt-2 text-body text-text-secondary">
        Paste an inbound message and the AI will draft a response for your review.
      </p>
      <div className="mt-8">
        <TaskCreateForm tasksUsed={tasksUsed} taskLimit={taskLimit} />
      </div>
    </div>
  )
}
