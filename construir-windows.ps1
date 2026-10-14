# Construye el instalador de MONETA en Windows.
# Uso (PowerShell, dentro de la carpeta del proyecto):  .\construir-windows.ps1
$ErrorActionPreference = 'Stop'

function Requiere($cmd, $ayuda) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "Falta '$cmd'. $ayuda" -ForegroundColor Red
    exit 1
  }
}

Requiere node  'Instala Node.js 22 o superior: https://nodejs.org'
Requiere cargo 'Instala Rust (rustup): https://rustup.rs  (luego cierra y abre PowerShell)'

$v = [int](node -p "process.versions.node.split('.')[0]")
if ($v -lt 22) { Write-Host "Se necesita Node 22+ (tienes $v)." -ForegroundColor Red; exit 1 }

# Rust en Windows necesita las Build Tools de Visual Studio con "Desarrollo para el escritorio con C++".
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere) -or -not (& $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)) {
  Write-Host "No encuentro las Build Tools de Visual Studio con C++. Instálalas desde https://visualstudio.microsoft.com/visual-cpp-build-tools/ (carga de trabajo 'Desarrollo para el escritorio con C++')." -ForegroundColor Red
  exit 1
}

npm install
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm test
if ($LASTEXITCODE) { Write-Host 'Las pruebas fallaron; no se construye el instalador.' -ForegroundColor Red; exit $LASTEXITCODE }
npm run tauri:build
if ($LASTEXITCODE) { exit $LASTEXITCODE }

$dir = 'src-tauri\target\release\bundle\nsis'
Write-Host "`nListo. Instalador en: $((Resolve-Path $dir).Path)" -ForegroundColor Green
Get-ChildItem $dir -Filter *.exe | ForEach-Object { Write-Host "  $($_.Name)" }
