"""Moteur RAG : vector store Chroma + LLM servi localement par Ollama."""
import json
import os
import threading
import time

import requests
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_core.prompts import PromptTemplate
from langchain_huggingface.embeddings import HuggingFaceEmbeddings

from app.references import extraire_reference

load_dotenv()

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
# _v3 : bge-small-en-v1.5 (anglais uniquement) a été remplacé par un modèle
# multilingue — un ancien index construit avec l'embedding anglais n'est pas
# compatible (recherche sémantique dégradée sur un corpus 100% français).
CHROMA_DIR = os.getenv("CHROMA_DIR", "./chroma_db_v3")
DATASET_NAME = os.getenv("DATASET_NAME", "uriel/Maathis_Ohada_dataset")

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
# mistral (Mistral-7B-Instruct, Apache-2.0) — mêmes poids que le notebook GPU
# (mistral-community/Mistral-7B-Instruct-v0.3), qui donne de bonnes réponses
# sur Colab. Plus lourd/lent sur CPU que qwen2.5:1.5b (~4,1 Go vs ~1 Go, et
# la génération est nettement plus lente) mais la qualité des réponses est
# la priorité ici. qwen2.5:1.5b reste utilisable via OLLAMA_MODEL si la
# vitesse prime.
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
# Combien de temps Ollama garde le modèle chargé en RAM après la dernière requête.
# Par défaut Ollama décharge le modèle au bout de 5 minutes d'inactivité ; le
# rechargement depuis le disque au message suivant peut à lui seul prendre
# plusieurs secondes. "30m" évite ce coût pour un usage interactif normal.
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")

K_RETRIEVAL = 2
# Aligné sur le notebook GPU (pipeline transformers, max_new_tokens=256) pour
# une config équivalente entre local (Ollama) et Colab (transformers).
MAX_NEW_TOKENS = 256
CONTEXT_CHAR_LIMIT = 3000

PROMPT_TEMPLATE = PromptTemplate.from_template(
    """Tu es un assistant chargé de répondre à des questions. Utilises les éléments de contexte récupérés ci-dessous pour répondre à la question. Si tu ne connais pas la réponse, dis simplement que tu ne la connais pas. Limites ta réponse à trois phrases maximum et restes concis.
Question: {question}
Context: {context}
Answer: """
)


def _build_sources(retrieved_docs) -> list[dict]:
    return [
        {"title": doc.metadata.get("title"), "details": doc.metadata.get("details")}
        for doc in retrieved_docs
    ]


def _build_reference(retrieved_docs) -> dict | None:
    if not retrieved_docs:
        return None
    acronyme, slug, article = extraire_reference(retrieved_docs[0])
    if not acronyme:
        return None
    return {"acronyme": acronyme, "slug": slug, "article": article}


