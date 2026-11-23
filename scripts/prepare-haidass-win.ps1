param()
$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $PSScriptRoot
$Release = if ($env:ELR_RELEASE_DIR) { $env:ELR_RELEASE_DIR } else { Join-Path $Project 'release' }
$Cache = Join-Path $Release 'runtime\haidass'
$Engine = Join-Path $Cache 'engine'
New-Item -ItemType Directory -Path $Cache, $Engine -Force | Out-Null

function Get-Sha256($Path) {
    $Algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $Stream = [IO.File]::OpenRead($Path)
        try { return [BitConverter]::ToString($Algorithm.ComputeHash($Stream)).Replace('-', '') }
        finally { $Stream.Dispose() }
    } finally { $Algorithm.Dispose() }
}

function Receive-VerifiedFile($Url, $Name, $Sha256) {
    $Destination = Join-Path $Cache $Name
    if ((Test-Path -LiteralPath $Destination) -and (Get-Sha256 $Destination) -eq $Sha256) { return $Destination }
    $Pending = "$Destination.pending"
    try {
        & curl.exe --fail --location --silent --show-error --retry 2 --connect-timeout 25 --max-time 900 --output $Pending $Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed for $Name" }
        if ((Get-Sha256 $Pending) -ne $Sha256) { throw "Checksum mismatch for $Name" }
        Move-Item -LiteralPath $Pending -Destination $Destination -Force
    } finally {
        if (Test-Path -LiteralPath $Pending) { Remove-Item -LiteralPath $Pending -Force }
    }
    return $Destination
}

$Runtime = Receive-VerifiedFile `
    'https://github.com/ggml-org/llama.cpp/releases/download/b12445/llama-b12445-bin-win-cpu-x64.zip' `
    'llama-b12445-bin-win-cpu-x64.zip' '2a224215f248cd32eab5f79a0478ed36492dfeb0c05ac85a82884d6afb386ffc'
& tar.exe -xf $Runtime -C $Engine
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $Engine 'llama-server.exe'))) {
    throw 'The verified llama.cpp runtime could not be unpacked.'
}

$Model = Receive-VerifiedFile `
    'https://huggingface.co/umeiko/Haidass-Translate-143M-GGUF/resolve/0763c602a8099460a5fc767ee095abbe13f87332/haidass-translate-143m-q8_0.gguf?download=true' `
    'haidass-translate-143m-q8_0.gguf' '37b8c73c9323fb17687ba286968e92f88387e659f5162526b03bf34b5f3fe990'

$HyMtSource = 'https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/a0c709d/'
$HyMtModel = Receive-VerifiedFile `
    ($HyMtSource + 'Hy-MT2-1.8B-Q4_K_M.gguf?download=true') `
    'Hy-MT2-1.8B-Q4_K_M.gguf' 'dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699'
$null = Receive-VerifiedFile `
    ($HyMtSource + 'LICENSE.txt') `
    'Hy-MT2-LICENSE.txt' 'a1d52d448f81c584a47c583e19dfab2d3851c7c84431b07baee093c1113ed114'

$License = Join-Path $Cache 'Haidass-LICENSE.txt'
& curl.exe --fail --location --silent --show-error --output $License 'https://www.apache.org/licenses/LICENSE-2.0.txt'
if ($LASTEXITCODE -ne 0) { throw 'Could not obtain the Apache 2.0 license text.' }
if (-not (Test-Path -LiteralPath (Join-Path $Engine 'LICENSE'))) {
    & curl.exe --fail --location --silent --show-error --output (Join-Path $Engine 'LICENSE') 'https://raw.githubusercontent.com/ggml-org/llama.cpp/b12445/LICENSE'
    if ($LASTEXITCODE -ne 0) { throw 'Could not obtain the llama.cpp license text.' }
}
Get-Item -LiteralPath $Model, $HyMtModel | Select-Object Name,Length
