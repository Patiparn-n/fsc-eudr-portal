# PowerShell Simple Local Web Server for FSC & EUDR Portal

$port = 8085

# Foolproof check: Automatically find and terminate any process already listening on port 8085
$connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($connection) {
    $pidToKill = $connection.OwningProcess
    # Don't kill ourselves by mistake
    if ($pidToKill -ne $PID) {
        Write-Host "Port $port is currently occupied by process ID $pidToKill. Terminating it to restart..." -ForegroundColor Yellow
        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1 # Wait for the socket to release
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  FSC & EUDR Compliance Portal Server is running!" -ForegroundColor Green
    Write-Host "  URL: http://localhost:$port/" -ForegroundColor Cyan
    Write-Host "  Press Ctrl+C to stop the server." -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green

    # Automatically open the browser
    Start-Process "http://localhost:$port/"

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # Resolve requested file path
        $url = $request.Url.LocalPath
        if ($url -eq "/") { $url = "/index.html" }
        
        # Clean up path to prevent directory traversal
        $url = $url.Replace("\", "/").TrimStart("/")
        $filePath = Join-Path (Get-Location) $url

        if (Test-Path $filePath -PathType Leaf) {
            # Read file bytes
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Detect MIME Type
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".geojson" { "application/geo+json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".gif"  { "image/gif" }
                ".svg"  { "image/svg+xml" }
                default { "application/octet-stream" }
            }
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            # Return 404
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 File Not Found")
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
    }
}
catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
}
