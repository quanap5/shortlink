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
    <section className="max-w-md rounded-lg border border-line bg-white p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Logout</h1>
      <p className="mt-3 text-sm text-slate-600">{message}</p>
    </section>
  );
}
