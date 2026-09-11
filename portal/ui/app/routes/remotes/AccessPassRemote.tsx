/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Suspense, lazy } from "react";

const AccessManagerRoutes = lazy(() => import("accessPassRemote/AppRoutes"));

export default function AccessPassRemote() {
  return (
    <Suspense fallback={<div>Loading accessPass module...</div>}>
      <AccessManagerRoutes />
    </Suspense>
  );
}
