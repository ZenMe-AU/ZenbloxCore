export type GithubUser = { login: string };

export type GithubAccount = {
  login: string;
  type: "User" | "Organization";
  id: number;
};

export type GithubRepository = {
  id: number;
  name: string;
};

export type GithubRepositoryOption = {
  id: number | string;
  name: string;
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
  url: string;
};

export type RepoStatus = "idle" | "loading" | "complete" | "warning" | "error";
