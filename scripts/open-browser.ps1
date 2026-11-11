# Invoked automatically by START.bat; no PowerShell commands to enter.
# Open the tab only after Next.js responds, not while npm is still starting.
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Net.Http
$url = 'http://localhost:3000'
$limit = [DateTime]::UtcNow.AddSeconds(120)
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(3)
try {
    while ([DateTime]::UtcNow -lt $limit) {
        try {
            $response = $client.GetAsync($url).GetAwaiter().GetResult()
            if ($response.IsSuccessStatusCode) {
                Start-Process $url
                break
            }
        } catch { }
        Start-Sleep -Milliseconds 850
    }
} finally {
    $client.Dispose()
}
