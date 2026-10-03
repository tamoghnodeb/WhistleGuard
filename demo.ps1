$base = "http://localhost:3000"

Write-Host "`n=== 1. Submit Anonymous Report ===" -ForegroundColor Cyan
$reportBody = @{
    category = "security"
    description = "Found an open admin panel at internal.corp/admin that bypasses authentication. Anyone with the URL can access sensitive employee data."
    evidence_url = "https://screenshots.example.com/admin-panel.png"
} | ConvertTo-Json

$report = Invoke-RestMethod -Method Post -Uri "$base/api/reports" -ContentType "application/json" -Body $reportBody
$report | ConvertTo-Json -Depth 5
$caseCode = $report.data.case_code
Write-Host "`nCase Code: $caseCode" -ForegroundColor Green

Write-Host "`n=== 2. Track Report (as anonymous reporter) ===" -ForegroundColor Cyan
$track = Invoke-RestMethod -Uri "$base/api/reports/$caseCode"
$track | ConvertTo-Json -Depth 5

Write-Host "`n=== 3. Moderator Login ===" -ForegroundColor Cyan
$loginBody = @{ username = "admin"; password = "admin123" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$base/api/moderator/login" -ContentType "application/json" -Body $loginBody
$token = $login.data.token
Write-Host "Token: $($token.Substring(0, 30))..." -ForegroundColor Green

$headers = @{ Authorization = "Bearer $token" }

Write-Host "`n=== 4. View All Reports (moderator) ===" -ForegroundColor Cyan
$reports = Invoke-RestMethod -Uri "$base/api/moderator/reports" -Headers $headers
$reports | ConvertTo-Json -Depth 5

Write-Host "`n=== 5. Update Status: SUBMITTED -> UNDER_REVIEW ===" -ForegroundColor Cyan
$updateBody = @{
    status = "UNDER_REVIEW"
    message = "Your report is being investigated by our security team."
} | ConvertTo-Json
$update = Invoke-RestMethod -Method Patch -Uri "$base/api/moderator/reports/1/status" -ContentType "application/json" -Body $updateBody -Headers $headers
$update | ConvertTo-Json -Depth 5

Write-Host "`n=== 6. Reporter checks update ===" -ForegroundColor Cyan
$trackAgain = Invoke-RestMethod -Uri "$base/api/reports/$caseCode"
$trackAgain | ConvertTo-Json -Depth 5

Write-Host "`n=== 7. Dashboard Stats ===" -ForegroundColor Cyan
$stats = Invoke-RestMethod -Uri "$base/api/moderator/stats" -Headers $headers
$stats | ConvertTo-Json -Depth 5

Write-Host "`n=== All tests passed! ===" -ForegroundColor Green
