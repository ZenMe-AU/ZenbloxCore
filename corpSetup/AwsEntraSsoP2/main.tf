// roles needed:
// AppRoleAssignment.ReadWrite.All
// Policy.ReadWrite.ApplicationConfiguration

data "azuread_application" "aws_sso_corp" {
  display_name = var.app_name
}

data "azuread_service_principal" "aws_sso_corp" {
  client_id = data.azuread_application.aws_sso_corp.client_id
}

locals {
  # App-specific federation metadata endpoint for the AWS Single-Account Access app.
  aws_sso_federation_metadata_url = format(
    "https://login.microsoftonline.com/%s/federationmetadata/2007-06/federationmetadata.xml?appid=%s",
    var.tenant_id,
    data.azuread_service_principal.aws_sso_corp.client_id
  )
  # federation_metadata_path = "${path.module}/federationmetadata.xml"
}

data "http" "entra_federation_metadata" {
  url = local.aws_sso_federation_metadata_url
  request_headers = {
    Accept = "application/xml"
  }
}

resource "aws_iam_saml_provider" "entra" {
  name                   = var.identity_provider_name
  saml_metadata_document = data.http.entra_federation_metadata.response_body

  lifecycle {
    # Ignore changes to the SAML metadata document, manually update if needed
    ignore_changes = [saml_metadata_document]
  }
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithSAML"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_saml_provider.entra.arn]
    }
    # condition to ensure the role is only assumable in the context of AWS SSO
    condition {
      test     = "StringEquals"
      variable = "SAML:aud"
      values   = ["https://signin.aws.amazon.com/saml"]
    }
  }
}

resource "aws_iam_role" "entra_id_admin_access" {
  name               = var.role_name
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

resource "aws_iam_role_policy_attachment" "entra_id_admin_access" {
  role       = aws_iam_role.entra_id_admin_access.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "aws_iam_role" "entra_id_read_only_access" {
  name               = var.role_ro_name
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

resource "aws_iam_role_policy_attachment" "entra_id_read_only_access" {
  role       = aws_iam_role.entra_id_read_only_access.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}
