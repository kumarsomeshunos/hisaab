"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Activity,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/friends", label: "Friends", icon: UserCircle },
  { href: "/activity", label: "Activity", icon: Activity },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    // iOS tab bar: frosted glass, hairline top border, safe-area-aware
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden glass border-t border-black/[0.06]">
      <ul className="flex h-16 items-stretch pb-safe">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-[3px] transition-colors duration-150",
                  active ? "text-emerald-500" : "text-[#8E8E93]"
                )}
              >
                {/* Icon is slightly larger when active — iOS convention */}
                <Icon
                  className={cn(
                    "transition-transform duration-150",
                    active ? "h-[22px] w-[22px]" : "h-[21px] w-[21px]"
                  )}
                  strokeWidth={active ? 2 : 1.5}
                />
                <span
                  className={cn(
                    "text-[10px] tracking-tight",
                    active ? "font-medium" : "font-light"
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
