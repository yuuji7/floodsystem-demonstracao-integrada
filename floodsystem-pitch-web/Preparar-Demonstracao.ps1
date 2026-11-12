param(
  [string]$Source = (Join-Path $PSScriptRoot '..\floodsystem-software')
)

$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath (Join-Path $Source 'backend\requirements.txt') -PathType Leaf)) {
  throw 'Execute git submodule update --init --recursive na raiz do repositorio ou informe -Source com o caminho do FloodSystem original.'
}
$Source = (Resolve-Path -LiteralPath $Source).Path
$runtime = Join-Path $PSScriptRoot 'integracao\.runtime'
$python = Join-Path $runtime 'python\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) {
  & python -m venv (Join-Path $runtime 'python')
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o Python.' }
}
& $python -m pip install --disable-pip-version-check -r (Join-Path $Source 'backend\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências do backend.' }
& $python -B (Join-Path $PSScriptRoot 'integracao\prepare_frontend.py') $Source
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar a cópia do painel.' }
& $python -B (Join-Path $PSScriptRoot 'integracao\prepare_laboratory.py')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o Laboratório 3D completo.' }

Push-Location -LiteralPath (Join-Path $runtime 'frontend')
try {
  & pnpm.cmd install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências do painel.' }
  $env:VITE_API_BASE_URL = ''
  $env:VITE_ARTICLE_MODE = 'false'
  $env:VITE_EXPERIMENTS_ENABLED = 'true'
  & pnpm.cmd run build --base=/painel/
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o painel.' }
} finally {
  Pop-Location
}
& node (Join-Path $PSScriptRoot 'build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar a apresentação.' }
Write-Host 'Pronto. Abra Abrir-Demonstracao-Integrada.cmd.'
