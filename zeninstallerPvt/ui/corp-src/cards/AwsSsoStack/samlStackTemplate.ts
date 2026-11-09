/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { AWS_SSO_APP_NAME, GITHUB_OIDC_THUMBPRINTS, GITHUB_OIDC_URL, awsConsoleRoleName, awsSamlProviderName } from "../../config/awsConfig";
import { AWS_SSO_STACK_TITLE, GITHUB_ROLE_NAME, GITHUB_ROLE_OUTPUT } from "./config";

const consoleRole = (logicalId: string, roleName: string, policy: string) => `
  ${logicalId}:
    Type: AWS::IAM::Role
    Properties:
      RoleName: ${roleName}
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal: { Federated: !Ref EntraSamlProvider }
            Action: sts:AssumeRoleWithSAML
            Condition:
              StringEquals: { "SAML:aud": "https://signin.aws.amazon.com/saml" }
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/${policy}
`;

const OIDC_HOST = GITHUB_OIDC_URL.replace("https://", "");

// What AWS setup did from the page: the GitHub OIDC provider and the shared role, created if missing, else this repo is added to the role's trust.
const GITHUB_ROLE_FUNCTION = `import json
import boto3
import cfnresponse

HOST = "${OIDC_HOST}"
SUB = HOST + ":sub"
THUMBPRINTS = ${JSON.stringify(GITHUB_OIDC_THUMBPRINTS)}
iam = boto3.client("iam")


def ensure_provider(account):
    arn = "arn:aws:iam::" + account + ":oidc-provider/" + HOST
    try:
        iam.get_open_id_connect_provider(OpenIDConnectProviderArn=arn)
    except iam.exceptions.NoSuchEntityException:
        iam.create_open_id_connect_provider(Url="https://" + HOST, ClientIDList=["sts.amazonaws.com"], ThumbprintList=THUMBPRINTS)
    return arn


def ensure_role(name, provider, subjects):
    statement = {
        "Effect": "Allow",
        "Principal": {"Federated": provider},
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {"StringEquals": {HOST + ":aud": "sts.amazonaws.com"}, "StringLike": {SUB: subjects}},
    }
    try:
        role = iam.get_role(RoleName=name)["Role"]
    except iam.exceptions.NoSuchEntityException:
        policy = {"Version": "2012-10-17", "Statement": [statement]}
        return iam.create_role(RoleName=name, AssumeRolePolicyDocument=json.dumps(policy), Description="GitHub Actions OIDC role")["Role"]["Arn"]
    policy = role["AssumeRolePolicyDocument"]
    statements = policy["Statement"] if isinstance(policy["Statement"], list) else [policy["Statement"]]
    github = next((s for s in statements if SUB in s.get("Condition", {}).get("StringLike", {})), None)
    if github is None:
        statements.append(statement)
    else:
        current = github["Condition"]["StringLike"][SUB]
        github["Condition"]["StringLike"][SUB] = sorted(set([current] if isinstance(current, str) else current) | set(subjects))
    policy["Statement"] = statements
    iam.update_assume_role_policy(RoleName=name, PolicyDocument=json.dumps(policy))
    return role["Arn"]


def handler(event, context):
    props = event["ResourceProperties"]
    try:
        # Other repos may use the role, so deleting the stack leaves it.
        if event["RequestType"] == "Delete":
            return cfnresponse.send(event, context, cfnresponse.SUCCESS, {}, props["RoleName"])
        account = context.invoked_function_arn.split(":")[4]
        arn = ensure_role(props["RoleName"], ensure_provider(account), props["Subjects"])
        iam.attach_role_policy(RoleName=props["RoleName"], PolicyArn="arn:aws:iam::aws:policy/ReadOnlyAccess")
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {"Arn": arn}, props["RoleName"])
    except Exception as err:
        cfnresponse.send(event, context, cfnresponse.FAILED, {}, props["RoleName"], reason=str(err))
`;

const indent = (text: string, spaces: number) =>
  text
    .split("\n")
    .map((line) => (line ? " ".repeat(spaces) + line : line))
    .join("\n");

const githubResources = (subjects: string[]) => `
  # The Lambda may only touch the GitHub OIDC provider and ${GITHUB_ROLE_NAME}, and only attach ReadOnlyAccess.
  GitHubRoleFunctionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal: { Service: lambda.amazonaws.com }
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: ${GITHUB_ROLE_NAME}
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action: ["iam:GetOpenIDConnectProvider", "iam:CreateOpenIDConnectProvider"]
                Resource: !Sub "arn:aws:iam::\${AWS::AccountId}:oidc-provider/${OIDC_HOST}"
              - Effect: Allow
                Action: ["iam:GetRole", "iam:CreateRole", "iam:UpdateAssumeRolePolicy"]
                Resource: !Sub "arn:aws:iam::\${AWS::AccountId}:role/${GITHUB_ROLE_NAME}"
              - Effect: Allow
                Action: iam:AttachRolePolicy
                Resource: !Sub "arn:aws:iam::\${AWS::AccountId}:role/${GITHUB_ROLE_NAME}"
                Condition:
                  ArnEquals: { "iam:PolicyARN": "arn:aws:iam::aws:policy/ReadOnlyAccess" }

  GitHubRoleFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: python3.12
      Handler: index.handler
      Timeout: 60
      Role: !GetAtt GitHubRoleFunctionRole.Arn
      Code:
        ZipFile: |
${indent(GITHUB_ROLE_FUNCTION, 10)}
  # GitHub Actions in this repo's environments get read-only AWS access through ${GITHUB_ROLE_NAME}.
  GitHubRole:
    Type: Custom::GitHubRole
    Properties:
      ServiceToken: !GetAtt GitHubRoleFunction.Arn
      RoleName: ${GITHUB_ROLE_NAME}
      Subjects: ${JSON.stringify(subjects)}

Outputs:
  ${GITHUB_ROLE_OUTPUT}:
    Description: Save as AWS_ROLE_ARN in ZenInstaller's ${AWS_SSO_STACK_TITLE} step.
    Value: !GetAtt GitHubRole.Arn
`;

// The AWS side of console sign-in and of GitHub Actions, with the tenant, certificate and repo's OIDC subjects written in.
export function samlStackTemplate(tenantId: string, certificate: string, githubSubjects: string[]): string {
  return `AWSTemplateFormatVersion: "2010-09-09"
Description: AWS console sign-in for the Microsoft Entra tenant ${tenantId} through its ${AWS_SSO_APP_NAME} app, and read-only AWS access for the repo's GitHub Actions.

Resources:
  # AWS trusts SAML sign-ins that Entra signs with the app's certificate.
  EntraSamlProvider:
    Type: AWS::IAM::SAMLProvider
    Properties:
      Name: ${awsSamlProviderName(tenantId)}
      # Minimal Entra federation metadata: issuer, signing certificate and sign-in URL.
      SamlMetadataDocument: |
        <?xml version="1.0" encoding="utf-8"?>
        <EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sts.windows.net/${tenantId}/">
          <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
            <KeyDescriptor use="signing">
              <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
                <X509Data>
                  <X509Certificate>${certificate}</X509Certificate>
                </X509Data>
              </KeyInfo>
            </KeyDescriptor>
            <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://login.microsoftonline.com/${tenantId}/saml2"/>
          </IDPSSODescriptor>
        </EntityDescriptor>
${consoleRole("ConsoleAdminRole", awsConsoleRoleName(tenantId, "admin"), "AdministratorAccess")}${consoleRole("ConsoleReadOnlyRole", awsConsoleRoleName(tenantId, "readonly"), "ReadOnlyAccess")}${githubResources(githubSubjects)}`;
}
