param(
  [string] $Url = "https://github.com/DavidHDev/react-bits/archive/refs/heads/main.zip"
)

$ErrorActionPreference = "Stop"
$skillRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $skillRoot "assets"
$zipPath = Join-Path $assetsDir "react-bits-main.zip"

New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
Invoke-WebRequest -Uri $Url -OutFile $zipPath

Write-Output "Downloaded React Bits archive to $zipPath"
Write-Output "Review the upstream MIT + Commons Clause license before redistributing this archive."
