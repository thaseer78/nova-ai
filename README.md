# NOVA AI — Personal AI Assistant

**A locally running AI assistant with voice interaction, persistent memory, and desktop automation.**

NOVA AI is a full-stack personal assistant designed to bring AI-powered conversations and useful computer actions into one interface. It combines a React frontend, a Python FastAPI backend, and a locally hosted language model through Ollama.

## Overview

NOVA provides a workspace for interacting with an AI assistant, asking questions through text or voice, retaining information across sessions, and triggering supported actions on your computer.

The project focuses on a clean user interface, local AI inference, and practical desktop automation.

## Features

- **AI chat:** Ask questions and receive responses from a locally hosted language model.
- **Voice interaction:** Use microphone-based speech recognition and spoken AI responses.
- **Conversation context:** Share recent conversation context between the main chat and voice assistant.
- **Persistent memory:** Store and retrieve supported information across sessions.
- **Google search:** Open Google searches through explicit commands.
- **Desktop automation:** Open supported applications and folders.
- **Filename search:** Search filenames in supported folders.
- **Modern interface:** React-based workspace with a dark, technical design.
- **Local backend:** Route AI requests through a Python FastAPI server.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React, Vite, JavaScript |
| Backend | Python, FastAPI |
| AI inference | Ollama |
| Language model | Llama 3.2 (`llama3.2`) |
| Database | SQLite |
| Voice input | Browser Speech Recognition API |
| Voice output | Browser Speech Synthesis API |
| API communication | HTTP and JSON |

## Architecture

```text
User
 |
 v
React + Vite Frontend
 |                 |
 | Text / Voice    | Supported PC commands
 v                 v
FastAPI Backend    Desktop Actions
 |
 v
Ollama API
 |
 v
Llama 3.2

FastAPI Backend
 |
 v
SQLite Memory Store
```

The frontend communicates with the FastAPI backend, which handles AI requests and supported local actions. Ollama provides local language-model inference, while SQLite supports persistent application data.

## Prerequisites

Before running NOVA, install:

- [Node.js](https://nodejs.org/)
- [Python](https://www.python.org/downloads/)
- [Ollama](https://ollama.com/)

A Windows computer is recommended for the current desktop-automation implementation.

## Installation and Setup

### 1. Clone the repository

```powershell
git clone https://github.com/thaseer78/nova-ai.git
cd nova-ai
```

### 2. Download the language model

Make sure Ollama is installed and running. Pull the model used by the project:

```powershell
ollama pull llama3.2
```

### 3. Set up the backend

Open a terminal in the project root:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

If PowerShell blocks virtual-environment activation, run the environment's Python executable directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Configure the backend environment variables according to `backend/.env.example`. Do not commit real credentials or local secrets.

Start the backend:

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API documentation should be available at:

`http://127.0.0.1:8000/docs`

### 4. Set up the frontend

Open a second terminal in the project root:

```powershell
npm install
npm run dev
```

Open the local Vite URL displayed in your terminal, usually:

`http://localhost:5173`

Keep the backend, Ollama, and frontend running while using the application.

## Example Commands

You can try supported requests such as:

- `Explain how an API works.`
- `Search Google for Python tutorials.`
- `Open Downloads.`
- `Open Notepad.`
- `Find my project files in Documents.`

Available commands depend on the application's supported actions and folder mappings. NOVA may request confirmation before executing an action.

## Production Build

To build the frontend for production:

```powershell
npm run build
```

To preview the generated frontend build:

```powershell
npm run preview
```

The frontend build does not deploy the backend or host the Ollama model. Those components must be configured separately for a public deployment.

## Security and Privacy

- Never commit `.env` files containing secrets or credentials.
- Keep local SQLite databases and private application data out of public repositories.
- Review environment variables and configuration files before publishing changes.
- Use confirmation prompts for desktop actions.
- Understand that local desktop automation can access parts of your computer within the permissions granted to the application.
- Do not expose the development server or an unauthenticated backend publicly without appropriate security controls.

## Current Limitations

- The current setup is designed primarily for local use.
- Ollama must be installed and running with the required model.
- Browser speech recognition and speech synthesis depend on browser support and permissions.
- Desktop automation is dependent on the operating system and supported commands.
- Public deployment requires a separately configured backend and AI inference strategy.

## Future Improvements

Potential improvements include:

- More configurable voice and model settings
- Stronger memory controls and management
- Additional desktop automation integrations
- Improved error handling and automated tests
- Authentication and secure remote access
- A production deployment workflow

## Author

**Thaseer A R**

- GitHub: [@thaseer78](https://github.com/thaseer78)

## License

No license has been specified yet. Add a license before permitting others to reuse or redistribute this project.
