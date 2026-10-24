import React, { useEffect, useRef, useState } from "react";

import { createRoot } from "react-dom/client";

import {

  ChevronDown,

  Plus,

  Settings2,

  Trash2,

  X,

  Copy,

  Menu,

  PanelRightOpen,

  PanelRightClose,

  Mic,

  Sun,

  Moon,

} from "lucide-react";

import "./styles.css";

import VoiceAssistant from "./VoiceAssistant";



const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const DEFAULT_MODEL = "llama3.2";


function App() {

  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);

  const [model, setModel] = useState(DEFAULT_MODEL);

  const [temperature, setTemperature] = useState(0.6);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [inspectorOpen, setInspectorOpen] = useState(true);

  const [voiceOpen, setVoiceOpen] = useState(false);

  const [lightTheme, setLightTheme] = useState(false);

  const [input, setInput] = useState("");

  const [busy, setBusy] = useState(false);

  const [notice, setNotice] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);

  const [threads, setThreads] = useState([

    { id: 1, title: "New session", messages: [] },

  ]);

  const [activeId, setActiveId] = useState(1);

  const feedRef = useRef(null);



  const activeThread =

    threads.find((thread) => thread.id === activeId) || threads[0];

  const messages = activeThread.messages;



  useEffect(() => {

    document.title = "NOVA — Workspace";

  }, []);



  useEffect(() => {

    if (feedRef.current) {

      feedRef.current.scrollTop = feedRef.current.scrollHeight;

    }

  }, [messages, busy]);



  useEffect(() => {

    if (!notice) return;

    const timer = setTimeout(() => setNotice(""), 3500);

    return () => clearTimeout(timer);

  }, [notice]);



  useEffect(() => {

    if (lightTheme) {

      document.body.classList.add("theme-light");

    } else {

      document.body.classList.remove("theme-light");

    }

  }, [lightTheme]);



  function updateThread(id, update) {

    setThreads((current) =>

      current.map((thread) =>

        thread.id === id ? update(thread) : thread

      )

    );

  }



  function newSession() {
    const id = Date.now();

    setThreads((current) => [
      { id, title: "New session", messages: [] },
      ...current,
    ]);

    setActiveId(id);
    setInput("");
    setShowWelcome(false);
  }



  function deleteSession(id) {

    const remaining = threads.filter((thread) => thread.id !== id);



    if (remaining.length === 0) {

      const newId = Date.now();

      setThreads([{ id: newId, title: "New session", messages: [] }]);

      setActiveId(newId);

      return;

    }



    setThreads(remaining);



    if (activeId === id) {

      setActiveId(remaining[0].id);

    }

  }



  async function sendMessage(text = input) {

    const prompt = text.trim();



    if (!prompt || busy) return;



    const threadId = activeId;

    const previousMessages = activeThread.messages;



    const userMessage = {

      role: "user",

      content: prompt,

      time: new Date().toISOString(),

    };



    const requestMessages = [

      ...previousMessages.map(({ role, content }) => ({

        role,

        content,

      })),

      { role: "user", content: prompt },

    ];



    updateThread(threadId, (thread) => ({

      ...thread,

      title:

        thread.messages.length === 0

          ? prompt.slice(0, 32)

          : thread.title,

      messages: [...thread.messages, userMessage],

    }));



    setInput("");

    setBusy(true);



    const baseUrl = apiUrl.trim().replace(/\/+$/, "");



    try {

      const normalizedPrompt = prompt
        .toLowerCase()
        .replace(/[.!?]+$/, "")
        .trim()
        .replace(/^(?:hey\s+)?nova[, ]+/, "");

      const addAssistantMessage = (content) => {
        updateThread(threadId, (thread) => ({
          ...thread,
          messages: [...thread.messages, {
            role: "assistant",
            content,
            time: new Date().toISOString(),
          }],
        }));
      };

      // Route direct commands to backend endpoints before asking the LLM.
      const searchMatch = normalizedPrompt.match(
        /^(?:please\s+)?(?:search(?:\s+google)?\s+for|google\s+search\s+for|look\s+up)\s+(.+)$/
      );
      if (searchMatch) {
        const query = searchMatch[1].trim();
        if (!window.confirm(`Allow NOVA to open a Google search for "${query}"?`)) {
          addAssistantMessage("Google search cancelled.");
          return;
        }
        const response = await fetch(`${baseUrl}/api/pc/google-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, confirm: true }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success !== true) {
          throw new Error(data.detail || data.message || "Google search failed.");
        }
        addAssistantMessage(`Opened Google search for: ${query}`);
        return;
      }

      // Search filenames in an approved folder (read-only).
      const fileSearchMatch = normalizedPrompt.match(
        /^(?:please\s+)?(?:find|search for|locate)\s+(?:my\s+|the\s+)?(.+?)\s+in\s+(downloads|documents|desktop|pictures|music|videos)(?:\s+folder)?$/
      );
      if (fileSearchMatch) {
        const query = fileSearchMatch[1].trim();
        const folder = fileSearchMatch[2];
        if (!window.confirm(`Allow NOVA to search filenames for "${query}" in ${folder}? This only reads filenames and does not open or modify files.`)) {
          addAssistantMessage(`File search in ${folder} cancelled.`);
          return;
        }
        const response = await fetch(`${baseUrl}/api/pc/search-files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, folder, limit: 30 }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success !== true) {
          throw new Error(data.detail || data.message || "File search failed.");
        }
        const found = Array.isArray(data.results) ? data.results : [];
        const summary = found.length
          ? `Found ${found.length} matching file${found.length === 1 ? "" : "s"}:\n\n` + found.map((item, index) => `${index + 1}. ${item.name}\n${item.path}`).join("\n\n")
          : `No files matching "${query}" were found in ${folder}.`;
        addAssistantMessage(summary);
        return;
      }

      const folderMatch = normalizedPrompt.match(
        /^(?:please\s+)?(?:open|show|go to)\s+(?:(?:my|the)\s+)?(downloads|documents|desktop|pictures|music|videos)(?:\s+folder)?$/
      );
      if (folderMatch) {
        const folder = folderMatch[1];
        if (!window.confirm(`Allow NOVA to open your ${folder} folder?`)) {
          addAssistantMessage(`Opening ${folder} was cancelled.`);
          return;
        }
        const response = await fetch(`${baseUrl}/api/pc/open-folder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder, confirm: true }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
          throw new Error(data.detail || data.message || `Could not open ${folder}.`);
        }
        addAssistantMessage(data.message || `Opening your ${folder} folder.`);
        return;
      }

      const websiteMatch = normalizedPrompt.match(
        /^(?:please\s+)?(?:open|launch|visit|go to)\s+(?:the\s+)?(youtube|github|google|gmail|stackoverflow|chatgpt)$/
      );
      if (websiteMatch) {
        const website = websiteMatch[1];
        if (!window.confirm(`Allow NOVA to open ${website}?`)) {
          addAssistantMessage(`Opening ${website} was cancelled.`);
          return;
        }
        const response = await fetch(`${baseUrl}/api/pc/open-website`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website, confirm: true }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
          throw new Error(data.detail || data.message || `Could not open ${website}.`);
        }
        addAssistantMessage(data.message || `Opening ${website}.`);
        return;
      }

      const appMatch = normalizedPrompt.match(
        /^(?:please\s+)?(?:open|launch|start)\s+(?:(?:the|my)\s+)?(.+?)(?:\s+application|\s+app)?$/
      );
      if (appMatch && !/^(google|youtube|github|gmail|stackoverflow|chatgpt|downloads|documents|desktop|pictures|music|videos)$/.test(appMatch[1])) {
        const appName = appMatch[1].trim();
        if (appName.length <= 100) {
          if (!window.confirm(`Allow NOVA to open "${appName}" on your PC?`)) {
            addAssistantMessage(`Opening ${appName} was cancelled.`);
            return;
          }
          const knownActions = { calculator: "open_calculator", notepad: "open_notepad" };
          const action = knownActions[appName];
          const endpoint = action ? `${baseUrl}/api/pc/actions` : `${baseUrl}/api/pc/open-app`;
          const body = action ? { action, confirm: true } : { app_name: appName, confirm: true };
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data.success === false) {
            throw new Error(data.detail || data.message || `Could not open ${appName}.`);
          }
          addAssistantMessage(data.message || `${data.app || appName} is launching.`);
          return;
        }
      }

      // Normal conversation continues through the chat API.

      const response = await fetch(

        `${baseUrl}/v1/chat/completions`,

        {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

          },

          body: JSON.stringify({

            model,

            messages: requestMessages,

            temperature,

            stream: false,

          }),

        }

      );



      const data = await response.json().catch(() => ({}));



      if (!response.ok) {

        const detail =

          typeof data.detail === "string"

            ? data.detail

            : data.error?.message ||

              `HTTP ${response.status}`;



        throw new Error(detail);

      }



      const answer = data.choices?.[0]?.message?.content;



      if (!answer) {

        throw new Error("The backend returned an empty response.");

      }



      updateThread(threadId, (thread) => ({

        ...thread,

        messages: [

          ...thread.messages,

          {

            role: "assistant",

            content: answer,

            time: new Date().toISOString(),

          },

        ],

      }));

    } catch (error) {

      const message =

        error.name === "TypeError"

          ? "Cannot reach the NOVA backend. Check that FastAPI is running at " +

            baseUrlForDisplay(apiUrl) +

            " and that the API URL is correct."

          : error.message ||

            "An unexpected connection error occurred.";



      updateThread(threadId, (thread) => ({

        ...thread,

        messages: [

          ...thread.messages,

          {

            role: "assistant",

            content: `Connection needs attention\n\n${message}`,

            error: true,

            time: new Date().toISOString(),

          },

        ],

      }));

    } finally {

      setBusy(false);

    }

  }



  function copyMessage(text) {

    navigator.clipboard

      .writeText(text)

      .then(() => setNotice("Copied to clipboard"))

      .catch(() => setNotice("Unable to copy message"));

  }



  if (showWelcome) {
    return (
      <div
        className="nova-welcome"
        style={{
          minHeight: "100vh",
          background: "var(--bg, #0b0c0e)",
          color: "var(--text-main, #f5f5f7)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 20px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          className="mono"
          style={{
            position: "absolute",
            top: "28px",
            left: "32px",
            color: "var(--text-sub, #8790a0)",
            fontSize: "11px",
            letterSpacing: "0.18em",
          }}
        >
          NOVA <span style={{ color: "var(--accent, #ff3b00)" }}>●</span> / LOCAL INTELLIGENCE
        </div>
        <div
          className="mono"
          style={{
            color: "var(--text-dim, #697386)",
            fontSize: "10px",
            letterSpacing: "0.2em",
            marginBottom: "24px",
          }}
        >
          PERSONAL AI WORKSPACE
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display, Georgia, serif)",
            fontSize: "clamp(64px, 12vw, 132px)",
            fontWeight: 400,
            letterSpacing: "0.12em",
            lineHeight: 1,
          }}
        >
          NOVA<span style={{ color: "var(--accent, #ff3b00)" }}>.</span>
        </h1>
        <p
          style={{
            margin: "24px 0 0",
            color: "var(--text-sub, #8790a0)",
            fontFamily: "var(--font-display, Georgia, serif)",
            fontSize: "clamp(22px, 4vw, 42px)",
            fontWeight: 400,
          }}
        >
          Intelligence, at your command.
        </p>
        <p
          style={{
            maxWidth: "520px",
            margin: "18px 0 32px",
            color: "var(--text-sub, #8790a0)",
            fontSize: "13px",
            lineHeight: 1.8,
          }}
        >
          Your local AI workspace for thinking, building, and getting things done.
        </p>
        <button
          type="button"
          onClick={newSession}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            padding: "14px 24px",
            minWidth: "190px",
            border: "1px solid var(--accent, #ff3b00)",
            borderRadius: "3px",
            background: "var(--accent, #ff3b00)",
            color: "#fff",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            cursor: "pointer",
          }}
        >
          <Plus size={16} /> NEW SESSION
        </button>
        <div
          className="mono"
          style={{
            position: "absolute",
            bottom: "24px",
            color: "var(--text-dim, #697386)",
            fontSize: "9px",
            letterSpacing: "0.14em",
          }}
        >
          RUNNING LOCALLY · OLLAMA · LLAMA 3.2
        </div>
      </div>
    );
  }

  return (

    <div className="workspace">

      {/* Left sidebar */}

      {sidebarOpen && (

        <aside className="history-sidebar">

          <div className="sidebar-head">

            <div className="brand-single-line">

              <span className="brand-title">

                NOVA<span className="brand-dot">.</span>

              </span>

              <span className="brand-badge">LOCAL</span>

            </div>



            <button

              className="icon-button"

              onClick={() => setSidebarOpen(false)}

              aria-label="Hide sessions"

            >

              <Menu size={16} />

            </button>

          </div>



          <button className="new-session" onClick={newSession}>

            <div

              style={{

                display: "flex",

                alignItems: "center",

                gap: "8px",

              }}

            >

              <Plus size={14} />

              <span>New session</span>

            </div>

            <span

              className="mono"

              style={{ fontSize: "9px", opacity: 0.5 }}

            >

              ⌘N

            </span>

          </button>



          <div className="history-scroll">

            <div className="history-label">YOUR SESSIONS</div>



            {threads.map((thread) => (

              <div

                key={thread.id}

                className={`thread-row ${

                  thread.id === activeId ? "active" : ""

                }`}

              >

                <button

                  className="thread-select"

                  onClick={() => setActiveId(thread.id)}

                >

                  {thread.title}

                </button>



                <button

                  className="thread-delete"

                  onClick={() => deleteSession(thread.id)}

                  aria-label="Delete session"

                  style={{

                    background: "none",

                    border: "none",

                    padding: "4px",

                    cursor: "pointer",

                    color: "var(--text-dim)",

                  }}

                >

                  <Trash2 size={12} />

                </button>

              </div>

            ))}

          </div>



          <div className="sidebar-bottom">

            <div className="profile-block">

              <div className="avatar">N</div>

              <div>

                <b

                  style={{

                    fontSize: "11px",

                    display: "block",

                    color: "var(--text-main)",

                  }}

                >

                  Personal workspace

                </b>

                <span

                  className="mono"

                  style={{

                    fontSize: "9px",

                    color: "var(--text-sub)",

                  }}

                >

                  Ollama · Local model

                </span>

              </div>

            </div>



            <button

              className="icon-button"

              onClick={() => setSettingsOpen(true)}

              aria-label="Settings"

            >

              <Settings2 size={15} />

            </button>

          </div>

        </aside>

      )}



      {/* Main workspace */}

      <main className="work-main">

        <header className="work-topbar">

          <div

            style={{

              display: "flex",

              alignItems: "center",

              gap: "12px",

            }}

          >

            {!sidebarOpen && (

              <button

                className="icon-button"

                onClick={() => setSidebarOpen(true)}

                aria-label="Show sessions"

              >

                <Menu size={16} />

              </button>

            )}



            <div className="work-breadcrumb">

              <span className="mono" style={{ opacity: 0.6 }}>

                WORKSPACE /

              </span>

              <b style={{ fontWeight: 600 }}>{activeThread.title}</b>

            </div>
            <button
              type="button"
              className="mono"
              onClick={() => setShowWelcome(true)}
              title="Return to welcome page"
              style={{
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-sub)",
                padding: "5px 8px",
                fontSize: "9px",
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              WELCOME
            </button>


          </div>



          <div

            style={{

              display: "flex",

              alignItems: "center",

              gap: "8px",

            }}

          >

            <span className="status-node">

              <span className="status-dot" />

              <span>LOCAL AI</span>

            </span>



            <button

              className="icon-button"

              onClick={() => setVoiceOpen(!voiceOpen)}

              title="Toggle Voice Console"

              style={{

                color: voiceOpen ? "var(--accent)" : "inherit",

              }}

            >

              <Mic size={16} />

            </button>



            <button

              className="icon-button"

              onClick={() => setLightTheme(!lightTheme)}

              title="Switch Theme"

            >

              {lightTheme ? (

                <Moon size={16} />

              ) : (

                <Sun size={16} />

              )}

            </button>



            <button

              className="icon-button"

              onClick={() => setInspectorOpen(!inspectorOpen)}

              aria-label="Toggle inspector"

            >

              {inspectorOpen ? (

                <PanelRightClose size={16} />

              ) : (

                <PanelRightOpen size={16} />

              )}

            </button>

          </div>

        </header>



        {/* Voice console */}
       
        <VoiceAssistant
          isOpen={voiceOpen}
          onClose={() => setVoiceOpen(false)}
          messages={messages}
          model={model}
        />



        {/* Conversation feed */}

        <div className="conversation" ref={feedRef}>

          {messages.length === 0 ? (

            <div className="empty-workspace">

              <div

                className="mono"

                style={{

                  fontSize: "10px",

                  letterSpacing: "0.12em",

                  marginBottom: "16px",

                  color: "var(--text-dim)",

                }}

              >

                SYSTEM 01 // INTELLIGENCE

              </div>



              <h1 className="empty-wordmark-title">

                NOVA<span style={{ color: "var(--accent)" }}>.</span>

              </h1>



              <h2 className="empty-subtitle">

                What deserves your attention?

              </h2>



              <div

                style={{

                  display: "grid",

                  gridTemplateColumns: "1fr 1fr",

                  gap: "12px",

                  textAlign: "left",

                  maxWidth: "560px",

                  margin: "0 auto",

                }}

              >

                {[

                  "Explain a complex technical concept",

                  "Review code architecture & safety",

                  "Structure a research paper brief",

                  "Plan autonomous AI agent workflows",

                ].map((starter, index) => (

                  <button

                    key={starter}

                    onClick={() => sendMessage(starter)}

                    style={{

                      border: "1px solid var(--border)",

                      padding: "14px",

                      background: "var(--surface)",

                      borderRadius: "3px",

                      cursor: "pointer",

                      textAlign: "left",

                      transition: "border-color 0.15s ease",

                    }}

                    onMouseEnter={(event) => {

                      event.currentTarget.style.borderColor =

                        "var(--accent)";

                    }}

                    onMouseLeave={(event) => {

                      event.currentTarget.style.borderColor =

                        "var(--border)";

                    }}

                  >

                    <div

                      className="mono"

                      style={{

                        fontSize: "9px",

                        color: "var(--accent)",

                        marginBottom: "4px",

                      }}

                    >

                      0{index + 1}

                    </div>

                    <div

                      style={{

                        fontSize: "12px",

                        fontWeight: 600,

                        color: "var(--text-main)",

                      }}

                    >

                      {starter}

                    </div>

                  </button>

                ))}

              </div>

            </div>

          ) : (

            <div

              style={{

                maxWidth: "760px",

                width: "100%",

                margin: "0 auto",

                padding: "32px 24px",

              }}

            >

              {messages.map((message, index) => (

                <article

                  key={`${message.time}-${index}`}

                  style={{ marginBottom: "28px" }}

                >

                  <div

                    style={{

                      display: "flex",

                      alignItems: "center",

                      gap: "8px",

                      marginBottom: "8px",

                    }}

                  >

                    <span

                      className="mono"

                      style={{

                        fontSize: "9px",

                        padding: "2px 6px",

                        border: "1px solid var(--border)",

                        background:

                          message.role === "assistant"

                            ? "var(--accent)"

                            : "var(--surface)",

                        color:

                          message.role === "assistant"

                            ? "#FFFFFF"

                            : "var(--text-main)",

                        fontWeight: 600,

                      }}

                    >

                      {message.role === "assistant" ? "NOVA" : "YOU"}

                    </span>



                    <span

                      className="mono"

                      style={{

                        fontSize: "9px",

                        color: "var(--text-dim)",

                        marginLeft: "auto",

                      }}

                    >

                      {new Date(message.time).toLocaleTimeString([], {

                        hour: "2-digit",

                        minute: "2-digit",

                      })}

                    </span>

                  </div>



                  <div

                    style={{

                      fontSize: "14px",

                      lineHeight: "1.7",

                      color: "var(--text-main)",

                      whiteSpace: "pre-wrap",

                      paddingLeft: "4px",

                    }}

                  >

                    {message.content}

                  </div>



                  {message.role === "assistant" && (

                    <div

                      style={{

                        marginTop: "8px",

                        display: "flex",

                        gap: "12px",

                      }}

                    >

                      <button

                        onClick={() => copyMessage(message.content)}

                        className="mono"

                        style={{

                          fontSize: "10px",

                          color: "var(--text-sub)",

                          display: "flex",

                          alignItems: "center",

                          gap: "4px",

                          border: "none",

                          background: "none",

                          cursor: "pointer",

                        }}

                      >

                        <Copy size={12} /> COPY RESPONSE

                      </button>

                    </div>

                  )}

                </article>

              ))}



              {busy && (

                <div

                  className="mono"

                  style={{

                    fontSize: "11px",

                    color: "var(--accent)",

                    padding: "12px 0",

                  }}

                >

                  ■ NOVA IS PROCESSING QUERY...

                </div>

              )}

            </div>

          )}

        </div>



        {/* Prompt composer */}

        <div className="composer-container">

          <div className="composer-box">

            <textarea

              className="composer-input"

              value={input}

              onChange={(event) => setInput(event.target.value)}

              onKeyDown={(event) => {

                if (event.key === "Enter" && !event.shiftKey) {

                  event.preventDefault();

                  sendMessage();

                }

              }}

              placeholder="Think something through..."

              rows={2}

            />



            <div className="composer-toolbar">

              <div

                style={{

                  display: "flex",

                  alignItems: "center",

                  gap: "12px",

                }}

              >

                <button

                  className="mono"

                  style={{

                    fontSize: "10px",

                    border: "1px solid var(--border)",

                    padding: "2px 8px",

                    cursor: "pointer",

                    display: "flex",

                    alignItems: "center",

                    gap: "4px",

                  }}

                  onClick={() => setSettingsOpen(true)}

                >

                  {model}

                  <ChevronDown size={11} />

                </button>



                <span

                  className="mono"

                  style={{

                    fontSize: "9px",

                    color: "var(--text-dim)",

                  }}

                >

                  SHIFT + ENTER FOR NEW LINE

                </span>

              </div>



              <div

                style={{

                  display: "flex",

                  alignItems: "center",

                  gap: "8px",

                }}

              >

                <button

                  type="button"

                  onClick={() => setVoiceOpen(!voiceOpen)}

                  title="Toggle Voice Input"

                  style={{

                    border: "1px solid var(--border)",

                    width: "32px",

                    height: "32px",

                    borderRadius: "2px",

                    display: "grid",

                    placeItems: "center",

                    color: voiceOpen

                      ? "var(--accent)"

                      : "var(--text-main)",

                    borderColor: voiceOpen

                      ? "var(--accent)"

                      : "var(--border)",

                    background: voiceOpen

                      ? "rgba(255, 59, 0, 0.1)"

                      : "var(--surface)",

                    cursor: "pointer",

                  }}

                >

                  <Mic size={15} />

                </button>



                <button

                  className="btn-send"

                  disabled={!input.trim() || busy}

                  onClick={() => sendMessage()}

                >

                  SEND →

                </button>

              </div>

            </div>

          </div>

        </div>

      </main>



      {/* Right context inspector */}

      {inspectorOpen && (

        <aside className="context-inspector">

          <div className="inspector-head">

            <span>CONTEXT INSPECTOR</span>

            <button

              className="icon-button"

              onClick={() => setInspectorOpen(false)}

              aria-label="Close inspector"

            >

              <X size={15} />

            </button>

          </div>



          <div className="inspector-body">

            <div className="param-group">

              <div className="param-label">LOCAL EXECUTION ENGINE</div>

              <p

                style={{

                  fontSize: "12px",

                  lineHeight: "1.6",

                  color: "var(--text-sub)",

                }}

              >

                Requests route locally to your FastAPI backend server at{" "}

                <code className="mono">127.0.0.1:8000</code> and forward

                directly to Ollama.

              </p>

            </div>



            <div className="param-group">

              <div className="param-label">

                <span>MODEL PARAMETER</span>

                <span className="param-value">{model}</span>

              </div>

            </div>



            <div className="param-group">

              <div className="param-label">

                <span>TEMPERATURE</span>

                <span className="param-value">

                  {temperature.toFixed(1)}

                </span>

              </div>

              <input

                type="range"

                min="0"

                max="1"

                step="0.1"

                value={temperature}

                onChange={(event) =>

                  setTemperature(Number(event.target.value))

                }

              />

            </div>



            <div

              className="param-group"

              style={{

                borderTop: "1px solid var(--border)",

                paddingTop: "16px",

              }}

            >

              <button

                className="mono"

                style={{

                  width: "100%",

                  border: "1px solid var(--border)",

                  padding: "8px",

                  textTransform: "uppercase",

                  fontSize: "10px",

                  cursor: "pointer",

                }}

                onClick={() => setSettingsOpen(true)}

              >

                Configure Settings

              </button>

            </div>

          </div>

        </aside>

      )}



      {/* Settings modal */}

      {settingsOpen && (

        <div

          style={{

            position: "fixed",

            inset: 0,

            background: "rgba(0,0,0,0.6)",

            backdropFilter: "blur(4px)",

            display: "grid",

            placeItems: "center",

            zIndex: 100,

          }}

          onMouseDown={(event) => {

            if (event.target === event.currentTarget) {

              setSettingsOpen(false);

            }

          }}

        >

          <section

            style={{

              background: "var(--panel)",

              border: "1px solid var(--border)",

              padding: "24px",

              maxWidth: "480px",

              width: "90%",

              borderRadius: "4px",

            }}

          >

            <div

              style={{

                display: "flex",

                justifyContent: "space-between",

                alignItems: "center",

                marginBottom: "20px",

              }}

            >

              <span

                className="mono"

                style={{ fontSize: "10px", color: "var(--accent)" }}

              >

                PREFERENCES

              </span>



              <button

                onClick={() => setSettingsOpen(false)}

                style={{

                  border: "none",

                  background: "none",

                  cursor: "pointer",

                }}

              >

                <X size={18} />

              </button>

            </div>



            <div

              style={{

                display: "flex",

                flexDirection: "column",

                gap: "16px",

              }}

            >

              <label

                style={{

                  fontSize: "12px",

                  display: "flex",

                  flexDirection: "column",

                  gap: "6px",

                }}

              >

                <span className="mono">MODEL IDENTIFIER</span>

                <select

                  value={model}

                  onChange={(event) => setModel(event.target.value)}

                  style={{

                    border: "1px solid var(--border)",

                    padding: "8px",

                    background: "var(--surface)",

                    color: "var(--text-main)",

                  }}

                >

                  <option value="llama3.2">Llama 3.2 / Local</option>

                </select>

              </label>



              <label

                style={{

                  fontSize: "12px",

                  display: "flex",

                  flexDirection: "column",

                  gap: "6px",

                }}

              >

                <span className="mono">API BASE URL</span>

                <input

                  value={apiUrl}

                  onChange={(event) => setApiUrl(event.target.value)}

                  placeholder={DEFAULT_API_URL}

                  style={{

                    border: "1px solid var(--border)",

                    padding: "8px",

                    background: "var(--surface)",

                    color: "var(--text-main)",

                  }}

                />

              </label>

            </div>



            <button

              className="btn-send"

              style={{

                width: "100%",

                marginTop: "24px",

                padding: "10px",

              }}

              onClick={() => {

                setApiUrl(apiUrl.trim().replace(/\/+$/, ""));

                setSettingsOpen(false);

                setNotice("Settings applied");

              }}

            >

              SAVE SETTINGS

            </button>

          </section>

        </div>

      )}



      {notice && (

        <div

          style={{

            position: "fixed",

            bottom: "20px",

            right: "20px",

            background: "var(--surface)",

            border: "1px solid var(--accent)",

            padding: "8px 16px",

            fontSize: "11px",

            fontFamily: "var(--font-mono)",

            zIndex: 1000,

          }}

        >

          {notice}

        </div>

      )}

    </div>

  );

}



function baseUrlForDisplay(url) {

  return url || DEFAULT_API_URL;

}



createRoot(document.getElementById("root")).render(

  <React.StrictMode>

    <App />

  </React.StrictMode>

);
