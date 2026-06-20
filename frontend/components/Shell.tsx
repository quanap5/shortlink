import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthNavButton } from "@/components/AuthNavButton";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/links", label: "Links" },
  { href: "/links/create", label: "Create" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/register", label: "Register" },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-vintage-paper text-ink">
      <header className="sticky top-0 z-50 border-b-4 border-ink bg-cream shadow-retro-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex min-h-11 items-center gap-3 tracking-normal">
            <span className="grid h-12 w-12 overflow-hidden border-4 border-ink bg-chocolate shadow-retro-sm">
              <Image
                alt="TwinQX logo"
                className="h-full w-full object-cover"
                height={48}
                src="/twinqx-logo.jpg"
                unoptimized
                width={48}
              />
            </span>
            <span className="leading-none">
              <span className="block text-2xl font-black uppercase">TwinQX</span>
              <span className="block text-xs font-bold uppercase tracking-[0.16em] text-terracotta">
                ShortLink Console
              </span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="min-h-11 border-2 border-ink bg-white px-3 py-2 font-bold shadow-retro-sm transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-yellow"
              >
                {item.label}
              </Link>
            ))}
            <AuthNavButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 md:py-10">{children}</main>
    </div>
  );
}
