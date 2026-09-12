# Installe et lance tout ce qu'il faut pour l'app OHADA (Ollama + venv Python + serveur), sous Windows (PowerShell).
$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

$OllamaModel = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "qwen2.5:3b" }
$OllamaHostUrl = if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST } else { "http://localhost:11434" }

# 1. Ollama : installation si absente
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "[start] Ollama non trouvé. Télécharge et installe-le depuis https://ollama.com/download avant de relancer ce script."
    exit 1
}

# 2. Démarrage du service Ollama si pas déjà joignable
try {
    Invoke-RestMethod -Uri "$OllamaHostUrl/api/tags" -TimeoutSec 3 | Out-Null
} catch {
    Write-Host "[start] Démarrage d'Ollama en arrière-plan..."
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try {
            Invoke-RestMethod -Uri "$OllamaHostUrl/api/tags" -TimeoutSec 3 | Out-Null
            $ready = $true
            break
        } catch {}
    }
    if (-not $ready) {
        Write-Host "[start] Impossible de contacter Ollama sur $OllamaHostUrl."
        exit 1
    }
}

# 3. Téléchargement du modèle si nécessaire
$models = (ollama list) -join "`n"
if ($models -notmatch [regex]::Escape($OllamaModel)) {
    Write-Host "[start] Téléchargement du modèle $OllamaModel..."
    ollama pull $OllamaModel
}

# 4. Environnement virtuel Python
if (-not (Test-Path ".venv")) {
    Write-Host "[start] Création de l'environnement virtuel..."
    python -m venv .venv
}
. .\.venv\Scripts\Activate.ps1

Write-Host "[start] Installation des dépendances Python (peut prendre quelques minutes la première fois)..."
pip install -q -r requirements.txt

# 5. Fichier .env
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}

# 6. Lancement du serveur
$port = if ($env:PORT) { $env:PORT } else { "8000" }
$hostAddr = if ($env:HOST) { $env:HOST } else { "0.0.0.0" }
Write-Host "[start] Lancement sur http://localhost:$port ..."
uvicorn app.main:app --reload --host $hostAddr --port $port
