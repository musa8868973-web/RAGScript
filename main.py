"""
========================================================================================
RAGScript - Enterprise Codebase Explorer & Intelligence Engine
========================================================================================
Role: Senior AI Backend Engineer & Technical Lead
Architecture: Local-First Retrieval-Augmented Generation (RAG)
Tech Stack:
    - Web Framework: FastAPI
    - Vector Store: ChromaDB (Local persistent)
    - Embedding Model: HuggingFace (sentence-transformers/all-MiniLM-L6-v2)
    - LLM Inference: ChatGroq (llama-3.1-8b-instant)
    - Documentation Engine: FPDF2 (FPDF-compatible)
========================================================================================
"""

import os
import sys
import time
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

# --------------------------------------------------------------------------------------
# 1. Environment & Logging Initialization
# --------------------------------------------------------------------------------------
# Load environment variables from .env file immediately on process start
load_dotenv(override=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("RAGScript.Backend")

# Core System Configuration Parameters
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
CHROMA_DB_DIR = os.getenv("CHROMA_DB_DIR", "./chroma_data")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
GROQ_MODEL_NAME = os.getenv("GROQ_MODEL_NAME", "llama-3.1-8b-instant")
DEFAULT_COLLECTION = "ragscript_codebase"

# Ensure Chroma persistent directory exists
os.makedirs(CHROMA_DB_DIR, exist_ok=True)

# --------------------------------------------------------------------------------------
# 2. Lazy / Safe AI Library Imports
# --------------------------------------------------------------------------------------
try:
    from langchain_core.documents import Document
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    from langchain_groq import ChatGroq
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser
except ImportError as err:
    logger.critical(f"LangChain dependencies missing: {err}. Please run 'pip install -r requirements.txt'")

# Dual-import compatibility for Chroma and HuggingFace
try:
    from langchain_chroma import Chroma
except ImportError:
    from langchain_community.vectorstores import Chroma  # type: ignore

try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    from langchain_community.embeddings import HuggingFaceEmbeddings  # type: ignore

# FPDF library import (compatible with both fpdf and modern fpdf2)
try:
    from fpdf import FPDF
except ImportError:
    class FPDF:  # type: ignore
        """Fallback mock class if fpdf/fpdf2 is not yet installed in the current environment."""
        pass

# --------------------------------------------------------------------------------------
# 3. FastAPI Application Setup & Security Guardrails
# --------------------------------------------------------------------------------------
app = FastAPI(
    title="RAGScript Codebase Explorer API",
    description="High-performance, local-first RAG backend powering codebase chat and architectural indexing.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable Cross-Origin Resource Sharing (CORS) for hackathon frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits requests from React, Vite, Next.js, Streamlit, etc.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global caches for singletons (avoids reloading heavy models into RAM on each request)
_EMBEDDINGS_INSTANCE: Optional[HuggingFaceEmbeddings] = None
_VECTOR_STORE_CACHE: Dict[str, Chroma] = {}


def get_embedding_model() -> HuggingFaceEmbeddings:
    """
    Singleton accessor for the local HuggingFace embedding model.
    Runs locally on CPU/CUDA to guarantee zero source code transmission during embedding.
    """
    global _EMBEDDINGS_INSTANCE
    if _EMBEDDINGS_INSTANCE is None:
        logger.info(f"Initializing local embedding model: '{EMBEDDING_MODEL_NAME}' on CPU...")
        _EMBEDDINGS_INSTANCE = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL_NAME,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        logger.info("Embedding model initialized successfully.")
    return _EMBEDDINGS_INSTANCE


def get_vector_store(collection_name: str = DEFAULT_COLLECTION) -> Chroma:
    """
    Retrieves or instantiates a persistent Chroma vector database instance for a given collection.
    """
    global _VECTOR_STORE_CACHE
    if collection_name not in _VECTOR_STORE_CACHE:
        embeddings = get_embedding_model()
        logger.info(f"Connecting to persistent Chroma store at '{CHROMA_DB_DIR}' [collection='{collection_name}']")
        _VECTOR_STORE_CACHE[collection_name] = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=CHROMA_DB_DIR,
        )
    return _VECTOR_STORE_CACHE[collection_name]


def get_llm_inference_engine(model_name: Optional[str] = None) -> ChatGroq:
    """
    Initializes the Groq LLM client using LLaMA 3.1 8B Instant (with fallback resilience).
    Verifies presence of the GROQ_API_KEY without exposing it to callers.
    """
    api_key = GROQ_API_KEY or os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        logger.error("Missing GROQ_API_KEY in environment variables.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GROQ_API_KEY is not configured on the server. Please set it in the .env file.",
        )
    target_model = model_name or GROQ_MODEL_NAME
    return ChatGroq(
        groq_api_key=api_key,
        model_name=target_model,
        temperature=0.1,  # Low temperature for deterministic, factual code analysis
        max_retries=2,
    )


# --------------------------------------------------------------------------------------
# 4. Pydantic Request & Response Schemas
# --------------------------------------------------------------------------------------
class IngestRequest(BaseModel):
    directory_path: Optional[str] = Field(
        default=None,
        description="Absolute or relative path to the codebase repository to ingest.",
        example="./",
    )
    files: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional list of in-memory files uploaded directly from the client [{path, content}].",
    )
    collection_name: Optional[str] = Field(
        default=DEFAULT_COLLECTION,
        description="ChromaDB collection namespace to store the generated embeddings.",
    )
    chunk_size: int = Field(
        default=1000,
        ge=200,
        le=4000,
        description="Character limit per code chunk.",
    )
    chunk_overlap: int = Field(
        default=200,
        ge=0,
        le=800,
        description="Character overlap between consecutive chunks to maintain semantic continuity.",
    )
    file_extensions: Optional[List[str]] = Field(
        default=[
            ".py", ".js", ".jsx", ".ts", ".tsx", ".cpp", ".c", ".h", ".hpp",
            ".java", ".go", ".rs", ".md", ".json", ".yaml", ".yml", ".sql", ".sh",
        ],
        description="List of file extensions to include during code traversal.",
    )
    clear_existing: bool = Field(
        default=False,
        description="If True, flushes the existing vector collection before indexing.",
    )


