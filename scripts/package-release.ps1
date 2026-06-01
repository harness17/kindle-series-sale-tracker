param(
    [ValidateSet("chrome", "firefox", "all")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ExtensionRoot = Join-Path $ProjectRoot "extension"
$ManifestRoot = Join-Path $ProjectRoot "manifests"
$DistRoot = Join-Path $ProjectRoot "dist"
$PackageSlug = Split-Path $ProjectRoot -Leaf

function New-ReleasePackage {
    param([string]$TargetName)

    $ManifestPath = Join-Path $ManifestRoot "$TargetName.json"
    if (-not (Test-Path $ManifestPath)) {
        throw "Missing manifest: $ManifestPath"
    }
    if (-not (Test-Path $ExtensionRoot)) {
        throw "Missing extension source: $ExtensionRoot"
    }

    $Manifest = Get-Content -Raw -Path $ManifestPath | ConvertFrom-Json -AsHashtable
    $Version = $Manifest["version"]

    $TargetDistRoot = Join-Path $DistRoot $TargetName
    $StageRoot = Join-Path $TargetDistRoot "$PackageSlug-$TargetName-v$Version"
    $ZipPath = Join-Path $TargetDistRoot "$PackageSlug-$TargetName-v$Version.zip"

    if (Test-Path $StageRoot) {
        Remove-Item -LiteralPath $StageRoot -Recurse -Force
    }
    if (Test-Path $ZipPath) {
        Remove-Item -LiteralPath $ZipPath -Force
    }

    New-Item -ItemType Directory -Force -Path $StageRoot | Out-Null
    Copy-Item -Path (Join-Path $ExtensionRoot "*") -Destination $StageRoot -Recurse -Force
    Copy-Item -LiteralPath $ManifestPath -Destination (Join-Path $StageRoot "manifest.json") -Force

    Compress-Archive -Path (Join-Path $StageRoot "*") -DestinationPath $ZipPath -Force
    Write-Host "Created $ZipPath"
}

if ($Target -eq "all") {
    New-ReleasePackage -TargetName "chrome"
    New-ReleasePackage -TargetName "firefox"
} else {
    New-ReleasePackage -TargetName $Target
}
