import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't auto-load .env.local; use Node's built-in loader
try { process.loadEnvFile(".env.local"); } catch {}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
