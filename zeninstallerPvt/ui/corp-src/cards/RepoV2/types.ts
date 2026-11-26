export type GithubUser = { login: string };

export type GithubAccount = {
  login: string;
  type: "User" | "Organization";
  id: number;
  htmlUrl: string; // The account's page on GitHub.
};

export type GithubRepository = {
  id: number;
  name: string;
};

export type GithubRepositoryOption = {
  id: number | string;
  name: string;
  htmlUrl: string; // The repository's page on GitHub; for a new one, where it will be once cloned.
  isNew?: boolean;
};

export type GithubBranch = {
  name: string;
  commit: string;
  protected: boolean;
};

export type GithubEnvironment = {
  name: string;
  id: number;
  settingsUrl: string; // The environment's settings page on GitHub.
};

export type RepoStatus = "idle" | "loading" | "complete" | "warning" | "error";