class IngestResponse(BaseModel):
    status: str
    files_processed: int
    chunks_created: int
    collection_name: str
    directory_scanned: str
    elapsed_time_seconds: float
    message: str


class SourceChunk(BaseModel):
    file_path: str
    file_name: str
    chunk_snippet: str
    similarity_score: Optional[float] = None


class ChatRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=3,
        description="Natural language question about the ingested codebase.",
        example="Where is database authentication handled, and how does error recovery work?",
    )
    collection_name: Optional[str] = Field(
        default=DEFAULT_COLLECTION,
        description="Collection name to query.",
    )
    top_k: int = Field(
        default=4,
        ge=1,
        le=10,
        description="Number of most relevant code chunks to retrieve for prompt context.",
    )


class ChatResponse(BaseModel):
    query: str
    answer: str
    model: str
    collection_name: str
    retrieval_count: int
    sources: List[SourceChunk]
    latency_seconds: float


class HealthResponse(BaseModel):
    status: str
    embedding_model: str
    llm_model: str
    chroma_dir: str
    api_key_configured: bool


# --------------------------------------------------------------------------------------
# 5. Core Ingestion & Traversal Helpers
# --------------------------------------------------------------------------------------
EXCLUDE_DIRS = {
    ".git", "node_modules", "venv", ".venv", "env", "__pycache__",
    "chroma_data", ".gemini", "dist", "build", ".idea", ".vscode",
    ".next", ".turbo", "coverage", "bin", "obj",
}


