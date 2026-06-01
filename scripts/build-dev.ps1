param(
    [ValidateSet("chrome", "firefox", "all")]
    [string]$Target = "chrome"
)

# Stages an unpacked extension into a STABLE, version-less folder so it can be
# loaded once in the browser and simply reloaded after each rebuild.
#   dist/dev/chrome/   <- load this once via chrome://extensions
#   dist/dev/firefox/  <- load this once via about:debugging
# Unlike package-release.ps1 the path never changes with the version, which
# avoids re-adding / picking the wrong version-named folder.
# Output lives under dist/ which is gitignored.

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ExtensionRoot = Join-Path $ProjectRoot "extension"
$ManifestRoot = Join-Path $ProjectRoot "manifests"
$DevRoot = Join-Path $ProjectRoot "dist/dev"

function New-DevBuild {
    param([string]$TargetName)

    $ManifestPath = Join-Path $ManifestRoot "$TargetName.json"
    if (-not (Test-Path $ManifestPath)) {
        throw "Missing manifest: $ManifestPath"
    }
    if (-not (Test-Path $ExtensionRoot)) {
        throw "Missing extension source: $ExtensionRoot"
    }

    $StageRoot = Join-Path $DevRoot $TargetName

    if (Test-Path $StageRoot) {
        Remove-Item -LiteralPath $StageRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $StageRoot | Out-Null
    Copy-Item -Path (Join-Path $ExtensionRoot "*") -Destination $StageRoot -Recurse -Force
    Copy-Item -LiteralPath $ManifestPath -Destination (Join-Path $StageRoot "manifest.json") -Force

    $Version = (Get-Content -Raw -Path $ManifestPath | ConvertFrom-Json).version
    Write-Host "Dev build ready ($TargetName v$Version): $StageRoot"
    Write-Host "  -> Load this folder once, then just press Reload after rebuilds."
}

if ($Target -eq "all") {
    New-DevBuild -TargetName "chrome"
    New-DevBuild -TargetName "firefox"
} else {
    New-DevBuild -TargetName $Target
}
