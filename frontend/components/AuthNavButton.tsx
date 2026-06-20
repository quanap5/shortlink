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
          className="inline-flex min-h-11 items-center gap-2 px-1 py-1"
          title={`Workspace ${tenantId}`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center text-ink">
            <svg
              aria-hidden="true"
              className="h-7 w-7"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 3.5c-5 0-8.5 3.6-8.5 8.6 0 5.3 3.5 8.4 8.2 8.4 5 0 8.8-3.8 8.8-8.9 0-4.7-3.5-8.1-8.5-8.1Zm-4.6 8c.5-1 1.7-1.5 2.9-1.1.3.1.4.4.2.7-.6.7-2 .8-2.8.5-.3-.1-.4-.1-.3-.1Zm8.7-.4c.5 0 .9.2 1.2.5.2.2.1.6-.2.7-.8.3-2.3.2-2.9-.5-.2-.3-.1-.6.2-.7.5-.1 1.1-.1 1.7 0ZM8.2 15c.3-.4.8-.5 1.2-.2 1.4 1 3.9 1 5.3 0 .4-.3.9-.2 1.2.2.3.4.2.9-.2 1.2-2 1.5-5.4 1.5-7.4 0-.4-.3-.5-.8-.1-1.2Zm9.4-8.1c-2.4-1.7-6.8-2-9.5.1-.4.3-.9.2-1.2-.2-.3-.4-.2-.9.2-1.2 3.3-2.5 8.5-2.2 11.4-.1.4.3.5.8.2 1.2-.3.4-.8.5-1.1.2Z" />
            </svg>
          </span>
          <span className="-rotate-1 border-b-2 border-terracotta px-1 py-1 text-base font-black uppercase tracking-wide text-terracotta [font-family:'Comic_Sans_MS','Comic_Neue',cursive]">
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
