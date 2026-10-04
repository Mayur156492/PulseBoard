param(
  [string]$Component,
  [ValidateSet('JS-CSS','JS-TW','TS-CSS','TS-TW')]
  [string]$Variant = 'JS-CSS',
  [string]$Destination = '.',
  [string]$Search,
  [switch]$List
)

$ErrorActionPreference = 'Stop'
$skillRoot = Split-Path -Parent $PSScriptRoot
$zipPath = Join-Path $skillRoot 'assets\react-bits-main.zip'
if (-not (Test-Path $zipPath)) {
  $fetchScript = Join-Path $PSScriptRoot 'fetch-react-bits.ps1'
  throw "React Bits archive not found: $zipPath. Run $fetchScript after reviewing the upstream MIT + Commons Clause license."
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$variantRoot = @{
  'JS-CSS' = 'src/content'
  'JS-TW'  = 'src/tailwind'
  'TS-CSS' = 'src/ts-default'
  'TS-TW'  = 'src/ts-tailwind'
}[$Variant]

function Get-ReactBitsCatalog {
  param([System.IO.Compression.ZipArchive]$Zip)
  $items = @{}
  foreach ($entry in $Zip.Entries) {
    if ($entry.FullName -match '^react-bits-main/src/content/([^/]+)/([^/]+)/[^/]+\.(jsx|css)$') {
      $category = $Matches[1]
      $name = $Matches[2]
      if (-not $items.ContainsKey($name)) {
        $items[$name] = [ordered]@{ Name = $name; Category = $category }
      }
    }
  }
  $items.Values | Sort-Object Category, Name
}

$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $catalog = Get-ReactBitsCatalog -Zip $zip
  if ($List) {
    $catalog | ForEach-Object { "{0}\t{1}" -f $_.Category, $_.Name }
    return
  }
  if ($Search) {
    $catalog | Where-Object { $_.Name -match [regex]::Escape($Search) -or $_.Category -match [regex]::Escape($Search) } | ForEach-Object { "{0}\t{1}" -f $_.Category, $_.Name }
    return
  }
  if (-not $Component) { throw 'Pass -Component <Name>, or use -List / -Search.' }

  $match = $catalog | Where-Object { $_.Name -ieq $Component } | Select-Object -First 1
  if (-not $match) {
    $near = $catalog | Where-Object { $_.Name -like "*$Component*" } | Select-Object -First 12
    $hint = if ($near) { ($near | ForEach-Object { $_.Name }) -join ', ' } else { 'Use -List to see all components.' }
    throw "Component '$Component' not found. Matches: $hint"
  }

  $componentName = $match.Name
  $category = $match.Category
  $prefix = "react-bits-main/$variantRoot/$category/$componentName/"
  $entries = $zip.Entries | Where-Object { $_.FullName.StartsWith($prefix) -and -not $_.FullName.EndsWith('/') }
  if (-not $entries -or $entries.Count -eq 0) { throw "No files found for $componentName variant $Variant at $prefix" }

  if (-not (Test-Path $Destination)) { New-Item -ItemType Directory -Force -Path $Destination | Out-Null }
  $targetDir = Join-Path (Resolve-Path $Destination).Path $componentName
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

  foreach ($entry in $entries) {
    $relative = $entry.FullName.Substring($prefix.Length)
    $outPath = Join-Path $targetDir $relative
    $outDir = Split-Path -Parent $outPath
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $outPath, $true)
    Write-Output "wrote $outPath"
  }

  $registryEntry = $zip.GetEntry('react-bits-main/public/r/registry.json')
  if ($registryEntry) {
    $reader = [IO.StreamReader]::new($registryEntry.Open())
    try { $registry = ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Close() }
    $item = $registry.items | Where-Object { $_.title -eq $componentName -and $_.name -eq "$componentName-$Variant" } | Select-Object -First 1
    if ($item -and $item.dependencies -and $item.dependencies.Count -gt 0) {
      Write-Output "dependencies: $($item.dependencies -join ', ')"
    } else {
      Write-Output 'dependencies: none listed for this variant'
    }
  }
} finally {
  $zip.Dispose()
}
