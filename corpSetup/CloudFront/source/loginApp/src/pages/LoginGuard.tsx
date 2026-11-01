/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
import { useAnchor } from "../hooks/useAnchor";

interface LoginGuardProps {
  children: ReactNode;
}

// Component: Guards its children with authentication check and triggers login redirect if not authenticated
export default function LoginGuard({ children }: LoginGuardProps) {
  const { instance, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  useAnchor(); // Ensure anchor is processed

  useEffect(() => {
    if (inProgress !== "none") return;
    if (!isAuthenticated) instance.loginRedirect(loginRequest);
  }, [isAuthenticated, inProgress, instance]);

  // if (!isAuthenticated) return null;
  return <>{children}</>;
}
