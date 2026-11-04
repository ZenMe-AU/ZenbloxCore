/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getAwsCallerIdentity, getAwsAssumeRoleCredentials } from "../../api/aws";
import type { AwsCallerIdentity } from "../../api/aws";
import { clearAwsSession, loadAwsTemporarySession, saveAwsTemporarySession } from "../../api/awsSession";
import { SESSION_DURATION_MS, SESSION_REFRESH_LEAD_MS } from "../../config/awsConfig";
import type { CardHook, CardStatus, LoginHook } from "../../types";

export type UseAwsLoginCard = CardHook &
  LoginHook<AwsCallerIdentity> & {
    readonly cardId: "aws_login";
    accessKeyId: string;
    setAccessKeyId: (value: string) => void;
    secretAccessKey: string;
    setSecretAccessKey: (value: string) => void;
    signInError: string | null;
    canSignIn: boolean;
  };

export function useAwsLoginCard(): UseAwsLoginCard {
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [restoredSession] = useState(loadAwsTemporarySession);

  const [identity, setIdentity] = useState<AwsCallerIdentity | null>(restoredSession?.identity ?? null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [sessionValidUntil, setSessionValidUntil] = useState<number | null>(
    restoredSession ? new Date(restoredSession.credentials.expiration).getTime() : null
  );

  const signedIn = sessionValidUntil !== null && sessionValidUntil > Date.now();

  const resetSession = useCallback(() => {
    setSessionValidUntil(null);
    setIdentity(null);
    setSignInError(null);
    clearAwsSession();
  }, []);

  const previousLongTermCredentialsRef = useRef({ accessKeyId, secretAccessKey });
  useEffect(() => {
    const previous = previousLongTermCredentialsRef.current;
    if (previous.accessKeyId !== accessKeyId || previous.secretAccessKey !== secretAccessKey) {
      previousLongTermCredentialsRef.current = { accessKeyId, secretAccessKey };
      resetSession();
    }
  }, [accessKeyId, secretAccessKey, resetSession]);

  // Re-assumes the role just before expiry while the long-term keys are still in memory;
  // a session restored after a reload has no keys, so it just lapses.
  useEffect(() => {
    if (sessionValidUntil === null) return;
    const canRefresh = !!accessKeyId.trim() && !!secretAccessKey.trim();
    const lead = canRefresh ? SESSION_REFRESH_LEAD_MS : 0;
    const delay = Math.max(0, sessionValidUntil - Date.now() - lead);
    const timer = setTimeout(async () => {
      if (!canRefresh || !identity) {
        resetSession();
        return;
      }
      try {
        const creds = await getAwsAssumeRoleCredentials(accessKeyId.trim(), secretAccessKey.trim(), identity.accountId);
        setSessionValidUntil(creds.expiration ? creds.expiration.getTime() : Date.now() + SESSION_DURATION_MS);
        saveAwsTemporarySession(identity, creds);
      } catch {
        resetSession();
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [sessionValidUntil, accessKeyId, secretAccessKey, identity, resetSession]);

  const login = async () => {
    setSignInError(null);
    setSigningIn(true);
    try {
      const id = await getAwsCallerIdentity(accessKeyId.trim(), secretAccessKey.trim());
      const creds = await getAwsAssumeRoleCredentials(accessKeyId.trim(), secretAccessKey.trim(), id.accountId);
      setIdentity(id);
      setSessionValidUntil(creds.expiration ? creds.expiration.getTime() : Date.now() + SESSION_DURATION_MS);
      saveAwsTemporarySession(id, creds);
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  };

  const logout = () => resetSession();
  const canSignIn = !!accessKeyId.trim() && !!secretAccessKey.trim();
  const status: CardStatus = signedIn ? "complete" : "idle";
  const summary = signedIn ? `Signed in as ${identity?.username ?? "AWS"}` : "Connect your AWS account";

  return {
    // cardHook
    cardId: "aws_login",
    status,
    summary,
    cardRequirements: [],
    cardDependencyLabel: "Sign in to AWS",
    done: signedIn,
    // loginHook
    account: identity,
    loggingIn: signingIn,
    login,
    logout,
    refresh: () => {},
    // extra
    accessKeyId,
    setAccessKeyId,
    secretAccessKey,
    setSecretAccessKey,
    signInError,
    canSignIn,
  };
}
