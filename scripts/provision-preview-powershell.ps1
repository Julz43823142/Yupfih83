# Run from the repository root in Windows PowerShell.
# This script never prints or writes the password or preview secret.
$ErrorActionPreference = 'Stop'
$previousPassword = [Environment]::GetEnvironmentVariable('ELO_PROVISION_PASSWORD', 'Process')
$previousSecret = [Environment]::GetEnvironmentVariable('ELO_PROVISION_SECRET', 'Process')
$passwordSecure = $null
$secretSecure = $null
$passwordPtr = [IntPtr]::Zero
$secretPtr = [IntPtr]::Zero
try {
  $passwordSecure = Read-Host 'New UNIQUE test password (hidden)' -AsSecureString
  $secretSecure = Read-Host 'Existing Preview BETTER_AUTH_SECRET (hidden)' -AsSecureString
  $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
  $secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretSecure)
  $env:ELO_PROVISION_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
  $env:ELO_PROVISION_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)
  if ($env:ELO_PROVISION_PASSWORD.Length -lt 15 -or $env:ELO_PROVISION_SECRET.Length -lt 32) {
    throw 'Password or Preview secret is too short. Nothing was exported.'
  }
  & node .\scripts\provision-auth-user.mjs --export-sql --output preview-test-account.sql
  if ($LASTEXITCODE -ne 0) { throw 'Provisioning failed; no SQL was imported into Cloudflare.' }
} finally {
  [Environment]::SetEnvironmentVariable('ELO_PROVISION_PASSWORD', $previousPassword, 'Process')
  [Environment]::SetEnvironmentVariable('ELO_PROVISION_SECRET', $previousSecret, 'Process')
  if ($passwordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr) }
  if ($secretPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr) }
  if ($passwordSecure) { $passwordSecure.Dispose() }
  if ($secretSecure) { $secretSecure.Dispose() }
}
