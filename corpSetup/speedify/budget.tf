resource "azurerm_consumption_budget_subscription" "speedify_monthly" {
  name            = "speedify-monthly-budget"
  amount          = 100
  subscription_id = "/subscriptions/${var.subscription_id}"

  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", timestamp())
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "EqualTo"
    contact_emails = [for email in split(",", var.contact_emails) : trimspace(email)]
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}