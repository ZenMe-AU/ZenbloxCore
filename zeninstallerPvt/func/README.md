
This function app is used by the zeninstaller to obtain a github api secret and to proxy all commands through to the github api.

This function uses Azure easy auth that obtains an access token from github and attaches it to the headers as "x-ms-token-github-access-token"

For Development purposes easy auth is not available and the github API token must be manually entered into the local.settings.json

# Quick start

1. To start the backend, in the terminal run:
`func start`

2. Login to github.
Go to your personal settings > Develoer Settings > Personal Access Tokens > Fine-grained personal access tokens
Generate a new token and call it zeninstallerLocal or similar.
