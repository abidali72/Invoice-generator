"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Percent,
  Repeat,
  BellRing,
  BarChart3,
  ScrollText,
  Settings,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/tax-fx", label: "Tax & FX", icon: Percent },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/reminders", label: "Reminders", icon: BellRing },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/audit-log", label: "Audit Log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 font-black text-white">IG</div>
        <div>
          <div className="text-sm font-bold leading-tight text-slate-900">Invoice Generator</div>
          <div className="text-[11px] text-slate-500">v1.0 · Acme Studio</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon size={17} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-4 text-[11px] leading-relaxed text-slate-400">
        Signed in as <span className="font-semibold text-slate-600">admin@acme.studio</span>
        <br />
        Owner · single-entity demo
      </div>
    </aside>
  );
}
