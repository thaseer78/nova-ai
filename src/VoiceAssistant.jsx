
import React, { useEffect, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

const FOLDERS = {
  downloads: "downloads",
  documents: "documents",
  desktop: "desktop",
  pictures: "pictures",
  music: "music",
  videos: "videos",
};

const WEBSITES = {
  youtube: "youtube",
  github: "github",
  google: "google",
  gmail: "gmail",
  stackoverflow: "stackoverflow",
  chatgpt: "chatgpt",
};

function cleanTextForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__|~~|\*|_)/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_~`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function VoiceAssistant({ isOpen = true, onClose, messages = [], model = "llama3.2" }) {
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef(null);
  const transcriptRef = useRef("");
  const busyRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(
        "Speech recognition is unavailable. Please use Google Chrome."
      );

      return () => {
        mountedRef.current = false;
      };
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!mountedRef.current) return;

      setListening(true);
      setError("");
      setTranscript("");
      transcriptRef.current = "";
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const resultText = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalText += resultText;
        } else {
          interimText += resultText;
        }
      }

      const currentText = (finalText || interimText).trim();

      if (currentText && mountedRef.current) {
        setTranscript(currentText);
      }

      if (finalText.trim()) {
        transcriptRef.current = finalText.trim();
      }
    };

    recognition.onerror = (event) => {
      if (!mountedRef.current) return;

      if (
        event.error !== "no-speech" &&
        event.error !== "aborted"
      ) {
        setError("Microphone error: " + event.error);
      }
    };

    recognition.onend = () => {
      if (!mountedRef.current) return;

      setListening(false);

      const spokenText = transcriptRef.current.trim();

      if (spokenText && !busyRef.current) {
        sendMessage(spokenText);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      mountedRef.current = false;

      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;

      try {
        recognition.stop();
      } catch {
        // Recognition has already stopped.
      }

      window.speechSynthesis.cancel();
    };
  }, []);

  async function sendMessage(text) {
    const prompt = text.trim();

    if (!prompt || busyRef.current) return;

    busyRef.current = true;
    setThinking(true);
    setError("");
    setTranscript(prompt);

    window.speechSynthesis.cancel();
    setSpeaking(false);

    try {
      const normalizedPrompt = prompt
        .toLowerCase()
        .replace(/[.!?]+$/, "")
        .trim();
        
      // Google search voice command
      const searchMatch = normalizedPrompt.match(
        /^(?:(?:hey\s+)?nova[, ]+)?(?:please\s+)?(?:search(?:\s+google)?\s+for|google\s+search\s+for|look\s+up)\s+(.+)$/
      );

      if (searchMatch) {
        const query = searchMatch[1].trim();
        if (!window.confirm(`Allow NOVA to open a Google search for "${query}"?`)) {
          const cancelled = "Google search cancelled.";
          setReply(cancelled);
          speak(cancelled);
          return;
        }

        const response = await fetch(
          `${API_URL}/api/pc/google-search`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query, confirm: true }),
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success !== true) {
          throw new Error(
            data.detail || "Could not open Google search."
          );
        }

        const answer = `Opening Google search for ${query}.`;

        if (mountedRef.current) {
          setReply(answer);
          speak(answer);
        }

        return;
      }


      // Search filenames in an approved folder. This is read-only.
      const fileSearchMatch = normalizedPrompt.match(
        /^(?:(?:hey\s+)?nova[, ]+)?(?:please\s+)?(?:find|search for|locate)\s+(?:my\s+|the\s+)?(.+?)\s+in\s+(downloads|documents|desktop|pictures|music|videos)(?:\s+folder)?$/
      );
      if (fileSearchMatch) {
        const query = fileSearchMatch[1].trim();
        const folder = fileSearchMatch[2];
        if (!window.confirm(`Allow NOVA to search filenames for "${query}" in ${folder}? This does not open or modify files.`)) {
          const cancelled = `File search in ${folder} cancelled.`;
          setReply(cancelled);
          speak(cancelled);
          return;
        }
        const response = await fetch(`${API_URL}/api/pc/search-files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, folder, limit: 30 }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success !== true) {
          throw new Error(data.detail || data.message || "File search failed.");
        }
        const results = Array.isArray(data.results) ? data.results : [];
        const fileAnswer = results.length
          ? `Found ${results.length} matching files in ${folder}: ` + results.map((item, index) => `${index + 1}. ${item.name}`).join(". ")
          : `I couldn't find any files matching ${query} in ${folder}.`;
        if (mountedRef.current) {
          setReply(fileAnswer + (results.length ? "\n\n" + results.map((item) => item.path).join("\n") : ""));
          speak(cleanTextForSpeech(fileAnswer));
        }
        return;
      }

      // Recognize explicit app, folder, and website commands.
      const openMatch = normalizedPrompt.match(
        /^(?:(?:hey\s+)?nova[, ]+)?(?:please\s+)?(?:can you\s+)?(?:please\s+)?(?:open|launch|start|run|go to|visit)\s+(?:(?:the|my)\s+)?(.+?)\s*$/
      );

      let answer;

      if (openMatch) {
        const target = openMatch[1]
          .replace(/\s+application$/, "")
          .replace(/\s+app$/, "")
          .replace(/\s+folder$/, "")
          .replace(/^my\s+/, "")
          .replace(/^the\s+/, "")
          .trim();

        const normalizedTarget = target.toLowerCase();
        if (!window.confirm(`Allow NOVA to open "${target}" on your PC or browser?`)) {
          const cancelled = `Opening ${target} cancelled.`;
          setReply(cancelled);
          speak(cancelled);
          return;
        }

        // 1. Open a known Windows folder.
        const folderKey = normalizedTarget;

        if (Object.prototype.hasOwnProperty.call(FOLDERS, folderKey)) {
          const response = await fetch(
            `${API_URL}/api/pc/open-folder`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                folder: FOLDERS[folderKey],
                confirm: true,
              }),
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.success === false) {
            throw new Error(
              data.detail ||
                data.message ||
                `Could not open the ${folderKey} folder.`
            );
          }

          answer = `Opening your ${folderKey} folder.`;
        } else if (
          Object.prototype.hasOwnProperty.call(
            WEBSITES,
            normalizedTarget
          )
        ) {
          // 2. Open an explicitly allowlisted website.
          const response = await fetch(
            `${API_URL}/api/pc/open-website`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                website: WEBSITES[normalizedTarget],
                confirm: true,
              }),
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.success === false) {
            throw new Error(
              data.detail ||
                data.message ||
                `Could not open ${normalizedTarget}.`
            );
          }

          answer =
            data.message ||
            `${normalizedTarget.charAt(0).toUpperCase() + normalizedTarget.slice(1)} is opening.`;
        } else {
          // 3. Open a discovered Windows application.
          const knownActions = {
            calculator: "open_calculator",
            notepad: "open_notepad",
          };

          const knownAction = knownActions[normalizedTarget];

          const response = knownAction
            ? await fetch(`${API_URL}/api/pc/actions`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  action: knownAction,
                  confirm: true,
                }),
              })
            : await fetch(`${API_URL}/api/pc/open-app`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  app_name: target,
                  confirm: true,
                }),
              });

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.success === false) {
            throw new Error(
              typeof data.detail === "string"
                ? data.detail
                : data.message ||
                    data.error?.message ||
                    `Could not launch ${target}.`
            );
          }

          const launchedName =
            data.app ||
            target.charAt(0).toUpperCase() + target.slice(1);

          answer = `${launchedName} is launching.`;
        }
      } else {
        // 4. Normal voice conversations use the existing chat API.
        
        const response = await fetch(
          `${API_URL}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content:
                    "You are NOVA, a practical personal AI assistant. Treat short statements as ideas the user wants help exploring. Give concrete, relevant next steps, explain trade-offs, and ask at most one focused follow-up question when necessary. Do not claim you lack information merely because the user introduced a new topic. Be honest about uncertainty and never invent facts.",
                },
                ...messages
                  .filter((message) =>
                    ["user", "assistant"].includes(message.role) &&
                    typeof message.content === "string"
                  )
                  .slice(-12)
                  .map(({ role, content }) => ({ role, content })),
                {
                  role: "user",
                  content: prompt,
                },
              ],
              stream: false,
            }),
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.detail ||
              data.error?.message ||
              `Request failed with status ${response.status}.`
          );
        }

        answer =
          data.choices?.[0]?.message?.content ||
          data.reply;

        if (typeof answer !== "string" || !answer.trim()) {
          throw new Error("NOVA returned an empty response.");
        }
      }

      if (!mountedRef.current) return;

      setReply(String(answer));
      speak(cleanTextForSpeech(String(answer)));
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err.message ||
            "Could not connect to NOVA. Check that the backend is running."
        );
      }
    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setThinking(false);
      }
    }
  }

  function startListening() {
    if (busyRef.current || listening) return;

    const recognition = recognitionRef.current;

    if (!recognition) {
      setError(
        "Microphone is unavailable. Use Chrome and check permissions."
      );
      return;
    }

    window.speechSynthesis.cancel();
    setSpeaking(false);
    setError("");
    transcriptRef.current = "";

    try {
      recognition.start();
    } catch {
      setError("Could not start the microphone. Please try again.");
    }
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop();
    } catch {
      setListening(false);
    }
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      setError("Spoken replies are not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = "en-GB";
    utterance.rate = 1;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();

    const preferredVoice = voices.find(
      (voice) =>
        voice.lang.toLowerCase().startsWith("en-gb") &&
        /male|daniel|ryan|george/i.test(voice.name)
    );

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      if (mountedRef.current) setSpeaking(true);
    };

    utterance.onend = () => {
      if (mountedRef.current) setSpeaking(false);
    };

    utterance.onerror = () => {
      if (mountedRef.current) setSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  if (!isOpen) return null;

  return (
    <div className="voice-drawer">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span className="status-dot" />

          <span
            className="mono"
            style={{
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            NOVA AI / VOICE
          </span>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mono"
            style={{ opacity: 0.6 }}
          >
            CLOSE
          </button>
        )}
      </div>

      <div className="voice-controls">
        <button
          type="button"
          onClick={listening ? stopListening : startListening}
          disabled={thinking}
          style={{
            border: "1px solid var(--border)",
            padding: "6px 14px",
            background: listening
              ? "rgba(255, 59, 0, 0.1)"
              : "var(--surface)",
            borderColor: listening
              ? "var(--accent)"
              : "var(--border)",
            color: listening
              ? "var(--accent)"
              : "var(--text-main)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 500,
          }}
        >
          {listening ? "STOP LISTENING" : "START SPEAKING"}
        </button>

        <button
          type="button"
          onClick={stopSpeaking}
          disabled={!speaking}
          style={{
            border: "1px solid var(--border)",
            padding: "6px 14px",
            background: "var(--surface)",
            opacity: speaking ? 1 : 0.4,
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
          }}
        >
          STOP VOICE
        </button>

        {listening && (
          <div className="waveform-bar-container">
            <div className="waveform-bar" style={{ animationDelay: "0s" }} />
            <div className="waveform-bar" style={{ animationDelay: "0.2s" }} />
            <div className="waveform-bar" style={{ animationDelay: "0.4s" }} />
            <div className="waveform-bar" style={{ animationDelay: "0.1s" }} />
            <div className="waveform-bar" style={{ animationDelay: "0.3s" }} />
          </div>
        )}

        <span
          className="mono"
          style={{ fontSize: "11px", marginLeft: "auto" }}
        >
          {thinking
            ? "NOVA IS THINKING..."
            : speaking
              ? "NOVA IS SPEAKING..."
              : listening
                ? "LISTENING..."
                : "IDLE"}
        </span>
      </div>

      <div
        style={{
          marginTop: "12px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
        }}
      >
        <div
          style={{
            border: "1px solid var(--border)",
            padding: "8px 12px",
            background: "var(--surface)",
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: "9px",
              color: "var(--text-dim)",
              display: "block",
            }}
          >
            YOU SAID
          </span>

          <p
            style={{
              fontSize: "12px",
              margin: "4px 0 0",
              color: "var(--text-main)",
            }}
          >
            {transcript || "Speak clearly..."}
          </p>
        </div>

        <div
          style={{
            border: "1px solid var(--border)",
            padding: "8px 12px",
            background: "var(--surface)",
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: "9px",
              color: "var(--text-dim)",
              display: "block",
            }}
          >
            NOVA REPLY
          </span>

          <p
            style={{
              fontSize: "12px",
              margin: "4px 0 0",
              color: "var(--text-main)",
            }}
          >
            {thinking
              ? "Thinking..."
              : reply || "Awaiting your voice query..."}
          </p>
        </div>
      </div>

      {error && (
        <p
          className="mono"
          style={{
            color: "var(--accent)",
            marginTop: "8px",
            fontSize: "10px",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
