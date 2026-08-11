"""Moteur RAG : vector store Chroma + LLM Qwen2.5-3B-Instruct (4bit)."""
import os
import threading

import torch
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_core.prompts import PromptTemplate
from langchain_huggingface.embeddings import HuggingFaceEmbeddings
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    StoppingCriteria,
    StoppingCriteriaList,
    pipeline,
)

load_dotenv()

MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-3B-Instruct")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
CHROMA_DIR = os.getenv("CHROMA_DIR", "./chroma_db")

PROMPT_TEMPLATE = PromptTemplate.from_template(
    """Tu es un assistant chargé de répondre à des questions. Utilises les éléments de contexte récupérés ci-dessous pour répondre à la question. Si tu ne connais pas la réponse, dis simplement que tu ne la connais pas. Limites ta réponse à trois phrases maximum et restes concis.
Question: {question}
Context: {context}
Answer: """
)


class StopFlagCriteria(StoppingCriteria):
    """Interrompt la génération dès que stop_event est activé."""

    def __init__(self, stop_event: threading.Event):
        self.stop_event = stop_event

    def __call__(self, input_ids, scores, **kwargs) -> bool:
        return self.stop_event.is_set()


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
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            quantization_config=quant_config,
            device_map="auto",
        )
        self.generator = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
            max_new_tokens=100,
            do_sample=False,
            return_full_text=False,
        )
        self.stop_event = threading.Event()

    def ask(self, query: str, k: int = 2) -> dict:
        self.stop_event.clear()

        retrieved_docs = self.vectorstore.similarity_search(query, k=k)
        context = "\n\n".join(doc.page_content[:3000] for doc in retrieved_docs)

        prompt = PROMPT_TEMPLATE.format(question=query, context=context)

        stopping_criteria = StoppingCriteriaList([StopFlagCriteria(self.stop_event)])
        output = self.generator(prompt, stopping_criteria=stopping_criteria)
        answer = output[0]["generated_text"].strip()

        sources = [
            {
                "title": doc.metadata.get("title"),
                "details": doc.metadata.get("details"),
            }
            for doc in retrieved_docs
        ]
        return {"answer": answer, "sources": sources, "interrupted": self.stop_event.is_set()}

    def stop(self):
        self.stop_event.set()