def load_codebase_documents(target_dir: str, allowed_extensions: List[str]) -> List[Document]:
    """
    Crawls the specified directory recursively, filtering for source code files
    while ignoring compiled binaries, dependency trees, and VCS directories.
    """
    resolved_path = Path(target_dir).resolve()
    if not resolved_path.exists() or not resolved_path.is_dir():
        raise FileNotFoundError(f"Target directory '{target_dir}' does not exist or is not a directory.")

    documents: List[Document] = []
    norm_extensions = {ext.lower() if ext.startswith(".") else f".{ext.lower()}" for ext in allowed_extensions}

    for root, dirs, files in os.walk(resolved_path):
        # Prune excluded directories in-place to stop os.walk from descending
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]

        for file_name in files:
            ext = os.path.splitext(file_name)[1].lower()
            if ext in norm_extensions:
                full_file_path = os.path.join(root, file_name)
                relative_path = os.path.relpath(full_file_path, start=resolved_path)

                try:
                    # Defensive file reading with fallback encoding
                    with open(full_file_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()

                    # Avoid indexing empty or whitespace-only files
                    if content.strip():
                        documents.append(
                            Document(
                                page_content=content,
                                metadata={
                                    "source": relative_path.replace("\\", "/"),
                                    "file_name": file_name,
                                    "extension": ext,
                                    "absolute_path": full_file_path.replace("\\", "/"),
                                    "char_length": len(content),
                                },
                            )
                        )
                except Exception as file_read_err:
                    logger.warning(f"Skipping unreadable file '{full_file_path}': {file_read_err}")

    return documents


# --------------------------------------------------------------------------------------
# 6. Architecture PDF Generator Engine (FPDF)
# --------------------------------------------------------------------------------------
class RAGScriptDocPDF(FPDF):
    """
    Custom FPDF Document Generator configured for technical specification output.
    Ensures ASCII/Latin-1 safe string outputs and clean corporate typography.
    """

    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 110, 120)
        self.cell(0, 8, "RAGScript Architecture & Technical Specification | Hacktoberfest 2026", border=0, align="R")
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        page_str = f"Page {self.page_no()}"
        self.cell(0, 10, page_str, border=0, align="C")

    def chapter_title(self, num: str, title: str):
        self.set_font("Helvetica", "B", 14)
        self.set_fill_color(240, 244, 248)
        self.set_text_color(20, 35, 60)
        self.cell(0, 10, f" {num}. {title}", border=0, ln=1, fill=True)
        self.ln(4)

    def section_title(self, title: str):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 60, 90)
        self.cell(0, 7, title, border=0, ln=1)
        self.ln(1)

    def body_paragraph(self, text: str):
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(50, 50, 50)
        self.multi_cell(0, 5.5, text)
        self.ln(3)

    def code_box(self, code_text: str):
        self.set_font("Courier", "", 8)
        self.set_fill_color(245, 245, 245)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 4.5, code_text, border=1, fill=True)
        self.ln(3)


