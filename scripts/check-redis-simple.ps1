# Simple Azure Redis checker
$redisName = "redis-media-pipeline-ffmpeg"

Write-Host "Checking Azure Redis..." -ForegroundColor Cyan

# Check Azure CLI
try {
    $null = az version 2>$null
} catch {
    Write-Host "ERROR: Azure CLI not installed" -ForegroundColor Red
    Write-Host "Install with: winget install Microsoft.AzureCLI" -ForegroundColor Yellow
    exit 1
}

# Check login
$account = az account show 2>$null
if (!$account) {
    Write-Host "ERROR: Not logged in to Azure" -ForegroundColor Red
    Write-Host "Run: az login" -ForegroundColor Yellow
    exit 1
}

Write-Host "Finding Redis instance..." -ForegroundColor Yellow
$redisList = az redis list | ConvertFrom-Json
$redis = $redisList | Where-Object { $_.name -eq $redisName }

if (!$redis) {
    Write-Host "ERROR: Redis '$redisName' not found" -ForegroundColor Red
    exit 1
}

$rg = $redis.resourceGroup
Write-Host "Found: $redisName in $rg" -ForegroundColor Green

Write-Host "`nRedis Status:" -ForegroundColor Cyan
Write-Host "  Host: $($redis.hostName)"
Write-Host "  Port: $($redis.sslPort)"
Write-Host "  Status: $($redis.provisioningState)"
Write-Host "  Public Access: $($redis.publicNetworkAccess)"

Write-Host "`nGetting access keys..." -ForegroundColor Yellow
$keys = az redis list-keys --name $redisName --resource-group $rg | ConvertFrom-Json

Write-Host "`nPrimary Key (last 10 chars): ...$($keys.primaryKey.Substring($keys.primaryKey.Length - 10))" -ForegroundColor Green

Write-Host "`nCorrect .env format:" -ForegroundColor Cyan
$encodedKey = [uri]::EscapeDataString($keys.primaryKey)
Write-Host "REDIS_URL=rediss://:$encodedKey@$($redis.hostName):$($redis.sslPort)" -ForegroundColor White

Write-Host "`nChecking firewall..." -ForegroundColor Yellow
$fw = az redis firewall-rules list --name $redisName --resource-group $rg | ConvertFrom-Json
Write-Host "Firewall rules: $($fw.Count)"

if ($fw.Count -eq 0) {
    Write-Host "WARNING: No firewall rules! Add your IP to allow connections" -ForegroundColor Yellow
    $myIp = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content
    Write-Host "Your IP: $myIp" -ForegroundColor Cyan
    Write-Host "`nTo add firewall rule:"
    Write-Host "az redis firewall-rules create --name allow-my-ip --resource-group $rg --redis-name $redisName --start-ip $myIp --end-ip $myIp" -ForegroundColor Gray
}

Write-Host "`nDone!" -ForegroundColor Green
