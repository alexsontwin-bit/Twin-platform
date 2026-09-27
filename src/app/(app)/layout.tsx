import type { ReactNode } from "react"
import { Suspense } from "react"

import { requireUser } from "@/lib/auth"
import { Sidebar } from "@/components/shell/Sidebar"
import { MobileTabBar } from "@/components/shell/MobileTabBar"
import { TopBar } from "@/components/shell/TopBar"
import { RouteProgressBar } from "@/components/shell/RouteProgressBar"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * Authenticated app shell — wraps every route under (app). Route protection
 * itself lives in src/proxy.ts (redirects unauthenticated requests to
 * /login before this layout ever renders), not here.
 *
 * requireUser() here (rather than in Sidebar/TopBar themselves) is what lets
 * the Plan badge (MonetizationPlan.md Step 6.5) stay accurate — those two
 * components are "use client" for unrelated reasons (collapse state, active
 * route highlighting) and would otherwise need their own session-derived
 * fetch. This one fresh Postgres read per navigation is shared between both.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-bg-base">
        {/* useSearchParams inside RouteProgressBar requires a Suspense boundary */}
        <Suspense fallback={null}>
          <RouteProgressBar />
        </Suspense>
        <Sidebar plan={user.plan} />
        {/*
          min-w-0 is required here: flex items default to `min-width: auto`,
          meaning this column refuses to shrink below the natural width of
          its content (e.g. a task row's untruncated text) instead of
          shrinking to fit the viewport — the classic flexbox overflow
          pitfall. Without this, /tasks and /observation (the two routes
          with the widest row content) silently grew to ~1024px wide even
          on a 320px viewport, causing real horizontal page scroll. Caught
          via a Playwright audit measuring actual scrollWidth vs
          clientWidth, not visible from a screenshot alone since the
          overflow extended past the visible viewport rather than clipping
          visibly on-screen.
        */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar plan={user.plan} />
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
        </div>
        <MobileTabBar />
      </div>
    </TooltipProvider>
  )
}
