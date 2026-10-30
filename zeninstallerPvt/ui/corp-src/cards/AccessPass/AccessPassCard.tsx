/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { Box, Button, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import type { CardChrome, SetupStep } from "../../types";
import type { UseAccessPassCard } from "./useAccessPassCard";
import StepRow from "../StepRow";
import { logEvent } from "../../monitor/telemetry";
import Card from "../../components/Card";
import CopyRow from "../../components/CopyRow";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import ViewLink from "../../components/ViewLink";
import ExternalLink from "../../components/ExternalLink";
import ErrorText from "../../components/ErrorText";
import StatusText from "../../components/StatusText";
import { getEntraUsersUrl } from "../../logic/consoleUrls";

const COMPLETED_USERS_KEY = "zeninstaller_corp_access_pass_completed_users";
const DELIVERY_CONFIRMED_USERS_KEY = "zeninstaller_corp_access_pass_delivery_confirmed_users";

function loadCompletedByUserId(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPLETED_USERS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, !!v]));
  } catch {
    return {};
  }
}
function saveCompletedByUserId(value: Record<string, boolean>) {
  localStorage.setItem(COMPLETED_USERS_KEY, JSON.stringify(value));
}
function loadDeliveryConfirmedByUserId(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELIVERY_CONFIRMED_USERS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, !!v]));
  } catch {
    return {};
  }
}
function saveDeliveryConfirmedByUserId(value: Record<string, boolean>) {
  localStorage.setItem(DELIVERY_CONFIRMED_USERS_KEY, JSON.stringify(value));
}

type Props = {
  card: CardChrome;
  accessPass: UseAccessPassCard;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Create a Temporary Access Pass for a user managed by your account. This removes their existing authentication methods, randomizes their password, and
      issues an access pass that lasts one hour.
    </Typography>
  );
}

function Action() {
  return <ViewLink href={getEntraUsersUrl()} label="Open Entra users list" />;
}

/*
 * Creates a Microsoft Entra Temporary Access Pass for a user managed by the signed-in
 * account. Locked behind "azure_login" (see cardRequirements on useAccessPassCard), so
 * this body only ever renders once an Azure account + tenant are already confirmed —
 * unlike the standalone access-pass-src app, no separate sign-in/tenant UI lives here.
 */
