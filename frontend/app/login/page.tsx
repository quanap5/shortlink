"use client";

import { useEffect, useState } from "react";
import {
  buildLoginUrl,
  createOAuthState,
  createPkcePair,
  loadAuthConfig,
  readTenantIdToken,
  saveCodeVerifier,
  saveOAuthState,
} from "@/lib/auth";

export default function LoginPage() {
  const [status, setStatus] = useState("Ready to sign in.");
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const token = readTenantIdToken();
    if (token) {
      setEmail("Signed in");
    }
  }, []);

  async function startLogin() {
    setIsLoading(true);
    setStatus("Opening secure sign in...");
    try {
      const config = await loadAuthConfig();
      const pkce = await createPkcePair();
      const state = createOAuthState();
      saveCodeVerifier(pkce.verifier);
      saveOAuthState(state);
      window.location.href = buildLoginUrl(config, pkce.challenge, state);
    } catch (error) {
      setIsLoading(false);
      setStatus(error instanceof Error ? error.message : "Unable to start login.");
    }
  }

  return (
    <section className="retro-card-white max-w-md p-6">
      <p className="inline-flex border-2 border-ink bg-yellow px-2 py-1 text-xs font-black uppercase tracking-[0.14em]">
        Auth station
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-normal">Login</h1>
      <p className="mt-3 text-sm font-semibold text-ink/70">
        {email ? "You already have a local session." : status}
      </p>
      <button
        className="retro-button retro-button-primary mt-6 min-h-11 px-4 py-2 text-sm disabled:opacity-60"
        disabled={isLoading}
        onClick={startLogin}
      >
        Sign in
      </button>
    </section>
  );
}
