# NOVA AI — Full-stack starter

NOVA AI has a React + Vite frontend and a Python FastAPI backend using Gemini, plus a local SQLite message log.

## Start the backend (Windows PowerShell)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and add your Gemini API key. Then run:

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell activation is blocked, use `.\.venv\Scripts\python.exe` in place of `python` after creating the environment.

## Start the frontend

Open a second terminal in the project root:

```powershell
npm install
npm run dev
```

Visit the Vite URL, usually http://localhost:5173.

Full backend setup and API notes are in `backend/README.md`. Never commit `.env` or put production API secrets in browser code.