class RagEngine:
    def __init__(self):
        embedding = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            encode_kwargs={"normalize_embeddings": True},
        )
        self.vectorstore = Chroma(
            persist_directory=CHROMA_DIR,
            embedding_function=embedding,
        )
        self.stop_event = threading.Event()
        self._check_ollama()

    def _check_ollama(self):
        try:
            res = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=5)
            res.raise_for_status()
            available = {m["name"] for m in res.json().get("models", [])}
            if OLLAMA_MODEL not in available and f"{OLLAMA_MODEL}:latest" not in available:
                print(
                    f"[rag] ATTENTION: le modèle '{OLLAMA_MODEL}' n'est pas encore "
                    f"téléchargé dans Ollama. Lance : ollama pull {OLLAMA_MODEL}"
                )
            else:
                print(f"[rag] Ollama OK — modèle '{OLLAMA_MODEL}' disponible.")
        except requests.exceptions.RequestException as exc:
            print(
                f"[rag] ATTENTION: impossible de contacter Ollama sur {OLLAMA_HOST} ({exc}). "
                "Assure-toi qu'Ollama est installé et lancé (commande: ollama serve)."
            )

    def _call_ollama(self, prompt: str) -> str:
        response = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": True,
                "keep_alive": OLLAMA_KEEP_ALIVE,
                "options": {"num_predict": MAX_NEW_TOKENS, "temperature": 0},
            },
            stream=True,
            timeout=300,
        )
        response.raise_for_status()

        chunks = []
        try:
            for line in response.iter_lines():
                if self.stop_event.is_set():
                    break
                if not line:
                    continue
                data = json.loads(line)
                chunks.append(data.get("response", ""))
                if data.get("done"):
                    break
        finally:
            response.close()

        return "".join(chunks).strip()

    def _generate(self, query: str, k: int = K_RETRIEVAL) -> dict:
        t0 = time.perf_counter()
        retrieved_docs = self.vectorstore.similarity_search(query, k=k)
        t1 = time.perf_counter()
        context = "\n\n".join(doc.page_content[:CONTEXT_CHAR_LIMIT] for doc in retrieved_docs)

        prompt = PROMPT_TEMPLATE.format(question=query, context=context)
        answer = self._call_ollama(prompt)
        t2 = time.perf_counter()
        print(
            f"[rag] retrieval: {t1 - t0:.2f}s | génération: {t2 - t1:.2f}s | "
            f"total: {t2 - t0:.2f}s"
        )

        return {
            "answer": answer,
            "sources": _build_sources(retrieved_docs),
            "reference": _build_reference(retrieved_docs),
            "interrupted": self.stop_event.is_set(),
        }

    def ask(self, query: str, k: int = K_RETRIEVAL) -> dict:
        self.stop_event.clear()
        return self._generate(query, k)

    def _call_ollama_stream(self, prompt: str):
        """Yield les tokens de réponse au fur et à mesure qu'Ollama les génère."""
        response = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": True,
                "keep_alive": OLLAMA_KEEP_ALIVE,
                "options": {"num_predict": MAX_NEW_TOKENS, "temperature": 0},
            },
            stream=True,
            timeout=300,
        )
        response.raise_for_status()

        try:
            for line in response.iter_lines():
                if self.stop_event.is_set():
                    break
                if not line:
                    continue
                data = json.loads(line)
                token = data.get("response", "")
                if token:
                    yield token
                if data.get("done"):
                    break
        finally:
            response.close()

    def _generate_stream(self, query: str, k: int = K_RETRIEVAL):
        t0 = time.perf_counter()
        retrieved_docs = self.vectorstore.similarity_search(query, k=k)
        t1 = time.perf_counter()
        context = "\n\n".join(doc.page_content[:CONTEXT_CHAR_LIMIT] for doc in retrieved_docs)
        prompt = PROMPT_TEMPLATE.format(question=query, context=context)

        answer_parts = []
        for token in self._call_ollama_stream(prompt):
            answer_parts.append(token)
            yield {"type": "token", "token": token}

        t2 = time.perf_counter()
        print(
            f"[rag] retrieval: {t1 - t0:.2f}s | génération (streamée): {t2 - t1:.2f}s | "
            f"total: {t2 - t0:.2f}s"
        )

        yield {
            "type": "done",
            "answer": "".join(answer_parts).strip(),
            "sources": _build_sources(retrieved_docs),
            "reference": _build_reference(retrieved_docs),
            "interrupted": self.stop_event.is_set(),
        }

    def ask_stream(self, query: str, k: int = K_RETRIEVAL):
        self.stop_event.clear()
        yield from self._generate_stream(query, k)

    def ask_many(self, queries: list[str], k: int = K_RETRIEVAL) -> list[dict]:
        self.stop_event.clear()
        results = []
        for query in queries:
            if self.stop_event.is_set():
                break
            results.append({"question": query, **self._generate(query, k)})
        return results

    def stop(self):
        self.stop_event.set()

    def info(self) -> dict:
        try:
            doc_count = self.vectorstore._collection.count()
        except Exception:
            doc_count = None

        return {
            "dataset_name": DATASET_NAME,
            "doc_count": doc_count,
            "embedding_model": EMBEDDING_MODEL,
            "llm_model": OLLAMA_MODEL,
            "inference_engine": "Ollama (llama.cpp)",
            "quantization": "GGUF (quantification native Ollama)",
            "decoding": "glouton (température = 0)",
            "compute": "CPU",
            "k": K_RETRIEVAL,
            "max_new_tokens": MAX_NEW_TOKENS,
            "context_char_limit": CONTEXT_CHAR_LIMIT,
        }
