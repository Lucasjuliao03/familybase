# Gera APK instalável (release) do Tudo de Família.
# Requisitos: Node.js, Android SDK (ANDROID_HOME), Java 17+, CMake (Kitware).
# Uso: npm run build:apk

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path ".env")) {
  Write-Host "ERRO: Crie o arquivo mobile/.env com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY" -ForegroundColor Red
  exit 1
}

if (-not $env:ANDROID_HOME) {
  $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (Test-Path $defaultSdk) {
    $env:ANDROID_HOME = $defaultSdk
    $env:ANDROID_SDK_ROOT = $defaultSdk
  }
}

if (-not $env:ANDROID_HOME) {
  Write-Host "ERRO: ANDROID_HOME não encontrado. Instale Android Studio / SDK." -ForegroundColor Red
  exit 1
}

# JDK sem acentos no path (JAVA_HOME com "Julião" quebra prefab/CMake no Windows)
$studioJbr = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path (Join-Path $studioJbr "bin\java.exe")) {
  $env:JAVA_HOME = $studioJbr
} elseif (-not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
  Write-Host "ERRO: Java 17+ não encontrado. Instale Android Studio ou JDK 17." -ForegroundColor Red
  exit 1
}
$env:PATH = (Join-Path $env:JAVA_HOME "bin") + ";" + $env:PATH
Write-Host ">> Java:" $env:JAVA_HOME -ForegroundColor DarkGray

# local.properties exigido pelo Gradle (forward slashes evitam problemas de encoding)
$localProps = Join-Path $Root "android\local.properties"
$sdkUnix = ($env:ANDROID_HOME -replace '\\', '/')
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($localProps, "sdk.dir=$sdkUnix`n", $utf8NoBom)

# Cache Gradle dentro do projeto (evita paths temporarios do sandbox)
$env:GRADLE_USER_HOME = Join-Path $Root ".gradle-home"
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null

function Set-AndroidBuildPath {
  $prepend = @()
  $kitware = "C:\Program Files\CMake\bin"
  if (Test-Path $kitware) { $prepend += $kitware }

  $cmakeSdk = Get-ChildItem (Join-Path $env:ANDROID_HOME "cmake") -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if ($cmakeSdk) { $prepend += (Join-Path $cmakeSdk.FullName "bin") }

  $prepend += (Join-Path $env:ANDROID_HOME "platform-tools")

  $filtered = ($env:PATH -split ';' | Where-Object {
    $_ -and ($_ -notmatch 'Python\\Python\d+\\Scripts')
  })
  $env:PATH = (($prepend + $filtered) -join ';')
}

Set-AndroidBuildPath

Write-Host ">> CMake usado:" -ForegroundColor DarkGray
& where.exe cmake 2>$null | Select-Object -First 1

Write-Host ">> Sincronizando projeto nativo Android (expo prebuild)..." -ForegroundColor Cyan
npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ">> Gerando APK release (arm64, celulares modernos)..." -ForegroundColor Cyan
Set-Location "$Root\android"
Set-AndroidBuildPath

# Para daemons antigos (evita conflito de JDK apos troca de JAVA_HOME)
.\gradlew.bat --stop 2>$null | Out-Null

.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$apk = Get-ChildItem -Path "app\build\outputs\apk\release" -Filter "*.apk" -Recurse | Select-Object -First 1
if (-not $apk) {
  Write-Host "ERRO: APK não encontrado em android/app/build/outputs/apk/release" -ForegroundColor Red
  exit 1
}

$destDir = Join-Path $Root "dist"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$dest = Join-Path $destDir "tudo-de-familia-release.apk"
Copy-Item $apk.FullName $dest -Force

Write-Host ""
Write-Host "APK pronto:" -ForegroundColor Green
Write-Host $dest
Write-Host ""
Write-Host "Instale no celular:" -ForegroundColor Yellow
Write-Host "  1. Copie o APK para o telefone e abra o arquivo, ou"
Write-Host ('  2. USB: adb install -r "' + $dest + '"')