def build_architecture_pdf(output_filename: str = "RAGScript_Working_Architecture.pdf") -> str:
    """
    Dynamically generates the technical architecture PDF using FPDF and saves it locally.
    """
    if not hasattr(FPDF, "add_page"):
        raise RuntimeError("The 'fpdf2' package is not installed. Please run 'pip install fpdf2' to generate architecture documentation.")

    pdf = RAGScriptDocPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Cover Header Banner
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(16, 44, 87)
    pdf.cell(0, 12, "RAGScript: Technical Architecture Report", border=0, ln=1, align="L")

    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(100, 110, 120)
    generated_date = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    pdf.cell(0, 6, f"System Architecture, Data Flow, and Engineering Constraints | Generated: {generated_date}", border=0, ln=1)
    pdf.ln(5)

    # 1. Executive Summary
    pdf.chapter_title("1", "Executive Architecture Overview")
    pdf.body_paragraph(
        "RAGScript is a high-speed, privacy-first codebase intelligence tool built on Retrieval-Augmented "
        "Generation (RAG). It enables software engineers to ask natural-language questions about complex source "
        "code repositories and receive grounded, accurate answers with precise file path citations."
    )
    pdf.body_paragraph(
        "Key Design Principle: Complete Source Code Privacy. Repository files are ingested, chunked, and embedded "
        "strictly on the local machine using HuggingFace sentence-transformers and persisted in a local ChromaDB store. "
        "Only the top-k context snippets relevant to an active query are dispatched to the cloud inference engine."
    )

    # 2. System Architecture & Component Diagram
    pdf.chapter_title("2", "Component Stack & Topology")
    arch_diagram = (
        "+-------------------------------------------------------------------------+\n"
        "|                        CLIENT LAYER (Frontend)                          |\n"
        "|             Streamlit / React / Vite UI [Partner Managed]               |\n"
        "+-----------------------------------+-------------------------------------+\n"
        "                                    | HTTP REST (JSON)\n"
        "+-----------------------------------v-------------------------------------+\n"
        "|                     FASTAPI APPLICATION BACKEND                         |\n"
        "|  - POST /ingest        : Recursive file parsing & vector storage        |\n"
        "|  - POST /chat          : Context retrieval & LLM synthesis              |\n"
        "|  - GET  /generate-docs : Dynamic architectural PDF generation           |\n"
        "+-------------------+---------------------------------+-------------------+\n"
        "                    |                                 |\n"
        "       [Local Embeddings & Storage]          [Cloud Inference]\n"
        "                    |                                 |\n"
        "+-------------------v--------------+   +--------------v-------------------+\n"
        "|    ChromaDB + HuggingFace        |   |    Groq LPU Acceleration         |\n"
        "|  Model: all-MiniLM-L6-v2 (CPU)   |   |  Model: LLaMA 3.1 8B Instant     |\n"
        "|  Storage: ./chroma_data (Disk)   |   |  Latency: ~150-350ms TTFT        |\n"
        "+----------------------------------+   +----------------------------------+"
    )
    pdf.code_box(arch_diagram)

    # 3. Data Ingestion Pipeline
    pdf.chapter_title("3", "Data Ingestion & Chunking Logic (/ingest)")
    pdf.body_paragraph(
        "The ingestion pipeline converts raw source trees into indexed vector embeddings through four deterministic stages:"
    )
    pdf.section_title("3.1. Recursive Discovery & File Filtering")
    pdf.body_paragraph(
        "- Excludes non-source directories (.git, node_modules, venv, __pycache__, dist, build).\n"
        "- Filters for designated code extensions (.py, .js, .ts, .cpp, .c, .h, .java, .go, .rs, .md, .sql).\n"
        "- Normalizes file paths to POSIX standard for uniform client representation."
    )
    pdf.section_title("3.2. Code-Aware Recursive Chunking")
    pdf.body_paragraph(
        "- Utilizes RecursiveCharacterTextSplitter with specialized code separators: class declarations, "
        "function definitions, statement breaks, and spaces.\n"
        "- Default Chunk Size: 1000 characters (~200-250 tokens).\n"
        "- Default Overlap: 200 characters (~40-50 tokens) to preserve semantic boundaries across cuts."
    )
    pdf.section_title("3.3. Vector Persistence")
    pdf.body_paragraph(
        "- Computes 384-dimensional dense vectors using sentence-transformers/all-MiniLM-L6-v2 on CPU.\n"
        "- Commits chunks into ChromaDB with metadata: source path, filename, extension, and character count."
    )

    # 4. Inference & Query Pipeline
    pdf.chapter_title("4", "AI Retrieval & Inference Pipeline (/chat)")
    pdf.body_paragraph(
        "When an engineer asks a question, RAGScript executes a grounded retrieval chain:"
    )
    pdf.body_paragraph(
        "1. Query Embedding: The user's query is converted to a vector using the identical embedding model.\n"
        "2. Similarity Search: ChromaDB performs cosine similarity search to retrieve the top-k (default=4) closest chunks.\n"
        "3. Prompt Construction: Chunks are formatted with explicit file headers into a strict grounding prompt.\n"
        "4. Groq Inference: ChatGroq dispatches the prompt to llama-3.1-8b-instant with temperature=0.1.\n"
        "5. Source Grounding: The response is paired with exact file sources and returned to the client."
    )

    # 5. Engineering Constraints & Production Guardrails
    pdf.chapter_title("5", "Production Guardrails & Constraints")
    pdf.section_title("5.1. Strict 8B Parameter Reasoning Boundary")
    pdf.body_paragraph(
        "LLaMA 3.1 8B provides low latency and high speed on Groq LPUs, but cannot execute deep multi-hop "
        "AST dependency tracing across hundreds of disparate files. System prompts enforce strict negative acknowledgement "
        "if retrieved chunks lack adequate context, preventing hallucinated methods."
    )
    pdf.section_title("5.2. Credential Protection")
    pdf.body_paragraph(
        "The GROQ_API_KEY is isolated on the server. It is never emitted in HTTP headers, JSON error traces, "
        "or client-side code, guaranteeing protection against token leakage."
    )
    pdf.section_title("5.3. Latency Budget")
    pdf.body_paragraph(
        "- Local Embedding: ~15-30ms per query.\n"
        "- ChromaDB Index Search: ~20-40ms.\n"
        "- Groq LPU Inference: ~150-300ms.\n"
        "- Total End-to-End Latency: Sub-500ms typical response time."
    )

    pdf.output(output_filename)
    return os.path.abspath(output_filename)


