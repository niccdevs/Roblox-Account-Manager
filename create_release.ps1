$sourceDir = "C:\Users\Anwender\Documents\projects\Roblox-Account-Manager\build\Release"
$zipPath = "C:\Users\Anwender\Documents\projects\Roblox-Account-Manager\Roblox.Account.Manager.3.8.zip"
$tempDir = "C:\Users\Anwender\Documents\projects\Roblox-Account-Manager\temp_release"

# Essential files for the release
$essentialFiles = @(
    "Roblox Account Manager.exe",
    "Roblox Account Manager.exe.config",
    "RBX Alt Manager.exe",
    "log4.config",
    "libsodium.dll",
    "libsodium-64.dll",
    "Sodium.dll",
    "sodium.dll.config"
)

# Remove old zip if exists
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

# Create temp directory
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Copy essential files
foreach ($file in $essentialFiles) {
    $src = Join-Path $sourceDir $file
    if (Test-Path $src) {
        Copy-Item $src -Destination $tempDir
    }
}

# Create zip
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force

# Cleanup
Remove-Item $tempDir -Recurse -Force

# Show result
$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Created $zipPath ($size MB)"
