"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readAccessToken } from "@/lib/auth";

export function AuthNavButton() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    setIsSignedIn(Boolean(readAccessToken()));
  }, []);

  return (
    <Link
      aria-label={isSignedIn ? "Logout from ShortLink" : "Login to ShortLink"}
      className="retro-button retro-button-secondary min-h-11 px-4 py-2 text-sm"
      href={isSignedIn ? "/logout" : "/login"}
    >
      {isSignedIn ? "Logout" : "Login"}
    </Link>
  );
}
