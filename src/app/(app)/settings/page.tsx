import Link from "next/link"
import { UserRound, KeyRound, ShieldCheck, Smartphone, CreditCard } from "lucide-react"

import { requireUser } from "@/lib/auth"
import { GUARDRAIL_POLICY } from "@/lib/ai/guardrails"
import { isPaidPlan } from "@/lib/billing/plan"
import { buttonVariants } from "@/components/ui/button-variants"
import { ProfileForm } from "@/app/(app)/settings/ProfileForm"
import { PasswordForm } from "@/app/(app)/settings/PasswordForm"
import { ManageBillingButton } from "@/app/(app)/settings/ManageBillingButton"
import { InstallAppButton } from "@/components/shared/InstallAppButton"

/**
 * ApplicationFlow.md Section 10 — profile (editable), password change
 * (self-hosted, no external account portal), and a read-only guardrail
 * policy view rendering the real GUARDRAIL_POLICY object from
 * lib/ai/guardrails.ts (Step 7.2) so this never drifts from what's
 * actually enforced. Theme toggle is already in TopBar (Step 1.1) —
 * ApplicationFlow.md 10.3 only asks for one "if not already accessible."
 */
export default async function SettingsPage() {
  const user = await requireUser()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <h2 className="text-h2 text-text-primary">Settings</h2>

      <section className="elevation-card flex flex-col gap-4 rounded-lg bg-bg-surface p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft-bg text-accent-primary">
            <UserRound className="size-4" strokeWidth={1.75} />
          </span>
          <h3 className="text-h3 text-text-primary">Profile</h3>
        </div>
        <ProfileForm initialName={user.name ?? ""} initialEmail={user.email} />
      </section>

      <section className="elevation-card flex flex-col gap-4 rounded-lg bg-bg-surface p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft-bg text-accent-primary">
            <KeyRound className="size-4" strokeWidth={1.75} />
          </span>
          <h3 className="text-h3 text-text-primary">Change Password</h3>
        </div>
        <PasswordForm />
      </section>

      {/* MonetizationPlan.md Step 4/5 — same per-section card pattern as
          Profile/Change Password/Install App above. */}
      <section className="elevation-card flex items-center justify-between gap-4 rounded-lg bg-bg-surface p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft-bg text-accent-primary">
            <CreditCard className="size-4" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col">
            <h3 className="text-h3 text-text-primary">Plan</h3>
            <span className="text-micro text-text-tertiary">
              {isPaidPlan(user) ? `Current plan: ${user.plan}` : "Demo — limited to a few free tasks"}
            </span>
          </div>
        </div>
        {isPaidPlan(user) ? (
          <ManageBillingButton />
        ) : (
          <Link href="/pricing" className={buttonVariants({ variant: "secondary" })}>
            Upgrade
          </Link>
        )}
      </section>

      {/* Install renders nothing on browsers/states where it can't do
          anything useful (already installed, or no install path exists) —
          see InstallAppButton's own file comment. Placed here rather than
          on the marketing navbar's persistent nag surface, since a settings
          visit is a real user-intent moment per PWA standard Section 10. */}
      <section className="elevation-card flex items-center justify-between gap-4 rounded-lg bg-bg-surface p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft-bg text-accent-primary">
            <Smartphone className="size-4" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col">
            <h3 className="text-h3 text-text-primary">Install App</h3>
            <span className="text-micro text-text-tertiary">Faster access, its own window, works offline</span>
          </div>
        </div>
        <InstallAppButton variant="secondary" />
      </section>

      {/* Read-only system policy, not a user-editable form like the two
          sections above — rendered as an instrument readout (monospace
          values, tighter surface) rather than a third identical form card,
          per ThemeGuideline.md's "precision instrument" identity and
          Section 8's rule against repeating the same card pattern with no
          distinguishing moment. */}
      <section className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-surface-2 p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-status-pending-bg text-status-pending">
            <ShieldCheck className="size-4" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col">
            <h3 className="text-h3 text-text-primary">Guardrail Policy</h3>
            <span className="text-micro text-text-tertiary">Read-only · enforced on every draft</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-border-subtle pt-4">
          <span className="text-meta font-medium text-text-secondary">Pricing floor</span>
          <p className="font-mono text-body text-text-primary">
            {GUARDRAIL_POLICY.pricingFloorPercentDiscount}<span className="text-text-tertiary">% max discount</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-meta font-medium text-text-secondary">Commitment phrases</span>
          <ul className="flex flex-wrap gap-2">
            {GUARDRAIL_POLICY.commitmentPhrases.map((phrase) => (
              <li
                key={phrase}
                className="rounded-sm border border-border-subtle bg-bg-surface-3 px-2.5 py-1 font-mono text-meta text-text-secondary"
              >
                {phrase}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-meta font-medium text-text-secondary">Flagged keywords</span>
          <ul className="flex flex-wrap gap-2">
            {GUARDRAIL_POLICY.flaggedKeywords.map((keyword) => (
              <li
                key={keyword}
                className="rounded-sm border border-border-subtle bg-bg-surface-3 px-2.5 py-1 font-mono text-meta text-text-secondary"
              >
                {keyword}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
