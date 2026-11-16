/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from "vitest";
import { entraLicenceFromPlans } from "../api/azureGraph";

const P1 = "41781fb2-bc02-4b7c-bd55-b576c07bb09d";
const P2 = "eec0eb4f-6444-4f95-aba0-50c24d67f998";
const plan = (servicePlanId: string, capabilityStatus = "Enabled") => ({ servicePlanId, capabilityStatus });

describe("entraLicenceFromPlans", () => {
  it("picks the highest active Entra ID plan", () => {
    expect(entraLicenceFromPlans([])).toBe("none");
    expect(entraLicenceFromPlans([plan(P1)])).toBe("p1");
    expect(entraLicenceFromPlans([plan(P1), plan(P2)])).toBe("p2");
    expect(entraLicenceFromPlans([plan(P1, "Warning")])).toBe("p1");
    expect(entraLicenceFromPlans([plan(P1, "Suspended"), plan(P2, "Deleted")])).toBe("none");
  });
});
