(() => {
  const root = document.documentElement;
  const themeToggle = document.getElementById("theme-toggle");
  const chat = document.getElementById("chat");
  const emptyState = document.getElementById("empty-state");
  const messagesEl = document.getElementById("messages");
  const composer = document.getElementById("composer");
  const input = document.getElementById("question-input");
  const sendBtn = document.getElementById("send-btn");
  const uploadBtn = document.getElementById("upload-btn");
  const fileInput = document.getElementById("file-input");

  const SEND_ICON = sendBtn.innerHTML;
  const STOP_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`;
  const SPEAK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>`;

  let currentController = null;
  let isGenerating = false;

  function setGeneratingState(active) {
    isGenerating = active;
    sendBtn.innerHTML = active ? STOP_ICON : SEND_ICON;
    sendBtn.setAttribute("aria-label", active ? "Arrêter" : "Envoyer");
    input.disabled = active;
    uploadBtn.disabled = active;
  }

  // --- Theme ---
  const storedTheme = localStorage.getItem("theme");
  if (storedTheme) root.setAttribute("data-theme", storedTheme);

  themeToggle.addEventListener("click", () => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = root.getAttribute("data-theme") || (prefersDark ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });

  // --- Textarea auto-grow ---
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composer.requestSubmit();
    }
  });

  // --- Suggestion chips ---
  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      input.value = chip.dataset.q;
      composer.requestSubmit();
    });
  });

  // --- Import CSV/XLSX ---
  uploadBtn.addEventListener("click", () => {
    if (!isGenerating) fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) handleBatchUpload(file);
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function addUserMessage(text) {
    const msg = document.createElement("div");
    msg.className = "msg msg-user";
    msg.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
    messagesEl.appendChild(msg);
    return msg;
  }

  function addTypingIndicator(label) {
    const msg = document.createElement("div");
    msg.className = "msg msg-assistant";
    msg.innerHTML = `
      <div class="msg-avatar">${escapeHtml(label || "Assistant OHADA")}</div>
      <div class="typing"><span></span><span></span><span></span></div>
    `;
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function renderAssistantMessage(el, data) {
    const sourcesHtml = (data.sources || [])
      .filter((s) => s.title)
      .map(
        (s) => `
        <div class="source-item">
          <div class="source-title">${escapeHtml(s.title)}</div>
          <div class="source-details">${escapeHtml(s.details || "")}</div>
        </div>`
      )
      .join("");

    el.innerHTML = `
      <div class="msg-header">
        <span class="msg-avatar">Assistant OHADA</span>
        <button type="button" class="speak-btn" aria-label="Écouter la réponse" title="Écouter la réponse">${SPEAK_ICON}</button>
      </div>
      <div class="msg-bubble">${escapeHtml(data.answer)}</div>
      ${
        sourcesHtml
          ? `<details class="sources">
              <summary>Sources (${data.sources.length})</summary>
              ${sourcesHtml}
            </details>`
          : ""
      }
    `;
  }

  function renderError(el, message) {
    el.innerHTML = `
      <div class="msg-avatar">Assistant OHADA</div>
      <div class="error-text">${escapeHtml(message)}</div>
    `;
  }

  function renderInterrupted(el) {
    el.innerHTML = `
      <div class="msg-avatar">Assistant OHADA</div>
      <div class="error-text" style="color: var(--text-tertiary); font-style: italic;">Réponse interrompue.</div>
    `;
  }

  function renderBatchResults(el, results) {
    if (!results.length) {
      el.innerHTML = `
        <div class="msg-avatar">Assistant OHADA</div>
        <div class="error-text">Aucune question trouvée dans le fichier.</div>
      `;
      return;
    }

    const rows = results
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.question)}</td>
          <td>${escapeHtml(r.answer)}</td>
        </tr>`
      )
      .join("");

    el.innerHTML = `
      <div class="msg-avatar">Assistant OHADA</div>
      <div class="batch-result">
        <p class="msg-bubble" style="padding:0; background:transparent;">${results.length} question(s) traitée(s).</p>
        <div class="batch-table-wrap">
          <table class="batch-table">
            <thead><tr><th>Question</th><th>Réponse</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <button type="button" class="download-btn">Télécharger en CSV</button>
      </div>
    `;

    el.querySelector(".download-btn").addEventListener("click", () => downloadCsv(results));
  }

  function downloadCsv(results) {
    const escapeCsv = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const header = "question,reponse\n";
    const body = results.map((r) => `${escapeCsv(r.question)},${escapeCsv(r.answer)}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reponses_ohada.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function scrollToBottom() {
    chat.scrollTop = chat.scrollHeight;
  }

  function stopGeneration() {
    if (currentController) currentController.abort();
    fetch("/stop", { method: "POST" }).catch(() => {});
  }

  // --- Lecture vocale ---
  messagesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".speak-btn");
    if (!btn) return;
    const bubble = btn.closest(".msg-assistant")?.querySelector(".msg-bubble");
    if (bubble) speak(bubble.textContent);
  });

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    window.speechSynthesis.speak(utterance);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (isGenerating) {
      stopGeneration();
      return;
    }

    const question = input.value.trim();
    if (!question) return;

    emptyState.style.display = "none";
    addUserMessage(question);
    input.value = "";
    input.style.height = "auto";
    scrollToBottom();

    const typingEl = addTypingIndicator();
    currentController = new AbortController();
    setGeneratingState(true);

    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: currentController.signal,
      });

      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);

      const data = await res.json();
      renderAssistantMessage(typingEl, data);
    } catch (err) {
      if (err.name === "AbortError") {
        renderInterrupted(typingEl);
      } else {
        renderError(typingEl, "Désolé, une erreur est survenue. Réessayez dans un instant.");
      }
    } finally {
      setGeneratingState(false);
      currentController = null;
      scrollToBottom();
    }
  }

  async function handleBatchUpload(file) {
    if (isGenerating) return;

    emptyState.style.display = "none";
    addUserMessage(`Import : ${file.name}`);
    scrollToBottom();

    const typingEl = addTypingIndicator("Traitement du fichier…");
    currentController = new AbortController();
    setGeneratingState(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/ask-batch", {
        method: "POST",
        body: formData,
        signal: currentController.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erreur serveur (${res.status})`);
      }

      const results = await res.json();
      renderBatchResults(typingEl, results);
    } catch (err) {
      if (err.name === "AbortError") {
        renderInterrupted(typingEl);
      } else {
        renderError(typingEl, err.message || "Erreur lors du traitement du fichier.");
      }
    } finally {
      setGeneratingState(false);
      currentController = null;
      fileInput.value = "";
      scrollToBottom();
    }
  }

  composer.addEventListener("submit", handleSubmit);
})();
