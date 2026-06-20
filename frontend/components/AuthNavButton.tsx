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
        <span className="min-h-11 border-2 border-ink bg-mint px-3 py-2 text-xs font-black uppercase shadow-retro-sm">
          Tenant: {tenantId}
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
