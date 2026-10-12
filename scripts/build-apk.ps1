# Gera APK instalável (release) do Tudo de Família.
# Requisitos: Node.js, SDK Android e JDK 17+, com a assinatura existente do Expo.
# Uso: npm run build:apk

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$localToolchain = Join-Path (Split-Path -Parent $Root) '.local-android'
$localJdk = Get-ChildItem (Join-Path $localToolchain 'jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($localJdk) { $env:JAVA_HOME = $localJdk.FullName }
if (Test-Path (Join-Path $localToolchain 'sdk/platforms/android-36')) {
  $env:ANDROID_HOME = Join-Path $localToolchain 'sdk'
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
}
if (-not (Test-Path 'credentials.json')) {
  throw 'Baixe a assinatura existente com eas credentials antes de compilar uma atualização.'
}

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
if (-not $localJdk -and (Test-Path (Join-Path $studioJbr "bin\java.exe"))) {
  $env:JAVA_HOME = $studioJbr
} elseif (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
  Write-Host "ERRO: Java 17+ não encontrado. Instale Android Studio ou JDK 17." -ForegroundColor Red
  exit 1
}
$env:PATH = (Join-Path $env:JAVA_HOME "bin") + ";" + $env:PATH
Write-Host ">> Java:" $env:JAVA_HOME -ForegroundColor DarkGray

# local.properties exigido pelo Gradle (forward slashes evitam problemas de encoding)
$localProps = Join-Path $Root "android\local.properties"
$sdkUnix = ($env:ANDROID_HOME -replace '\\', '/')
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

# Cache Gradle dentro do projeto (evita paths temporarios do sandbox)
$env:GRADLE_USER_HOME = Join-Path $Root ".gradle-home"
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null
# Hermes writes its intermediate files through TEMP/TMP; keep them in the
# workspace so both restricted and local builds use a writable build directory.
$taskBuildTemp = Join-Path $Root '.build-tmp'
New-Item -ItemType Directory -Force -Path $taskBuildTemp | Out-Null
$env:TEMP = $taskBuildTemp
$env:TMP = $taskBuildTemp

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
$sdkTemplate = Join-Path $localToolchain 'template-sdk56.tgz'
if (-not (Test-Path $sdkTemplate)) {
  throw 'Template oficial SDK 56 ausente: prepare .local-android/template-sdk56.tgz antes de compilar.'
}
npx expo prebuild --platform android --no-install --template $sdkTemplate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
[System.IO.File]::WriteAllText($localProps, "sdk.dir=$sdkUnix`n", $utf8NoBom)
# AGP 8.12 and the installed Foojay resolver require the compatible Gradle 8 line.
$wrapperProperties = Join-Path $Root 'android/gradle/wrapper/gradle-wrapper.properties'
$wrapperSource = [System.IO.File]::ReadAllText($wrapperProperties)
$wrapperSource = $wrapperSource -replace 'gradle-[0-9.]+-bin.zip', 'gradle-8.14.3-bin.zip'
[System.IO.File]::WriteAllText($wrapperProperties, $wrapperSource, $utf8NoBom)
$appGradle = Join-Path $Root 'android/app/build.gradle'
$signingLine = 'apply from: rootProject.file("../scripts/release-signing.gradle")'
$gradleSource = [System.IO.File]::ReadAllText($appGradle)
if (-not $gradleSource.Contains($signingLine)) {
  [System.IO.File]::WriteAllText($appGradle, $gradleSource + "`n" + $signingLine + "`n", $utf8NoBom)
}

Write-Host ">> Gerando APK release com assinatura existente (ARM64 e ARMv7)..." -ForegroundColor Cyan
Set-Location "$Root\android"
Set-AndroidBuildPath

# Para daemons antigos (evita conflito de JDK apos troca de JAVA_HOME)
.\gradlew.bat --stop 2>$null | Out-Null

.\gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' --no-daemon --max-workers=4
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
