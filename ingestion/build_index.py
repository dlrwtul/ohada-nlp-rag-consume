"""Construit (ou reconstruit) l'index vectoriel Chroma à partir du dataset OHADA."""
import os

import pandas as pd
from datasets import load_dataset
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface.embeddings import HuggingFaceEmbeddings

load_dotenv()

DATASET_NAME = os.getenv("DATASET_NAME", "uriel/Maathis_Ohada_dataset")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
CHROMA_DIR = os.getenv("CHROMA_DIR", "./chroma_db")


def load_documents() -> list[Document]:
    dataset = load_dataset(DATASET_NAME)
    df = pd.DataFrame(dataset["train"])

    documents = []
    for _, row in df.iterrows():
        content = f"""
    title : {row['title']}
    content : {row['content']}
    details : {row['details']}
    """
        documents.append(
            Document(
                page_content=content,
                metadata={
                    "title": row["title"],
                    "content": row["content"],
                    "details": row["details"],
                },
            )
        )
    return documents


def build_index() -> Chroma:
    documents = load_documents()
    embedding = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        encode_kwargs={"normalize_embeddings": True},
    )
    return Chroma.from_documents(
        documents=documents,
        embedding=embedding,
        persist_directory=CHROMA_DIR,
    )


if __name__ == "__main__":
    build_index()
    print(f"Index Chroma construit dans {CHROMA_DIR}")
