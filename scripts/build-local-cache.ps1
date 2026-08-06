param(
  [switch]$Install,
  [switch]$Test,
  [switch]$Lint,
  [switch]$Typecheck,
  [switch]$BuildDir,
  [switch]$BuildInstaller,
  [switch]$NoSignWorkaround
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path (Split-Path -Parent $repoRoot) '.cache'
$npmCache = Join-Path $cacheRoot 'npm'
$electronCache = Join-Path $cacheRoot 'electron'
$electronBuilderCache = Join-Path $cacheRoot 'electron-builder'

New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
New-Item -ItemType Directory -Force -Path $npmCache | Out-Null
New-Item -ItemType Directory -Force -Path $electronCache | Out-Null
New-Item -ItemType Directory -Force -Path $electronBuilderCache | Out-Null

$env:npm_config_cache = $npmCache
$env:ELECTRON_CACHE = $electronCache
$env:ELECTRON_BUILDER_CACHE = $electronBuilderCache

Set-Location $repoRoot

if (
  -not $Install
  -and -not $Test
  -and -not $Lint
  -and -not $Typecheck
  -and -not $BuildDir
  -and -not $BuildInstaller
) {
  $Install = $true
  $Test = $true
  $Lint = $true
  $Typecheck = $true
  $BuildDir = $true
}

Write-Host "Repository root: $repoRoot"
Write-Host "npm cache: $npmCache"
Write-Host "Electron cache: $electronCache"
Write-Host "electron-builder cache: $electronBuilderCache"

if ($Install) {
  Write-Host "`n==> npm ci"
  npm ci
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Test) {
  Write-Host "`n==> npm test"
  npm test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Lint) {
  Write-Host "`n==> npm run lint"
  npm run lint
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Typecheck) {
  Write-Host "`n==> npx tsc --noEmit"
  npx tsc --noEmit
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($BuildDir) {
  Write-Host "`n==> npm run build:dev"
  npm run build:dev
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($BuildInstaller) {
  if ($NoSignWorkaround) {
    Write-Host "`n==> npx electron-builder --config electron-builder.json5 --win nsis"
    npx electron-builder --config electron-builder.json5 --win nsis
  } else {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    Write-Host "`n==> npx electron-builder --config electron-builder.json5 --win nsis --config.win.signAndEditExecutable=false --config.nsis.packElevateHelper=false"
    npx electron-builder --config electron-builder.json5 --win nsis --config.win.signAndEditExecutable=false --config.nsis.packElevateHelper=false
  }

  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
