import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** users.sessionVersion when this session signed in (0 for tokens issued before it existed). */
      sessionVersion: number;
    } & DefaultSession["user"];
  }
  interface User {
    sessionVersion?: number;
  }
}
