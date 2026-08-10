import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
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


@app.post("/ask")
async def ask(payload: Question):
    return engine.ask(payload.question)
