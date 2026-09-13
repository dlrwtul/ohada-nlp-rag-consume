# OHADA Assistant — mini app RAG

Mini application web qui consomme un pipeline RAG (retrieval-augmented generation) sur le corpus juridique OHADA : embeddings BGE + Chroma pour le retrieval, Qwen2.5-1.5B-Instruct (open-source, licence Apache-2.0) servi par Ollama (CPU) pour la génération, le tout derrière une API FastAPI avec une interface de chat moderne (dark/light), des réponses **streamées** token par token, et plusieurs discussions persistées par utilisateur (avec ou sans compte).

Une landing page publique (`/`) explique le projet ; on peut discuter directement (`/app`) **sans créer de compte** — une seule discussion est alors conservée. Se connecter ou créer un compte (`/login`, `/register`) permet d'en garder plusieurs.

## Prérequis

- Python 3.10+
- [Ollama](https://ollama.com) installé et lancé (aucun GPU requis — Ollama tourne bien sur CPU)
- Un token Hugging Face (optionnel, recommandé pour éviter le rate-limit lors du téléchargement du dataset/des embeddings)

## Démarrage rapide (script tout-en-un)

Un script s'occupe de tout : installer/démarrer Ollama, télécharger le modèle, créer le venv Python, installer les dépendances et lancer le serveur.

- **Linux / macOS / WSL (Ubuntu, etc.)** :
  ```bash
  ./start.sh
  ```
- **Windows (PowerShell)** — installe d'abord [Ollama pour Windows](https://ollama.com/download) manuellement (le script ne peut pas le faire), puis :
  ```powershell
  .\start.ps1
  ```

Le script est idempotent (relançable sans risque) : il saute les étapes déjà faites (Ollama déjà installé/lancé, modèle déjà téléchargé, venv déjà créé, `.env` déjà présent). Une fois lancé, ouvrir [http://localhost:8000](http://localhost:8000).

## Installation manuelle (détail des étapes du script)

```bash
# 1. Installer et lancer Ollama (une seule fois)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:1.5b

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

Ouvrir [http://localhost:8000](http://localhost:8000) (landing page) ou directement [http://localhost:8000/app](http://localhost:8000/app) (chat, sans compte).

## Performance

**Ce qui se passe réellement à chaque question** (pour dissiper le doute : non, le "notebook" n'est pas relancé à chaque interaction) :

1. **Au démarrage du serveur, une seule fois** (`app/main.py`, fonction `lifespan`) : construction/chargement de l'index Chroma (embeddings du corpus) et création d'une unique instance `RagEngine` (charge le modèle d'embeddings BGE en RAM). Ce coût est payé une fois par démarrage de `uvicorn`/`start.sh`, jamais par question.
2. **À chaque question** (`app/rag.py`, `_generate`/`_generate_stream`) : seulement une recherche vectorielle Chroma (quasi instantanée, quelques ms sur ~1200 documents) puis un appel à Ollama pour la génération — c'est la seule étape coûteuse par requête, et c'est purement le temps que met le modèle à produire ses tokens sur ton CPU.

Le terminal affiche à chaque réponse une ligne `[rag] retrieval: Xs | génération: Ys | total: Zs` — **c'est le premier réflexe pour diagnostiquer une lenteur** : si `retrieval` est élevé (rare), c'est l'index qui a un problème ; si c'est `génération` qui domine (le cas le plus probable), la génération LLM elle-même est le goulot, pas le RAG autour.

Les réponses sont **streamées** token par token (comme la plupart des chats LLM) : le premier mot apparaît en ~1s au lieu d'attendre la fin de toute la génération, ce qui réduit la latence *perçue* — mais le temps total pour un paragraphe de 100 tokens sur CPU reste ce qu'il est. Si `génération` est systématiquement long (dizaines de secondes), les leviers réels sont :

- **`OLLAMA_MODEL`** : `qwen2.5:1.5b` (par défaut ici, Apache-2.0) est déjà le compromis rapide. `qwen2.5:3b` répond un peu mieux mais est ~2x plus lent *et* sous licence Qwen Research (non-commerciale, pas open-source) — à réserver aux usages où la licence du modèle n'est pas contrainte (voir section Zindi plus bas).
- **`OLLAMA_KEEP_ALIVE`** (nouveau, voir `.env.example`) : par défaut Ollama décharge le modèle de la RAM après 5 minutes d'inactivité — le rechargement depuis le disque au message suivant ajoute plusieurs secondes. `OLLAMA_KEEP_ALIVE=30m` (déjà la valeur par défaut ici) garde le modèle chargé plus longtemps ; `-1` pour ne jamais le décharger si la RAM le permet.
- **CPU réellement alloué** : sous WSL2/Windows notamment, vérifie que WSL n'est pas bridé (`.wslconfig` — par défaut WSL2 limite parfois la RAM/CPU disponible) et regarde l'usage CPU (`htop`/gestionnaire des tâches) pendant la génération : si un seul cœur tourne à 100% et les autres à 0%, Ollama n'exploite pas tout le CPU disponible.

## Comptes, invités et conversations

- **Sans compte** : dès l'arrivée sur `/app`, une identité "invité" est créée automatiquement (cookie de session) et permet de mener **une seule discussion**, consultable en revenant sur la page.
- **Avec compte** (`/register` puis `/login`) : autant de discussions que voulu, listées et rechargeables depuis la sidebar "Mes discussions". Si une discussion invité était en cours au moment de la connexion, elle est automatiquement rattachée au compte (rien n'est perdu).
- Les mots de passe sont hashés avec `bcrypt` ; la session est un cookie signé (`SessionMiddleware`, `HttpOnly`, `SameSite=Lax`). Voir `SESSION_SECRET`/`SESSION_HTTPS_ONLY` dans `.env.example`.
- Toutes les discussions et messages sont stockés dans une base SQLite locale (`APP_DB_PATH`, par défaut `./app.db`, gitignorée).

## Reconstruire l'index manuellement

```bash
python -m ingestion.build_index
```

Utile après un changement de dataset ou de modèle d'embeddings (il faut alors supprimer le dossier `chroma_db/` existant avant de relancer).

## Structure

```
ingestion/build_index.py   # dataset -> Documents -> embeddings -> Chroma persisté
app/rag.py                  # vectorstore + appel à Ollama (bufferisé ET streamé) + ask()/ask_stream()/ask_many()
app/db.py                   # stockage SQLite (utilisateurs/invités, conversations, messages)
app/auth.py                 # hash de mot de passe (bcrypt), identité de session (compte ou invité)
app/main.py                 # API FastAPI (auth, conversations, /ask streamé, /ask-batch, /info) + pages statiques
app/static/                 # landing, login/register, chat (HTML/CSS/JS, dark & light, sidebars info + conversations)
```

## Notebook GPU vs version locale

Le notebook `notebook/NLP_project_ollama.ipynb` de ce repo est la version **sans GPU** : il remplace le chargement direct d'un modèle en 4-bit (bitsandbytes, nécessite une carte comme la Tesla T4) par un appel à Ollama, qui sert le même modèle quantifié (GGUF) et tourne très bien sur CPU. C'est celui-là qu'il faut utiliser sur une machine sans GPU — l'app FastAPI (`app/`) en est l'équivalent packagé.

Si tu as un notebook différent qui charge le modèle directement via `transformers`/`bitsandbytes` (comme celui qui vérifie `nvidia-smi` / Tesla T4), deux options :
- L'adapter comme `notebook/NLP_project_ollama.ipynb` (remplacer les cellules de chargement du modèle + génération par les appels à Ollama ci-dessus) pour le faire tourner en local sans GPU.
- Le lancer tel quel sur [Google Colab](https://colab.research.google.com/) : `Fichier > Importer un notebook`, puis `Exécution > Modifier le type d'exécution > GPU (T4)` (disponible gratuitement, avec quotas d'usage). Il faut alors aussi uploader `data/ohada.xlsx` dans l'environnement Colab (panneau fichiers à gauche, ou `from google.colab import drive`) puisque `pd.read_excel('ohada.xlsx')` lit un fichier local à l'environnement d'exécution.

## Concours Zindi — LLM pour le droit OHADA

Ce repo est aligné sur le règlement du concours *Large Language Model Challenge on OHADA Law* (data354/Zindi) :

- **Modèle open-source** : `qwen2.5:1.5b` (licence Apache-2.0) est le modèle par défaut partout (app, notebook, `start.sh`/`start.ps1`). `qwen2.5:3b` reste utilisable via `OLLAMA_MODEL`, mais sa licence Qwen Research (non-commerciale) le rend non conforme à l'exigence "LLM open-source uniquement" du règlement — à éviter pour une soumission.
- **Matériel** : tourne entièrement sur CPU (aucun GPU requis), donc compatible avec la contrainte "processeur multicœur ou Google Colab gratuit".
- **Notebook de soumission** : `notebook/NLP_project_ollama.ipynb` construit désormais, en plus de la réponse, un fichier `submission.csv` au format attendu par la Phase 1 (colonnes `ID`/`Target`, 3 lignes par question : `{ID}_Answer`, `{ID}_Document_de_Référence`, `{ID}_Numéro_d'Article`). Le document de référence et le numéro d'article sont extraits par une regex (`extraire_reference`) sur le premier document récupéré, qui repère les motifs `ARTICLE <numéro> <ABRÉVIATION>` présents dans le corpus (ex. `AUPSRVE`, `AUA`) — une heuristique simple, pas une garantie d'exactitude.

**Points restants à vérifier avec les vrais fichiers du concours** (non accessibles depuis cet environnement, `zindi.world` étant bloqué) :
- Le notebook suppose un fichier `Test.csv` avec des colonnes `ID`/`question` : à ajuster une fois le vrai fichier de test téléchargé si les noms de colonnes diffèrent.
- Le règlement mentionne aussi "extraire les verbes et les noms et les remplir dans l'ordre où ils apparaissent" pour chaque réponse — formulation ambiguë dans le texte fourni, non implémentée ici faute de spécification claire (format de sortie exact non défini). À clarifier via le `SampleSubmission.csv`/la page Data du concours avant la soumission finale.

## Endpoints API

Toutes les routes ci-dessous (sauf auth) fonctionnent aussi bien pour un compte que pour un invité auto-créé — jamais de 401 "non connecté" en soi, seulement un 403 `guest_limit` si un invité tente d'ouvrir une deuxième discussion.

```
POST /login        Body: {"username", "password"} -> {"ok": true} (401 si invalide)
POST /register     Body: {"username", "password"} -> {"ok": true} (400 si nom déjà pris / trop court)
POST /logout        -> {"ok": true}
GET  /me            -> {"username": "..." | null, "is_guest": bool}

GET  /conversations                    -> [{"id", "title", "created_at"}, ...]
POST /conversations                    -> crée une discussion (403 "guest_limit" si invité et déjà 1 discussion)
GET  /conversations/{id}/messages      -> [{"id","role","content","sources"?,"created_at"}, ...] (404 si pas propriétaire)
DELETE /conversations/{id}             -> {"ok": true} (404 si pas propriétaire)

POST /ask
Body: {"question": "...", "conversation_id": 1 | null}
Réponse : flux NDJSON (une ligne JSON par événement), pas un JSON unique :
  {"type": "meta", "conversation_id": 1}
  {"type": "token", "token": "..."}          (répété au fur et à mesure de la génération)
  {"type": "done", "answer": "...", "sources": [...], "interrupted": false}

POST /ask-batch
Body: multipart/form-data avec un fichier "file" (.csv ou .xlsx, colonne "question")
Réponse: [{"question": "...", "answer": "...", "sources": [...]}, ...]
(non streamé, et non rattaché à une conversation)

POST /stop
Interrompt la génération en cours.

GET /info
Retourne la configuration réelle du pipeline (dataset, modèle, embeddings, etc.)
affichée dans la sidebar de l'UI.
```

## Sécurité — limites connues

Application pensée pour un usage personnel/petit groupe auto-hébergé, pas un SaaS multi-tenant :

- Cookie de session `HttpOnly` + `SameSite=Lax` (mitigation CSRF informelle, pas de framework CSRF dédié). Mettre `SESSION_HTTPS_ONLY=true` dès que l'app est servie derrière HTTPS.
- `SESSION_SECRET` doit être fixé (valeur aléatoire stable) dans tout déploiement persistant — sinon une clé éphémère est générée à chaque redémarrage et toutes les sessions (comptes ET invités) sont perdues.
- Inscription libre en self-service, sans vérification d'email ni invitation : accepté pour ce cadre d'usage ; si l'app est un jour exposée publiquement, ajouter un code d'invitation (comparaison simple d'une variable d'env dans `/register`).
- Pas de limitation de tentatives sur `/login` : à faire au niveau reverse proxy si l'app est exposée sur internet.
- Le bouton "Stop" et le moteur RAG sont partagés globalement (une seule instance `RagEngine`) : avec plusieurs utilisateurs simultanés, cliquer sur Stop interrompt la génération en cours quel que soit qui a posé la question. Non corrigé dans cette passe.
- `app.db` (gitignoré) contient des hashs bcrypt et le contenu des conversations : restreindre ses permissions (`chmod 600 app.db`) en production.
- Les utilisateurs invités s'accumulent en base tant que leur cookie de session vit (14 jours) ; un nettoyage périodique pourra être ajouté plus tard si la table grossit trop.
