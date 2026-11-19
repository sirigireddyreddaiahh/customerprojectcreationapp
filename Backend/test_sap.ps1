$clientId = "BTP_DEV_INTEGRATION"
$clientSecret = "Btp_Dev_Integration@123456"
$url = "https://my434938-api.s4hana.cloud.sap/sap/opu/odata4/sap/api_cost_center/srvd_a2x/sap/costcenter/0001/A_CostCenter_2"

# Test 1
$t1_status = ""
$t1_body = ""
try {
    $res = Invoke-WebRequest -Uri $url -Method Get -SkipHeaderValidation -ErrorAction Stop
    $t1_status = $res.StatusCode
    $t1_body = $res.Content.Substring(0, [Math]::Min(100, $res.Content.Length))
} catch {
    if ($_.Exception.Response) {
        $t1_status = $_.Exception.Response.StatusCode.Value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        $t1_body = $body.Substring(0, [Math]::Min(200, $body.Length))
    } else {
        $t1_status = "Error"
        $t1_body = $_.Exception.Message
    }
}

# Test 2
$t2_status = ""
$t2_body = ""
try {
    $headers = @{ "clientid" = $clientId; "clientsecret" = $clientSecret }
    $res = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -SkipHeaderValidation -ErrorAction Stop
    $t2_status = $res.StatusCode
    $t2_body = $res.Content.Substring(0, [Math]::Min(100, $res.Content.Length))
} catch {
    if ($_.Exception.Response) {
        $t2_status = $_.Exception.Response.StatusCode.Value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        $t2_body = $body.Substring(0, [Math]::Min(200, $body.Length))
    } else {
        $t2_status = "Error"
        $t2_body = $_.Exception.Message
    }
}

# Test 3
$t3_status = ""
$t3_body = ""
$successResponseContent = ""
try {
    $pair = "$($clientId):$($clientSecret)"
    $encoded = [System.Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes($pair))
    $headers = @{ "Authorization" = "Basic $encoded" }
    $res = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -SkipHeaderValidation -ErrorAction Stop
    $t3_status = $res.StatusCode
    $t3_body = $res.Content.Substring(0, [Math]::Min(250, $res.Content.Length))
    $successResponseContent = $res.Content
} catch {
    if ($_.Exception.Response) {
        $t3_status = $_.Exception.Response.StatusCode.Value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        $t3_body = $body.Substring(0, [Math]::Min(200, $body.Length))
    } else {
        $t3_status = "Error"
        $t3_body = $_.Exception.Message
    }
}

Write-Host "T1Status: $t1_status"
Write-Host "T1Body: $t1_body"
Write-Host "T2Status: $t2_status"
Write-Host "T2Body: $t2_body"
Write-Host "T3Status: $t3_status"
Write-Host "T3Body: $t3_body"

if ($successResponseContent) {
    Set-Content -Path "sap_success.json" -Value $successResponseContent
}
