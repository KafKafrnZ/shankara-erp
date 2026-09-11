# Creates two named steward accounts (IT head + Dante) via the app's own API,
# using the existing seed steward login to authenticate. Writes the new
# credentials ONLY to a local file (never to console/transcript), then locks
# that file down to the Admin user only, matching backend\.env's ACL model.

$ErrorActionPreference = 'Stop'
$Root = 'E:\shankara-erp'
# This process's cert validation only - the CA is Caddy's own internal root, already
# trusted for this exact host; bypass here just sidesteps a .NET Framework store-lookup quirk.
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
$Base = 'https://erp.shankara.local/api'   # must be https: login cookie is Secure-flagged in production

function New-StrongPassword {
  $bytes = New-Object byte[] 24
  $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return [Convert]::ToBase64String($bytes) -replace '[/+=]', (Get-Random -InputObject @('x','y','z','Q','7'))
}

$envLines = Get-Content "$Root\backend\.env"
$seedPwLine = $envLines | Where-Object { $_ -match '^SEED_STEWARD_PASSWORD=' }
$seedPassword = ($seedPwLine -split '=', 2)[1]

$session = $null
$loginBody = @{ email = 'steward@shankara.local'; password = $seedPassword } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$Base/auth/login" -Method Post -Body $loginBody -ContentType 'application/json' -SessionVariable session -ErrorAction Stop

$accounts = @(
  @{ email = 'it-head@shankara.local'; displayName = 'IT Head'; role = 'steward' },
  @{ email = 'dantebelieber.jb@gmail.com'; displayName = 'Dante'; role = 'steward' }
)

$results = @()
foreach ($acct in $accounts) {
  $pw = New-StrongPassword
  $body = @{ email = $acct.email; displayName = $acct.displayName; role = $acct.role; password = $pw } | ConvertTo-Json
  try {
    $resp = Invoke-RestMethod -Uri "$Base/users" -Method Post -Body $body -ContentType 'application/json' -WebSession $session -ErrorAction Stop
    $results += [PSCustomObject]@{ Email = $acct.email; DisplayName = $acct.displayName; Role = $acct.role; Password = $pw; Status = 'created' }
  } catch {
    $results += [PSCustomObject]@{ Email = $acct.email; DisplayName = $acct.displayName; Role = $acct.role; Password = $pw; Status = "FAILED: $($_.Exception.Message)" }
  }
}

# Verify each by logging in fresh with the new credentials.
foreach ($r in $results) {
  if ($r.Status -eq 'created') {
    try {
      $vBody = @{ email = $r.Email; password = $r.Password } | ConvertTo-Json
      $null = Invoke-RestMethod -Uri "$Base/auth/login" -Method Post -Body $vBody -ContentType 'application/json' -SessionVariable vSess -ErrorAction Stop
      $r.Status = 'created+verified'
    } catch {
      $r.Status = "created but login-verify FAILED: $($_.Exception.Message)"
    }
  }
}

$outFile = 'C:\Users\Admin\Desktop\STEWARD-ACCOUNTS-HANDOFF.txt'
$lines = @(
  "Shankara ERP - new named steward accounts"
  "Created: $(Get-Date -Format o)"
  "URL: https://erp.shankara.local"
  ""
  "Keep this file OFFLINE / hand credentials over via a secure channel (not email/chat in plaintext)."
  "This file is restricted to the Admin Windows account only (icacls)."
  ""
)
foreach ($r in $results) {
  $lines += "Display name: $($r.DisplayName)"
  $lines += "Email:        $($r.Email)"
  $lines += "Role:         $($r.Role)"
  $lines += "Password:     $($r.Password)"
  $lines += "Status:       $($r.Status)"
  $lines += ""
}
$lines += "The original steward@shankara.local / SEED_STEWARD_PASSWORD login still works too."
$lines += "Consider retiring the shared seed logins once both named accounts are confirmed working day-to-day."

Set-Content -Path $outFile -Value $lines -Encoding UTF8
icacls $outFile /inheritance:r | Out-Null
icacls $outFile /grant:r "SBPL-HO-PC-0051\Admin:(F)" | Out-Null

Write-Host "Done. Results (no secrets shown here):"
$results | Select-Object Email, DisplayName, Role, Status | Format-Table -AutoSize
Write-Host "Credentials written to: $outFile (Admin-only access)"
