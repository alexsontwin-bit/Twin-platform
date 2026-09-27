import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"

// MonetizationPlan.md Step 4 — "/pricing" must be reachable by a logged-out
// visitor: this is a flat array of EXACT-match strings, not a prefix or
// pattern matcher, and placing a page under the (marketing) route group
// does NOT exempt it from this check on its own (route groups only affect
// file organization/layout nesting, never middleware matching). Without
// this entry, a prospect who isn't signed in yet would be redirected to
// /login before ever seeing pricing — the opposite of what a page meant to
// convert an anonymous visitor should do.
const PUBLIC_PATHS = ["/", "/signup", "/login", "/pricing"]

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PATHS.includes(pathname)

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    return NextResponse.redirect(loginUrl)
  }
})

export const config = {
  // Protect everything except Next.js internals, static assets, the
  // NextAuth API routes themselves (which must stay reachable to sign in),
  // the PWA assets (manifest, service worker, offline fallback, icons) —
  // these must be fetchable by the browser/OS installer and by the
  // service worker's own fetch handler even when signed out, otherwise
  // installability checks fail and a logged-out visitor can never get a
  // working offline fallback page — and the Stripe webhook route
  // (MonetizationPlan.md Step 3). That last exclusion is critical, not
  // cosmetic: Stripe calls this endpoint directly and unauthenticated —
  // without "api/webhooks" excluded here, every single webhook delivery
  // would be redirected to /login and silently fail, meaning checkout
  // would visually succeed in a browser (the client-side redirect happens
  // regardless) while no account ever actually gets marked paid, since all
  // of that logic lives in the webhook handler, not the checkout action.
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/).*)",
  ],
}
