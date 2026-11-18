# Google Play upload key helper. Shows a normal Windows password box (no hidden terminal prompt).
#   powershell -ExecutionPolicy Bypass -File tools\android_key.ps1 create   -> make the upload key (once)
#   powershell -ExecutionPolicy Bypass -File tools\android_key.ps1 sign     -> sign build\aab\unsigned.aab for Google Play
#   powershell -ExecutionPolicy Bypass -File tools\android_key.ps1 export   -> upload_certificate.pem (for a Play upload key reset)
# The password goes straight to keytool / jarsigner through a temporary environment variable of this process only;
# it is never written to a file or shown on screen. The key lives OUTSIDE the project: D:\skyrath-keys\skyrath-upload.jks
param([ValidateSet("create", "sign", "export")] [string]$Mode = "create")
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$Tools = if ($env:SKYRATH_ANDROID_TOOLS) { $env:SKYRATH_ANDROID_TOOLS } else { "D:\skyrath-android-tools" }
$Jdk = (Get-ChildItem $Tools -Directory -Filter "jdk-17*" | Select-Object -First 1).FullName
$Keytool = Join-Path $Jdk "bin\keytool.exe"
$Jarsigner = Join-Path $Jdk "bin\jarsigner.exe"
$Key = if ($env:SKYRATH_UPLOAD_KEY) { $env:SKYRATH_UPLOAD_KEY } else { "D:\skyrath-keys\skyrath-upload.jks" }
$Root = Split-Path $PSScriptRoot -Parent

function Show-Message([string]$text, [string]$icon = "Information") {
    [void][System.Windows.Forms.MessageBox]::Show($text, "Skyrath upload key", "OK", $icon)
}

# a small dialog with one or two masked password boxes; returns the password, or $null if cancelled
function Ask-Password([string]$intro, [bool]$confirm) {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Skyrath upload key"
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false; $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.ClientSize = New-Object System.Drawing.Size(420, $(if ($confirm) { 230 } else { 170 }))
    $form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = $intro
    $label.SetBounds(16, 12, 390, 60)
    $form.Controls.Add($label)

    $l1 = New-Object System.Windows.Forms.Label; $l1.Text = "Password"; $l1.SetBounds(16, 78, 120, 22); $form.Controls.Add($l1)
    $p1 = New-Object System.Windows.Forms.TextBox; $p1.UseSystemPasswordChar = $true; $p1.SetBounds(140, 76, 262, 26); $form.Controls.Add($p1)
    $p2 = $null
    if ($confirm) {
        $l2 = New-Object System.Windows.Forms.Label; $l2.Text = "Type it again"; $l2.SetBounds(16, 116, 120, 22); $form.Controls.Add($l2)
        $p2 = New-Object System.Windows.Forms.TextBox; $p2.UseSystemPasswordChar = $true; $p2.SetBounds(140, 114, 262, 26); $form.Controls.Add($p2)
    }
    $y = if ($confirm) { 176 } else { 118 }
    $ok = New-Object System.Windows.Forms.Button; $ok.Text = "OK"; $ok.SetBounds(220, $y, 88, 32); $form.Controls.Add($ok)
    $cancel = New-Object System.Windows.Forms.Button; $cancel.Text = "Cancel"; $cancel.SetBounds(314, $y, 88, 32)
    $cancel.DialogResult = "Cancel"; $form.Controls.Add($cancel)
    $form.AcceptButton = $ok; $form.CancelButton = $cancel

    $ok.Add_Click({
        if ($p1.Text.Length -lt 8) { Show-Message "Please use at least 8 characters (12 or more is better)." "Warning"; return }
        if ($confirm -and $p1.Text -ne $p2.Text) { Show-Message "The two passwords are different. Please type them again." "Warning"; $p2.Text = ""; return }
        $form.DialogResult = "OK"; $form.Close()
    })
    $form.Add_Shown({ $form.Activate(); $p1.Focus() })
    $result = $form.ShowDialog()
    $pw = $p1.Text
    $form.Dispose()
    if ($result -ne "OK") { return $null }
    return $pw
}

