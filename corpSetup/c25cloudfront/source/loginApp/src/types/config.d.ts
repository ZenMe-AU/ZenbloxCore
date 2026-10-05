/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export {};

declare global {
  interface Window {
    __APP_CONFIG__?: {
      tenantId: string;
      clientId: string;
      redirectUri: string;
      domainName: string;
    };
  }
}
