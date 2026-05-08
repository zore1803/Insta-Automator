import React from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, History, Settings, Zap, TrendingUp, Calendar } from "lucide-react";

interface ShellProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/posts", label: "Post History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: ShellProps) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        {/* Logo */}
        <div className="flex h-[60px] items-center px-5 border-b border-sidebar-border shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-xl ig-gradient flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Zap className="h-4 w-4 text-white fill-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground leading-none">ViralFlow</div>
              <div className="text-[10px] text-muted-foreground leading-none mt-0.5">AI Content Studio</div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <span className={`sidebar-nav-item ${isActive ? "active" : ""}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Status */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="rounded-xl bg-sidebar-accent border border-sidebar-border px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-emerald-400">AUTO-PILOT ON</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">Scheduler posts every day at 6 optimal times</p>
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="fixed top-0 inset-x-0 z-20 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-7 w-7 rounded-lg ig-gradient flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-white fill-white" />
          </div>
          <span className="text-sm font-bold">ViralFlow</span>
        </Link>
        <div className="flex gap-1">
          {NAV_ITEMS.map(({ href, icon: Icon }) => {
            const isActive = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <span className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}>
                  <Icon className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 md:ml-60 pt-14 md:pt-0 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
