# NOVA API backend

Python + FastAPI backend using Google Gemini for live model responses and SQLite for a simple local message log.

## 1. Requirements

- Python 3.10+
- A Gemini API key from Google AI Studio
- Node.js for the React frontend

## 2. Set up the backend (Windows PowerShell)

From the project root:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Open `backend/.env` and replace `replace_with_your_gemini_api_key` with your real key. Keep `.env` private and never commit it to GitHub.

If PowerShell blocks environment activation, run the venv Python directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Otherwise start it with:

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

API docs: http://127.0.0.1:8000/docs
Health check: http://127.0.0.1:8000/health

## 3. Start the frontend

Open a second terminal in the project root:

```powershell
npm install
npm run dev
```

Open the Vite URL, usually http://localhost:5173. The frontend defaults to `http://localhost:8000`, which matches this backend. You can also set `VITE_NOVA_API_URL=http://localhost:8000` in a root `.env` file.

## 4. What works

- `POST /v1/chat/completions`: OpenAI-compatible request shape used by the frontend, routed to Gemini.
- `GET /health`: backend and configuration status.
- `GET /api/history`: returns the latest saved user/assistant messages.
- `DELETE /api/history`: clears the local message log.
- SQLite stores a basic message log in `backend/nova_memory.db`.

## Important limitations and safety

- This is a local-development starter. It has no user authentication, authorization, rate limiting, or deployment hardening.
- The SQLite log is a basic history log, not retrieval-augmented memory and not partitioned by user or thread.
- The frontend does not yet load history from `/api/history`; its visible threads remain in browser memory.
- Attachments are selected in the frontend but are not uploaded or parsed by this backend.
- Voice input uses browser speech recognition where available; spoken replies / text-to-speech are not wired yet.
- Only Gemini is implemented in this backend. The frontend model dropdown is a label; server calls use `GEMINI_MODEL` from `.env`.
- Do not expose this local server to the public internet as-is. Before deployment, add authentication, per-user data separation, quotas, logging hygiene, and secure secret management.
