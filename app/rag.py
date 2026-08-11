"""Moteur RAG : vector store Chroma + LLM Qwen2.5-3B-Instruct (4bit)."""
import os

import torch
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_huggingface.embeddings import HuggingFaceEmbeddings
from langchain_huggingface.llms import HuggingFacePipeline
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    pipeline,
)

load_dotenv()

MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-3B-Instruct")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
CHROMA_DIR = os.getenv("CHROMA_DIR", "./chroma_db")

SYSTEM_PROMPT = (
    "Tu es un assistant chargé de répondre à des questions sur le droit OHADA. "
    "Utilises les éléments de contexte récupérés ci-dessous pour répondre à la question. "
    "Si tu ne connais pas la réponse, dis simplement que tu ne la connais pas. "
    "Limites ta réponse à trois phrases maximum et restes concis."
)


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

        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
        )
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            quantization_config=quant_config,
            device_map="auto",
        )
        self.llm = HuggingFacePipeline(
            pipeline=pipeline(
                "text-generation",
                model=model,
                tokenizer=self.tokenizer,
                max_new_tokens=256,
                do_sample=False,
                return_full_text=False,
            )
        )

    def ask(self, query: str, k: int = 4) -> dict:
        retrieved_docs = self.vectorstore.similarity_search(query, k=k)
        context = "\n\n".join(doc.page_content for doc in retrieved_docs)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Question: {query}\n\nContext: {context}"},
        ]
        prompt = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        answer = self.llm.invoke(prompt).strip()
        sources = [
            {
                "title": doc.metadata.get("title"),
                "details": doc.metadata.get("details"),
            }
            for doc in retrieved_docs
        ]
        return {"answer": answer, "sources": sources}
