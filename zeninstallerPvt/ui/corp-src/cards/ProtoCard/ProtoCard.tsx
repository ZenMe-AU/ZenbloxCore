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

type Props = {
  card: CardChrome;
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

export default function ProtoCard({ card }: Props) {
  return (
    <Card title="Title of the card" action={<Action />} lockedIntro={<Intro />} {...card}>
      <Box>
        <Box sx={{ mb: 2 }}>
          <Intro />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography color="text.muted" sx={{ mb: 1 }}>
            This will do something.{" "}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          color="error"
        >
          Do Something
        </Button>
      </Box>
    </Card>
  );
}
