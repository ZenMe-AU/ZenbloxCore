/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Fragment } from "react";
import {
  Box, Button, Checkbox, FormControlLabel, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import type { AppContext } from "../../appContext";
import BaseCard from "../../components/BaseCard";
import CopyRow from "../../components/CopyRow";
import ErrorText from "../../components/ErrorText";
import ExternalLink from "../../components/ExternalLink";
import ProcessRetryNotice from "../../components/ProcessRetryNotice";
import ViewLink from "../../components/ViewLink";
import { borderTint } from "../../config/styles";
import { getEntraUsersUrl } from "../../logic/consoleUrls";
import StepRow from "../StepRow";
import { PAGE_SIZE } from "./stateMachine";
import { useAccessPassV2, type UseAccessPassV2 } from "./useAccessPassV2";

function Intro() {
  return (
    <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Create a one-hour Temporary Access Pass for a user you manage in Microsoft Entra. ZenInstaller removes the user's existing sign-in methods and resets
      their password to a random value before issuing the pass. They may be unable to sign in until they use it, so confirm the user's identity and arrange to
      deliver the pass securely.
    </Typography>
  );
}

export function CardContentMain({ baseCardContext, privateContext }: UseAccessPassV2) {
  const {
    managerUsers, managerUsersError, currentPage, pageInput, totalPages, visiblePages, selectedUserId, confirmationUserId,
    photoIdConfirmed, passes, deliveryConfirmed, completed, steps, running, error, consentRequired,
    dispatch, canCreate, canConfirmUser, confirmUser, createPass, requestAccessPassConsent, refresh, goToPage,
  } = privateContext;
  const pagedUsers = managerUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Intro />
      {(error || managerUsersError) && <ErrorText>{error || managerUsersError}</ErrorText>}
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button variant="text" onClick={refresh} disabled={running || !privateContext.identityKey}>Refresh users</Button>
        {(consentRequired || managerUsersError?.toLowerCase().includes("consent")) && (
          <Button variant="outlined" onClick={() => void requestAccessPassConsent()} disabled={running}>Grant consent</Button>
        )}
        {baseCardContext.lifecycle === "error" && <Button onClick={() => dispatch({ type: "reset" })}>Try again</Button>}
      </Box>
      <Box sx={{
        backgroundColor: "background.default", border: "1px solid", borderColor: "divider", borderRadius: 1,
        px: 2, py: 1.5, display: "flex", flexDirection: "column", gap: 1.25,
      }}>
        <Typography variant="sectionLabel">Select Entra user</Typography>
        {managerUsers.length === 0 && !managerUsersError && (
          <Typography color="text.secondary" role="status">
            No users managed by your signed-in account were found. Check that you signed in to the correct Entra tenant and have permission to view these users.
          </Typography>
        )}
        {managerUsers.length > 0 && (
          <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, backgroundColor: "background.paper", overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>UPN</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedUsers.map((user) => {
                  const pass = privateContext.validationPending ? undefined : passes[user.id];
                  const isCompleted = !!completed[user.id] && !!pass;
                  const confirming = confirmationUserId === user.id;
                  const userSteps = selectedUserId === user.id ? steps : [];
                  const showDetails = confirming || userSteps.length > 0 || !!pass;
                  const rowSx = pass ? (theme: Theme) => ({
                    backgroundColor: theme.vars.palette.background.paper,
                    "@supports (color: color-mix(in srgb, red, white))": {
                      backgroundColor: borderTint(isCompleted ? theme.vars.palette.info.main : theme.vars.palette.success.main, theme.vars.palette.background.paper, 8),
                    },
                  }) : undefined;
                  return (
                    <Fragment key={user.id}>
                      <TableRow sx={rowSx}>
                        <TableCell sx={{ color: "text.primary", ...(showDetails ? { borderBottom: "none" } : {}) }}>{user.displayName}</TableCell>
                        <TableCell data-sensitive="true" sx={{ color: "text.secondary", ...(showDetails ? { borderBottom: "none" } : {}) }}>
                          {user.userPrincipalName || "-"}
                        </TableCell>
                        <TableCell align="right" sx={showDetails ? { borderBottom: "none" } : undefined}>
                          {!confirming && (
                            <Button variant="contained" disabled={!canConfirmUser || running} onClick={() => confirmUser(user.id)}>
                              {running && selectedUserId === user.id ? "Creating..." : pass ? "Create Again" : "Create Access Pass"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {showDetails && (
                        <TableRow sx={rowSx}>
                          <TableCell colSpan={3} sx={{ px: 1.5, py: 0.75 }}>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                              {confirming && (
                                <Box sx={{ borderLeft: "2px solid", borderColor: "warning.main", pl: 1.25 }}>
                                  <Typography color="text.primary">
                                    This removes the user's existing sign-in methods, resets their password, and creates a Temporary Access Pass that expires after one hour. They may be unable to sign in until they use the pass.
                                  </Typography>
                                  <FormControlLabel
                                    control={<Checkbox id={`access-pass-v2-photo-id-${user.id}`} checked={photoIdConfirmed}
                                      onChange={(event) => dispatch({ type: "photo-id", confirmed: event.target.checked })} />}
                                    label="I verified the selected user's identity against their photo ID."
                                  />
                                  <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                                    <Button onClick={() => dispatch({ type: "reset" })}>Cancel</Button>
                                    <Button variant="contained" disabled={!canCreate || running} onClick={() => void createPass()}>
                                      {pass ? "Create Again" : "Create Access Pass"}
                                    </Button>
                                  </Box>
                                </Box>
                              )}
                              {userSteps.length > 0 && (
                                <Box sx={{ borderLeft: "2px solid", borderColor: "divider", pl: 1.25, "& [data-sensitive='true']": { color: "text.secondary" } }}>
                                  {userSteps.map((step) => <StepRow key={step.id} step={step} />)}
                                  <ProcessRetryNotice started />
                                </Box>
                              )}
                              {pass && (
                                <>
                                  {userSteps.length === 0 && <StepRow step={{ id: "tap", label: "Create Temporary Access Pass", status: "done" }} />}
                                  <Box sx={{ "& .MuiButton-root": { color: "text.secondary" } }}>
                                    <CopyRow label="New Temporary Access Pass:" value={pass.accessPassValue} masked />
                                  </Box>
                                  <Box sx={{ borderLeft: "2px solid", borderColor: "primary.light", pl: 1.25 }}>
                                    <FormControlLabel
                                      control={<Checkbox
                                        id={`access-pass-v2-delivery-${user.id}`} data-id="chkDeliveryConfirmV2"
                                        checked={!!deliveryConfirmed[user.id]} disabled={running}
                                        onChange={(event) => dispatch({ type: "delivery-confirmed", userId: user.id, confirmed: event.target.checked })}
                                      />}
                                      label={<Box>
                                        <Typography component="span" color="text.primary">Confirm that the person has signed in and set up their own sign-in method at: </Typography>
                                        <ExternalLink href="https://mysignins.microsoft.com/" label="Microsoft My Sign-ins">https://mysignins.microsoft.com/</ExternalLink>
                                      </Box>}
                                    />
                                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                                      {isCompleted ? <Typography sx={{ color: "primary.main", fontWeight: 600 }}>Completed</Typography> : (
                                        <Button variant="contained" disabled={running || !deliveryConfirmed[user.id]}
                                          onClick={() => dispatch({ type: "mark-complete", userId: user.id })}>Mark Complete</Button>
                                      )}
                                    </Box>
                                  </Box>
                                </>
                              )}
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
        {totalPages > 1 && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Button variant="outlined" disabled={currentPage === 1} onClick={() => dispatch({ type: "page", page: currentPage - 1, totalPages })}>Prev</Button>
              {visiblePages.map((page) => (
                <Button key={page} variant={page === currentPage ? "contained" : "outlined"}
                  aria-current={page === currentPage ? "page" : undefined} onClick={() => dispatch({ type: "page", page, totalPages })}>{page}</Button>
              ))}
              <Button variant="outlined" disabled={currentPage === totalPages} onClick={() => dispatch({ type: "page", page: currentPage + 1, totalPages })}>Next</Button>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Typography color="text.secondary">Page {currentPage} of {totalPages}</Typography>
              <TextField value={pageInput} onChange={(event) => dispatch({ type: "page-input", value: event.target.value })}
                onKeyDown={(event) => { if (event.key === "Enter") goToPage(); }} placeholder="Page"
                inputProps={{ "aria-label": "Go to user page", inputMode: "numeric", style: { width: 48 } }} />
              <Button variant="outlined" onClick={goToPage}>Go</Button>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

const CardEntrypoint = ({ appCtxStore }: { appCtxStore: AppContext }) => {
  const card = useAccessPassV2(appCtxStore);
  return (
    <BaseCard baseCardContext={card.baseCardContext} appContext={card.privateContext.appContext} blockedIntro={<Intro />}
      action={<ViewLink href={getEntraUsersUrl()} label="Open Entra users list" />}>
      <CardContentMain {...card} />
    </BaseCard>
  );
};

export default CardEntrypoint;
