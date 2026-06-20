"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTenantIdFromIdToken, readTenantIdToken } from "@/lib/auth";

export function AuthNavButton() {
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    const idToken = readTenantIdToken();
    setTenantId(idToken ? getTenantIdFromIdToken(idToken) : null);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tenantId ? (
        <span
          aria-label={`Workspace ${tenantId}`}
          className="inline-flex min-h-11 items-center gap-2 border-4 border-ink bg-yellow px-2 py-1 shadow-retro-sm"
          title={`Workspace ${tenantId}`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center border-2 border-ink bg-cream text-ink">
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
            >
              <path d="M4 20V9l8-5 8 5v11" />
              <path d="M9 20v-6h6v6" />
              <path d="M8 10h1" />
              <path d="M15 10h1" />
            </svg>
          </span>
          <span className="border-b-2 border-terracotta bg-cream px-2 py-1 font-mono text-sm font-black uppercase tabular-nums tracking-normal text-terracotta">
            {tenantId}
          </span>
        </span>
      ) : null}
      <Link
        aria-label={tenantId ? "Logout from ShortLink" : "Login to ShortLink"}
        className="retro-button retro-button-secondary min-h-11 px-4 py-2 text-sm"
        href={tenantId ? "/logout" : "/login"}
      >
        {tenantId ? "Logout" : "Login"}
      </Link>
    </div>
  );
}
