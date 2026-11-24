# Minimal streaming chat-completions example for the local Qwen endpoint.
# Sends ONE fixed prompt to /v1/chat/completions via curl.exe and streams the
# SSE response. This is a minimal streaming example, NOT a full benchmark
# timing collector. Nothing here starts a server or changes GPU clocks/power.
param(
    [string]$BaseUrl = "http://127.0.0.1:8080",
    [string]$Model = "qwen38"
)

$body = [ordered]@{
    model    = $Model
    messages = @([ordered]@{
        role    = "user"
        content = "Write a C# implementation of an LRU cache. Explain the time complexity of each operation."
    })
    temperature    = 0
    seed           = 42
    max_tokens     = 8192
    stream         = $true
    stream_options = [ordered]@{ include_usage = $true }
} | ConvertTo-Json -Depth 6 -Compress

$jsonPath = Join-Path ([System.IO.Path]::GetTempPath()) ("qwen-request-" + [guid]::NewGuid() + ".json")
try {
    # UTF-8 without BOM so the server receives a clean JSON body.
    [System.IO.File]::WriteAllText($jsonPath, $body, (New-Object System.Text.UTF8Encoding($false)))
    & curl.exe --no-buffer --silent --show-error --fail-with-body `
        --header "Content-Type: application/json" `
        --data-binary "@$jsonPath" `
        "$BaseUrl/v1/chat/completions"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Remove-Item -LiteralPath $jsonPath -ErrorAction SilentlyContinue
}
