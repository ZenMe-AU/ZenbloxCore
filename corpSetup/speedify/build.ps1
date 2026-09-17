if ($env:AZURE_CLIENT_SECRET) { "AZURE_CLIENT_SECRET is set (length: $($env:AZURE_CLIENT_SECRET.Length))" } else { "AZURE_CLIENT_SECRET is NOT set in this session" }; if ([Environment]::GetEnvironmentVariable('AZURE_CLIENT_SECRET','User')) { "AZURE_CLIENT_SECRET is set persistently (user env)" } else { "AZURE_CLIENT_SECRET is NOT set persistently (user env)" }


"use_azure_cli_auth": true
client_secret = var.azure_client_secret


packer build speedify.json
packer validate speedify.json; packer validate speedify-image.pkr.hcl
packer inspect speedify-image.pkr.hcl
packer build speedify-image.pkr.hcl

az group list --query "[?starts_with(name,'pkr')].name" -o tsv; if (-not $?) { "no leftover packer resource groups" }
az group show -n speedify2 --query "{name:name, location:location}" -o json
az image list -g speedify2 --query "[].{name:name, state:provisioningState, location:location}" -o table
az image show --resource-group speedify2 --name speedify-golden-1789585828 --query "{name:name, location:location, resourceGroup:resourceGroup, provisioningState:provisioningState, id:id}" -o json

az vm create --resource-group speedify2 --name speedifyVM2 --image speedify-golden-1789585828 --admin-username azureuser --generate-ssh-keys --size Standard_B1ms

terraform apply -var="custom_image_id=/subscriptions/51d0ca21-eaa5-4d34-aeb3-fa9f7d454b5d/resourceGroups/speedify2/providers/Microsoft.Compute/images/speedify-golden-1789585828"

ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 azureuser@74.235.64.1 "hostname && lsb_release -ds"