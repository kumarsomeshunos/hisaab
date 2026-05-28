import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// neon() is lazy — it creates an HTTP fetch function, not a persistent connection.
// Safe to call at module level; no actual network call happens until a query is run.
const sql = neon(process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@placeholder.neon.tech/placeholder");

export const db = drizzle(sql, { schema });
