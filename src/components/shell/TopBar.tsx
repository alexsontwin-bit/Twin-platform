"use client"

import type { Plan } from "@prisma/client"
import { usePathname } from "next/navigation"

import { NAV_ITEMS } from "@/components/shell/nav-items"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { PlanBadge } from "@/components/shared/PlanBadge"

function pageTitleFor(pathname: string) {
  const match = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )
  return match?.label ?? "Twin Platform"
}

/**
 * The account-menu placeholder (a plain circle icon with no real action)
 * was removed per explicit feedback — the sidebar footer's Log out button
 * is the real account action, and duplicating an inert avatar here added
 * visual clutter without functionality.
 *
 * The Plan badge (MonetizationPlan.md Step 6.5) sits next to the page title
 * on desktop, hidden on mobile where Sidebar's own copy (visible via the
 * MobileTabBar's absence of a header) is the one that reliably shows —
 * TopBar is always mounted regardless of viewport, so `hidden sm:inline-flex`
 * avoids showing it twice on narrow screens where Sidebar is also hidden but
 * the collapsed rail badge still renders.
 */
function TopBar({ plan }: { plan: Plan }) {
  const pathname = usePathname()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-4 md:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-h3 text-text-primary">{pageTitleFor(pathname)}</h1>
        <PlanBadge plan={plan} className="hidden sm:inline-flex" />
      </div>
      <ThemeToggle />
    </header>
  )
}

export { TopBar }
