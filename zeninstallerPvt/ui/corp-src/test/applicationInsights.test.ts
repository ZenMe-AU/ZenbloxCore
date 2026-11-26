/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@microsoft/applicationinsights-web", () => ({
  ApplicationInsights: class {
    addTelemetryInitializer = mocks.initialize;
    loadAppInsights = mocks.load;
  },
}));
vi.mock("@microsoft/applicationinsights-react-js", () => ({ ReactPlugin: class {} }));
vi.mock("@microsoft/applicationinsights-clickanalytics-js", () => ({
  ClickAnalyticsPlugin: class { identifier = "click"; },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

it("does not print telemetry envelopes by default but still enriches them", async () => {
  vi.stubEnv("VITE_APPINSIGHTS_CONNECTION_STRING", "");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const { initMonitor } = await import("../monitor/applicationInsights");
  expect(initMonitor({ page: "corp", connectionString: "test" })).toBe(true);
  const envelope = { tags: {}, baseData: { properties: {} } };
  mocks.initialize.mock.calls[0][0](envelope);
  expect(envelope.tags).toMatchObject({ "ai.cloud.role": "ZenInstallerFrontend", "ai.cloud.roleInstance": "corp" });
  expect(envelope.baseData.properties).toEqual({ appPage: "corp" });
  expect(mocks.load).toHaveBeenCalledOnce();
  expect(log).not.toHaveBeenCalled();
});

it("can explicitly enable telemetry envelope logging", async () => {
  vi.stubEnv("VITE_APPINSIGHTS_CONNECTION_STRING", "");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  const { initMonitor } = await import("../monitor/applicationInsights");
  expect(initMonitor({ page: "corp", connectionString: "test", debug: true })).toBe(true);
  const envelope = { tags: {}, baseData: { properties: {} } };
  mocks.initialize.mock.calls[0][0](envelope);
  expect(log).toHaveBeenCalledWith("[monitor]", envelope);
});
