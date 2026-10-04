param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $SearchArgs
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$skillRoot = Split-Path -Parent $scriptDir
$searchPy = Join-Path $scriptDir "search.py"
if (-not (Test-Path -LiteralPath $searchPy)) {
  throw "search.py not found next to run-search.ps1: $searchPy"
}

$dataDir = Join-Path $skillRoot "data"
if (-not (Test-Path -LiteralPath (Join-Path $dataDir "products.csv"))) {
  $zipPath = Join-Path $skillRoot "assets\ui-ux-pro-max-data.zip"
  if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "UI/UX Pro Max data is missing. Expected data/ or assets/ui-ux-pro-max-data.zip under $skillRoot"
  }
  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.Substring(0, 16)
  $cacheCandidates = New-Object System.Collections.Generic.List[string]
  if ($env:CODEX_UI_UX_PRO_CACHE_DIR) { [void]$cacheCandidates.Add($env:CODEX_UI_UX_PRO_CACHE_DIR) }
  if (Test-Path -LiteralPath "C:\tmp") { [void]$cacheCandidates.Add("C:\tmp\codex-ui-ux-pro-data") }
  if ($env:TEMP) { [void]$cacheCandidates.Add((Join-Path $env:TEMP "codex-ui-ux-pro-data")) }
  if ($env:LOCALAPPDATA) { [void]$cacheCandidates.Add((Join-Path $env:LOCALAPPDATA "Codex\ui-ux-pro-max-data")) }

  $lastError = $null
  foreach ($base in $cacheCandidates) {
    try {
      $candidateDataDir = Join-Path $base $hash
      if (-not (Test-Path -LiteralPath (Join-Path $candidateDataDir "products.csv"))) {
        New-Item -ItemType Directory -Force -Path $candidateDataDir | Out-Null
        Expand-Archive -LiteralPath $zipPath -DestinationPath $candidateDataDir -Force
      }
      $dataDir = $candidateDataDir
      break
    } catch {
      $lastError = $_
    }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $dataDir "products.csv"))) {
    throw "Could not extract UI/UX Pro Max data cache. Last error: $lastError"
  }
}
$env:UI_UX_PRO_MAX_DATA_DIR = $dataDir

$candidates = New-Object System.Collections.Generic.List[string]
if ($env:CODEX_BUNDLED_PYTHON) { [void]$candidates.Add($env:CODEX_BUNDLED_PYTHON) }
$bundled = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
[void]$candidates.Add($bundled)
foreach ($name in @("python", "python3")) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { [void]$candidates.Add($cmd.Source) }
}

$seen = @{}
foreach ($candidate in $candidates) {
  if (-not $candidate -or $seen.ContainsKey($candidate)) { continue }
  $seen[$candidate] = $true
  if (Test-Path -LiteralPath $candidate) {
    & $candidate $searchPy @SearchArgs
    exit $LASTEXITCODE
  }
}

throw "No Python runtime found. In Codex Desktop call load_workspace_dependencies and set CODEX_BUNDLED_PYTHON to the returned Python executable, or read the CSV files from the extracted UI_UX_PRO_MAX_DATA_DIR cache directly as a fallback."
