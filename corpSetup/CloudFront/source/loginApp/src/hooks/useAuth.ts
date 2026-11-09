/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest, cookieDomain } from "../authConfig";

/**
 * Hook: If authenticated, it will try to acquire token silently and set cookie for parent page
 * - Manages authentication state and actions (login, logout)
 * - On auth state change, attempts to acquire token silently and set cookie
 * - Returns { isAuthenticated, account, login, logout } for components to use
 */
export function useAuth() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0];

  useEffect(() => {
    if (inProgress !== "none") return;
    if (!isAuthenticated || !account) return;

    const getToken = async () => {
      let authStatus: "SUCCESS" | "FAILED" = "FAILED",
        token: string | undefined = undefined;
      try {
        const res = await instance.acquireTokenSilent({
          ...loginRequest,
          account,
        });
        if (!res?.idToken) return; // No token, do nothing
        const exp = res.expiresOn?.getTime();
        // Token expired, delete cookie
        if (exp !== undefined && Date.now() > exp) {
          await cookieStore.set({ name: "idToken", value: "", domain: cookieDomain });
          await cookieStore.delete({ name: "idToken", domain: cookieDomain });
          return;
        }
        await cookieStore.set({
          name: "idToken",
          value: res.idToken || "",
          domain: cookieDomain,
          expires: exp,
          // sameSite: "none",
          sameSite: "lax",
        });
        // await cookieStore.set({
        //   name: "preferred_username",
        //   value: idTokenClaims?.preferred_username || "",
        //   domain: cookieDomain,
        // });
        // console.log(cookieDomain);
        authStatus = "SUCCESS";
        token = res.idToken;
      } catch (err) {
        console.error("Token acquire failed", err);
      } finally {
        // Reload parent page to update auth state
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ authStatus, token }, "*");
          // window.close();
        }
      }
    };

    getToken();
  }, [isAuthenticated, account, instance, inProgress]);

  const login = () => {
    instance.loginRedirect(loginRequest);
  };

  const logout = async () => {
    await cookieStore.set({ name: "idToken", value: "", domain: cookieDomain });
    await cookieStore.delete({ name: "idToken", domain: cookieDomain });
    // await cookieStore.set({ name: "preferred_username", value: "", domain: cookieDomain });
    // await cookieStore.delete({ name: "preferred_username", domain: cookieDomain });
    // Object.keys(localStorage).forEach((key) => {
    //   if (key.startsWith("msal.")) {
    //     localStorage.removeItem(key);
    //   }
    // });
    await instance.clearCache();
    window.location.reload();
  };

  return {
    isAuthenticated,
    account,
    login,
    logout,
  };
}

export type Auth = ReturnType<typeof useAuth>;
