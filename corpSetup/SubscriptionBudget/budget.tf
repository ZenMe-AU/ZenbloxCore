#This script creates a budget for the subscription to ensure that costs are monitored and controlled.
output "new_subscription_id" {
  value = var.subscription_id
}

# Add a $100 monthly limit to the subscription
resource "azurerm_consumption_budget_subscription" "payg_budget" {
  name            = "monthly-budget"
  amount          = 100
  subscription_id = "/subscriptions/${var.subscription_id}"

  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", timestamp())
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "EqualTo"
    contact_emails = split(",", var.contact_emails)
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}
