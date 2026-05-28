import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "hisaab_session";

// Public paths — no session required
const PUBLIC_PREFIXES = ["/auth", "/api/auth", "/_next", "/favicon"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // PWA static assets
  if (/\.(js|css|png|jpg|jpeg|svg|ico|webmanifest|json|txt)$/.test(pathname)) return true;
  return false;
}

// Lazy-initialised neon client — avoids connecting at module load time
let _sql: ReturnType<typeof neon> | null = null;
function getSql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized." }, { status: 401 })
      : NextResponse.redirect(new URL("/auth", request.url));
  }

  // Validate session + fetch onboarding status in one query
  const rows = await getSql()`
    SELECT u.is_onboarded
    FROM   sessions s
    JOIN   users    u ON s.user_id = u.id
    WHERE  s.id          = ${token}
      AND  s.expires_at  > NOW()
    LIMIT  1
  ` as { is_onboarded: boolean }[];

  if (rows.length === 0) {
    // Invalid or expired session — clear cookie and redirect
    if (pathname.startsWith("/api/")) {
      const res = NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
      return res;
    }
    const res = NextResponse.redirect(new URL("/auth", request.url));
    res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  }

  const isOnboarded = rows[0].is_onboarded;

  // Un-onboarded users must complete setup first
  if (!isOnboarded && pathname !== "/auth/setup") {
    return NextResponse.redirect(new URL("/auth/setup", request.url));
  }

  // Already-onboarded users should not re-visit setup
  if (isOnboarded && pathname === "/auth/setup") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except Next.js internals and static PWA files
    "/((?!_next/static|_next/image|_next/webpack-hmr|favicon\\.ico|icons|sw\\.js|workbox-).*)",
  ],
};