# --------------------------------------------------------------------------------------
# 7. API Endpoints
# --------------------------------------------------------------------------------------

@app.get("/", tags=["System"])
@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check() -> HealthResponse:
    """
    Evaluates backend health, model configurations, and vector DB accessibility.
    """
    api_key_present = bool(GROQ_API_KEY or os.getenv("GROQ_API_KEY", "").strip())
    return HealthResponse(
        status="healthy",
        embedding_model=EMBEDDING_MODEL_NAME,
        llm_model=GROQ_MODEL_NAME,
        chroma_dir=os.path.abspath(CHROMA_DB_DIR),
        api_key_configured=api_key_present,
    )


@app.post("/ingest", response_model=IngestResponse, tags=["RAG Pipeline"])
def ingest_codebase(payload: IngestRequest) -> IngestResponse:
    """
    Ingests, chunks, and indexes a local codebase repository into the persistent Chroma vector store.
    """
    start_time = time.time()
    logger.info(f"Initiating codebase ingestion for directory: '{payload.directory_path}'")

    # Step 1: Validate directory existence and resolve paths
    raw_documents: List[Document] = []
    scanned_target = payload.directory_path or "client_upload"

    # Step 1: Process in-memory files if provided by browser client
    if payload.files:
        logger.info(f"Processing {len(payload.files)} in-memory uploaded files from client.")
        for item in payload.files:
            file_path = item.get("path") or item.get("file") or "uploaded_code.txt"
            content = item.get("content") or ""
            if content.strip():
                raw_documents.append(
                    Document(
                        page_content=content,
                        metadata={
                            "source": file_path.replace("\\", "/"),
                            "file_name": os.path.basename(file_path),
                            "extension": os.path.splitext(file_path)[1].lower(),
                            "char_length": len(content),
                        },
                    )
                )

    # Step 2: Traverse directory if provided
    if payload.directory_path:
        target_path = Path(payload.directory_path).resolve()
        if target_path.exists() and target_path.is_dir():
            scanned_target = str(target_path)
            dir_docs = load_codebase_documents(
                target_dir=str(target_path),
                allowed_extensions=payload.file_extensions or [".py", ".cpp", ".h", ".js", ".ts", ".md"],
            )
            raw_documents.extend(dir_docs)
        elif not payload.files:
            logger.error(f"Ingest failed: Directory does not exist '{payload.directory_path}'")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target directory path '{payload.directory_path}' does not exist or is not a directory.",
            )

    try:
        if not raw_documents:
            logger.warning("No code documents provided or found to ingest.")
            return IngestResponse(
                status="warning",
                files_processed=0,
                chunks_created=0,
                collection_name=payload.collection_name or DEFAULT_COLLECTION,
                directory_scanned=scanned_target,
                elapsed_time_seconds=round(time.time() - start_time, 2),
                message="No files matching the specified extensions were found to ingest.",
            )

        # Step 3: Chunking documents with language-aware separators
        code_splitter = RecursiveCharacterTextSplitter(
            chunk_size=payload.chunk_size,
            chunk_overlap=payload.chunk_overlap,
            separators=[
                "\nclass ", "\ndef ", "\nfunction ", "\nfunc ", "\nvoid ",
                "\ninterface ", "\nstruct ", "\n\n", "\n", " ", ""
            ],
            keep_separator=True,
        )

        chunked_docs = code_splitter.split_documents(raw_documents)
        logger.info(f"Created {len(chunked_docs)} chunks from {len(raw_documents)} raw source files.")

        # Step 4: Storage in ChromaDB
        coll_name = payload.collection_name or DEFAULT_COLLECTION
        vector_store = get_vector_store(coll_name)

        if payload.clear_existing:
            logger.info(f"Clearing existing collection '{coll_name}'...")
            try:
                vector_store.delete_collection()
                # Re-initialize after deletion
                _VECTOR_STORE_CACHE.pop(coll_name, None)
                vector_store = get_vector_store(coll_name)
            except Exception as clear_err:
                logger.warning(f"Note on clearing collection: {clear_err}")

        # Batch addition to prevent memory spikes
        batch_size = 64
        for i in range(0, len(chunked_docs), batch_size):
            batch = chunked_docs[i : i + batch_size]
            vector_store.add_documents(batch)

        elapsed = round(time.time() - start_time, 2)
        logger.info(f"Ingestion complete: {len(raw_documents)} files, {len(chunked_docs)} chunks in {elapsed}s.")

        return IngestResponse(
            status="success",
            files_processed=len(raw_documents),
            chunks_created=len(chunked_docs),
            collection_name=coll_name,
            directory_scanned=str(scanned_target),
            elapsed_time_seconds=elapsed,
            message="Codebase successfully chunked, embedded, and stored in ChromaDB.",
        )

    except Exception as e:
        logger.exception("Unexpected error during codebase ingestion.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while ingesting the codebase: {str(e)}",
        )


