# Moodle Auto Relogin — build script (Windows / PowerShell)
# Creates:
#   dist\chrome-unpacked\
#   dist\firefox-unpacked\
#   dist\moodle-relogin-chrome.zip
#   dist\moodle-relogin-firefox.zip
#   dist\moodle-relogin-firefox.xpi  (unsigned stub)

$ErrorActionPreference = 'Stop'

$projectDir      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$srcDir          = Join-Path $projectDir 'src'
$distDir         = Join-Path $projectDir 'dist'
$chromeManifest  = Join-Path $projectDir 'manifests\chrome\manifest.json'
$firefoxManifest = Join-Path $projectDir 'manifests\firefox\manifest.json'
$chromeUnpacked  = Join-Path $distDir 'chrome-unpacked'
$firefoxUnpacked = Join-Path $distDir 'firefox-unpacked'
$chromeZip       = Join-Path $distDir 'moodle-relogin-chrome.zip'
$firefoxZip      = Join-Path $distDir 'moodle-relogin-firefox.zip'
$firefoxXpi      = Join-Path $distDir 'moodle-relogin-firefox.xpi'

function Copy-BuildFiles {
    param([string]$ManifestPath, [string]$TargetDir, [bool]$Firefox = $false)

    if (Test-Path $TargetDir) { Remove-Item $TargetDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

    # Копируем всё из src/ кроме папки firefox/
    Get-ChildItem $srcDir | Where-Object { $_.Name -ne 'firefox' } | ForEach-Object {
        Copy-Item $_.FullName $TargetDir -Recurse -Force
    }

    # Firefox: добавляем firefox-extras.js в корень
    if ($Firefox) {
        $ffExtras = Join-Path $srcDir 'firefox\firefox-extras.js'
        if (Test-Path $ffExtras) {
            Copy-Item $ffExtras (Join-Path $TargetDir 'firefox-extras.js') -Force
        }
    }

    # Кладём нужный манифест
    Copy-Item $ManifestPath (Join-Path $TargetDir 'manifest.json') -Force
}

function New-ZipArchive {
    param([string]$SourceDir, [string]$ZipPath)

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    $root = (Resolve-Path $SourceDir).Path.TrimEnd('\', '/')
    $zip  = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        Get-ChildItem $root -Recurse -File -Force | ForEach-Object {
            $entry = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $_.FullName, $entry,
                [System.IO.Compression.CompressionLevel]::Optimal)
        }
    } finally {
        $zip.Dispose()
    }
}

try {
    if (-not (Test-Path $srcDir))          { throw "Missing: $srcDir" }
    if (-not (Test-Path $chromeManifest))  { throw "Missing: $chromeManifest" }
    if (-not (Test-Path $firefoxManifest)) { throw "Missing: $firefoxManifest" }

    New-Item -ItemType Directory -Force -Path $distDir | Out-Null
    Remove-Item -Force -ErrorAction SilentlyContinue $chromeZip, $firefoxZip, $firefoxXpi

    Write-Host 'Preparing Chrome unpacked...'
    Copy-BuildFiles -ManifestPath $chromeManifest -TargetDir $chromeUnpacked -Firefox $false

    Write-Host 'Preparing Firefox unpacked...'
    Copy-BuildFiles -ManifestPath $firefoxManifest -TargetDir $firefoxUnpacked -Firefox $true

    Write-Host "Zipping Chrome -> $chromeZip"
    New-ZipArchive -SourceDir $chromeUnpacked -ZipPath $chromeZip

    Write-Host "Zipping Firefox -> $firefoxZip"
    New-ZipArchive -SourceDir $firefoxUnpacked -ZipPath $firefoxZip

    Write-Host "Copying Firefox zip -> xpi (unsigned stub)"
    Copy-Item $firefoxZip $firefoxXpi -Force

    Write-Host 'Packaging complete.' -ForegroundColor Green
    Write-Host "Chrome folder:  $chromeUnpacked"
    Write-Host "Firefox folder: $firefoxUnpacked"
    Write-Host "Chrome zip:     $chromeZip"
    Write-Host "Firefox zip:    $firefoxZip"
    Write-Host "Firefox xpi:    $firefoxXpi"
    exit 0
} catch {
    Write-Host "Packaging failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}
