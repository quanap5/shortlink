"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  exchangeCodeForTokens,
  getEmailFromIdToken,
  getTenantIdFromIdToken,
  loadAuthConfig,
  clearTokens,
  readTenantIdToken,
  saveTokens,
  takeCodeVerifier,
  takeOAuthState,
} from "@/lib/auth";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Completing sign in...");
  const [isComplete, setIsComplete] = useState(false);
  const hasCompletedLogin = useRef(false);

  useEffect(() => {
    async function completeLogin() {
      if (hasCompletedLogin.current) {
        return;
      }
      hasCompletedLogin.current = true;
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const returnedState = params.get("state");
      if (!code) {
        setMessage("Missing authorization code.");
        return;
      }
      const expectedState = takeOAuthState();
      if (!expectedState || returnedState !== expectedState) {
        setMessage("Invalid login state. Please start login again.");
        return;
      }
      const verifier = takeCodeVerifier();
      if (!verifier) {
        setMessage("Missing PKCE verifier. Please start login again.");
        return;
      }
      try {
        const config = await loadAuthConfig();
        const tokens = await exchangeCodeForTokens(config, code, verifier);
        saveTokens(tokens);
        if (!readTenantIdToken()) {
          clearTokens();
          setMessage("Unable to save login session. Please enable browser storage and try again.");
          return;
        }
        const tenantId = getTenantIdFromIdToken(tokens.id_token);
        if (!tenantId) {
          clearTokens();
          setMessage("Signed in, but this account is not linked to a tenant. Register a tenant first.");
          return;
        }
        const email = getEmailFromIdToken(tokens.id_token);
        setMessage(email ? `Signed in as ${email}.` : "Signed in.");
        setIsComplete(true);
        window.history.replaceState({}, document.title, "/auth/callback");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to complete sign in.");
      }
    }

    void completeLogin();
  }, []);

  return (
    <section className="max-w-xl rounded-lg border border-line bg-white p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Completing sign in</h1>
      <p className="mt-3 text-sm text-slate-600">{message}</p>
      {isComplete ? (
        <Link
          className="mt-6 inline-block rounded-md bg-teal px-4 py-2 text-sm font-medium text-white"
          href="/links"
        >
          Continue
        </Link>
      ) : null}
    </section>
  );
}
