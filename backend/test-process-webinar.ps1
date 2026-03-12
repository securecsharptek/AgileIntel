# Test script for /api/media/process-webinar endpoint
Write-Host "`n=== Testing Async Video Processing Endpoint ===" -ForegroundColor Cyan
Write-Host "Endpoint: POST /api/media/process-webinar" -ForegroundColor Yellow

# Prepare test payload
$testPayload = @{
    sourceBlob = "https://stgsupadem media.blob.core.windows.net/media-assets/test-video.mp4"
    webinarId = "test-webinar-$(Get-Date -Format 'yyyyMMddHHmmss')"
    title = "Test Webinar - Async Processing"
    presenter = "John Doe"
    date = "2026-03-11"
}

$jsonBody = $testPayload | ConvertTo-Json

Write-Host "`nRequest Payload:" -ForegroundColor Yellow
Write-Host $jsonBody

Write-Host "`nSending request..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/media/process-webinar" `
        -Method POST `
        -ContentType "application/json" `
        -Body $jsonBody `
        -ErrorAction Stop
    
    Write-Host "`n✅ SUCCESS - Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3 | Write-Host
    
    # Test if response has expected fields
    if ($response.job_id -and $response.queued_asset_count -eq 12) {
        Write-Host "`n✅ Response validation PASSED" -ForegroundColor Green
        Write-Host "   - job_id: $($response.job_id)" -ForegroundColor Gray
        Write-Host "   - queued_asset_count: $($response.queued_asset_count)" -ForegroundColor Gray
        
        # Now test the job status endpoint
        Write-Host "`n--- Testing Job Status Endpoint ---" -ForegroundColor Cyan
        Start-Sleep -Seconds 2
        
        $statusResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/media/job-status/$($response.job_id)" `
            -Method GET `
            -ErrorAction Stop
        
        Write-Host "`n✅ Job Status Retrieved:" -ForegroundColor Green
        $statusResponse | ConvertTo-Json -Depth 3 | Write-Host
    } else {
        Write-Host "`n❌ Response validation FAILED" -ForegroundColor Red
        Write-Host "   Expected: job_id and queued_asset_count=12" -ForegroundColor Gray
        Write-Host "   Received: job_id=$($response.job_id), queued_asset_count=$($response.queued_asset_count)" -ForegroundColor Gray
    }
    
} catch {
    Write-Host "`n❌ ERROR - Request failed:" -ForegroundColor Red
    Write-Host "   Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
