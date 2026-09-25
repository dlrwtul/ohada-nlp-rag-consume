#!/usr/bin/env bash
# Installe et lance tout ce qu'il faut pour l'app OHADA (Ollama + venv Python + serveur).
set -e

cd "$(dirname "$0")"

OLLAMA_MODEL="${OLLAMA_MODEL:-mistral}"
OLLAMA_HOST_URL="${OLLAMA_HOST:-http://localhost:11434}"

# 1. Ollama : installation si absente
if ! command -v ollama &> /dev/null; then
    echo "[start] Ollama non trouvé, installation..."
    curl -fsSL https://ollama.com/install.sh | sh
fi

# 2. Démarrage du service Ollama si pas déjà joignable
if ! curl -fsS "${OLLAMA_HOST_URL}/api/tags" > /dev/null 2>&1; then
    echo "[start] Démarrage d'Ollama en arrière-plan..."
    nohup ollama serve > /tmp/ollama-ohada.log 2>&1 &
    for _ in $(seq 1 20); do
        curl -fsS "${OLLAMA_HOST_URL}/api/tags" > /dev/null 2>&1 && break
        sleep 1
    done
fi

# 3. Téléchargement du modèle si nécessaire
if ! ollama list | awk '{print $1}' | grep -qx "${OLLAMA_MODEL}"; then
    echo "[start] Téléchargement du modèle ${OLLAMA_MODEL}..."
    ollama pull "${OLLAMA_MODEL}"
fi

# 4. Environnement virtuel Python
if [ ! -d ".venv" ]; then
    echo "[start] Création de l'environnement virtuel..."
    python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "[start] Installation des dépendances Python (peut prendre quelques minutes la première fois)..."
pip install -q -r requirements.txt

# 5. Fichier .env
if [ ! -f ".env" ]; then
    cp .env.example .env
fi

# 6. Lancement du serveur
echo "[start] Lancement sur http://localhost:${PORT:-8000} ..."
exec uvicorn app.main:app --reload --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}"
