import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowDownLeft, ArrowUpRight, Receipt, Users } from "lucide-react";

export default function DashboardPage() {
  return (
    <AppShell>
      {/* iOS-style navigation bar — frosted glass, sticky */}
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center justify-between px-5 md:px-6">
          {/* Title: large, thin — visible on mobile; "Overview" label on desktop */}
          <h1 className="text-[17px] font-light tracking-[-0.02em] md:hidden">
            Hisaab
          </h1>
          <h1 className="hidden md:block text-[15px] font-medium tracking-[-0.01em] text-foreground">
            Overview
          </h1>
          <Avatar className="h-8 w-8 cursor-pointer ring-[1.5px] ring-black/10">
            <AvatarFallback className="bg-emerald-500 text-white text-[13px] font-medium">
              U
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      <div className="px-4 py-6 md:px-6 md:py-8 space-y-8 max-w-2xl mx-auto w-full">

        {/* Hero balance — large thin display number, Apple-style */}
        <section className="text-center pt-2 pb-1">
          <p className="text-[13px] font-light text-muted-foreground tracking-[0.04em] uppercase mb-1">
            Total Balance
          </p>
          <p className="text-[52px] font-thin tracking-[-0.04em] leading-none text-foreground">
            ₹0
          </p>
          <p className="mt-2 text-[13px] font-light text-muted-foreground">
            All settled up
          </p>
        </section>

        {/* Balance split — two pill cards, iOS wallet style */}
        <section className="grid grid-cols-2 gap-3">
          {/* Owed to you */}
          <div className="rounded-2xl bg-emerald-50 px-5 py-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
                <ArrowDownLeft className="h-3 w-3 text-emerald-600" strokeWidth={2.5} />
              </div>
              <span className="text-[11px] font-light text-emerald-700 tracking-[0.02em] uppercase">
                Owed to you
              </span>
            </div>
            <p className="text-[28px] font-thin tracking-[-0.03em] leading-none text-emerald-600">
              ₹0
            </p>
          </div>

          {/* You owe */}
          <div className="rounded-2xl bg-rose-50 px-5 py-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/15">
                <ArrowUpRight className="h-3 w-3 text-rose-600" strokeWidth={2.5} />
              </div>
              <span className="text-[11px] font-light text-rose-700 tracking-[0.02em] uppercase">
                You owe
              </span>
            </div>
            <p className="text-[28px] font-thin tracking-[-0.03em] leading-none text-rose-500">
              ₹0
            </p>
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          {/* Section header — Apple grouped list style */}
          <p className="text-[13px] font-medium text-muted-foreground tracking-[0.02em] uppercase mb-2 px-1">
            Recent Activity
          </p>
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Receipt className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-light text-foreground mb-1">
                No expenses yet
              </p>
              <p className="text-[13px] font-light text-muted-foreground max-w-[220px] leading-relaxed">
                Add your first expense to start tracking shared costs.
              </p>
            </div>
          </div>
        </section>

        {/* Groups */}
        <section>
          <p className="text-[13px] font-medium text-muted-foreground tracking-[0.02em] uppercase mb-2 px-1">
            Groups
          </p>
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Users className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-light text-foreground mb-1">
                No groups yet
              </p>
              <p className="text-[13px] font-light text-muted-foreground max-w-[220px] leading-relaxed">
                Create a group to split expenses with friends or flatmates.
              </p>
            </div>
          </div>
        </section>

      </div>
    </AppShell>
  );
}
