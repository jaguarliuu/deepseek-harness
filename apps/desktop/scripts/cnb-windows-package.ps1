# Native Windows packaging with the existing offline-runtime smoke gates.
# Requires PowerShell 7, Git, Node.js 24.9+ and the repository-pinned pnpm.
param([ValidateSet('Build', 'Upload')][string]$Mode = 'Build')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
Push-Location $root
try {
    Invoke-Checked 'node' @('-e', 'if(process.platform!=="win32"||process.arch!=="x64")throw Error("Windows x64 Node.js required");const [a,b]=process.versions.node.split(".").map(Number);if(a<24||(a===24&&b<9))throw Error("Node.js 24.9+ required")')
    $output = Join-Path $root 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts'
    if ($Mode -eq 'Build') {
        $package = Get-Content -Raw 'package.json' | ConvertFrom-Json
        $expectedPnpm = ($package.packageManager -replace '^pnpm@', '') -replace '\+.*$', ''
        $actualPnpm = (& pnpm --version).Trim()
        if ($LASTEXITCODE -ne 0 -or $actualPnpm -ne $expectedPnpm) { throw "Install pnpm $expectedPnpm before starting this runner" }
        Invoke-Checked 'git' @('--version')
        Invoke-Checked 'pnpm' @('install', '--frozen-lockfile')
        # Packaging builds sources, assembles Windows libraries, and executes packaged-runtime smoke tests.
        Invoke-Checked 'pnpm' @('--dir', 'apps/desktop', 'run', 'package:win:x64:unsigned')
        $installers = @(Get-ChildItem -LiteralPath $output -Filter '*.exe' -File)
        if ($installers.Count -ne 1) { throw 'Expected exactly one installer after successful packaging' }
        $installer = $installers[0]
        $checksum = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$checksum  $($installer.Name)" | Set-Content -LiteralPath "$($installer.FullName).sha256" -Encoding utf8NoBOM
        Copy-Item -LiteralPath 'apps/desktop/.desktop-build/targets/win-x64/runtime/primary-runtime/runtime.json' -Destination (Join-Path $output 'office-runtime.json')
        Write-Host "Verified installer: $($installer.Name)"
        Write-Host "SHA256: $checksum"
    } else {
        foreach ($name in @('CNB_TOKEN', 'CNB_API_ENDPOINT', 'CNB_REPO_SLUG', 'CNB_COMMIT')) {
            if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Missing CNB variable: $name" }
        }
        foreach ($pattern in @('*.exe', '*.exe.sha256', 'office-runtime.json')) {
            if (@(Get-ChildItem -LiteralPath $output -Filter $pattern -File).Count -ne 1) { throw "Missing or ambiguous artifact: $pattern" }
        }
        # Run CNB's pinned official attachment plugin natively: self-hosted Windows has no Docker requirement.
        $plugin = Join-Path ([IO.Path]::GetTempPath()) ('zhiwei-attachments-' + [Guid]::NewGuid().ToString('N'))
        try {
            Invoke-Checked 'git' @('clone', '--no-checkout', 'https://cnb.cool/cnb/plugins/cnbcool/attachments', $plugin)
            Invoke-Checked 'git' @('-C', $plugin, 'checkout', '--detach', '326a9dbcaf8ac30c04d1ff2daf93f0c30eb9aa78')
            Push-Location $plugin
            try {
                Invoke-Checked 'npm' @('ci', '--ignore-scripts', '--no-audit', '--no-fund')
                Invoke-Checked 'npm' @('run', 'build')
            } finally { Pop-Location }
            $env:PLUGIN_TYPE = 'UPLOAD'
            Remove-Item Env:PLUGIN_TAG -ErrorAction SilentlyContinue
            $env:PLUGIN_COMMIT = $env:CNB_COMMIT
            $env:PLUGIN_ATTACHMENTS = @(
                (Get-ChildItem -LiteralPath $output -Filter '*.exe' -File).Name
                (Get-ChildItem -LiteralPath $output -Filter '*.exe.sha256' -File).Name
                'office-runtime.json'
            ) | ConvertTo-Json -Compress
            Push-Location $output
            try { Invoke-Checked 'node' @((Join-Path $plugin 'dist/entrypoint.js')) }
            finally { Pop-Location }
        } finally {
            if (Test-Path -LiteralPath $plugin) { Remove-Item -LiteralPath $plugin -Recurse -Force }
        }
    }
} finally { Pop-Location }
