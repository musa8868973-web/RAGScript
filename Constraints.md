# 🛡️ RAGScript Architecture & Technical Constraints

**Document Version:** 1.0.0  
**Target System:** RAGScript Codebase Explorer Backend  
**Author:** Senior AI Backend Engineer & Technical Lead  
**Scope:** Data Ingestion, Local Vector Database, and LLM Inference Pipeline  

---

## 1. System & Hardware Limits

| Dimension | Constraint Limit | Architectural Impact / Mitigation |
| :--- | :--- | :--- |
| **Local Compute (CPU/RAM)** | Memory footprint bounded by embedding model (~400MB) + ChromaDB index cache (~500MB+ depending on repo size). | Run embedding extraction sequentially or in micro-batches (batch size = 32-64 chunks) to prevent Out-Of-Memory (OOM) faults on developer machines. |
| **Disk I/O** | Persistent storage on local filesystem (`./chroma_data`). High concurrent I/O during heavy multi-file ingestion. | Ingestion runs asynchronously; files are read with streaming line iterators where appropriate, and ChromaDB persistence syncs per batch. |
| **Vector DB Concurrency** | SQLite/DuckDB embedded backend in ChromaDB enforces a single-writer lock. | Write operations (`/ingest`) cannot run concurrently in parallel threads across identical collections. Multi-worker Uvicorn configurations must coordinate writes to avoid DB lock contention. |
| **Network Egress** | Outbound HTTPS calls only to Groq Cloud API (`https://api.groq.com`). Zero raw codebase code is sent upstream except for the retrieved top-$k$ context snippets. | Network failure/packet loss to Groq results in HTTP 504/502 handling with retry backoffs. |

---

## 2. LLM Inference Constraints: LLaMA 3.1 8B Instant (ChatGroq)

### 2.1. Strict 8B Parameter Reasoning Boundaries
- **Reasoning Depth:** While LLaMA 3.1 8B has superior reasoning compared to earlier generation 7B models, it lacks deep multi-step AST-level semantic tracing across large dependency graphs (e.g., recursive template metaprogramming or complex cross-repository pointer tracking).
- **Hallucination Risk:** If the retrieved vector chunks do not contain the target declaration or interface definition, the 8B model will exhibit pattern-completion bias. 
  - *Mitigation:* System prompts strictly mandate negative-acknowledgement: *"If the retrieved code snippets do not contain sufficient context to answer the question with certainty, state clearly that the code is missing rather than speculating."*

### 2.2. Token Context Window vs. Cost & Latency
- **Nominal Context Window:** LLaMA 3.1 8B supports up to 128,000 tokens. However, sending wide context windows (>16k tokens) introduces:
  1. *Lost-in-the-Middle Phenomenon:* Retrieval degradation where needle-in-haystack context is ignored.
  2. *Groq API TPM Throttling:* Token-per-minute consumption accelerates dramatically.
- *Prescribed Policy:* Constrain top-$k$ retrieval to $k=4$ to $k=6$ chunks (approx. 2,000–3,500 total prompt tokens). This delivers sub-second response times while preserving focus.

### 2.3. Groq API Rate Limits
- Free & developer tiers on Groq enforce rate limits (typically 30 RPM and 6,000–30,000 TPM depending on account tier).
- High-frequency chat querying or looping frontend clients can trigger HTTP 429 (`RateLimitError`).
- *Mitigation:* The backend utilizes exponential retry logic (`max_retries=2`) and surfaces structured HTTP 429 status codes with clear retry-after signals to the frontend.

---

## 3. Chunking & Ingestion Limitations

### 3.1. Maximum Chunk Size & Overlap Trade-offs
- **Default Chunk Size:** 1,000 characters (~200–250 tokens).
- **Default Overlap:** 200 characters (~40–50 tokens).
- **Why Not Larger (>2,500 characters)?**
  - Dilutes vector cosine similarity scores by mixing disparate logical functions or classes within the same embedding vector.
  - Exceeds the optimal receptive field of `sentence-transformers/all-MiniLM-L6-v2` (which truncates at 256 or 512 input tokens).
- **Why Not Smaller (<300 characters)?**
  - Strips crucial structural context (variable declarations, imports, type hints, and docstrings).

### 3.2. Syntax Boundary & Splitting Limitations
- Text-based recursive splitting (`RecursiveCharacterTextSplitter`) relies on string separators (`\nclass `, `\ndef `, `\n\n`, `\n`, ` `).
- While language-aware separators improve boundary detection, regex splitters can still bifurcate a function body across chunks if a single method exceeds `chunk_size`.
- *Consequence:* An isolated chunk might contain internal loops without function signatures. The prompt must instruct the model to correlate related snippets using metadata file paths.

### 3.3. File Filtering & Binary Isolation
- Non-text, binary, and compiled artifacts (`.dll`, `.so`, `.exe`, `.pyc`, `.wasm`, `.png`, `.db`) and build output folders (`node_modules`, `.git`, `dist`, `build`, `__pycache__`) are strictly bypassed. Ingesting binary files corrupts embeddings and causes UTF-8 decoding exceptions.

---

## 4. Latency Considerations & SLAs

```
[User Query] 
     │
     ▼ (10-30ms)
[HuggingFace Embeddings - Local CPU]
     │
     ▼ (15-50ms)
[ChromaDB Vector Distance Search]
     │
     ▼ (150-400ms)
[Groq LPU Inference (LLaMA 3.1 8B)]
     │
     ▼
[Final Stream/Response: Total ~200-500ms End-to-End]
```

1. **Local Embedding Latency (`all-MiniLM-L6-v2`):**
   - Single-query embedding on modern CPU: ~15ms to 35ms.
   - Bulk ingestion of 500 files (~3,000 chunks): ~30s to 90s on CPU. Ingestion must always be treated as an upfront batch setup step, not a per-query synchronous operation.
2. **Vector Retrieval Latency:**
   - ChromaDB approximate nearest neighbor (HNSW index) search over 10,000 chunks executes in < 30ms.
3. **Groq LPU Acceleration:**
   - Groq LPUs generate tokens at ~400–700 tokens/second for LLaMA 3.1 8B. Time-To-First-Token (TTFT) is typically under 150ms.

---

## 5. Security & Isolation Constraints

### 5.1. Strict Protection of `GROQ_API_KEY`
- **Zero Client-Side Exposure:** `GROQ_API_KEY` must never be sent in HTTP responses, included in client logs, embedded in generated documentation, or exposed to the frontend partner.
- **Environment Isolation:** Loaded via `.env` with fallback to operating system environment variables (`os.getenv`).
- **Git Hygiene:** `.env` and `.env.local` files are registered in `.gitignore`. Sample configs must use placeholder keys (`GROQ_API_KEY=gsk_your_key_here`).
- **Internal Sanitization:** Request models, response schemas, and error dumps automatically filter out sensitive environment strings.

### 5.2. Ingestion Path Traversal Protection
- To avoid arbitrary file read vulnerabilities (e.g., an attacker requesting `/ingest` with `../../../../etc/passwd` or `C:\Windows\System32`), the backend enforces:
  - Canonical path resolution (`os.path.realpath` / `Path.resolve()`).
  - Validation that target paths exist and resolve to safe directories.

### 5.3. Enterprise Code Privacy & Compliance
- The core value proposition of RAGScript is local-first security.
- The raw codebase never leaves the local developer machine during indexing. Only specific retrieved snippets (top-$k$ chunks) are sent to Groq's inference endpoint over TLS 1.3 when answering queries.
- No source code is used to fine-tune or train third-party foundation models.
