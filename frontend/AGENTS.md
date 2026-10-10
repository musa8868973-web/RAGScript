# RAGScript Frontend Architecture

## Architecture Rules
- All backend network calls live in `src/lib/api.ts`; UI never calls fetch directly — keeps Demo Mode fallback in one place.
- App state (files, chats, settings, index) lives in `src/lib/store.tsx` and persists to localStorage — no server database in this frontend.
- RAGScript UI components live in `src/components/rag/`; the single app screen is `src/routes/index.tsx`.
