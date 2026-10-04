param(
  [string[]] $Plugins = @(
    "frontend-design-core",
    "frontend-prototypes",
    "frontend-react-ui",
    "frontend-3d-motion",
    "frontend-browser-qa",
    "frontend-strategy-review",
    "frontend-ui-ux-pro"
  )
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

$codex = $env:CODEX_CLI_PATH
if (-not $codex -or -not (Test-Path -LiteralPath $codex)) {
  $cmd = Get-Command codex -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    $codex = $cmd.Source
  }
}
if (-not $codex -or -not (Test-Path -LiteralPath $codex)) {
  throw "Could not find codex CLI. Set CODEX_CLI_PATH to codex.exe and retry."
}

& $codex plugin marketplace add $repoRoot
foreach ($plugin in $Plugins) {
  & $codex plugin add "$plugin@codex-frontend-skills"
}

Write-Output "Installed Codex Frontend Skills marketplace from $repoRoot"
Write-Output "Open a new Codex thread so the skills are loaded."
