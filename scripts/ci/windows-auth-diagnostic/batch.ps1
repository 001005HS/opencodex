param(
    [Parameter(Mandatory = $true)][string]$BunPath,
    [Parameter(Mandatory = $true)][string]$RepoDir,
    [Parameter(Mandatory = $true)][string]$ControlDir
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$controlPath = $null
$result = [ordered]@{
    testStarted = $false; testExit = $null; batchTimeout = $false
    jobAssigned = $false; descendantsTerminated = $false; nativeError = 0
}

function Assert-ControlDirectory([string]$Path) {
    $cursor = [System.IO.Path]::GetPathRoot($Path)
    $attributes = [System.IO.File]::GetAttributes($cursor)
    if (($attributes -band 0x400) -ne 0) { throw [System.UnauthorizedAccessException]::new() }
    foreach ($part in ($Path.Substring($cursor.Length) -split '[\\/]')) {
        if ($part.Length -eq 0) { continue }
        $cursor = [System.IO.Path]::Combine($cursor, $part)
        $attributes = [System.IO.File]::GetAttributes($cursor)
        if (($attributes -band 0x400) -ne 0 -or ($attributes -band 0x10) -eq 0) {
            throw [System.UnauthorizedAccessException]::new()
        }
    }
}

try {
    if ($ControlDir -notmatch '^[A-Za-z]:[\\/]' -or
        $ControlDir.Substring(2) -match '[:*?"<>|\x00-\x1f]') { throw [System.ArgumentException]::new() }
    foreach ($part in ($ControlDir.Substring(3) -split '[\\/]')) {
        if ($part -eq '.' -or $part -eq '..' -or $part -match '[ .]$') { throw [System.ArgumentException]::new() }
    }
    $controlPath = [System.IO.Path]::GetFullPath($ControlDir)
    Assert-ControlDirectory $controlPath
    $null = Add-Type -Path ([System.IO.Path]::Combine($PSScriptRoot, 'NativeBatch.cs')) -ErrorAction Stop -WarningAction SilentlyContinue 2>$null
    $result = [OcxWindowsAuthDiagnostic.NativeBatch]::Run($BunPath, $RepoDir)
} catch {
    $result['nativeError'] = [int]$_.Exception.GetBaseException().HResult
}

# Publish only the allowlisted result, never paths, PIDs, or exception text.
try {
    if ($null -eq $controlPath) { throw [System.ArgumentException]::new() }
    Assert-ControlDirectory $controlPath
    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    $bytes = $utf8.GetBytes((ConvertTo-Json -InputObject $result -Depth 3 -Compress))
    if ($bytes.Length -gt 4096) { throw [System.IO.InvalidDataException]::new() }
    $temp = [System.IO.Path]::Combine($controlPath, 'test-result-' + [guid]::NewGuid().ToString('N') + '.tmp')
    $stream = [System.IO.File]::Open($temp, [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
    [System.IO.File]::Move($temp, [System.IO.Path]::Combine($controlPath, 'test-result.json'))
} catch {
    # Parent treats an absent result as an infrastructure gap; raw output stays in its pipes.
    if ($null -ne $result['testExit']) { exit ([int]$result['testExit']) }
    if ($result['batchTimeout']) { exit 124 }
    exit 125
}
if ($null -ne $result['testExit']) { exit ([int]$result['testExit']) }
if ($result['batchTimeout']) { exit 124 }
exit 125
