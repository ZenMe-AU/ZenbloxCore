const DOCS_BASE = "/docs";

export const CLOUD_DOCS = {
  azure: {
    createAccount: `${DOCS_BASE}/Creating_AZURE_account`,
    setupOidc:     `${DOCS_BASE}/Set_up_GitHub_oidc_for_AZURE`,
  },
  aws: {
    createAccount:        `${DOCS_BASE}/Creating_AWS_account`,
    setupOidc:            `${DOCS_BASE}/Set_up_GitHub_oidc_for_AWS`,
    bootstrapCredentials: `${DOCS_BASE}/Create_AWS_bootstrap_credentials`,
  },
} as const;
