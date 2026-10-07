$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDirectory "..\.env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Environment file was not found: $envFile"
}

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    throw "terraform was not found on PATH. Install Terraform before running this script."
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI (az) was not found on PATH. Install it and sign in before running this script."
}

function Get-Setting {
    param(
        [Parameter(Mandatory)] [string] $Name,
        [string] $Default
    )

    $value = [Environment]::GetEnvironmentVariable("TF_VAR_$Name", "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $Default
    }
    return $value
}

function Test-AzureResource {
    param([Parameter(Mandatory)] [string] $Id)

    $null = az resource show --ids $Id --query id --output tsv 2>$null
    return $LASTEXITCODE -eq 0
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
        return
    }

    $separatorIndex = $line.IndexOf('=')
    if ($separatorIndex -lt 1) {
        return
    }

    $name = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim('"', "'")
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

$hostPoolName = Get-Setting "HOST_POOL_NAME"
if ([string]::IsNullOrWhiteSpace($hostPoolName)) {
    throw "Required PAW setting 'TF_VAR_HOST_POOL_NAME' is missing from $envFile."
}
$targetResourceGroup = "$hostPoolName-rg"

$subscriptionId = Get-Setting "SUBSCRIPTION_ID"
if ([string]::IsNullOrWhiteSpace($subscriptionId)) {
    throw "Required PAW setting 'TF_VAR_SUBSCRIPTION_ID' is missing from $envFile."
}

$galleryResourceGroup = Get-Setting "GALLERY_RG" "paw-gallery"
$imageName = Get-Setting "IMAGE_NAME" "PrivilegedWorkstation"
$latestImageVersion = az sig image-version list `
    --subscription $subscriptionId `
    --resource-group $galleryResourceGroup `
    --gallery-name $galleryResourceGroup `
    --gallery-image-definition $imageName `
    --query "sort_by([], &publishingProfile.publishedDate)[-1].name" `
    --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($latestImageVersion)) {
    throw "Unable to resolve a published image version from the PAW gallery settings in $envFile."
}
[Environment]::SetEnvironmentVariable("TF_VAR_IMAGE_VERSION", $latestImageVersion, "Process")

$pawLoginGroupName = Get-Setting "PAW_GROUP" "PAW_GROUP_DEFAULT"
$workspaceName = Get-Setting "WORKSPACE_NAME" "WORKSPACE_NAME_DEFAULT"
$applicationGroupName = Get-Setting "APPLICATION_GROUP_NAME" "APPLICATION_GROUP_NAME_DEFAULT"

