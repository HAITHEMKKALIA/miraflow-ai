# Script de démarrage Supabase local CLI en une commande
# Usage:  .\start-supabase.ps1
# Pour installer Docker Desktop: https://www.docker.com/products/docker-desktop/
# - Lancez Docker Desktop AVANT ce script
# - Une fois Docker démarré, exécutez ce script pour démarrer Supabase local (port default DB=54322, Studio=54323)

$ErrorActionPreference = 'Stop'
$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$INVOKER = Join-Path $PROJECT_ROOT 'Invoke-Supabase.ps1'

Write-Host ''
Write-Host '======================================================='  -ForegroundColor Cyan
Write-Host ' Supabase CLI Sandbox Fix - Démarrage stack locale    '  -ForegroundColor Cyan
Write-Host '======================================================='  -ForegroundColor Cyan
Write-Host ''

Write-Host '[1/3] Vérification Docker...' -ForegroundColor Yellow
$dockerOK = $false
try {
  $ver = & docker info --format '{{.ServerVersion}}' 2>$null
  if ($ver) { $dockerOK = $true; Write-Host ('  OK - Docker version: ' + $ver) -ForegroundColor Green }
} catch {}
if (-not $dockerOK) {
  Write-Host '  ❌ Docker non détecté ou daemon arrêté' -ForegroundColor Red
  Write-Host ''
  Write-Host '  Solution:'
  Write-Host '   • Installer Docker Desktop: https://www.docker.com/products/docker-desktop/'
  Write-Host '   • OU lancer Docker Desktop et attendre "Docker Desktop is running"'
  Write-Host '   • PUIS ré-exécuter ce script'
  Write-Host ''
  Write-Host '  Note: Docker indisponible -> aucune action, le bridge utilise le SUPABASE CLOUD distant.' -ForegroundColor DarkGray
  exit 1
}

Write-Host ''
Write-Host '[2/3] Diagnostic projet Supabase (dossier supabase/)...' -ForegroundColor Yellow
$SUPABASE_DIR = Join-Path $PROJECT_ROOT 'supabase'
if (Test-Path -LiteralPath $SUPABASE_DIR) {
  $files = Get-ChildItem -LiteralPath $SUPABASE_DIR | Select-Object -ExpandProperty Name
  Write-Host ('  Trouvé: ' + ($files -join ', ')) -ForegroundColor Green
} else {
  Write-Host '  ⚠ Aucun dossier supabase/ dans le projet. Initialisation...' -ForegroundColor Yellow
  & $INVOKER init
  if ($LASTEXITCODE -ne 0) { Write-Host '  ❌ supabase init échoué' -ForegroundColor Red; exit 2 }
  Write-Host '  OK - Projet initialisé' -ForegroundColor Green
}

Write-Host ''
Write-Host '[3/3] supabase start (télécharge les images Docker, démarre stack ~1min)...' -ForegroundColor Yellow
& $INVOKER start
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '  ❌ supabase start échoué. Voir les erreurs ci-dessus.' -ForegroundColor Red
  exit 3
}

Write-Host ''
Write-Host '=======================================================' -ForegroundColor Green
Write-Host ' SUPABASE LOCAL DÉMARRÉ AVEC SUCCÈS' -ForegroundColor Green
Write-Host '=======================================================' -ForegroundColor Green
Write-Host ''
& $INVOKER status
Write-Host ''
Write-Host '  Liens utiles:'
Write-Host '   • Studio (UI):      http://localhost:54323'
Write-Host '   • DB URL locale:    postgresql://postgres:postgres@localhost:54322/postgres'
Write-Host '   • API REST:         http://localhost:54321'
Write-Host ''
Write-Host '  Commandes rapides:'
Write-Host '   • .\Invoke-Supabase.ps1 stop     # Arrêter la stack'
Write-Host '   • .\Invoke-Supabase.ps1 status   # Vérifier santé'
Write-Host '   • .\Invoke-Supabase.ps1 db reset # Reset DB (perte données!)'
Write-Host ''