export default function AccessPassCard({ card, accessPass }: Props) {
  const {
    steps,
    result,
    running,
    managerUsers,
    selectedManagerUserId,
    managerUsersLoading,
    managerUsersError,
    consentRequired,
    requestAccessPassConsent,
    reset,
    runForUser,
  } = accessPass;
  const disabled = card.locked;

  const PAGE_SIZE = 200;
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const [confirmationUserId, setConfirmationUserId] = useState<string | null>(null);
  const [photoIdConfirmed, setPhotoIdConfirmed] = useState(false);
  const [passValuesByUserId, setPassValuesByUserId] = useState<Record<string, string>>({});
  const [deliveryConfirmedByUserId, setDeliveryConfirmedByUserId] = useState<Record<string, boolean>>(loadDeliveryConfirmedByUserId);
  const [completedByUserId, setCompletedByUserId] = useState<Record<string, boolean>>(loadCompletedByUserId);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(managerUsers.length / PAGE_SIZE)), [managerUsers.length]);
  const pagedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return managerUsers.slice(start, start + PAGE_SIZE);
  }, [currentPage, managerUsers]);
  const visiblePages = useMemo(() => {
    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + windowSize - 1);
    if (end - start + 1 < windowSize) {
      start = Math.max(1, end - windowSize + 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (!result?.targetUserId || !result.accessPassValue) return;
    setPassValuesByUserId((prev) => ({ ...prev, [result.targetUserId!]: result.accessPassValue }));
  }, [result]);

  useEffect(() => {
    saveCompletedByUserId(completedByUserId);
  }, [completedByUserId]);

  useEffect(() => {
    saveDeliveryConfirmedByUserId(deliveryConfirmedByUserId);
  }, [deliveryConfirmedByUserId]);

  const handleCreateForUser = async (userId: string) => {
    logEvent("accessPassCreateButtonClicked", {
      targetUserId: userId,
    });
    setConfirmationUserId(null);
    setPhotoIdConfirmed(false);
    setPassValuesByUserId((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setDeliveryConfirmedByUserId((prev) => ({ ...prev, [userId]: false }));
    setCompletedByUserId((prev) => ({ ...prev, [userId]: false }));
    setCreatingUserId(userId);
    try {
      const created = await runForUser(userId);
      if (created?.targetUserId && created.accessPassValue) {
        setPassValuesByUserId((prev) => ({ ...prev, [created.targetUserId!]: created.accessPassValue }));
      }
    } finally {
      setCreatingUserId(null);
    }
  };

  const goToPage = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) return;
    const target = Math.min(totalPages, Math.max(1, parsed));
    setCurrentPage(target);
  };

  // Determine if the current result corresponds to the selected Entra user, so we can show the access pass value only for that user.
  const showingSelectedUserPass = !!result && !!selectedManagerUserId && result.targetUserId === selectedManagerUserId;
  const hydratedSelectedUserSteps: SetupStep[] =
    showingSelectedUserPass && steps.length === 0
      ? [
          {
            id: "tap",
            label: "Create Temporary Access Pass",
            status: "done" as const,
            detail: "Temporary Access Pass created",
          },
        ]
      : steps;
  const hasFinishedOrErroredStep = hydratedSelectedUserSteps.some((s) => s.status === "done" || s.status === "error");
  const showingSelectedUserSteps = hydratedSelectedUserSteps.length > 0 && (running || showingSelectedUserPass || hasFinishedOrErroredStep);
  const selectedUserRunSucceeded = showingSelectedUserPass && !hydratedSelectedUserSteps.some((s) => s.status === "error");
  const shouldShowTryAgain = !running && showingSelectedUserSteps && !selectedUserRunSucceeded;
  const statusUserId = creatingUserId ?? selectedManagerUserId;

  return (
    <Card title="Access pass" action={<Action />} lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Intro />

        {/* Entra user selector */}
        <Box
          sx={{
            backgroundColor: "background.default",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            px: 2,
            py: 1.5,
            display: "flex",
            flexDirection: "column",
            gap: 1.25,
          }}
        >
          <Typography variant="sectionLabel">Select Entra user</Typography>
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexDirection: "column", width: "100%" }}>
            {managerUsersLoading && (
              <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress aria-label="Loading managed users" size={14} />
                <StatusText>Loading users...</StatusText>
              </Box>
            )}

            {!managerUsersLoading && managerUsers.length > 0 && (
              <TableContainer
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  backgroundColor: "background.paper",
                  width: "100%",
                  overflowX: "auto",
                }}
              >
                <Table size="small" sx={{ minWidth: 640 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: "text.primary", fontWeight: 700 }}>Name</TableCell>
                      <TableCell sx={{ color: "text.primary", fontWeight: 700 }}>UPN</TableCell>
                      <TableCell align="right" sx={{ color: "text.primary", fontWeight: 700 }}>
                        {" "}
                        Action{" "}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedUsers.map((user) => {
                      const isCurrentResult = result?.targetUserId === user.id;
                      const isCreatingThisUser = creatingUserId === user.id && running;
                      const savedPass = passValuesByUserId[user.id];
                      const isCompletedUser = !!completedByUserId[user.id];
                      const isDeliveryConfirmed = !!deliveryConfirmedByUserId[user.id];
                      const rowHighlightSx = isCompletedUser ? { backgroundColor: "info.light" } : isCurrentResult ? { backgroundColor: "success.light" } : undefined;
                      const showingConfirmationForUser = confirmationUserId === user.id && !running;
                      const showingInlineStepsForUser = showingSelectedUserSteps && statusUserId === user.id;
                      return (
                        <Fragment key={user.id}>
                          <TableRow sx={rowHighlightSx}>
                            <TableCell
                              sx={{
                                color: "text.primary",
                                ...(savedPass || showingInlineStepsForUser || showingConfirmationForUser ? { borderBottom: "none" } : {}),
                              }}
                            >
                              {user.displayName}
                            </TableCell>
                            <TableCell
                              data-sensitive="true"
                              sx={{
                                color: "text.secondary",
                                ...(savedPass || showingInlineStepsForUser || showingConfirmationForUser ? { borderBottom: "none" } : {}),
                              }}
                            >
                              {user.userPrincipalName || "-"}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={savedPass || showingInlineStepsForUser || showingConfirmationForUser ? { borderBottom: "none" } : undefined}
                            >
                              <Box sx={{ display: "flex", justifyContent: "flex-end", minHeight: 28 }}>
                                {!showingConfirmationForUser && (
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => {
                                      if (confirmationUserId !== user.id) {
                                        setConfirmationUserId(user.id);
                                        setPhotoIdConfirmed(false);
                                        return;
                                      }
                                      if (!photoIdConfirmed) return;
                                      void handleCreateForUser(user.id);
                                    }}
                                    disabled={disabled || running || (showingConfirmationForUser && !photoIdConfirmed)}
                                    sx={{
                                      py: 0.35,
                                      px: 1.2,
                                      backgroundColor: isCurrentResult ? "success.main" : "primary.main",
                                      "&:hover": { backgroundColor: isCurrentResult ? "success.dark" : "primary.dark" },
                                    }}
                                  >
                                    {isCreatingThisUser ? "Creating..." : savedPass ? "Create Again" : "Create Access Pass"}
                                  </Button>
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                          {showingConfirmationForUser && (
                            <TableRow sx={rowHighlightSx ?? { background: "inherit" }}>
                              <TableCell colSpan={3} sx={{ py: 0.75, px: 1.5, borderBottom: savedPass ? "none" : undefined }}>
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 0.75,
                                    borderLeft: "2px solid",
                                    borderColor: "warning.main",
                                    pl: 1.25,
                                  }}
                                >
                                  <Typography color="warning.dark">
                                    This removes the user's existing sign-in methods, resets their password, and creates a Temporary Access Pass that expires after one hour. They may be unable to sign in until they use the pass.
                                  </Typography>
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                    <input
                                      id={`access-pass-photo-id-${user.id}`}
                                      type="checkbox"
                                      checked={photoIdConfirmed}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setPhotoIdConfirmed(checked);
                                        logEvent("accessPassPhotoIdCheckboxToggled", {
                                          targetUserId: user.id,
                                          checked,
                                        });
                                      }}
                                      style={{ margin: 0, width: 14, height: 14 }}
                                    />
                                    <Typography component="label" htmlFor={`access-pass-photo-id-${user.id}`} color="warning.dark">
                                      I verified the selected user's identity against their photo ID.
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: "flex", justifyContent: "flex-end", pt: 0.35 }}>
                                    <Button
                                      size="small"
                                      variant="contained"
                                      onClick={() => {
                                        if (confirmationUserId !== user.id) {
                                          setConfirmationUserId(user.id);
                                          setPhotoIdConfirmed(false);
                                          return;
                                        }
                                        if (!photoIdConfirmed) return;
                                        void handleCreateForUser(user.id);
                                      }}
                                      disabled={disabled || running || !photoIdConfirmed}
                                      sx={{
                                        py: 0.35,
                                        px: 1.2,
                                        backgroundColor: isCurrentResult ? "success.main" : "primary.main",
                                        "&:hover": { backgroundColor: isCurrentResult ? "success.dark" : "primary.dark" },
                                      }}
                                    >
                                      {isCreatingThisUser ? "Creating..." : savedPass ? "Create Again" : "Create Access Pass"}
                                    </Button>
                                  </Box>
                                </Box>
                              </TableCell>
                            </TableRow>
                          )}
                          {showingInlineStepsForUser && (
                            <TableRow sx={rowHighlightSx ?? { background: "inherit" }}>
                              <TableCell colSpan={3} sx={{ py: 0.75, px: 1.5, borderBottom: savedPass ? "none" : undefined }}>
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 0.25,
                                    borderLeft: "2px solid",
                                    borderColor: "divider",
                                    pl: 1.25,
                                  }}
                                >
                                  {hydratedSelectedUserSteps.map((s) => (
                                    <StepRow key={`${user.id}-${s.id}`} step={s} />
                                  ))}
                                  {running && <StatusText>Creating access pass...</StatusText>}
                                  <ProcessRetryNotice started={showingSelectedUserSteps} />
                                  {!running && (
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25 }}>
                                      {consentRequired && (
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={() => void requestAccessPassConsent()}
                                          sx={{ minWidth: 0 }}
                                        >
                                          Grant consent
                                        </Button>
                                      )}
                                      {shouldShowTryAgain && (
                                        <Button
                                          size="small"
                                          onClick={reset}
                                          sx={{
                                            alignSelf: "flex-start",
                                            color: "text.secondary",
                                            px: 0.5,
                                            minWidth: 0,
                                            "&:hover": { color: "primary.main" },
                                          }}
                                        >
                                          ↩ Try again
                                        </Button>
                                      )}
                                    </Box>
                                  )}
                                </Box>
                              </TableCell>
                            </TableRow>
                          )}
                          {savedPass && (
                            <TableRow sx={rowHighlightSx ?? { background: "inherit" }}>
                              <TableCell colSpan={3} sx={{ py: 0.5, px: 1.5 }}>
                                <CopyRow label="New Temporary Access Pass:" value={savedPass} masked />
                              </TableCell>
                            </TableRow>
                          )}
                          {savedPass && (
                            <TableRow sx={rowHighlightSx ?? { background: "inherit" }}>
                              <TableCell colSpan={3} sx={{ py: 0.75, px: 1.5 }}>
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 0.7,
                                    borderLeft: "2px solid",
                                    borderColor: "primary.light",
                                    pl: 1.25,
                                  }}
                                >
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                    <input
                                      id={`access-pass-delivery-${user.id}`}
                                      type="checkbox"
                                      data-id="chkDeliveryConfirm"
                                      data-upn={user.userPrincipalName}
                                      checked={isDeliveryConfirmed}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setDeliveryConfirmedByUserId((prev) => ({ ...prev, [user.id]: checked }));
                                        logEvent("chkDeliveryConfirmClicked", {
                                          targetUpn: user.userPrincipalName,
                                          checked,
                                        });
                                        if (!checked) {
                                          setCompletedByUserId((prev) => ({ ...prev, [user.id]: false }));
                                        }
                                      }}
                                      style={{ margin: 0, width: 14, height: 14 }}
                                    />
                                    <Box>
                                      <Typography component="label" htmlFor={`access-pass-delivery-${user.id}`} color="primary.dark">
                                        Confirm that the person has signed in and set up their own sign-in method at:
                                      </Typography>{" "}
                                      <ExternalLink href="https://mysignins.microsoft.com/" label="Microsoft My Sign-ins">
                                        https://mysignins.microsoft.com/
                                      </ExternalLink>
                                    </Box>
                                  </Box>
                                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                                    {isCompletedUser ? (
                                      <Typography
                                        sx={{
                                          color: "primary.dark",
                                          fontWeight: 600,
                                          px: 1.2,
                                          py: 0.35,
                                        }}
                                      >
                                        Completed
                                      </Typography>
                                    ) : (
                                      <Button
                                        size="small"
                                        variant="contained"
                                        onClick={() => {
                                          if (!isDeliveryConfirmed) return;
                                          setCompletedByUserId((prev) => ({ ...prev, [user.id]: true }));
                                        }}
                                        disabled={!isDeliveryConfirmed}
                                        sx={{
                                          py: 0.35,
                                          px: 1.2,
                                        }}
                                      >
                                        Mark Complete
                                      </Button>
                                    )}
                                  </Box>
                                </Box>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {!managerUsersLoading && managerUsers.length > PAGE_SIZE && (
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    sx={{ minWidth: 0, px: 1 }}
                  >
                    Prev
                  </Button>
                  {visiblePages.map((page) => (
                    <Button
                      key={page}
                      size="small"
                      variant={page === currentPage ? "contained" : "outlined"}
                      onClick={() => setCurrentPage(page)}
                      aria-current={page === currentPage ? "page" : undefined}
                      sx={{ minWidth: 32, px: 0.75 }}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    sx={{ minWidth: 0, px: 1 }}
                  >
                    Next
                  </Button>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Typography color="text.secondary">
                    Page {currentPage} of {totalPages}
                  </Typography>
                  <TextField
                    size="small"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && goToPage()}
                    placeholder="Page"
                    inputProps={{ "aria-label": "Go to user page", inputMode: "numeric", style: { width: 48 } }}
                  />
                  <Button size="small" variant="outlined" onClick={goToPage}>
                    Go
                  </Button>
                </Box>
              </Box>
            )}

            {!managerUsersLoading && managerUsers.length === 0 && !managerUsersError && (
              <Typography color="text.secondary" role="status">
                No users managed by your signed-in account were found. Check that you signed in to the correct Entra tenant and have permission to view these users.
              </Typography>
            )}

            {managerUsersError && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <ErrorText>{managerUsersError}</ErrorText>
                {consentRequired && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => void requestAccessPassConsent()}
                    sx={{ minWidth: 0 }}
                  >
                    Grant consent
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Card>
  );
}
