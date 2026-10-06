import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

// Next.js's recommended rules (React, hooks, Core Web Vitals, TypeScript),
// run through the ESLint CLI directly (`npm run lint`) rather than the
// deprecated `next lint`.
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "db/migrations/**"],
  },
];

export default eslintConfig;
