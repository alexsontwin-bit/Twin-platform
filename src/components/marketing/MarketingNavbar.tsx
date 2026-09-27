import Link from "next/link"

import { auth } from "@/lib/auth"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

/**
 * Landing page top navbar — Server Component so the logged-in-vs-not check
 * (`auth()`, which returns null rather than throwing when unauthenticated,
 * unlike `requireUser()`) happens with zero client JS. Reuses the same logo
 * mark as the authenticated Sidebar so the brand feels consistent across
 * both the marketing site and the app shell.
 */
async function MarketingNavbar() {
  const session = await auth()

  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg-base/80 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
      >
        <Link href="/" className="flex items-center gap-2.5 outline-none" aria-label="Twin — Home">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-primary text-text-on-accent shadow-[0_0_0_1px_var(--accent-primary),0_4px_16px_var(--accent-glow)]">
            <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden>
              <path
                d="M4 5.5C4 4.67157 4.67157 4 5.5 4H18.5C19.3284 4 20 4.67157 20 5.5C20 6.32843 19.3284 7 18.5 7H13.5V18.5C13.5 19.3284 12.8284 20 12 20C11.1716 20 10.5 19.3284 10.5 18.5V7H5.5C4.67157 7 4 6.32843 4 5.5Z"
                fill="currentColor"
              />
              <circle cx="17.5" cy="17.5" r="3" fill="currentColor" fillOpacity="0.35" />
              <circle cx="17.5" cy="17.5" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span className="text-h3 font-bold tracking-tight text-text-primary">Twin</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <Link href="#how-it-works" className="text-body text-text-secondary transition-colors duration-150 hover:text-text-primary">
            How it works
          </Link>
          <Link href="#authority" className="text-body text-text-secondary transition-colors duration-150 hover:text-text-primary">
            Authority
          </Link>
          <Link href="/pricing" className="text-body text-text-secondary transition-colors duration-150 hover:text-text-primary">
            Pricing
          </Link>
        </div>

        {session?.user ? (
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
            Dashboard
          </Link>
        ) : (
          <Link href="/signup" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
            Get Started
          </Link>
        )}
      </nav>
    </header>
  )
}

export { MarketingNavbar }
