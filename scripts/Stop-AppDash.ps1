$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$listenPort = if ($env:APPDASH_PORT) { $env:APPDASH_PORT } else { '4175' }
$baseUrl = "http://127.0.0.1:$listenPort"
try {
    $validatedPort = 0
    if (-not [int]::TryParse($listenPort, [ref]$validatedPort) -or $validatedPort -lt 1 -or $validatedPort -gt 65535) { throw 'APPDASH_PORT must be an integer between 1 and 65535.' }
    $baseUrl = "http://127.0.0.1:$validatedPort"
    $ready = Invoke-RestMethod "$baseUrl/api/ready" -TimeoutSec 3
    if ($ready.product -ne 'AppDash' -or $ready.root -ne $installRoot) { throw 'This port does not belong to this AppDash installation.' }
    $state = Invoke-RestMethod "$baseUrl/api/state" -TimeoutSec 3
    Invoke-RestMethod "$baseUrl/api/shutdown" -Method Post -Headers @{ 'X-AppDash-Session'=$state.session } -ContentType 'application/json' -Body '{}' | Out-Null
    for ($wait=0; $wait -lt 120; $wait++) {
        Start-Sleep -Milliseconds 250
        try { $null = Invoke-RestMethod "$baseUrl/api/ready" -TimeoutSec 1 } catch { Write-Host 'AppDash and its owned apps stopped.'; exit 0 }
    }
    throw 'Shutdown is still in progress. Check running apps and logs; no unrelated process was terminated.'
} catch { Write-Host "AppDash: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
