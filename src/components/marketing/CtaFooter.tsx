import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"

/**
 * ApplicationFlow.md Section 1.4 — closing CTA footer.
 */
function CtaFooter() {
  return (
    <footer className="border-t border-border-subtle bg-bg-base px-6 py-20">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <h2 className="text-h1 text-text-primary">Ready to see it in action?</h2>
        <p className="max-w-lg text-body-lg text-text-secondary">
          Create an account and submit your first task — the AI drafts, you decide.
        </p>
        <Link href="/signup" className={buttonVariants({ variant: "default", size: "lg" })}>
          Get Started
        </Link>
        <Link href="/pricing" className="text-meta text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">
          See pricing
        </Link>
      </div>
    </footer>
  )
}

export { CtaFooter }
