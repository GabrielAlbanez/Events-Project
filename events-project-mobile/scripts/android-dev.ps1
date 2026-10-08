$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
$env:NODE_ENV = 'development'
$env:EXPO_PUBLIC_API_URL = 'http://10.0.2.2:4100'
$env:EXPO_PUBLIC_SOCKET_URL = 'http://10.0.2.2:4100'
# Only the generated C++ cache uses this alias; Node keeps the real project path.
$mapping = (& subst) | Where-Object { $_ -match '^X:\\: => ' }
if ($mapping) {
    $mappedDirectory = ($mapping -split ' => ', 2)[1].TrimEnd('\')
    if ($mappedDirectory -ine $projectDirectory.TrimEnd('\')) { throw 'X: está ocupado por outro projeto. Libere essa letra ou ajuste o script.' }
} elseif (Test-Path -LiteralPath 'X:\') {
    throw 'X: está ocupado por uma unidade existente. Ajuste a letra no script.'
} else {
    & subst X: $projectDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o alias temporário do build.' }
}
$env:EVENTMAP_NATIVE_CXX_DIR = 'X:\.cxx'
Set-Location -LiteralPath $projectDirectory
npx expo run:android --port 8082 --no-bundler
exit $LASTEXITCODE
