"use client";

import { useEffect, useState } from "react";
import { buildLogoutUrl, clearTokens, loadAuthConfig } from "@/lib/auth";

export default function LogoutPage() {
  const [message, setMessage] = useState("Signing out...");

  useEffect(() => {
    async function logout() {
      clearTokens();
      try {
        const config = await loadAuthConfig();
        window.location.href = buildLogoutUrl(config);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Signed out locally.");
      }
    }

    void logout();
  }, []);

  return (
    <section className="retro-card-white max-w-md p-6">
      <p className="inline-flex border-2 border-ink bg-yellow px-2 py-1 text-xs font-black uppercase tracking-[0.14em]">
        Auth station
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-normal">Logout</h1>
      <p className="mt-3 text-sm font-semibold text-ink/70">{message}</p>
    </section>
  );
}
