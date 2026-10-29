$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$runtimeDir = if ($env:APPDASH_DATA_DIR) { [IO.Path]::GetFullPath($env:APPDASH_DATA_DIR) } else { Join-Path $installRoot '.runtime' }
$listenPort = if ($env:APPDASH_PORT) { $env:APPDASH_PORT } else { '4175' }
$baseUrl = "http://127.0.0.1:$listenPort"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
function Get-Ready {
    try { return Invoke-RestMethod "$baseUrl/api/ready" -TimeoutSec 2 } catch { return $null }
}
try {
    $ready = Get-Ready
    for ($wait=0; $ready -and -not $ready.ready -and $wait -lt 80; $wait++) {
        Start-Sleep -Milliseconds 250
        $ready = Get-Ready
    }
    if ($ready) {
        if ($ready.product -ne 'AppDash' -or $ready.root -ne $installRoot) { throw 'This port belongs to another installation. Set APPDASH_PORT.' }
        if (-not $ready.ready) { throw 'AppDash is still shutting down. Retry after shutdown completes.' }
        Start-Process $baseUrl
        exit 0
    }
    $nodePath = $null
    $installed = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($installed) {
        $nodeVersion = & $installed.Source --version
        if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -ge 24) { $nodePath = $installed.Source }
    }
    if (-not $nodePath) {
        $portable = Get-ChildItem -LiteralPath $runtimeDir -Filter node.exe -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*node-v*' } | Select-Object -First 1
        if ($portable) { $nodePath = $portable.FullName }
    }
    if (-not $nodePath) {
        Write-Host 'Preparing a verified portable Node.js runtime...'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $releases = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
        $release = $releases | Where-Object { $_.version -match '^v24\.' } | Select-Object -First 1
        if (-not $release) { throw 'Node.js 24 release could not be found.' }
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
        $zipName = "node-$($release.version)-win-$arch.zip"
        $zipPath = Join-Path $runtimeDir $zipName
        $checksums = (Invoke-WebRequest "https://nodejs.org/dist/$($release.version)/SHASUMS256.txt" -UseBasicParsing).Content
        $match = [regex]::Match($checksums, "(?m)^([a-f0-9]{64})\s+$([regex]::Escape($zipName))\s*$")
        if (-not $match.Success) { throw 'Official SHA-256 checksum is missing.' }
        Invoke-WebRequest "https://nodejs.org/dist/$($release.version)/$zipName" -OutFile $zipPath -UseBasicParsing
        if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLower() -ne $match.Groups[1].Value) { throw 'Node.js checksum mismatch.' }
        Expand-Archive -LiteralPath $zipPath -DestinationPath $runtimeDir -Force
        Remove-Item -LiteralPath $zipPath
        $nodePath = Join-Path $runtimeDir "node-$($release.version)-win-$arch\node.exe"
    }
    $env:PATH = "$(Split-Path $nodePath);$env:PATH"
    $stdout = Join-Path $runtimeDir 'server.log'
    $stderr = Join-Path $runtimeDir 'server-error.log'
    $entry = Join-Path $installRoot 'server\main.mjs'
    $process = Start-Process -FilePath $nodePath -ArgumentList @("`"$entry`"") -WorkingDirectory $installRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    for ($attempt=0; $attempt -lt 80; $attempt++) {
        Start-Sleep -Milliseconds 250
        $ready = Get-Ready
        if ($ready) {
            if ($ready.product -ne 'AppDash' -or $ready.root -ne $installRoot) { throw 'Port collision: another installation answered.' }
            if (-not $ready.ready) { continue }
            Start-Process $baseUrl
            exit 0
        }
        if ($process.HasExited) { throw "AppDash exited. See $stderr" }
    }
    throw "Readiness timed out. See $stderr"
} catch { Write-Host "AppDash: $($_.Exception.Message)" -ForegroundColor Red; Write-Host "Logs: $runtimeDir"; exit 1 }