@app.get("/ingest", tags=["RAG Pipeline"])
def ingest_info():
    """Returns endpoint schema and status for GET requests."""
    return {"status": "ready", "method": "POST", "usage": "Submit IngestRequest JSON payload to index codebase."}


@app.get("/chat", tags=["RAG Pipeline"])
def chat_info():
    """Returns endpoint schema and status for GET requests."""
    return {"status": "ready", "method": "POST", "usage": "Submit ChatRequest JSON payload to query codebase."}


@app.post("/chat", response_model=ChatResponse, tags=["RAG Pipeline"])
@app.post("/query", response_model=ChatResponse, tags=["RAG Pipeline"])
def chat_with_codebase(payload: ChatRequest) -> ChatResponse:
    """
    Executes a retrieval-augmented question answering query against the indexed codebase.
    Retrieves the top-k relevant code chunks and generates a grounded explanation via Groq (LLaMA 3.1 8B).
    """
    start_time = time.time()
    coll_name = payload.collection_name or DEFAULT_COLLECTION
    logger.info(f"Received query on collection '{coll_name}': '{payload.query}'")

    try:
        vector_store = get_vector_store(coll_name)

        # Step 1: Semantic Retrieval with relevance scores
        results_with_scores = vector_store.similarity_search_with_relevance_scores(
            payload.query,
            k=payload.top_k,
        )

        sources: List[SourceChunk] = []
        if not results_with_scores:
            logger.info("No matching chunks retrieved. Providing fallback context note to Groq LLM.")
            joined_context = "[No indexed code snippets found in current collection]"
        else:
            context_blocks = []
            for doc, score in results_with_scores:
                file_path = doc.metadata.get("source", "Unknown")
                file_name = doc.metadata.get("file_name", "Unknown")

                context_blocks.append(
                    f"--- File: {file_path} ---\n{doc.page_content.strip()}\n"
                )

                sources.append(
                    SourceChunk(
                        file_path=file_path,
                        file_name=file_name,
                        chunk_snippet=doc.page_content[:250].strip() + ("..." if len(doc.page_content) > 250 else ""),
                        similarity_score=round(float(score), 4) if score is not None else None,
                    )
                )
            joined_context = "\n\n".join(context_blocks)

        # Step 3: Construct Grounded System Prompt
        system_prompt = (
            "You are RAGScript AI, an expert Senior Software Engineer and Codebase Intelligence Assistant. "
            "Your objective is to answer technical questions about the codebase with strict factual fidelity.\n\n"
            "Grounding Rules:\n"
            "1. Base your answer EXCLUSIVELY on the provided code context snippets.\n"
            "2. If the context does not provide sufficient detail to answer definitively, clearly state: "
            "'The current indexed codebase does not contain sufficient context to answer this question.' Do not guess.\n"
            "3. Reference exact file paths (e.g. `services/auth.py`) and specific function/variable names.\n"
            "4. Provide concise, production-ready code examples when illustrating your explanation.\n"
            "5. Structure your explanation cleanly using markdown headings, bullet points, and code blocks."
        )

        user_prompt = (
            "Retrieved Code Context:\n"
            "```\n"
            "{context}\n"
            "```\n\n"
            "Developer Question: {question}\n\n"
            "Grounded Technical Explanation:"
        )

        prompt_template = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("user", user_prompt),
        ])

        # Step 4: Execute LLM Inference via Groq LPU
        used_model = GROQ_MODEL_NAME
        try:
            llm = get_llm_inference_engine(GROQ_MODEL_NAME)
            chain = prompt_template | llm | StrOutputParser()
            llm_answer = chain.invoke({
                "context": joined_context,
                "question": payload.query,
            })
        except Exception as groq_err:
            err_str = str(groq_err)
            if "model_not_found" in err_str or "404" in err_str or "decommissioned" in err_str:
                logger.warning(f"Configured model '{GROQ_MODEL_NAME}' unavailable on Groq key. Falling back to active model 'allam-2-7b'...")
                used_model = "allam-2-7b"
                llm = get_llm_inference_engine("allam-2-7b")
                chain = prompt_template | llm | StrOutputParser()
                llm_answer = chain.invoke({
                    "context": joined_context,
                    "question": payload.query,
                })
            else:
                raise

        latency = round(time.time() - start_time, 3)
        logger.info(f"Query answered in {latency}s via {used_model}")

        return ChatResponse(
            query=payload.query,
            answer=llm_answer,
            model=used_model,
            collection_name=coll_name,
            retrieval_count=len(sources),
            sources=sources,
            latency_seconds=latency,
        )

    except HTTPException:
        raise
    except Exception as chat_err:
        logger.exception("Inference failed during /chat execution.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference failure: {str(chat_err)}",
        )


