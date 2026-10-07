import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authConfig } from "@/lib/auth.config";
import { RATE_LIMITS, clearAttempts, clientIp, recordAttempt, retryAfterSeconds } from "@/lib/rate-limit";

/**
 * Thrown from authorize() when sign-in is throttled. Auth.js puts `code` in
 * the sign-in result, so the login page can tell this apart from a plain
 * wrong password. (It deliberately says nothing about which limit hit.)
 */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

/**
 * A real bcrypt hash (of a random string) to compare against when no user
 * matches, so an unknown email costs the same time as a wrong password and
 * response timing can't reveal which emails have accounts.
 */
const TIMING_DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8DBsF/KBFpnS3MGm4uvPbr3NLYG5We";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  // Auth.js logs every rejected sign-in (wrong password, throttled) as an
  // error. Those are routine, not faults — and throttling already logs its
  // own warning — so keep the log for real errors only.
  logger: {
    error(error) {
      if (error instanceof CredentialsSignin || error.name === "CredentialsSignin") return;
      console.error(error);
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const rawEmail = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!rawEmail || !password) return null;
        const email = rawEmail.trim().toLowerCase();
        const ip = clientIp(request.headers);

        // Throttle before touching the password, so a locked-out caller
        // can't keep testing guesses (and doesn't cost a bcrypt round).
        const [emailWait, ipWait] = await Promise.all([
          retryAfterSeconds(RATE_LIMITS.loginEmail, email),
          retryAfterSeconds(RATE_LIMITS.loginIp, ip),
        ]);
        if (emailWait > 0 || ipWait > 0) {
          console.warn("[auth] sign-in throttled", emailWait > 0 ? "(account)" : "(ip)");
          throw new RateLimitedSignin();
        }

        const fail = async () => {
          await Promise.all([recordAttempt(RATE_LIMITS.loginEmail, email), recordAttempt(RATE_LIMITS.loginIp, ip)]);
          return null;
        };

        try {
          const [user] = await db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              passwordHash: users.passwordHash,
              sessionVersion: users.sessionVersion,
            })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
          if (!user) {
            await bcrypt.compare(password, TIMING_DUMMY_HASH);
            return fail();
          }

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return fail();

          await clearAttempts(RATE_LIMITS.loginEmail, email);
          return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
        } catch (err) {
          // Surface the real cause in server logs — a DB error here would
          // otherwise look identical to "wrong password" to the client.
          console.error("[auth] authorize() failed:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Records which session version this sign-in belongs to (see
    // users.sessionVersion); requireOrgContext rejects the token once the
    // user's version moves on.
    async jwt({ token, user }) {
      if (user) token.sv = user.sessionVersion ?? 0;
      return token;
    },
    // Auth.js sets token.sub to the user id automatically on sign-in.
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.sessionVersion = typeof token.sv === "number" ? token.sv : 0;
      }
      return session;
    },
  },
});
