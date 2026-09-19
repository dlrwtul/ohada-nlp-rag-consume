import asyncio
import io
import json
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.concurrency import iterate_in_threadpool
from starlette.middleware.sessions import SessionMiddleware

from app import auth, db

load_dotenv()

CHROMA_DIR = os.getenv("CHROMA_DIR", "./chroma_db")
STATIC_DIR = Path(__file__).parent / "static"

engine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine

    db.init_db()

    if not Path(CHROMA_DIR).exists():
        from ingestion.build_index import build_index

        build_index()

    from app.rag import RagEngine

    engine = RagEngine()
    yield


app = FastAPI(title="OHADA Assistant", lifespan=lifespan)

SESSION_SECRET = os.getenv("SESSION_SECRET") or secrets.token_hex(32)
if not os.getenv("SESSION_SECRET"):
    print(
        "[auth] ATTENTION: SESSION_SECRET absent, une clé éphémère a été générée — "
        "les sessions (comptes ET invités) ne survivront pas au redémarrage du serveur."
    )

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="ohada_session",
    same_site="lax",
    https_only=os.getenv("SESSION_HTTPS_ONLY", "false").lower() == "true",
    max_age=60 * 60 * 24 * 14,  # 14 jours
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class Question(BaseModel):
    question: str
    conversation_id: int | None = None


class Credentials(BaseModel):
    username: str
    password: str


def _guest_limit_reached(user_id: int) -> bool:
    return auth.is_guest(user_id) and db.count_conversations(user_id) >= 1


# --- Pages ---


@app.get("/")
async def landing():
    return FileResponse(STATIC_DIR / "landing.html")


@app.get("/login")
async def login_page():
    return FileResponse(STATIC_DIR / "login.html")


@app.get("/register")
async def register_page():
    return FileResponse(STATIC_DIR / "register.html")


@app.get("/app")
async def chat_app():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/favicon.ico")
async def favicon():
    return FileResponse(STATIC_DIR / "favicon.svg", media_type="image/svg+xml")


# --- Authentification ---


@app.post("/login")
async def login(payload: Credentials, request: Request):
    user = db.get_user_by_username(payload.username.strip())
    if (
        user is None
        or user["is_guest"]
        or not user["password_hash"]
        or not auth.verify_password(payload.password, user["password_hash"])
    ):
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    auth.login_session(request, user["id"])
    return {"ok": True}


@app.post("/register")
async def register(payload: Credentials, request: Request):
    username = payload.username.strip()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Nom d'utilisateur trop court (3 caractères minimum)")
    if username.startswith(auth.GUEST_USERNAME_PREFIX):
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur n'est pas disponible")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (8 caractères minimum)")
    if db.get_user_by_username(username) is not None:
        raise HTTPException(status_code=400, detail="Nom d'utilisateur déjà utilisé")

    password_hash = auth.hash_password(payload.password)
    user_id = db.create_user(username, password_hash=password_hash, is_guest=False)
    auth.login_session(request, user_id)
    return {"ok": True}


@app.post("/logout")
async def logout(request: Request):
    auth.logout_session(request)
    return {"ok": True}


@app.get("/me")
async def me(user_id: int = Depends(auth.get_or_create_user_id)):
    user = db.get_user_by_id(user_id)
    return {
        "username": None if user["is_guest"] else user["username"],
        "is_guest": bool(user["is_guest"]),
    }


# --- Conversations ---


@app.get("/conversations")
async def list_conversations(user_id: int = Depends(auth.get_or_create_user_id)):
    return [
        {"id": c["id"], "title": c["title"], "created_at": c["created_at"]}
        for c in db.list_conversations(user_id)
    ]


@app.post("/conversations")
async def create_conversation(title: str | None = None, user_id: int = Depends(auth.get_or_create_user_id)):
    if _guest_limit_reached(user_id):
        raise HTTPException(status_code=403, detail="guest_limit")

    conv_id = db.create_conversation(user_id, title=title or "Nouvelle conversation")
    conv = db.get_conversation(conv_id, user_id)
    return {"id": conv["id"], "title": conv["title"], "created_at": conv["created_at"]}


@app.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: int, user_id: int = Depends(auth.get_or_create_user_id)):
    if db.get_conversation(conversation_id, user_id) is None:
        raise HTTPException(status_code=404, detail="Conversation introuvable")

    messages = []
    for m in db.list_messages(conversation_id):
        item = {"id": m["id"], "role": m["role"], "content": m["content"], "created_at": m["created_at"]}
        if m["sources_json"]:
            stored = json.loads(m["sources_json"])
            item["sources"] = stored.get("sources", [])
            item["reference"] = stored.get("reference")
        messages.append(item)
    return messages


@app.delete("/conversations/{conversation_id}")
async def delete_conversation_route(conversation_id: int, user_id: int = Depends(auth.get_or_create_user_id)):
    if not db.delete_conversation(conversation_id, user_id):
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    return {"ok": True}


# --- RAG ---


@app.post("/ask")
async def ask(payload: Question, user_id: int = Depends(auth.get_or_create_user_id)):
    conversation_id = payload.conversation_id
    if conversation_id is not None:
        if db.get_conversation(conversation_id, user_id) is None:
            raise HTTPException(status_code=404, detail="Conversation introuvable")
    else:
        if _guest_limit_reached(user_id):
            raise HTTPException(status_code=403, detail="guest_limit")
        conversation_id = db.create_conversation(user_id, title=payload.question[:60])

    db.add_message(conversation_id, "user", payload.question)

    def event_stream():
        answer = ""
        sources = []
        reference = None
        yield json.dumps({"type": "meta", "conversation_id": conversation_id}) + "\n"
        for event in engine.ask_stream(payload.question):
            if event["type"] == "done":
                answer = event["answer"]
                sources = event["sources"]
                reference = event["reference"]
            yield json.dumps(event, ensure_ascii=False) + "\n"
        stored = json.dumps({"sources": sources, "reference": reference}, ensure_ascii=False)
        db.add_message(conversation_id, "assistant", answer, sources_json=stored)

    return StreamingResponse(iterate_in_threadpool(event_stream()), media_type="application/x-ndjson")


@app.post("/stop")
async def stop(user_id: int = Depends(auth.get_or_create_user_id)):
    engine.stop()
    return {"status": "stopping"}


@app.get("/info")
async def info(user_id: int = Depends(auth.get_or_create_user_id)):
    return engine.info()


@app.post("/ask-batch")
async def ask_batch(file: UploadFile = File(...), user_id: int = Depends(auth.get_or_create_user_id)):
    content = await file.read()
    filename = (file.filename or "").lower()

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Format non supporté (utilise .csv ou .xlsx)")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Impossible de lire le fichier")

    if df.empty:
        raise HTTPException(status_code=400, detail="Le fichier ne contient aucune ligne")

    question_col = next(
        (c for c in df.columns if str(c).strip().lower() == "question"), df.columns[0]
    )
    questions = df[question_col].dropna().astype(str).tolist()

    return await asyncio.to_thread(engine.ask_many, questions)
