"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Receipt, Trash2, Check, Clock, Send, X, Pencil, FileText, ChevronLeft, ChevronRight, Paperclip, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { AddExpenseSheet } from "@/components/expenses/AddExpenseSheet";
import { useOfflineMutate } from "@/lib/offline/hooks";

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function categoryDisplay(key: string | null): { name: string; icon: string } | null {
  if (!key) return null;
  if (key.startsWith("custom:")) return { name: "Custom", icon: "📦" };
  const found = DEFAULT_CATEGORIES.find((c) => c.key === key);
  return found ? { name: found.name, icon: found.icon } : null;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function initials(name: string | null, username: string | null | undefined): string {
  if (name) return name.trim().charAt(0).toUpperCase();
  if (username) return username.trim().charAt(0).toUpperCase();
  return "?";
}

type MediaItem = {
  id: string;
  uploadedById: string;
  key: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
};

type Split = {
  type: "user" | "guest";
  id: string;
  participantId: string;
  name: string | null;
  username?: string | null;
  amount: number;
  rawValue: string | null;
  settlementStatus: "self" | "settled" | "pending";
};

type Comment = {
  id: string;
  userId: string;
  userName: string | null;
  userUsername: string | null;
  body: string;
  createdAt: string;
};

type ExpenseDetail = {
  id: string;
  title: string;
  notes: string | null;
  amount: number;
  date: string;
  category: string | null;
  splitMode: string;
  groupId: string | null;
  groupName: string | null;
  createdById: string;
  paidBy: { type: "user" | "guest"; id: string; name: string | null; username?: string | null };
  splits: Split[];
  comments: Comment[];
  media: MediaItem[];
};

const MAX_ATTACHMENTS = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export default function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: expenseId } = use(params);
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string; name: string | null; username: string | null } | null>(null);
  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const [settleOpen, setSettleOpen] = useState(false);
  const [settleNote, setSettleNote] = useState("");
  const [settling, setSettling] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate } = useOfflineMutate();

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.user) setCurrentUser({ id: d.user.id, name: d.user.name ?? null, username: d.user.username ?? null });
    }).catch(() => {});
  }, []);

  const fetchExpense = useCallback(async () => {
    try {
      const res = await fetch(`/api/expenses/${expenseId}`);
      if (!res.ok) { setExpense(null); return; }
      const data = await res.json();
      setExpense(data.expense ?? null);
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useEffect(() => { fetchExpense(); }, [fetchExpense]);

  useEffect(() => {
    const handler = () => fetchExpense();
    window.addEventListener("dutch-data-refresh", handler);
    return () => window.removeEventListener("dutch-data-refresh", handler);
  }, [fetchExpense]);

  // Close lightbox on Escape
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxIndex(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex]);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await mutate({ url: `/api/expenses/${expenseId}`, method: "DELETE", label: "Delete expense" });
      if (result.queued) return;
      if (result.response.ok) router.push("/expenses");
    } finally {
      setDeleting(false);
    }
  }, [expenseId, router, deleting, mutate]);

  const submitComment = useCallback(async () => {
    const body = commentText.trim();
    if (!body || submittingComment) return;
    setSubmittingComment(true);
    try {
      const result = await mutate({
        url: `/api/expenses/${expenseId}/comments`,
        method: "POST",
        body: { body },
        label: "Add comment",
      });
      setCommentText("");
      if (result.queued) return;
      if (result.response.ok) fetchExpense();
    } finally {
      setSubmittingComment(false);
    }
  }, [commentText, expenseId, fetchExpense, submittingComment, mutate]);

  const deleteComment = useCallback(async (commentId: string) => {
    setDeletingCommentId(commentId);
    try {
      const result = await mutate({ url: `/api/expenses/${expenseId}/comments/${commentId}`, method: "DELETE", label: "Delete comment" });
      if (result.queued) return;
      fetchExpense();
    } finally {
      setDeletingCommentId(null);
    }
  }, [expenseId, fetchExpense, mutate]);

  const handleSettle = useCallback(async (mySplit: Split, payerId: string) => {
    setSettling(true);
    try {
      const result = await mutate({
        url: "/api/settlements",
        method: "POST",
        body: { friendUserId: payerId, amount: mySplit.amount / 100, direction: "i_paid", note: settleNote.trim() || undefined },
        label: "Record settlement",
      });
      setSettleOpen(false);
      setSettleNote("");
      if (result.queued) return;
      if (!result.response.ok) return;
      setExpense((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          splits: prev.splits.map((s) =>
            s.type === "user" && s.id === mySplit.id ? { ...s, settlementStatus: "settled" as const } : s
          ),
        };
      });
      window.dispatchEvent(new CustomEvent("settlement-recorded"));
    } finally {
      setSettling(false);
    }
  }, [settleNote, mutate]);

  const uploadFiles = useCallback(async (files: FileList) => {
    setUploadError(null);
    const fileArr = Array.from(files).filter((f) => ALLOWED_TYPES.includes(f.type));
    if (fileArr.length === 0) {
      setUploadError("Only JPEG, PNG, WEBP, HEIC, and PDF files are allowed.");
      return;
    }
    const currentCount = expense?.media.length ?? 0;
    if (currentCount + fileArr.length > MAX_ATTACHMENTS) {
      setUploadError(`Maximum ${MAX_ATTACHMENTS} attachments per expense.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of fileArr) {
        const presignRes = await fetch(`/api/expenses/${expenseId}/media/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
        });
        if (!presignRes.ok) {
          const err = await presignRes.json();
          setUploadError(err.error ?? "Upload failed.");
          return;
        }
        const { uploadUrl, key } = await presignRes.json();

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!putRes.ok) {
          setUploadError("Failed to upload file to storage.");
          return;
        }

        const confirmRes = await fetch(`/api/expenses/${expenseId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, mimeType: file.type, sizeBytes: file.size }),
        });
        if (!confirmRes.ok) {
          const err = await confirmRes.json();
          setUploadError(err.error ?? "Failed to save attachment.");
          return;
        }
      }
      fetchExpense();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [expense?.media.length, expenseId, fetchExpense]);

  const deleteMedia = useCallback(async (mediaId: string) => {
    setDeletingMediaId(mediaId);
    try {
      const result = await mutate({ url: `/api/expenses/${expenseId}/media/${mediaId}`, method: "DELETE", label: "Delete attachment" });
      if (result.queued) return;
      fetchExpense();
    } finally {
      setDeletingMediaId(null);
    }
  }, [expenseId, fetchExpense, mutate]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!expense) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-64 text-center px-6">
          <p className="text-[15px] font-light text-muted-foreground">Expense not found.</p>
          <Link href="/expenses" className="mt-3 text-[14px] text-emerald-600">Back to expenses</Link>
        </div>
      </AppShell>
    );
  }

  const isCreator = expense.createdById === currentUser?.id;
  const isParticipant = expense.splits.some((s) => s.type === "user" && s.participantId === currentUser?.id);
  const canUpload = (isParticipant || isCreator) && expense.media.length < MAX_ATTACHMENTS && !uploading;
  const cat = categoryDisplay(expense.category);
  const mySplit = currentUser ? expense.splits.find((s) => s.type === "user" && s.participantId === currentUser.id) : undefined;
  const canSettle = !expense.groupId && mySplit?.settlementStatus === "pending" && expense.paidBy.type === "user" && expense.paidBy.id !== currentUser?.id;

  const imageItems = expense.media.filter((m) => m.mimeType !== "application/pdf");
  const pdfItems = expense.media.filter((m) => m.mimeType === "application/pdf");

  const editInitial = isCreator && currentUser ? {
    id: expense.id,
    title: expense.title,
    notes: expense.notes ?? "",
    amountRupees: expense.amount / 100,
    date: expense.date.slice(0, 10),
    category: expense.category,
    splitMode: expense.splitMode,
    paidBy: expense.paidBy,
    splits: expense.splits.map((s) => ({ type: s.type, id: s.participantId, name: s.name, username: s.username, rawValue: s.rawValue })),
  } : undefined;

  return (
    <AppShell>
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <Link
            href="/expenses"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] transition-colors duration-150"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Link>
          <h1 className="flex-1 text-[17px] font-light tracking-[-0.02em] truncate">{expense.title}</h1>
          {isCreator && (
            <button
              onClick={() => setEditOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] transition-colors duration-150"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </header>

      <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl mx-auto w-full space-y-6 pb-20 md:pb-8">

        {/* Hero */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-[28px]">
            {cat ? cat.icon : <Receipt className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />}
          </div>
          <div className="text-center">
            <p className="text-[42px] font-thin tracking-[-0.04em] leading-none">₹{formatPaise(expense.amount)}</p>
            <p className="text-[13px] font-light text-muted-foreground mt-1">
              {new Date(expense.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            {cat && <p className="text-[12px] font-light text-muted-foreground mt-0.5">{cat.name}</p>}
          </div>
        </div>

        {/* Attachments */}
        {(expense.media.length > 0 || canUpload) && (
          <section>
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Attachments</p>
            <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
              {expense.media.length > 0 && (
                <div className="p-3 space-y-3">
                  {/* Image grid */}
                  {imageItems.length > 0 && (
                    <div className={cn("grid gap-2", imageItems.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                      {imageItems.map((item) => {
                        const idx = imageItems.indexOf(item);
                        return (
                          <div key={item.id} className="relative group aspect-square rounded-xl overflow-hidden bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.url}
                              alt=""
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => setLightboxIndex(idx)}
                            />
                            {item.uploadedById === currentUser?.id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteMedia(item.id); }}
                                disabled={deletingMediaId === item.id}
                                className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150 disabled:opacity-60"
                              >
                                {deletingMediaId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" strokeWidth={2} />}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* PDF list */}
                  {pdfItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-1 py-0.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 shrink-0">
                        <FileText className="h-4 w-4 text-rose-500" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-light truncate">{item.key.split("/").pop()}</p>
                        <p className="text-[11px] text-muted-foreground">{(item.sizeBytes / 1024).toFixed(0)} KB</p>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/[0.05] transition-colors duration-150 shrink-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </a>
                      {item.uploadedById === currentUser?.id && (
                        <button
                          onClick={() => deleteMedia(item.id)}
                          disabled={deletingMediaId === item.id}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors duration-150 shrink-0 disabled:opacity-40"
                        >
                          {deletingMediaId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" strokeWidth={2} />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {canUpload && (
                <div className={cn("px-4 py-3", expense.media.length > 0 && "border-t border-black/[0.06]")}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 text-[13px] font-light text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} />}
                    {uploading ? "Uploading…" : "Add photo or receipt"}
                  </button>
                  {uploadError && (
                    <p className="mt-1 text-[12px] font-light text-rose-500">{uploadError}</p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Meta card */}
        <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
          {/* Paid by */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
            <span className="text-[13px] font-light text-muted-foreground w-20 shrink-0">Paid by</span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className={cn("text-[10px] font-medium", expense.paidBy.type === "user" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-200 text-zinc-600")}>
                  {initials(expense.paidBy.name, expense.paidBy.username)}
                </AvatarFallback>
              </Avatar>
              <span className="text-[14px] font-light truncate">
                {expense.paidBy.type === "user" && expense.paidBy.id === currentUser?.id ? "You" : (expense.paidBy.name ?? expense.paidBy.username ?? "Unknown")}
              </span>
            </div>
          </div>

          {/* Group */}
          {expense.groupId && expense.groupName && (
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
              <span className="text-[13px] font-light text-muted-foreground w-20 shrink-0">Group</span>
              <Link href={`/groups/${expense.groupId}`} className="text-[14px] font-light text-emerald-600 hover:text-emerald-700 transition-colors duration-150 flex-1 truncate">
                {expense.groupName}
              </Link>
            </div>
          )}

          {/* Notes */}
          {expense.notes && (
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="text-[13px] font-light text-muted-foreground w-20 shrink-0 pt-0.5">Notes</span>
              <p className="text-[14px] font-light flex-1 leading-relaxed">{expense.notes}</p>
            </div>
          )}
        </div>

        {/* Split breakdown */}
        <section>
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Split breakdown</p>
          <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
            {expense.splits.map((split, i) => {
              const isSelf = split.type === "user" && split.participantId === currentUser?.id;
              const href = isSelf ? null
                : split.type === "user" && split.username ? `/friends/${split.username}`
                : split.type === "guest" ? `/contacts/${split.participantId}`
                : null;
              const rowClass = cn(
                "flex items-center gap-3 px-4 py-3.5",
                i > 0 && "border-t border-black/[0.06]",
                href && "hover:bg-black/[0.02] transition-colors duration-150"
              );
              const rowContent = (
                <>
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={cn("text-[11px] font-medium", split.type === "user" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-200 text-zinc-600")}>
                      {initials(split.name, split.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-light truncate">
                      {isSelf ? "You" : (split.name ?? split.username ?? "Guest")}
                    </p>
                    {split.username && !isSelf && <p className="text-[12px] text-muted-foreground">@{split.username}</p>}
                  </div>
                  <p className="text-[14px] font-light tabular-nums shrink-0 mr-2">₹{formatPaise(split.amount)}</p>
                  {split.settlementStatus === "self" ? null : split.settlementStatus === "settled" ? (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium shrink-0">
                      <Check className="h-3 w-3" strokeWidth={2.5} /> Settled
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium shrink-0">
                      <Clock className="h-3 w-3" strokeWidth={2} /> Pending
                    </div>
                  )}
                </>
              );
              return href ? (
                <Link key={`${split.type}-${split.id}`} href={href} className={rowClass}>{rowContent}</Link>
              ) : (
                <div key={`${split.type}-${split.id}`} className={rowClass}>{rowContent}</div>
              );
            })}
          </div>
        </section>

        {/* Settle Up */}
        {canSettle && mySplit && expense.paidBy.type === "user" && (
          settleOpen ? (
            <div className="rounded-2xl border border-black/[0.06] bg-card px-5 py-4 space-y-3">
              <p className="text-[13px] font-light text-muted-foreground text-center">
                Recording that you paid {expense.paidBy.name ?? expense.paidBy.username ?? "them"} ₹{formatPaise(mySplit.amount)}
              </p>
              <Input
                type="text"
                placeholder="Note (optional)"
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                maxLength={200}
                className="h-9 text-[14px] font-light rounded-xl border-black/[0.1]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setSettleOpen(false); setSettleNote(""); }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-light text-muted-foreground hover:text-foreground border border-black/[0.06] transition-colors duration-150"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSettle(mySplit, expense.paidBy.id)}
                  disabled={settling}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-medium hover:bg-emerald-600 disabled:opacity-40 transition-colors duration-150 flex items-center justify-center"
                >
                  {settling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setSettleOpen(true)}
              className="w-full py-3 rounded-2xl border border-emerald-200 text-emerald-700 text-[14px] font-light hover:bg-emerald-50 transition-colors duration-150"
            >
              Settle Up
            </button>
          )
        )}

        {/* Comments */}
        <section>
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Comments</p>
          <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
            {expense.comments.length === 0 ? (
              <p className="text-[13px] font-light text-muted-foreground px-4 py-4">No comments yet.</p>
            ) : (
              expense.comments.map((c, i) => (
                <div key={c.id} className={cn("flex items-start gap-3 px-4 py-3.5", i > 0 && "border-t border-black/[0.06]")}>
                  <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                    <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-[10px] font-medium">
                      {initials(c.userName, c.userUsername)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium truncate">
                        {c.userId === currentUser?.id ? "You" : (c.userName ?? c.userUsername ?? "Unknown")}
                      </p>
                      <p className="text-[11px] font-light text-muted-foreground shrink-0">{relativeTime(c.createdAt)}</p>
                    </div>
                    <p className="text-[13px] font-light mt-0.5 leading-relaxed">{c.body}</p>
                  </div>
                  {c.userId === currentUser?.id && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      disabled={deletingCommentId === c.id}
                      className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-rose-50 hover:text-rose-500 transition-colors duration-150 disabled:opacity-40"
                    >
                      {deletingCommentId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" strokeWidth={2} />}
                    </button>
                  )}
                </div>
              ))
            )}
            <div className="border-t border-black/[0.06] flex items-center gap-2 px-4 py-3">
              <Input
                type="text"
                placeholder="Add a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                maxLength={500}
                className="h-8 flex-1 border-0 bg-transparent p-0 text-[13px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <button
                onClick={submitComment}
                disabled={!commentText.trim() || submittingComment}
                className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors duration-150"
              >
                {submittingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" strokeWidth={2} />}
              </button>
            </div>
          </div>
        </section>

        {/* Delete */}
        {isCreator && !showDeleteConfirm && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-rose-500 hover:bg-rose-50 text-[14px] font-light transition-colors duration-150"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} /> Delete expense
          </button>
        )}
        {isCreator && showDeleteConfirm && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 space-y-3">
            <p className="text-[13px] font-light text-rose-700 text-center">Delete this expense? This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-white border border-black/[0.08] text-[13px] font-light text-muted-foreground hover:bg-black/[0.03] transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[13px] font-medium hover:bg-rose-600 disabled:opacity-60 transition-colors duration-150 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); }}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && imageItems.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors duration-150"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
          {imageItems.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + imageItems.length) % imageItems.length); }}
                className="absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors duration-150"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % imageItems.length); }}
                className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors duration-150"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageItems[lightboxIndex].url}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
          {imageItems.length > 1 && (
            <p className="absolute bottom-4 text-white/60 text-[13px] font-light">
              {lightboxIndex + 1} / {imageItems.length}
            </p>
          )}
        </div>
      )}

      {editOpen && currentUser && editInitial && (
        <AddExpenseSheet
          currentUser={currentUser}
          editInitial={editInitial}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); fetchExpense(); }}
        />
      )}
    </AppShell>
  );
}
