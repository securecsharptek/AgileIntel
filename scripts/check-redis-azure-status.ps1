// check-redis-azure-status.ps1
# Check Azure Redis status and configuration

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Azure Redis Status Checker" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$redisName = "redis-media-pipeline-ffmpeg"

Write-Host "🔍 Checking Azure Redis: $redisName`n" -ForegroundColor Yellow

# Check if Azure CLI is installed
try {
    $azVersion = az version --query '\"azure-cli\"' -o tsv 2>$null
    if ($azVersion) {
        Write-Host "✅ Azure CLI installed: $azVersion`n" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Azure CLI not installed or not in PATH" -ForegroundColor Red
    Write-Host "`nInstall Azure CLI first:" -ForegroundColor Yellow
    Write-Host "   winget install Microsoft.AzureCLI`n" -ForegroundColor White
    exit 1
}

# Check if logged in
Write-Host "🔐 Checking Azure login status..." -ForegroundColor Yellow
$account = az account show 2>$null
if (!$account) {
    Write-Host "❌ Not logged in to Azure" -ForegroundColor Red
    Write-Host "`nPlease login first:" -ForegroundColor Yellow
    Write-Host "   az login`n" -ForegroundColor White
    exit 1
}

$accountInfo = $account | ConvertFrom-Json
Write-Host "✅ Logged in as: $($accountInfo.user.name)" -ForegroundColor Green
Write-Host "   Subscription: $($accountInfo.name)`n" -ForegroundColor Gray

# Find the Redis instance
Write-Host "🔍 Searching for Redis instance..." -ForegroundColor Yellow
$redisList = az redis list --query "[?name=='$redisName']" | ConvertFrom-Json

if ($redisList.Count -eq 0) {
    Write-Host "❌ Redis instance '$redisName' not found" -ForegroundColor Red
    Write-Host "`nListing all Redis instances in subscription:`n" -ForegroundColor Yellow
    az redis list --output table
    exit 1
}

$redis = $redisList[0]
$resourceGroup = $redis.resourceGroup

Write-Host "✅ Found Redis instance" -ForegroundColor Green
Write-Host "   Resource Group: $resourceGroup`n" -ForegroundColor Gray

# Get detailed info
Write-Host "📊 Redis Configuration:" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "   Name:              $($redis.name)" -ForegroundColor White
Write-Host "   Status:            $($redis.provisioningState)" -ForegroundColor $(if ($redis.provisioningState -eq "Succeeded") { "Green" } else { "Red" })
Write-Host "   Host:              $($redis.hostName)" -ForegroundColor White
Write-Host "   SSL Port:          $($redis.sslPort)" -ForegroundColor White
Write-Host "   Non-SSL Port:      $($redis.port)" -ForegroundColor White
Write-Host "   Redis Version:     $($redis.redisVersion)" -ForegroundColor White
Write-Host "   SKU:               $($redis.sku.name) $($redis.sku.family)$($redis.sku.capacity)" -ForegroundColor White
Write-Host "   Location:          $($redis.location)" -ForegroundColor White

# Check if Redis is enabled
$enableNonSslPort = $redis.enableNonSslPort
Write-Host "   Non-SSL Enabled:   $enableNonSslPort" -ForegroundColor $(if ($enableNonSslPort -eq $true) { "Yellow" } else { "Green" })

# Check public access
$publicAccess = $redis.publicNetworkAccess
Write-Host "   Public Access:     $publicAccess" -ForegroundColor $(if ($publicAccess -eq "Enabled") { "Green" } else { "Red" })

Write-Host "`n📋 Authentication:" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

# Get access keys
Write-Host "🔑 Fetching access keys..." -ForegroundColor Yellow
try {
    $keys = az redis list-keys --name $redisName --resource-group $resourceGroup | ConvertFrom-Json
    
    Write-Host "   Primary Key:       ***$($keys.primaryKey.Substring($keys.primaryKey.Length - 4))" -ForegroundColor Green
    Write-Host "   Secondary Key:     ***$($keys.secondaryKey.Substring($keys.secondaryKey.Length - 4))" -ForegroundColor Green
    
    # Show full connection string
    Write-Host "`n📝 Connection Strings:" -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
    
    $primaryConnString = "rediss://:$([uri]::EscapeDataString($keys.primaryKey))@$($redis.hostName):$($redis.sslPort)"
    
    Write-Host "`nFor ioredis (Node.js):" -ForegroundColor Yellow
    Write-Host "   REDIS_URL=$primaryConnString`n" -ForegroundColor White
    
    Write-Host "For StackExchange.Redis (.NET):" -ForegroundColor Yellow
    Write-Host "   $($redis.hostName):$($redis.sslPort),password=$($keys.primaryKey),ssl=True,abortConnect=False`n" -ForegroundColor White
    
} catch {
    Write-Host "   ❌ Could not fetch access keys" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
}

# Check firewall rules
Write-Host "🔒 Firewall Rules:" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

$firewallRules = az redis firewall-rules list --name $redisName --resource-group $resourceGroup | ConvertFrom-Json

if ($firewallRules.Count -eq 0) {
    Write-Host "   ⚠️  No firewall rules configured" -ForegroundColor Yellow
    Write-Host "   This might block external connections" -ForegroundColor Yellow
} else {
    Write-Host "   $($firewallRules.Count) rule(s) configured:" -ForegroundColor Green
    foreach ($rule in $firewallRules) {
        Write-Host "   - $($rule.name): $($rule.startIp) - $($rule.endIp)" -ForegroundColor White
    }
}

# Get your public IP
Write-Host "`n🌐 Your Public IP:" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
try {
    $myIp = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content
    Write-Host "   $myIp" -ForegroundColor White
    
    # Check if your IP is in firewall rules
    $ipInRules = $false
    foreach ($rule in $firewallRules) {
        if ([System.Net.IPAddress]::Parse($myIp).GetAddressBytes() -ge [System.Net.IPAddress]::Parse($rule.startIp).GetAddressBytes() -and 
            [System.Net.IPAddress]::Parse($myIp).GetAddressBytes() -le [System.Net.IPAddress]::Parse($rule.endIp).GetAddressBytes()) {
            $ipInRules = $true
            Write-Host "   ✅ Your IP is allowed by rule: $($rule.name)" -ForegroundColor Green
            break
        }
    }
    
    if (!$ipInRules -and $firewallRules.Count -gt 0) {
        Write-Host "   ⚠️  Your IP is NOT in firewall rules!" -ForegroundColor Yellow
        Write-Host "   Add your IP to allow connections from this machine" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   Could not detect public IP" -ForegroundColor Yellow
}

Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Diagnostic Complete" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

# Recommendations
Write-Host "📋 Recommendations:" -ForegroundColor Yellow
if ($redis.provisioningState -ne "Succeeded") {
    Write-Host "   ⚠️  Redis is not in 'Succeeded' state - check Azure Portal" -ForegroundColor Red
}
if ($publicAccess -ne "Enabled") {
    Write-Host "   ⚠️  Public network access is disabled" -ForegroundColor Red
}
if ($firewallRules.Count -eq 0) {
    Write-Host "   💡 Add firewall rules to allow your IP address" -ForegroundColor Cyan
    Write-Host "      az redis firewall-rules create --name allow-my-ip --resource-group $resourceGroup --redis-name $redisName --start-ip $myIp --end-ip $myIp" -ForegroundColor Gray
}

Write-Host ""
