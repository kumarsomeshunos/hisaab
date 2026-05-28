import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userCategories } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  icon: z.string().trim().max(10).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;

    const customRows = await db
      .select({ id: userCategories.id, name: userCategories.name, icon: userCategories.icon })
      .from(userCategories)
      .where(eq(userCategories.ownerId, me))
      .orderBy(userCategories.createdAt);

    const custom = customRows.map((c) => ({
      key: `custom:${c.id}`,
      name: c.name,
      icon: c.icon ?? "📦",
    }));

    return NextResponse.json({
      defaults: DEFAULT_CATEGORIES,
      custom,
    });
  } catch (err) {
    console.error("[categories/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    const [category] = await db
      .insert(userCategories)
      .values({ ownerId: me, name: parsed.data.name, icon: parsed.data.icon ?? null })
      .returning();

    return NextResponse.json(
      { category: { key: `custom:${category.id}`, name: category.name, icon: category.icon ?? "📦" } },
      { status: 201 }
    );
  } catch (err) {
    console.error("[categories/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
