output "new_subscription_id" {
  value = var.subscription_id
}

variable "speedify_resource_group" {
  description = "Resource group that receives the VM, the gallery and the image (corp.env: SPEEDIFY_RESOURCE_GROUP)"
  type        = string
}

variable "location" {
  description = "Azure region where the VM is created (corp.env: SPEEDIFY_LOCATION)"
  type        = string
}

# Resolve the latest published version of the Packer-built gallery image.
# The gallery lives in the image RG, which is also the VM RG.
# Naming comes from corp.env via TF_VAR_* (see README "Deploy" section).
data "azurerm_shared_image" "custom_image" {
  name                = var.image_name
  gallery_name        = var.gallery_name
  resource_group_name = var.speedify_resource_group
}

resource "azurerm_resource_group" "speedify_rg" {
  name     = var.speedify_resource_group
  location = var.location
}

resource "azurerm_virtual_network" "speedify" {
  name                = "speedify-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.speedify_rg.location
  resource_group_name = azurerm_resource_group.speedify_rg.name
}

resource "azurerm_subnet" "speedify" {
  name                 = "speedify-subnet"
  resource_group_name  = azurerm_resource_group.speedify_rg.name
  virtual_network_name = azurerm_virtual_network.speedify.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_public_ip" "speedify" {
  name                = "speedify-public-ip"
  location            = azurerm_resource_group.speedify_rg.location
  resource_group_name = azurerm_resource_group.speedify_rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_security_group" "speedify" {
  name                = "speedify-nsg"
  location            = azurerm_resource_group.speedify_rg.location
  resource_group_name = azurerm_resource_group.speedify_rg.name

  security_rule {
    name                       = "speedify-api"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-ssh"
    priority                   = 130
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }



  security_rule {
    name                       = "speedify-session-tcp"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "32768-65535"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "speedify-session-udp"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Udp"
    source_port_range          = "*"
    destination_port_range     = "32768-65535"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_network_interface" "speedify" {
  name                = "speedify-vm-nic"
  location            = azurerm_resource_group.speedify_rg.location
  resource_group_name = azurerm_resource_group.speedify_rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.speedify.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.speedify.id
  }

}

resource "azurerm_network_interface_security_group_association" "speedify" {
  network_interface_id      = azurerm_network_interface.speedify.id
  network_security_group_id = azurerm_network_security_group.speedify.id
}

resource "azurerm_linux_virtual_machine" "speedify" {
  name                = "speedifyVM"
  resource_group_name = azurerm_resource_group.speedify_rg.name
  location            = azurerm_resource_group.speedify_rg.location
  size                = "Standard_B1ms"
  admin_username      = "azureuser"
  network_interface_ids = [
    azurerm_network_interface.speedify.id,
  ]

  disable_password_authentication = false
  admin_password                  = var.admin_password

  lifecycle {
    ignore_changes = [admin_password]
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  # Boot from the Packer-built gallery image (zenblox/speedify). All Speedify
  # software is pre-baked - Terraform performs ZERO runtime installation.
  source_image_id = data.azurerm_shared_image.custom_image.id

  # NO Custom Script Extension, NO runtime installs. The Packer image already
  # contains Docker, docker compose v2, docker-compose.yml, a default .env and
  # the pulled speedify/ss-manager image. cloud-init only stamps this VM's
  # public IP into .env (compose interpolation) and starts the stack.
  custom_data = base64encode(<<-CLOUDINIT
    #!/bin/bash
    set -eu
    cd /opt/speedify-server

    # Wait for the docker daemon (systemd starts it on first boot)
    for i in $(seq 1 30); do
      docker info >/dev/null 2>&1 && break
      sleep 2
    done
    docker info >/dev/null 2>&1

    # Stamp this VM's public IP into .env so compose interpolation resolves it
    if command -v curl >/dev/null 2>&1; then
      VM_IP=$(curl -s -f -H 'Metadata:true' 'http://169.254.169.254/metadata/instance/compute/publicIpAddress?api-version=2021-02-01&format=text' || true)
      if [ -n "$VM_IP" ]; then
        sed -i "s/^PUBLIC_IP=.*/PUBLIC_IP=$VM_IP/" .env
      fi
    fi

    docker compose up -d
  CLOUDINIT
  )
}

output "speedify_public_ip" {
  description = "Public IP used by Speedify clients"
  value       = azurerm_public_ip.speedify.ip_address
}