Push-Location $scriptDirectory
try {
    terraform init -input=false
    if ($LASTEXITCODE -ne 0) {
        throw "terraform init failed with exit code $LASTEXITCODE."
    }

    terraform workspace select $targetResourceGroup
    if ($LASTEXITCODE -ne 0) {
        terraform workspace new $targetResourceGroup
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to select or create Terraform workspace '$targetResourceGroup'."
        }
    }

    $resourceGroupExists = az group exists --subscription $subscriptionId --name $targetResourceGroup
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to check Azure resource group '$targetResourceGroup'. Confirm Azure CLI login and subscription access."
    }
    if ($resourceGroupExists -ne "true") {
        Write-Host "Resource group '$targetResourceGroup' does not exist. Nothing to import."
        return
    }

    $state = @(terraform state list 2>$null)
    $stateAddresses = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $state | ForEach-Object { $null = $stateAddresses.Add($_) }

    $configuredAddresses = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    terraform graph -type=plan | ForEach-Object {
        if ($_ -match 'label = "((?!data\.)[^"\[]+)"') {
            $null = $configuredAddresses.Add($Matches[1])
        }
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to read configured Terraform resource addresses."
    }

    $imports = [System.Collections.Generic.List[hashtable]]::new()
    $stateValues = @{}
    $stateDocument = terraform show -json | ConvertFrom-Json
    foreach ($stateResource in @($stateDocument.values.root_module.resources) | Where-Object { $null -ne $_ -and -not [string]::IsNullOrWhiteSpace($_.address) }) {
        $stateValues[$stateResource.address] = $stateResource.values
    }

    $pawLoginGroupId = $stateValues["data.azuread_group.paw_login"].object_id
    $privilegedAccountsGroupId = $stateValues["azuread_group.privileged_accounts"].object_id
    if (-not $pawLoginGroupId -or -not $privilegedAccountsGroupId) {
        $pawCandidates = @(az ad group list --filter "displayName eq '$pawLoginGroupName'" --output json | ConvertFrom-Json)
        $privilegedCandidates = @(az ad group list --filter "displayName eq 'PrivilegedAccounts'" --output json | ConvertFrom-Json)
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to look up the PAW Entra ID groups. Confirm Azure CLI login and directory read access."
        }

        $linkedPairs = @(
            foreach ($pawCandidate in $pawCandidates) {
                foreach ($privilegedCandidate in $privilegedCandidates) {
                    $pawCandidateId = $pawCandidate.id
                    $privilegedCandidateId = $privilegedCandidate.id
                    $membership = az ad group member check --group $pawCandidateId --member-id $privilegedCandidateId --output json | ConvertFrom-Json
                    if ($LASTEXITCODE -eq 0 -and $membership.value) {
                        @{ Paw = $pawCandidateId; Privileged = $privilegedCandidateId }
                    }
                }
            }
        )

        if (-not $pawLoginGroupId -and $linkedPairs.Count -eq 1) {
            $pawLoginGroupId = $linkedPairs[0].Paw
        }
        if (-not $privilegedAccountsGroupId -and $linkedPairs.Count -eq 1) {
            $privilegedAccountsGroupId = $linkedPairs[0].Privileged
        }
        if (-not $pawLoginGroupId -and $pawCandidates.Count -eq 1) {
            $pawLoginGroupId = $pawCandidates[0].id
        }
        if (-not $privilegedAccountsGroupId -and $privilegedCandidates.Count -eq 1) {
            $privilegedAccountsGroupId = $privilegedCandidates[0].id
        }
        if (-not $pawLoginGroupId -and $pawCandidates.Count -gt 1) {
            throw "Multiple PAW Entra ID groups share the configured display names, and no unique membership pair could be identified. Remove stale duplicates or import the intended groups manually."
        }
    }

    $resourceGroupId = "/subscriptions/$subscriptionId/resourceGroups/$targetResourceGroup"
    $hostPoolId = "$resourceGroupId/providers/Microsoft.DesktopVirtualization/hostPools/$hostPoolName"
    $workspaceId = "$resourceGroupId/providers/Microsoft.DesktopVirtualization/workspaces/$workspaceName"
    $applicationGroupId = "$resourceGroupId/providers/Microsoft.DesktopVirtualization/applicationGroups/$applicationGroupName"
    $scalingPlanId = "$resourceGroupId/providers/Microsoft.DesktopVirtualization/scalingPlans/$hostPoolName-scaling"
    $virtualNetworkId = "$resourceGroupId/providers/Microsoft.Network/virtualNetworks/$hostPoolName-vnet"
    $firewallSubnetId = "$virtualNetworkId/subnets/AzureFirewallSubnet"
    $sessionHostSubnetId = "$virtualNetworkId/subnets/session-hosts"
    $firewallPolicyId = "$resourceGroupId/providers/Microsoft.Network/firewallPolicies/$hostPoolName-firewall-policy"
    $virtualMachineId = "$resourceGroupId/providers/Microsoft.Compute/virtualMachines/$hostPoolName-1"

    $azureResources = @(
        @{ Address = "azurerm_virtual_desktop_host_pool.pooled"; Id = $hostPoolId },
        @{ Address = "azurerm_virtual_desktop_workspace.workspace"; Id = $workspaceId },
        @{ Address = "azurerm_virtual_desktop_application_group.desktop"; Id = $applicationGroupId },
        @{ Address = "azurerm_virtual_desktop_scaling_plan.pooled"; Id = $scalingPlanId },
        @{ Address = "azurerm_virtual_network.avd"; Id = $virtualNetworkId },
        @{ Address = "azurerm_subnet.firewall"; Id = $firewallSubnetId },
        @{ Address = "azurerm_subnet.session_hosts"; Id = $sessionHostSubnetId },
        @{ Address = "azurerm_network_security_group.session_hosts"; Id = "$resourceGroupId/providers/Microsoft.Network/networkSecurityGroups/$hostPoolName-session-hosts-nsg" },
        @{ Address = "azurerm_public_ip.firewall"; Id = "$resourceGroupId/providers/Microsoft.Network/publicIPAddresses/$hostPoolName-firewall-pip" },
        @{ Address = "azurerm_firewall_policy.avd"; Id = $firewallPolicyId },
        @{ Address = "azurerm_firewall.avd"; Id = "$resourceGroupId/providers/Microsoft.Network/azureFirewalls/$hostPoolName-firewall" },
        @{ Address = "azurerm_firewall_policy_rule_collection_group.avd_egress"; Id = "$firewallPolicyId/ruleCollectionGroups/avd-required-egress" },
        @{ Address = "azurerm_route_table.session_hosts"; Id = "$resourceGroupId/providers/Microsoft.Network/routeTables/$hostPoolName-session-hosts-routes" },
        @{ Address = "azurerm_network_interface.session_host[0]"; Id = "$resourceGroupId/providers/Microsoft.Network/networkInterfaces/$hostPoolName-nic-1" },
        @{ Address = "azurerm_windows_virtual_machine.session_host[0]"; Id = $virtualMachineId },
        @{ Address = "azurerm_virtual_machine_extension.entra_login[0]"; Id = "$virtualMachineId/extensions/AADLoginForWindows" },
        @{ Address = "azurerm_virtual_machine_extension.avd_register[0]"; Id = "$virtualMachineId/extensions/avd-registration" }
    )

    $imports.Add(@{ Address = "azurerm_resource_group.avd"; Id = $resourceGroupId })

    foreach ($resource in $azureResources) {
        if (Test-AzureResource $resource.Id) {
            $imports.Add($resource)
        }
    }

    if ((Test-AzureResource $workspaceId) -and (Test-AzureResource $applicationGroupId)) {
        $imports.Add(@{ Address = "azurerm_virtual_desktop_workspace_application_group_association.desktop"; Id = "$workspaceId|$applicationGroupId" })
    }
    if ((Test-AzureResource $scalingPlanId) -and (Test-AzureResource $hostPoolId)) {
        $imports.Add(@{ Address = "azurerm_virtual_desktop_scaling_plan_host_pool_association.pooled"; Id = "$scalingPlanId|$hostPoolId" })
    }

    $sessionSubnet = az resource show --ids $sessionHostSubnetId --output json 2>$null | ConvertFrom-Json
    if ($LASTEXITCODE -eq 0 -and $null -ne $sessionSubnet.properties.networkSecurityGroup) {
        $imports.Add(@{ Address = "azurerm_subnet_network_security_group_association.session_hosts"; Id = $sessionHostSubnetId })
    }
    if ($LASTEXITCODE -eq 0 -and $null -ne $sessionSubnet.properties.routeTable) {
        $imports.Add(@{ Address = "azurerm_subnet_route_table_association.session_hosts"; Id = $sessionHostSubnetId })
    }

    $virtualNetwork = az resource show --ids $virtualNetworkId --output json 2>$null | ConvertFrom-Json
    if ($LASTEXITCODE -eq 0 -and @($virtualNetwork.properties.dhcpOptions.dnsServers).Count -gt 0) {
        $imports.Add(@{ Address = "azurerm_virtual_network_dns_servers.avd"; Id = "$virtualNetworkId/dnsServers/default" })
    }

    if ($pawLoginGroupId) {
        if ($privilegedAccountsGroupId) {
            $membership = az ad group member check --group $pawLoginGroupId --member-id $privilegedAccountsGroupId --output json | ConvertFrom-Json
            if ($LASTEXITCODE -eq 0 -and $membership.value) {
                $imports.Add(@{ Address = "azuread_group_member.paw_login"; Id = "$pawLoginGroupId/member/$privilegedAccountsGroupId" })
            }
        }

        $roleAssignments = @(
            @{ Address = "azurerm_role_assignment.paw_login_desktop"; Scope = $applicationGroupId; Role = "Desktop Virtualization User"; PrincipalId = $pawLoginGroupId },
            @{ Address = "azurerm_role_assignment.paw_login_vm"; Scope = $resourceGroupId; Role = "Virtual Machine User Login"; PrincipalId = $pawLoginGroupId }
        )

        $avdServicePrincipalId = az ad sp list --filter "appId eq '9cdead84-a844-4324-93f2-b2e6bb768d07'" --query "[0].id" --output tsv
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($avdServicePrincipalId)) {
            $roleAssignments += @{ Address = "azurerm_role_assignment.avd_power_management"; Scope = "/subscriptions/$subscriptionId"; Role = "Desktop Virtualization Power On Off Contributor"; PrincipalId = $avdServicePrincipalId }
        }

        foreach ($assignment in $roleAssignments) {
            $assignmentScope = $assignment.Scope
            $assignmentPrincipalId = $assignment.PrincipalId
            $assignmentRole = $assignment.Role
            $existingAssignments = @(az role assignment list --scope $assignmentScope --assignee-object-id $assignmentPrincipalId --role $assignmentRole --output json | ConvertFrom-Json)
            if ($LASTEXITCODE -eq 0 -and $existingAssignments.Count -gt 0) {
                $imports.Add(@{ Address = $assignment.Address; Id = $existingAssignments[0].id })
            }
        }
    }

    foreach ($resource in $imports) {
        $configuredAddress = $resource.Address -replace '\[\d+\]$', ''
        if (-not $configuredAddresses.Contains($configuredAddress)) {
            Write-Host "Not configured: $($resource.Address)"
            continue
        }

        if ($stateAddresses.Contains($resource.Address)) {
            Write-Host "Already managed: $($resource.Address)"
            continue
        }

        Write-Host "Importing $($resource.Address)..."
        terraform import -input=false $resource.Address $resource.Id
        if ($LASTEXITCODE -ne 0) {
            throw "terraform import of $($resource.Address) failed with exit code $LASTEXITCODE."
        }
        $null = $stateAddresses.Add($resource.Address)
    }

    Write-Host "Import complete. Workspace '$targetResourceGroup' manages $($stateAddresses.Count) state object(s)."
}
finally {
    Pop-Location
}
