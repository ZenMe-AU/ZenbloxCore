/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/* 
 * This is the Prototype card that is a template for how all cards in this workspace should be designed.
 * This card will provide documentation to guide an AI on developing new cards according to the standards.
 */


import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import Card from "../../components/Card";
import ViewLink from "../../components/ViewLink";
import type { CardChrome } from "../../types";
import type { CardStatus } from "../../types";
import type { UseProtoCard } from "./useProtoCard";

type Props = {
  card: CardChrome;
  protoCard: UseProtoCard;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary">
      Intro for this card.
    </Typography>
  );
}

function Action() {
  return <ViewLink href={"http://localhost"} label={"Open External Site"} />;
}

export default function ProtoCard({ card, protoCard }: Props) {
  return (
    <Card title="Title of the card" action={<Action />} lockedIntro={<Intro />} {...card}>
      <Box>
        <Box sx={{ mb: 2 }}>
          <Intro />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography color="text.muted" sx={{ mb: 1 }}>
            Select the button below to set card status:
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button size="small" variant="contained" color="primary" onClick={() => { protoCard.setCardStatus("idle"); }}>
              "idle"
            </Button>
            <Button size="small" variant="contained" color="primary" onClick={() => { protoCard.setCardStatus("loading"); }}>
              "loading"
            </Button>
            <Button size="small" variant="contained" color="primary" onClick={() => { protoCard.setCardStatus("complete"); }}>
              "complete"
            </Button>
            <Button size="small" variant="contained" color="primary" onClick={() => { protoCard.setCardStatus("warning"); }}>
              "warning"
            </Button>
            <Button size="small" variant="contained" color="primary" onClick={() => { protoCard.setCardStatus("error"); }}>
              "error"
            </Button>
            <Button size="small" variant="contained" color="primary" onClick={() => { protoCard.setCardStatus("skipped"); }}>
              "skipped"
            </Button>
            <Button size="small" variant="contained" color="primary" onClick={() => { protoCard.setCardStatus("unavailable"); }}>
              "unavailable"
            </Button>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography color="text.muted" sx={{ mb: 1 }}>
            Select the button below to set the card Locked:
          </Typography>
          <Button size="small" variant="contained" color="primary" onClick={() => { protoCard.setCardStatus("locked"); }}>
            "locked"
          </Button>
        </Box>
      </Box>
    </Card>
  );
}
