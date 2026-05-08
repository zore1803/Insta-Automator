import React from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, History, Settings, Instagram } from "lucide-react";

interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40 md:flex-row">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Instagram className="h-5 w-5" />
            </div>
            <span className="text-lg">ContentStudio</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-4">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            <Link
              href="/"
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary ${
                location === "/" ? "bg-muted text-primary" : "text-muted-foreground"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link
              href="/posts"
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary ${
                location === "/posts" ? "bg-muted text-primary" : "text-muted-foreground"
              }`}
            >
              <History className="h-4 w-4" />
              Post History
            </Link>
            <Link
              href="/settings"
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary ${
                location === "/settings" ? "bg-muted text-primary" : "text-muted-foreground"
              }`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </nav>
        </div>
      </aside>
      <div className="flex flex-1 flex-col md:pl-64">
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6 md:hidden">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Instagram className="h-5 w-5 text-primary" />
            <span className="text-lg">ContentStudio</span>
          </Link>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
