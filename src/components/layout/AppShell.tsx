"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { AddExpenseSheet } from "@/components/expenses/AddExpenseSheet";

type CurrentUser = { id: string; name: string | null; username: string | null };

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setCurrentUser(d.user ?? null))
      .catch(() => {});
  }, []);

  const handleSaved = () => {
    setRefreshKey((k) => k + 1);
    window.dispatchEvent(new CustomEvent("expense-added"));
  };

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-h-screen">
        {/* Pass refreshKey via a custom event so pages can react */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0" data-refresh={refreshKey}>
          {children}
        </main>
      </div>
      <BottomNav />

      {/* Global FAB — above bottom nav on mobile, bottom-right on desktop */}
      {currentUser && (
        <button
          onClick={() => setSheetOpen(true)}
          aria-label="Add expense"
          className="fixed bottom-[4.75rem] right-5 md:bottom-6 md:right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_4px_16px_rgba(16,185,129,0.40)] hover:bg-emerald-600 active:scale-95 transition-all duration-150"
        >
          <Plus className="h-6 w-6" strokeWidth={2} />
        </button>
      )}

      {sheetOpen && currentUser && (
        <AddExpenseSheet
          currentUser={currentUser}
          onClose={() => setSheetOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
