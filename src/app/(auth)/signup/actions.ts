"use server"

import { z } from "zod"
import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { signIn } from "@/lib/auth"
import { withDbRetry } from "@/lib/db-retry"

const signupSchema = z.object({
  // Postgres's default `email @unique` comparison is case-sensitive, but
  // email addresses are conventionally treated as case-insensitive by
  // users — normalize here (same as Settings' updateProfile schema) so
  // "Test@Example.com" at signup and "test@example.com" at login are
  // recognized as the same account instead of silently failing to match.
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().optional(),
})

export type SignupResult = { success: true } | { success: false; error: string }

export async function signup(formData: FormData): Promise<SignupResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }

  const { email, password, name } = parsed.data

  let existing
  try {
    existing = await withDbRetry(() => prisma.user.findUnique({ where: { email } }))
  } catch {
    return { success: false, error: "Something went wrong — please try again." }
  }
  if (existing) {
    return { success: false, error: "An account with this email already exists." }
  }

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    await withDbRetry(() =>
      prisma.user.create({
        data: { email, passwordHash, name },
      })
    )
  } catch (error) {
    // The findUnique check above isn't atomic with this create — two
    // concurrent signups for the same email can both pass it and both
    // reach here. The DB's unique constraint on User.email (schema.prisma)
    // is the real guard; without this catch, the loser's P2002 error would
    // propagate unhandled out of this Server Action instead of showing the
    // same friendly "already exists" message the findUnique path shows.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "An account with this email already exists." }
    }
    return { success: false, error: "Something went wrong — please try again." }
  }

  // The account is created at this point even if the auto-sign-in below
  // fails (e.g. a transient DB hiccup) — never let that throw unhandled and
  // leave the user stuck on a spinner with an account they don't know
  // exists. Tell them to sign in manually instead of silently failing.
  try {
    await signIn("credentials", { email, password, redirect: false })
  } catch {
    return {
      success: false,
      error: "Account created, but automatic sign-in failed — please sign in manually.",
    }
  }

  return { success: true }
}
