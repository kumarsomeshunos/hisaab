import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { groupMembers, groups } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const { id: groupId, memberId } = await params;

    // Must be the group creator to remove others
    const [group] = await db.select({ createdById: groups.createdById }).from(groups).where(eq(groups.id, groupId));
    if (!group) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (group.createdById !== me) return NextResponse.json({ error: "Only the group creator can remove members." }, { status: 403 });

    const [member] = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(
      and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId))
    );
    if (!member) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    // Creator cannot remove themselves
    if (member.userId === me) return NextResponse.json({ error: "Cannot remove yourself from the group." }, { status: 400 });

    await db.delete(groupMembers).where(eq(groupMembers.id, memberId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[groups/[id]/members/[memberId]/DELETE]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