if ($Mode -eq "create") {
    if (Test-Path $Key) { Show-Message "An upload key already exists:`n$Key`n`nNothing was changed."; exit 0 }
    New-Item -ItemType Directory -Force (Split-Path $Key) | Out-Null
    $pw = Ask-Password "Choose a password for your Google Play upload key.`nSave it somewhere safe (a password manager). You need it for every update." $true
    if ($null -eq $pw) { Write-Host "Cancelled."; exit 1 }
    $env:SKYRATH_KEY_PW = $pw; $pw = $null
    try {
        Write-Host "Creating the upload key (this takes a few seconds)..."
        & $Keytool -genkeypair -keystore $Key -storetype PKCS12 -alias upload -keyalg RSA -keysize 4096 -validity 10000 `
            -dname "CN=Sabbir Ahmed Shuvo, O=DevilExxon" -storepass:env SKYRATH_KEY_PW -keypass:env SKYRATH_KEY_PW
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Key)) { throw "keytool failed" }
        $sha1 = (& $Keytool -list -v -keystore $Key -alias upload -storepass:env SKYRATH_KEY_PW | Select-String "SHA1:").ToString().Trim()
        Write-Host "Upload key created: $Key"
        Write-Host "Certificate fingerprint $sha1"
        Show-Message "Upload key created:`n$Key`n`nBack up this file (USB stick or cloud drive) and keep the password safe."
    } finally { Remove-Item Env:SKYRATH_KEY_PW -ErrorAction SilentlyContinue }
}

if ($Mode -eq "sign") {
    if (-not (Test-Path $Key)) { Show-Message "No upload key found at:`n$Key`n`nCreate it first (android_key.ps1 create)." "Error"; exit 1 }
    $Unsigned = Join-Path $Root "build\aab\unsigned.aab"
    if (-not (Test-Path $Unsigned)) { Show-Message "No bundle to sign yet. Build it first:`nbash tools/build_android.sh unsigned" "Error"; exit 1 }
    $ver = ((Get-Content (Join-Path $Root "android\version.properties")) | Where-Object { $_ -like "versionName=*" }) -replace "versionName=", ""
    $Out = Join-Path $Root "dist\release\Skyrath-v$($ver.Trim())-GooglePlay.aab"
    $pw = Ask-Password "Enter your Google Play upload key password to sign Skyrath v$($ver.Trim())." $false
    if ($null -eq $pw) { Write-Host "Cancelled."; exit 1 }
    $env:SKYRATH_KEY_PW = $pw; $pw = $null
    try {
        & $Jarsigner -keystore $Key -storepass:env SKYRATH_KEY_PW -sigalg SHA256withRSA -digestalg SHA-256 -signedjar $Out $Unsigned upload
        if ($LASTEXITCODE -ne 0) { throw "signing failed (wrong password?)" }
        & $Jarsigner -verify $Out | Select-Object -Last 1
        Write-Host "Signed bundle: $Out"
        Show-Message "Signed and ready to upload to Google Play:`n$Out"
    } catch {
        Show-Message "Signing failed. If the password was wrong, run the sign step again." "Error"; exit 1
    } finally { Remove-Item Env:SKYRATH_KEY_PW -ErrorAction SilentlyContinue }
}

if ($Mode -eq "export") {
    if (-not (Test-Path $Key)) { Show-Message "No upload key found at:`n$Key" "Error"; exit 1 }
    $Pem = Join-Path (Split-Path $Key) "upload_certificate.pem"
    $pw = Ask-Password "Enter your upload key password to export its certificate (the public part, safe to give to Google)." $false
    if ($null -eq $pw) { Write-Host "Cancelled."; exit 1 }
    $env:SKYRATH_KEY_PW = $pw; $pw = $null
    try {
        & $Keytool -export -rfc -keystore $Key -alias upload -storepass:env SKYRATH_KEY_PW -file $Pem
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Pem)) { throw "export failed (wrong password?)" }
        Write-Host "Certificate: $Pem"
        Show-Message "Certificate saved:`n$Pem`n`nUpload this file in Play Console when you request the upload key reset."
    } catch {
        Show-Message "Export failed. If the password was wrong, run it again." "Error"; exit 1
    } finally { Remove-Item Env:SKYRATH_KEY_PW -ErrorAction SilentlyContinue }
}
