"use client";

import { useEffect, useState } from "react";
import {
  buildLoginUrl,
  createOAuthState,
  createPkcePair,
  loadAuthConfig,
  readTokens,
  saveCodeVerifier,
  saveOAuthState,
} from "@/lib/auth";

export default function LoginPage() {
  const [status, setStatus] = useState("Ready to sign in with Cognito.");
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const tokens = readTokens();
    if (tokens?.id_token) {
      setEmail("Signed in");
    }
  }, []);

  async function startLogin() {
    setIsLoading(true);
    setStatus("Redirecting to Cognito...");
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
    <section className="max-w-md rounded-lg border border-line bg-white p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Login</h1>
      <p className="mt-3 text-sm text-slate-600">
        {email ? "You already have a local session." : status}
      </p>
      <button
        className="mt-6 rounded-md bg-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        disabled={isLoading}
        onClick={startLogin}
      >
        Sign in with Cognito
      </button>
    </section>
  );
}