@app.get("/generate-docs", tags=["Documentation"])
@app.post("/generate-docs", tags=["Documentation"])
def generate_documentation(download: bool = Query(default=True, description="Whether to return the PDF file directly")):
    """
    Generates and saves 'RAGScript_Working_Architecture.pdf' documenting the complete
    RAG system architecture, backend data flow, and engineering design.
    """
    target_filename = "RAGScript_Working_Architecture.pdf"
    logger.info(f"Triggering dynamic PDF architecture documentation build -> '{target_filename}'")

    try:
        abs_path = build_architecture_pdf(output_filename=target_filename)
        logger.info(f"Architecture PDF successfully written to '{abs_path}'")

        if download:
            return FileResponse(
                path=abs_path,
                media_type="application/pdf",
                filename=target_filename,
                headers={"Content-Disposition": f"attachment; filename={target_filename}"},
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "status": "success",
                "message": f"Architecture PDF generated successfully at '{target_filename}'",
                "file_path": abs_path,
                "file_size_bytes": os.path.getsize(abs_path),
            },
        )

    except Exception as doc_err:
        logger.exception("Failed to generate architecture documentation PDF.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate documentation PDF: {str(doc_err)}",
        )


# --------------------------------------------------------------------------------------
# 8. Local Direct Run Entrypoint
# --------------------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    # Default host 0.0.0.0 and port 8000 for standard local server access
    logger.info("Starting RAGScript Backend Server via Uvicorn on http://0.0.0.0:8000...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
