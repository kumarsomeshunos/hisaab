import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated PWA files — not source code
    "public/sw.js",
    "public/workbox-*.js",
    "public/worker-*.js",
  ]),
  {
    rules: {
      // This rule flags indirect setState calls inside effects (e.g. calling a
      // fetch function that sets state). The codebase intentionally uses the
      // pattern `useEffect(() => { fetchData(); }, [fetchData])` throughout.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
