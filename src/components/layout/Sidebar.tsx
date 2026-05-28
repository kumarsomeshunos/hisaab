"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Activity,
  Settings,
  IndianRupee,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/friends", label: "Friends", icon: UserCircle },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/account", label: "Account", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    // macOS sidebar: slightly off-white, hairline right border
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-black/[0.06] bg-[#F5F5F5]">
      {/* Logo / wordmark */}
      <div className="flex h-14 items-center gap-2 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
          <IndianRupee className="h-4 w-4 text-white" strokeWidth={2} />
        </div>
        <span className="text-[17px] font-light tracking-[-0.02em] text-foreground">
          Dutch
        </span>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm transition-colors duration-150",
                    active
                      ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] font-medium text-foreground"
                      : "font-light text-[#555] hover:bg-black/[0.04] hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[17px] w-[17px] shrink-0",
                      active ? "text-emerald-500" : "text-[#8E8E93]"
                    )}
                    strokeWidth={active ? 2 : 1.5}
                  />
                  <span className="tracking-[-0.01em]">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
