/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import type { CardHook } from "../../types";

export interface UseGithubSignupCard extends CardHook {
  readonly cardId: "github_signup";
  email: string;
  setEmail: (email: string) => void;
}

export function useGithubSignupCard(signedIn: boolean): UseGithubSignupCard {
  const [email, setEmail] = useState("");

  return {
    cardId: "github_signup",
    done: signedIn,
    status: signedIn ? "complete" : "idle",
    summary: signedIn ? "Already signed in to GitHub" : "Optional: create a GitHub account",
    email,
    setEmail,
  };
}