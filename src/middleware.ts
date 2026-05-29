import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { hashToken } from "@/lib/auth/hash";

const SESSION_COOKIE = "hisaab_session";

const PUBLIC_PREFIXES = ["/auth", "/api/auth", "/_next", "/favicon"];
const PUBLIC_EXACT = ["/manifest.json", "/opengraph-image", "/robots.txt", "/sitemap.xml"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_EXACT.includes(pathname)) return true;
  return false;
}

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

  const tokenHash = await hashToken(token);

  const rows = await getSql()`
    SELECT u.is_onboarded
    FROM   sessions s
    JOIN   users    u ON s.user_id = u.id
    WHERE  s.id          = ${tokenHash}
      AND  s.expires_at  > NOW()
    LIMIT  1
  ` as { is_onboarded: boolean }[];

  if (rows.length === 0) {
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

  if (!isOnboarded && pathname !== "/auth/setup") {
    return NextResponse.redirect(new URL("/auth/setup", request.url));
  }

  if (isOnboarded && pathname === "/auth/setup") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|favicon\\.ico|icons|sw\\.js|workbox-|worker-).*)",
  ],
};
