/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { EditNote as EditNoteIcon, EmojiEvents as EmojiEventsIcon, Shield as ShieldIcon } from "@mui/icons-material";
import { Grid, Typography } from "@mui/material";
import { Helmet } from "react-helmet";
import QuestTierCard from "../components/QuestTierCard";

const questTiers = [
  {
    title: "Access Pass",
    description: "Manage access control and permissions for your applications.",
    tierLabel: "Access Pass",
    tierColor: "#ff9800",
    icon: <ShieldIcon />,
    updatedAgo: "Updated 1d ago",
    href: "/accessPass",
  },
];

// export async function clientLoader() {
// }

export default function HomePage() {
  return (
    <>
      <Helmet>
        <title>Portal - Home</title>
      </Helmet>

      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Welcome to the Portal
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Select a quest tier module to get started, or browse all available modules below.
      </Typography>

      <Grid container spacing={3}>
        {questTiers.map((tier) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={tier.href}>
            <QuestTierCard {...tier} />
          </Grid>
        ))}
      </Grid>
    </>
  );
}
