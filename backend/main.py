
import os
import re
import sqlite3
import subprocess
import webbrowser
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus, urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import difflib


# ============================================================
# NOVA AI CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

APP_NAME = "NOVA AI"
OLLAMA_BASE_URL = os.getenv(
    "OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"
)
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
DATABASE_PATH = BASE_DIR / "nova_memory.db"

client = OpenAI(
    base_url=OLLAMA_BASE_URL,
    api_key="ollama",
    timeout=180.0,
)

app = FastAPI(title="NOVA AI API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """
You are NOVA, a helpful personal AI assistant running locally.
Be conversational, practical, and accurate.
Use saved memories when relevant.
Never claim that you performed a computer action unless it succeeded.
You cannot directly control the computer through chat.
Computer actions require a separate approved backend action.
Keep replies concise unless the user asks for detail.
You are NOVA, a personal AI assistant running locally.
Your configured AI model is Ollama running llama3.2.
When asked which model powers you, identify it as Llama 3.2
running through Ollama. Never invent model architectures.
"""

# ============================================================
# DATABASE AND SAFE MIGRATIONS
# ============================================================

def get_db():
    db = sqlite3.connect(DATABASE_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def table_columns(db, table):
    return {
        row["name"]
        for row in db.execute(
            f"PRAGMA table_info({table})"
        ).fetchall()
    }


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL DEFAULT 'default',
                role TEXT NOT NULL DEFAULT 'user',
                content TEXT NOT NULL DEFAULT '',
                created_at TEXT
            )
        """)

        # Migrate older databases without deleting their records.
        columns = table_columns(db, "conversations")

        if "session_id" not in columns:
            db.execute("""
                ALTER TABLE conversations
                ADD COLUMN session_id TEXT NOT NULL DEFAULT 'default'
            """)

        columns = table_columns(db, "conversations")

        if "role" not in columns:
            db.execute("""
                ALTER TABLE conversations
                ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
            """)

        columns = table_columns(db, "conversations")

        if "content" not in columns:
            db.execute("""
                ALTER TABLE conversations
                ADD COLUMN content TEXT NOT NULL DEFAULT ''
            """)

        columns = table_columns(db, "conversations")

        if "created_at" not in columns:
            db.execute("""
                ALTER TABLE conversations
                ADD COLUMN created_at TEXT
            """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        memory_columns = table_columns(db, "memories")

        if "updated_at" not in memory_columns:
            db.execute("""
                ALTER TABLE memories ADD COLUMN updated_at TEXT
            """)
            db.execute("""
                UPDATE memories
                SET updated_at = created_at
                WHERE updated_at IS NULL
            """)

        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_conversations_session
            ON conversations(session_id, id)
        """)

        db.execute("""
            UPDATE conversations
            SET session_id = 'default'
            WHERE session_id IS NULL OR session_id = ''
        """)

        db.execute("""
            UPDATE conversations
            SET created_at = ?
            WHERE created_at IS NULL OR created_at = ''
        """, (datetime.now().isoformat(timespec="seconds"),))


init_db()


# ============================================================
# MEMORY
# ============================================================

def get_memories():
    with get_db() as db:
        rows = db.execute("""
            SELECT id, content, created_at, updated_at
            FROM memories
            ORDER BY id DESC
        """).fetchall()
        return [dict(row) for row in rows]


def save_memory(content):
    content = content.strip()
    if not content:
        return

    now = datetime.now().isoformat(timespec="seconds")

    with get_db() as db:
        db.execute("""
            INSERT INTO memories (content, created_at, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(content)
            DO UPDATE SET updated_at = excluded.updated_at
        """, (content, now, now))


def memory_context():
    memories = get_memories()
    if not memories:
        return "No saved memories."

    return "\n".join(
        "- " + item["content"]
        for item in memories[:100]
    )


def explicit_memory_request(message):
    patterns = [
        r"^remember that\s+",
        r"^remember this:\s*",
        r"^remember:\s*",
        r"^save this memory:\s*",
        r"^save to memory:\s*",
        r"^please remember\s+",
    ]

    for pattern in patterns:
        match = re.match(pattern, message.strip(), re.IGNORECASE)
        if match:
            content = message.strip()[match.end():].strip()
            return content or None

    return None


@app.get("/api/memories")
def list_memories():
    return {"memories": get_memories()}


@app.post("/api/memories")
def add_memory(payload: dict = Body(...)):
    content = str(payload.get("content", "")).strip()

    if not content:
        raise HTTPException(400, "Memory content is required.")

    if len(content) > 2000:
        raise HTTPException(400, "Memory is too long.")

    save_memory(content)
    return {"success": True, "memories": get_memories()}


@app.put("/api/memories/{memory_id}")
def edit_memory(memory_id: int, payload: dict = Body(...)):
    content = str(payload.get("content", "")).strip()

    if not content or len(content) > 2000:
        raise HTTPException(400, "Provide valid memory content.")

    now = datetime.now().isoformat(timespec="seconds")

    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM memories WHERE id = ?", (memory_id,)
        ).fetchone()

        if not existing:
            raise HTTPException(404, "Memory not found.")

        try:
            db.execute("""
                UPDATE memories
                SET content = ?, updated_at = ?
                WHERE id = ?
            """, (content, now, memory_id))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "That memory already exists.")

    return {"success": True, "memories": get_memories()}


@app.delete("/api/memories/{memory_id}")
def remove_memory(memory_id: int):
    with get_db() as db:
        cursor = db.execute(
            "DELETE FROM memories WHERE id = ?", (memory_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Memory not found.")

    return {"success": True, "memories": get_memories()}


@app.delete("/api/memories")
def remove_all_memories():
    with get_db() as db:
        db.execute("DELETE FROM memories")
    return {"success": True, "memories": []}


# ============================================================
# CHAT HISTORY
# ============================================================


def save_message(session_id, role, content):
    with get_db() as db:
        columns = {
            row["name"]
            for row in db.execute(
                "PRAGMA table_info(conversations)"
            ).fetchall()
        }

        values = {
            "session_id": session_id,
            "role": role,
            "content": content,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "model": OLLAMA_MODEL,
        }

        insert_columns = [
            name for name in values if name in columns
        ]

        names_sql = ", ".join(f'"{name}"' for name in insert_columns)
        placeholders = ", ".join("?" for _ in insert_columns)
        insert_values = [values[name] for name in insert_columns]

        db.execute(
            f"INSERT INTO conversations ({names_sql}) "
            f"VALUES ({placeholders})",
            insert_values,
        )



@app.get("/api/history")
def get_history(session_id: str = "default", limit: int = 100):
    limit = max(1, min(limit, 500))

    with get_db() as db:
        rows = db.execute("""
            SELECT id, session_id, role, content, created_at
            FROM conversations
            WHERE session_id = ?
            ORDER BY id DESC
            LIMIT ?
        """, (session_id, limit)).fetchall()

    return {"history": [dict(row) for row in reversed(rows)]}


@app.delete("/api/history")
def delete_history(session_id: str = "default"):
    with get_db() as db:
        db.execute(
            "DELETE FROM conversations WHERE session_id = ?",
            (session_id,),
        )
    return {"success": True}


# ============================================================
# STATUS
# ============================================================

@app.get("/")
def root():
    return {
        "name": APP_NAME,
        "status": "running",
        "model": OLLAMA_MODEL,
    }


@app.get("/health")
def health():
    try:
        models = client.models.list()
        return {
            "status": "healthy",
            "ollama": "connected",
            "configured_model": OLLAMA_MODEL,
            "available_models": [model.id for model in models.data],
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "ollama": "disconnected",
            "error": str(exc),
        }


@app.get("/api/voice/status")
def voice_status():
    return {
        "available": True,
        "provider": "browser",
        "note": "Microphone and speech playback need frontend support.",
    }


# ============================================================
# APPROVED WINDOWS ACTIONS
# ============================================================

ALLOWED_ACTIONS = {
    "open_calculator": {
        "label": "Open Calculator",
        "command": ["calc.exe"],
    },
    "open_notepad": {
        "label": "Open Notepad",
        "command": ["notepad.exe"],
    },
}

# ============================================================
# DYNAMIC WINDOWS APPLICATION LAUNCHER
# ============================================================

import os

START_MENU_DIRS = [
    Path(os.environ.get("APPDATA", "")) /
    "Microsoft/Windows/Start Menu/Programs",

    Path(os.environ.get("PROGRAMDATA", "")) /
    "Microsoft/Windows/Start Menu/Programs",
]


def discover_installed_apps():
    """Discover applications exposed through Start Menu shortcuts."""
    apps = {}

    for directory in START_MENU_DIRS:
        if not directory.is_dir():
            continue

        for shortcut in directory.rglob("*.lnk"):
            # Skip shortcuts inside uninstall or maintenance folders.
            name = shortcut.stem.strip()

            if not name:
                continue

            apps.setdefault(name.lower(), {
                "name": name,
                "path": str(shortcut),
            })

    return apps


@app.get("/api/pc/apps")
def list_installed_apps():
    """Return discoverable Windows Start Menu applications."""
    apps = discover_installed_apps()

    return {
        "count": len(apps),
        "apps": sorted(
            [
                {
                    "name": item["name"],
                    "path": item["path"],
                }
                for item in apps.values()
            ],
            key=lambda item: item["name"].lower(),
        ),
    }


@app.post("/api/pc/open-app")
def open_installed_app(payload: dict = Body(...)):
    """Open a discovered application without invoking a shell."""
    app_name = str(payload.get("app_name", "")).strip()

    if not app_name or len(app_name) > 150:
        raise HTTPException(
            status_code=400,
            detail="Provide a valid application name.",
        )

    apps = discover_installed_apps()
    requested = app_name.casefold()

    # Prefer an exact match.
    match = apps.get(requested)

    # Then try a unique partial match.
    if match is None:
        partial_matches = [
            item
            for key, item in apps.items()
            if requested in key or key in requested
        ]

        if len(partial_matches) == 1:
            match = partial_matches[0]

    # Finally, allow a close spelling match.
    if match is None and apps:
        closest = difflib.get_close_matches(
            requested,
            list(apps.keys()),
            n=1,
            cutoff=0.82,
        )

        if closest:
            match = apps[closest[0]]

    if match is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Couldn't find '{app_name}' in the Windows Start Menu. "
                "Check that the app is installed and has a Start Menu shortcut."
            ),
        )

    try:
        os.startfile(match["path"])

        return {
            "success": True,
            "app": match["name"],
            "message": f"{match['name']} is launching.",
        }

    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Couldn't launch {match['name']}: {exc}",
        )


@app.get("/api/pc/actions")
def list_actions():
    return {
        "actions": [
            {
                "id": key,
                "label": value["label"],
                "requires_confirmation": True,
            }
            for key, value in ALLOWED_ACTIONS.items()
        ]
    }


@app.post("/api/pc/actions")
def run_action(payload: dict = Body(...)):
    action_id = payload.get("action")
    confirm = payload.get("confirm", False)
    action = ALLOWED_ACTIONS.get(action_id)

    if not action:
        raise HTTPException(400, "Action is not allowed.")

    if confirm is not True:
        return {
            "success": False,
            "requires_confirmation": True,
            "message": "Confirm before: " + action["label"],
        }

    try:
        subprocess.Popen(action["command"], shell=False)
        return {"success": True, "message": action["label"] + " launched."}
    except OSError as exc:
        raise HTTPException(500, str(exc))


@app.post("/api/pc/open-url")
def open_url(payload: dict = Body(...)):
    url = str(payload.get("url", "")).strip()
    confirm = payload.get("confirm", False)
    parsed = urlparse(url)

    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise HTTPException(400, "Provide a valid HTTP or HTTPS URL.")

    if confirm is not True:
        return {
            "success": False,
            "requires_confirmation": True,
            "message": "Confirm before opening " + url,
        }

    webbrowser.open(url, new=2)
    return {"success": True, "message": "URL opened."}


# ============================================================
# CHAT - ACCEPTS BOTH FRONTEND FORMATS
# ============================================================

@app.post("/v1/chat/completions")
def chat_completions(payload: dict = Body(...)):
    """
    Accepts either:
      {"message": "Hello", "session_id": "default"}
    or:
      {"messages": [{"role": "user", "content": "Hello"}],
       "model": "llama3.2"}
    """

    session_id = str(payload.get("session_id") or "default")[:100]
    incoming = payload.get("messages")
    message = payload.get("message")

    # Support OpenAI-compatible frontend requests.
    if isinstance(incoming, list):
        valid_messages = []

        for item in incoming:
            if not isinstance(item, dict):
                continue

            role = item.get("role")
            content = item.get("content")

            # Ollama chat accepts text messages here.
            if role not in ("system", "user", "assistant"):
                continue

            if isinstance(content, str) and content.strip():
                valid_messages.append({
                    "role": role,
                    "content": content.strip(),
                })

        if not valid_messages:
            raise HTTPException(
                400, "The messages array contains no valid text messages."
            )

        user_messages = [
            item["content"]
            for item in valid_messages
            if item["role"] == "user"
        ]

        if not user_messages:
            raise HTTPException(400, "A user message is required.")

        message = user_messages[-1]
        conversation_messages = valid_messages[-20:]

    else:
        if not isinstance(message, str) or not message.strip():
            raise HTTPException(
                400,
                "Provide either a non-empty message or a messages array.",
            )

        message = message.strip()
        conversation_messages = []

    if len(message) > 12000:
        raise HTTPException(400, "Message is too long.")

    # Save explicit memory requests.
    memory_to_save = explicit_memory_request(message)
    if memory_to_save:
        save_memory(memory_to_save)

    # When using the simple message format, load local conversation history.
    if not conversation_messages:
        with get_db() as db:
            rows = db.execute("""
                SELECT role, content
                FROM conversations
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT 20
            """, (session_id,)).fetchall()

        conversation_messages = [
            {"role": row["role"], "content": row["content"]}
            for row in reversed(rows)
            if row["role"] in ("user", "assistant")
        ]

        # Avoid saving the same user message twice.
        if not conversation_messages or not (
            conversation_messages[-1]["role"] == "user"
            and conversation_messages[-1]["content"] == message
        ):
            save_message(session_id, "user", message)

    else:
        # Save the latest user message for history.
        save_message(session_id, "user", message)

    messages = [{
        "role": "system",
        "content": (
            SYSTEM_PROMPT
            + "\n\nSaved memories:\n"
            + memory_context()
        ),
    }]

    # Preserve supplied system messages, while always adding NOVA's prompt.
    for item in conversation_messages:
        if item["role"] == "system":
            messages[0]["content"] += "\n\n" + item["content"]
        else:
            messages.append(item)

    try:
        response = client.chat.completions.create(
            model=OLLAMA_MODEL,
            messages=messages,
            temperature=0.7,
        )

        answer = response.choices[0].message.content or ""
        answer = answer.strip()

        if not answer:
            answer = "I couldn't generate a response. Please try again."

        save_message(session_id, "assistant", answer)

        # Return OpenAI-compatible fields plus convenient frontend fields.
        return {
            "id": "nova-" + str(int(datetime.now().timestamp() * 1000)),
            "object": "chat.completion",
            "created": int(datetime.now().timestamp()),
            "model": OLLAMA_MODEL,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": answer,
                },
                "finish_reason": "stop",
            }],
            "reply": answer,
            "session_id": session_id,
            "memory_saved": bool(memory_to_save),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "NOVA could not generate a response. Make sure Ollama is "
                "running and llama3.2 is installed. Error: " + str(exc)
            ),
        )


# ============================================================
# NOVA: OPEN WEBSITES AND COMMON WINDOWS FOLDERS
# ============================================================

USER_HOME = Path.home()

ALLOWED_FOLDERS = {
    "downloads": USER_HOME / "Downloads",
    "documents": USER_HOME / "Documents",
    "desktop": USER_HOME / "Desktop",
    "pictures": USER_HOME / "Pictures",
    "music": USER_HOME / "Music",
    "videos": USER_HOME / "Videos",
}


@app.post("/api/pc/open-folder")
def open_folder(payload: dict = Body(...)):
    folder_name = str(payload.get("folder", "")).strip().lower()

    folder_path = ALLOWED_FOLDERS.get(folder_name)

    if folder_path is None:
        raise HTTPException(
            status_code=400,
            detail="That folder is not in NOVA's allowed folder list.",
        )

    if not folder_path.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"The {folder_name} folder was not found.",
        )

    try:
        # Launch Explorer directly. This avoids relying on the default
        # file association handler to decide how the folder is displayed.
        subprocess.Popen(
            ["explorer.exe", str(folder_path)],
            shell=False,
            close_fds=True,
        )

        return {
            "success": True,
            "message": f"Opening {folder_name.title()} folder.",
        }
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not open the folder: {exc}",
        )


@app.post("/api/pc/open-website")
def open_website(payload: dict = Body(...)):
    website = str(payload.get("website", "")).strip().lower()

    allowed_websites = {
        "youtube": "https://www.youtube.com/",
        "github": "https://github.com/",
        "google": "https://www.google.com/",
        "gmail": "https://mail.google.com/",
        "stackoverflow": "https://stackoverflow.com/",
        "chatgpt": "https://chatgpt.com/",
    }

    url = allowed_websites.get(website)

    if url is None:
        raise HTTPException(
            status_code=400,
            detail="That website is not in NOVA's allowed website list.",
        )

    try:
        opened = webbrowser.open(url)

        if not opened:
            raise HTTPException(
                status_code=500,
                detail="The browser did not confirm opening the website.",
            )

        return {
            "success": True,
            "message": f"Opening {website.title()}.",
            "url": url,
        }
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not open the website: {exc}",
        )



# ============================================================
# GOOGLE SEARCH — OPENS RESULTS IN THE DEFAULT BROWSER
# ============================================================

from pydantic import BaseModel, Field


class GoogleSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class FileSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    folder: str = "downloads"
    limit: int = Field(default=30, ge=1, le=100)


@app.post("/api/pc/google-search")
def google_search(payload: GoogleSearchRequest):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Enter a search query.")

    url = "https://www.google.com/search?q=" + quote_plus(query)
    try:
        opened = webbrowser.open(url, new=2)
        if not opened:
            raise HTTPException(
                status_code=500,
                detail="Could not open Google in your default browser."
            )
        return {
            "success": True,
            "query": query,
            "url": url,
            "message": "Google search opened in your browser."
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Google search failed: {str(exc)[:200]}"
        ) from exc


# ============================================================
# SEARCH FILENAMES IN APPROVED FOLDERS (READ-ONLY)
# ============================================================

@app.post("/api/pc/search-files")
def search_files(payload: FileSearchRequest):
    allowed_folders = {
        "downloads": Path.home() / "Downloads",
        "documents": Path.home() / "Documents",
        "desktop": Path.home() / "Desktop",
        "pictures": Path.home() / "Pictures",
        "music": Path.home() / "Music",
        "videos": Path.home() / "Videos",
    }

    folder_name = payload.folder.strip().lower()
    root = allowed_folders.get(folder_name)
    if root is None:
        raise HTTPException(
            status_code=400,
            detail="Folder is not on NOVA's approved list."
        )
    if not root.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"The {folder_name} folder was not found."
        )

    query = payload.query.strip().casefold()
    if not query:
        raise HTTPException(status_code=400, detail="Enter a filename to search for.")

    results = []
    scanned = 0
    max_scanned = 10000
    try:
        for path in root.rglob("*"):
            scanned += 1
            if scanned > max_scanned:
                break
            try:
                if path.is_symlink() or not path.is_file():
                    continue
                if query in path.name.casefold():
                    results.append({
                        "name": path.name,
                        "path": str(path),
                        "extension": path.suffix.lower(),
                        "size_bytes": path.stat().st_size,
                    })
                    if len(results) >= payload.limit:
                        break
            except OSError:
                continue
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"File search failed: {str(exc)[:200]}"
        ) from exc

    return {
        "success": True,
        "query": payload.query,
        "folder": str(root),
        "count": len(results),
        "results": results,
        "scan_limit_reached": scanned > max_scanned,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
