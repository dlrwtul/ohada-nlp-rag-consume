# OHADA Assistant — mini app RAG

Mini application web qui consomme un pipeline RAG (retrieval-augmented generation) sur le corpus juridique OHADA : embeddings BGE + Chroma pour le retrieval, Qwen2.5-3B-Instruct servi par Ollama (CPU) pour la génération, le tout derrière une API FastAPI avec une interface de chat moderne (dark/light).

## Prérequis

- Python 3.10+
- [Ollama](https://ollama.com) installé et lancé (aucun GPU requis — Ollama tourne bien sur CPU)
- Un token Hugging Face (optionnel, recommandé pour éviter le rate-limit lors du téléchargement du dataset/des embeddings)

## Installation

```bash
# 1. Installer et lancer Ollama (une seule fois)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b

# 2. Environnement Python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# éditer .env si besoin (HF_TOKEN, OLLAMA_MODEL, etc.)
```

Ollama démarre généralement un service en arrière-plan automatiquement après l'installation. S'il n'écoute pas encore, lance-le manuellement dans un terminal séparé :

```bash
ollama serve
```

## Lancement

```bash
uvicorn app.main:app --reload
```

Au premier démarrage, si aucun index Chroma n'existe dans `CHROMA_DIR` (par défaut `./chroma_db`), l'app construit les embeddings et persiste l'index automatiquement à partir du dataset. Les démarrages suivants réutilisent l'index existant.

Le dataset est chargé depuis `data/ohada.xlsx` (fichier local, `DATASET_XLSX_PATH`) s'il est présent — c'est le cas par défaut dans ce repo, donc tout fonctionne 100% hors-ligne dès le premier lancement. S'il est absent, il est téléchargé depuis le Hub Hugging Face (`DATASET_NAME=uriel/Maathis_Ohada_dataset`).

Au lancement, le terminal affiche si Ollama est bien joignable et si le modèle demandé est déjà téléchargé (`[rag] Ollama OK — modèle '...' disponible.`), ainsi que le temps de retrieval/génération pour chaque question.

Ouvrir [http://localhost:8000](http://localhost:8000).

## Reconstruire l'index manuellement

```bash
python -m ingestion.build_index
```

Utile après un changement de dataset ou de modèle d'embeddings (il faut alors supprimer le dossier `chroma_db/` existant avant de relancer).

## Structure

```
ingestion/build_index.py   # dataset -> Documents -> embeddings -> Chroma persisté
app/rag.py                 # vectorstore + appel à Ollama + fonctions ask()/ask_many()
app/main.py                # API FastAPI (/ask, /ask-batch, /stop, /info) + service de l'UI statique
app/static/                # interface de chat (HTML/CSS/JS, dark & light, sidebar d'info)
```

## Notebook GPU vs version locale

Le notebook `notebook/NLP_project_ollama.ipynb` de ce repo est la version **sans GPU** : il remplace le chargement direct de Qwen2.5-3B-Instruct en 4-bit (bitsandbytes, nécessite une carte comme la Tesla T4) par un appel à Ollama, qui sert le même modèle quantifié (GGUF) et tourne très bien sur CPU. C'est celui-là qu'il faut utiliser sur une machine sans GPU — l'app FastAPI (`app/`) en est l'équivalent packagé.

Si tu as un notebook différent qui charge le modèle directement via `transformers`/`bitsandbytes` (comme celui qui vérifie `nvidia-smi` / Tesla T4), deux options :
- L'adapter comme `notebook/NLP_project_ollama.ipynb` (remplacer les cellules de chargement du modèle + génération par les appels à Ollama ci-dessus) pour le faire tourner en local sans GPU.
- Le lancer tel quel sur [Google Colab](https://colab.research.google.com/) : `Fichier > Importer un notebook`, puis `Exécution > Modifier le type d'exécution > GPU (T4)` (disponible gratuitement, avec quotas d'usage). Il faut alors aussi uploader `data/ohada.xlsx` dans l'environnement Colab (panneau fichiers à gauche, ou `from google.colab import drive`) puisque `pd.read_excel('ohada.xlsx')` lit un fichier local à l'environnement d'exécution.

## Endpoints API

```
POST /ask
Body: {"question": "..."}
Réponse: {"answer": "...", "sources": [...], "interrupted": false}

POST /ask-batch
Body: multipart/form-data avec un fichier "file" (.csv ou .xlsx, colonne "question")
Réponse: [{"question": "...", "answer": "...", "sources": [...]}, ...]

POST /stop
Interrompt la génération en cours.

GET /info
Retourne la configuration réelle du pipeline (dataset, modèle, embeddings, etc.)
affichée dans la sidebar de l'UI.
```
