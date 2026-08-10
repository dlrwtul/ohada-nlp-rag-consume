# OHADA Assistant — mini app RAG

Mini application web qui consomme un pipeline RAG (retrieval-augmented generation) sur le corpus juridique OHADA : embeddings BGE + Chroma pour le retrieval, Qwen2.5-3B-Instruct (4bit) pour la génération, servis derrière une API FastAPI avec une interface de chat moderne (dark/light).

## Prérequis

- Python 3.10+
- Un GPU avec au moins ~6 Go de VRAM (le modèle est chargé en 4bit via bitsandbytes)
- Un token Hugging Face (optionnel, recommandé pour éviter le rate-limit)

## Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# éditer .env si besoin (HF_TOKEN, MODEL_ID, etc.)
```

## Lancement

```bash
uvicorn app.main:app --reload
```

Au premier démarrage, si aucun index Chroma n'existe dans `CHROMA_DIR` (par défaut `./chroma_db`), l'app télécharge le dataset `uriel/Maathis_Ohada_dataset`, construit les embeddings et persiste l'index automatiquement. Les démarrages suivants réutilisent l'index existant.

Ouvrir [http://localhost:8000](http://localhost:8000).

## Reconstruire l'index manuellement

```bash
python -m ingestion.build_index
```

Utile après un changement de dataset ou de modèle d'embeddings (il faut alors supprimer le dossier `chroma_db/` existant avant de relancer).

## Structure

```
ingestion/build_index.py   # dataset -> Documents -> embeddings -> Chroma persisté
app/rag.py                 # vectorstore + LLM + fonction ask()
app/main.py                # API FastAPI (/ask) + service de l'UI statique
app/static/                # interface de chat (HTML/CSS/JS, dark & light)
```

## Endpoint API

```
POST /ask
Body: {"question": "..."}
Réponse: {"answer": "...", "sources": [{"title": "...", "details": "..."}, ...]}
```
