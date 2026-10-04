param(
    [Parameter(Mandatory = $true)][string]$ControlDir,
    [Parameter(Mandatory = $true)][string]$ArtifactDir
)

# The runner owns the independent 30s readiness / 5s capture watchdogs.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$watcher = $null
$artifactPath = $null
$captureClock = $null
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)

function Get-LocalAbsolutePath([string]$Value) {
    # Exclude UNC, device paths, drive-relative paths, ADS and ambiguous Win32 names.
    if ($Value -notmatch '^[A-Za-z]:[\\/]' -or $Value.Length -gt 240 -or
        $Value.Substring(2) -match '[:*?"<>|\x00-\x1f]') {
        throw [System.ArgumentException]::new()
    }
    foreach ($part in ($Value.Substring(3) -split '[\\/]')) {
        if ($part -eq '.' -or $part -eq '..' -or $part -match '[ .]$') {
            throw [System.ArgumentException]::new()
        }
    }
    $full = [System.IO.Path]::GetFullPath($Value)
    if ($full.Length -gt 3) { $full = $full.TrimEnd([char[]]@('\', '/')) }
    return $full
}

function Assert-PlainDirectory([string]$Value) {
    $cursor = [System.IO.Path]::GetPathRoot($Value)
    $parts = $Value.Substring($cursor.Length) -split '[\\/]'
    $attr = [System.IO.File]::GetAttributes($cursor)
    if (($attr -band 0x400) -ne 0) { throw [System.UnauthorizedAccessException]::new() }
    foreach ($part in $parts) {
        if ($part.Length -eq 0) { continue }
        $cursor = [System.IO.Path]::Combine($cursor, $part)
        $attr = [System.IO.File]::GetAttributes($cursor)
        if (($attr -band 0x400) -ne 0 -or ($attr -band 0x10) -eq 0) {
            throw [System.UnauthorizedAccessException]::new()
        }
    }
}

function Read-ControlJson([string]$Path, [string[]]$Fields) {
    Assert-PlainDirectory ([System.IO.Path]::GetDirectoryName($Path))
    if (([System.IO.File]::GetAttributes($Path) -band 0x410) -ne 0) {
        throw [System.UnauthorizedAccessException]::new()
    }
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        if ($stream.Length -le 0 -or $stream.Length -gt 8192) {
            throw [System.IO.InvalidDataException]::new()
        }
        $bytes = New-Object byte[] 8193
        $length = 0
        while ($length -lt $bytes.Length) {
            $read = $stream.Read($bytes, $length, $bytes.Length - $length)
            if ($read -eq 0) { break }
            $length += $read
        }
        if ($length -gt 8192) { throw [System.IO.InvalidDataException]::new() }
        $value = ConvertFrom-Json -InputObject $utf8.GetString($bytes, 0, $length)
        if ($null -eq $value -or $value -isnot [System.Management.Automation.PSCustomObject]) {
            throw [System.IO.InvalidDataException]::new()
        }
        $names = @($value.PSObject.Properties.Name)
        if ($names.Count -ne $Fields.Count) { throw [System.IO.InvalidDataException]::new() }
        foreach ($name in $names) {
            if ($Fields -cnotcontains $name) { throw [System.IO.InvalidDataException]::new() }
        }
        return $value
    } finally { $stream.Dispose() }
}

function Write-NativeJson([object]$Value) {
    Assert-PlainDirectory $artifactPath
    $json = ConvertTo-Json -InputObject $Value -Depth 8 -Compress
    $bytes = $utf8.GetBytes($json)
    if ($bytes.Length -gt 262144) { throw [System.IO.InvalidDataException]::new() }
    $temp = [System.IO.Path]::Combine($artifactPath, 'native-' + [guid]::NewGuid().ToString('N') + '.tmp')
    $stream = [System.IO.File]::Open($temp, [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
    # One capture, create-only publication: never replace an existing result.
    [System.IO.File]::Move($temp, [System.IO.Path]::Combine($artifactPath, 'native.json'))
}

try {
    $artifactPath = Get-LocalAbsolutePath $ArtifactDir
    Assert-PlainDirectory $artifactPath
    $controlPath = Get-LocalAbsolutePath $ControlDir
    Assert-PlainDirectory $controlPath
    if ($artifactPath.Equals($controlPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw [System.ArgumentException]::new()
    }
    $session = Read-ControlJson ([System.IO.Path]::Combine($controlPath, 'session.json')) @('runId', 'salt', 'allowedTempRoot')
    $runId = [guid]::Empty
    if ($session.runId -isnot [string] -or
        -not [guid]::TryParseExact($session.runId, 'D', [ref]$runId) -or
        $session.salt -isnot [string] -or $session.salt -cnotmatch '\A[0-9a-fA-F]{64}\z' -or
        $session.allowedTempRoot -isnot [string]) {
        throw [System.IO.InvalidDataException]::new()
    }
    $allowedRoot = Get-LocalAbsolutePath $session.allowedTempRoot
    Assert-PlainDirectory $allowedRoot
    # Suppress compiler diagnostics, including source text and local paths.
    $null = Add-Type -Path ([System.IO.Path]::Combine($PSScriptRoot, 'NativeSnapshot.cs')) -ErrorAction Stop -WarningAction SilentlyContinue 2>$null
    $requestPath = [System.IO.Path]::Combine($controlPath, 'request.json')
    $watcher = New-Object OcxWindowsAuthDiagnostic.RequestSignal($controlPath)
    [Console]::Out.WriteLine('READY')
    [Console]::Out.Flush()
    $waitClock = [System.Diagnostics.Stopwatch]::StartNew()
    while (-not [System.IO.File]::Exists($requestPath)) {
        $remaining = 500000 - $waitClock.ElapsedMilliseconds
        if ($remaining -le 0) { throw [System.TimeoutException]::new() }
        # The C# event handler is armed before READY, so a rename cannot fall
        # between an existence check and subscription. Recheck after every wake.
        $watcher.Wait([int][Math]::Min($remaining, 1000))
    }
    $captureClock = [System.Diagnostics.Stopwatch]::StartNew()
    [Console]::Out.WriteLine('CAPTURE')
    [Console]::Out.Flush()
    $request = Read-ControlJson $requestPath @('root', 'requestTimeMs')
    if ($request.root -isnot [string] -or
        ($request.requestTimeMs -isnot [long] -and $request.requestTimeMs -isnot [int]) -or
        $request.requestTimeMs -lt 0 -or $request.requestTimeMs -gt 253402300799999) {
        throw [System.IO.InvalidDataException]::new()
    }
    $root = Get-LocalAbsolutePath $request.root
    if ($artifactPath.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -or
        $artifactPath.StartsWith($root + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw [System.ArgumentException]::new()
    }
    $snapshot = [OcxWindowsAuthDiagnostic.NativeSnapshot]::Capture($root, $allowedRoot, $session.salt)
    $snapshot['requestTimeMs'] = $request.requestTimeMs
    $snapshot['captureDurationMs'] = $captureClock.ElapsedMilliseconds
    Write-NativeJson $snapshot
} catch {
    $errorCode = [int]$_.Exception.GetBaseException().HResult
    $duration = 0
    if ($null -ne $captureClock) { $duration = $captureClock.ElapsedMilliseconds }
    if ($null -ne $artifactPath) {
        try {
            Write-NativeJson ([ordered]@{
                schemaVersion = 1; observerGap = $true; hresult = $errorCode
                captureDurationMs = $duration; truncated = $false
                inaccessible = $true; rootMissing = $false; entries = @()
            })
        } catch { } # The runner independently reports missing/unreadable artifacts.
    }
    exit 1
} finally {
    if ($null -ne $watcher) {
        try { $watcher.Dispose() } catch { } # Never print cleanup exception text.
    }
}
