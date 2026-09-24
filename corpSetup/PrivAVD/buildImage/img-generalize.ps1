#requires -RunAsAdministrator
# Waits for the Azure guest agents to come up, then syspreps the VM so
# Packer can capture it as a generalized managed image. Only meaningful
# on an Azure VM; running elsewhere will hang on the agent wait loops.

while ((Get-Service RdAgent -ErrorAction SilentlyContinue).Status -ne 'Running') { Start-Sleep -s 5 }
while ((Get-Service WindowsAzureGuestAgent -ErrorAction SilentlyContinue).Status -ne 'Running') { Start-Sleep -s 5 }

& $env:SystemRoot\System32\Sysprep\Sysprep.exe /oobe /generalize /quiet /quit /mode:vm

while ($true) {
    $imageState = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Setup\State').ImageState
    if ($imageState -eq 'IMAGE_STATE_GENERALIZE_RESEAL_TO_OOBE') { break }
    Start-Sleep -s 5
}