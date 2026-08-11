import asyncio
import io
import os
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

CHROMA_DIR = os.getenv("CHROMA_DIR", "./chroma_db")
STATIC_DIR = Path(__file__).parent / "static"

engine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine

    if not Path(CHROMA_DIR).exists():
        from ingestion.build_index import build_index

        build_index()

    from app.rag import RagEngine

    engine = RagEngine()
    yield


app = FastAPI(title="OHADA Assistant", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class Question(BaseModel):
    question: str


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/favicon.ico")
async def favicon():
    return FileResponse(STATIC_DIR / "favicon.svg", media_type="image/svg+xml")


@app.post("/ask")
async def ask(payload: Question):
    return await asyncio.to_thread(engine.ask, payload.question)


@app.post("/stop")
async def stop():
    engine.stop()
    return {"status": "stopping"}


@app.post("/ask-batch")
async def ask_batch(file: UploadFile = File(...)):
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
