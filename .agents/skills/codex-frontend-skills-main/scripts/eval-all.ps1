param(
  [string] $PluginEvalJs,
  [string] $Node = "node",
  [string] $OutputDir = ".plugin-eval"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginsRoot = Join-Path $repoRoot "plugins"
$outRoot = Join-Path $repoRoot $OutputDir
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

if (-not $PluginEvalJs) {
  $candidate = Join-Path $env:USERPROFILE ".codex\plugins\cache\openai-curated\plugin-eval\8770e9d2\scripts\plugin-eval.js"
  if (Test-Path -LiteralPath $candidate) {
    $PluginEvalJs = $candidate
  }
}
if (-not $PluginEvalJs -or -not (Test-Path -LiteralPath $PluginEvalJs)) {
  throw "Pass -PluginEvalJs with the path to plugin-eval.js."
}

Get-ChildItem -LiteralPath $pluginsRoot -Directory | ForEach-Object {
  $out = Join-Path $outRoot "$($_.Name).json"
  & $Node $PluginEvalJs analyze $_.FullName --format json --output $out
  $json = Get-Content -LiteralPath $out -Raw | ConvertFrom-Json
  [PSCustomObject]@{
    Plugin = $_.Name
    Score = $json.summary.score
    Grade = $json.summary.grade
    Risk = $json.summary.riskLevel
  }
} | Format-Table -AutoSize
