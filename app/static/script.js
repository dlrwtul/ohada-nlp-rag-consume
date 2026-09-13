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
  const infoToggle = document.getElementById("info-toggle");
  const infoClose = document.getElementById("info-close");
  const infoSidebar = document.getElementById("info-sidebar");
  const infoOverlay = document.getElementById("info-overlay");
  const infoBody = document.getElementById("info-body");
  const accountLink = document.getElementById("account-link");

  const conversationsToggle = document.getElementById("conversations-toggle");
  const conversationsClose = document.getElementById("conversations-close");
  const conversationsSidebar = document.getElementById("conversations-sidebar");
  const conversationsOverlay = document.getElementById("conversations-overlay");
  const conversationList = document.getElementById("conversation-list");
  const newConversationBtn = document.getElementById("new-conversation-btn");
  const guestNotice = document.getElementById("guest-notice");

  const SEND_ICON = sendBtn.innerHTML;
  const STOP_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`;
  const SPEAK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>`;
  const ICON_DATABASE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v14a9 3 0 0 0 18 0V5"></path><path d="M3 12a9 3 0 0 0 18 0"></path></svg>`;
  const ICON_SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>`;
  const ICON_CPU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"></path></svg>`;
  const ICON_SERVER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="8" rx="2"></rect><rect x="2" y="13" width="20" height="8" rx="2"></rect><path d="M6 7h.01M6 17h.01"></path></svg>`;
  const ICON_LAYERS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5Z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 17 9 5 9-5"></path></svg>`;
  const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>`;

  let currentController = null;
  let isGenerating = false;
  let currentConversationId = null;
  let conversations = [];

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

  // --- Sidebar d'information ---
  let infoLoaded = false;

  function openInfo() {
    infoOverlay.hidden = false;
    requestAnimationFrame(() => {
      infoSidebar.classList.add("open");
      infoOverlay.classList.add("open");
    });
    infoSidebar.setAttribute("aria-hidden", "false");
    infoToggle.setAttribute("aria-expanded", "true");
    if (!infoLoaded) loadInfo();
  }

  function closeInfo() {
    infoSidebar.classList.remove("open");
    infoOverlay.classList.remove("open");
    infoSidebar.setAttribute("aria-hidden", "true");
    infoToggle.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      if (!infoOverlay.classList.contains("open")) infoOverlay.hidden = true;
    }, 220);
  }

  infoToggle.addEventListener("click", () => {
    if (infoSidebar.classList.contains("open")) {
      closeInfo();
    } else {
      openInfo();
    }
  });

  infoClose.addEventListener("click", closeInfo);
  infoOverlay.addEventListener("click", closeInfo);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (infoSidebar.classList.contains("open")) closeInfo();
    if (conversationsSidebar.classList.contains("open")) closeConversations();
  });

  async function loadInfo() {
    try {
      const res = await fetch("/info");
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      infoLoaded = true;
      renderInfo(data);
    } catch (err) {
      infoBody.innerHTML = `<p class="error-text">Impossible de charger les informations du système.</p>`;
    }
  }

  function infoRow(label, value) {
    return `
      <div class="info-row">
        <span class="info-row-label">${escapeHtml(label)}</span>
        <span class="info-row-value">${escapeHtml(String(value))}</span>
      </div>`;
  }

  function renderInfo(data) {
    infoBody.innerHTML = `
      <section>
        <div class="info-section-title">${ICON_DATABASE} Jeu de données</div>
        ${infoRow("Source", data.dataset_name)}
        ${infoRow("Documents indexés", data.doc_count ?? "—")}
        ${infoRow("Champs", "titre, contenu, détails")}
      </section>
      <section>
        <div class="info-section-title">${ICON_SEARCH} Recherche documentaire</div>
        ${infoRow("Embeddings", data.embedding_model)}
        ${infoRow("Base vectorielle", "Chroma (persistée localement)")}
        ${infoRow("Documents récupérés / question", `top-${data.k}`)}
        ${infoRow("Contexte par document", `${data.context_char_limit} caractères max`)}
      </section>
      <section>
        <div class="info-section-title">${ICON_CPU} Génération (LLM)</div>
        ${infoRow("Modèle", data.llm_model)}
        ${infoRow("Moteur d'inférence", data.inference_engine)}
        ${infoRow("Quantification", data.quantization)}
        ${infoRow("Décodage", data.decoding)}
        ${infoRow("Longueur max de réponse", `${data.max_new_tokens} tokens`)}
      </section>
      <section>
        <div class="info-section-title">${ICON_SERVER} Infrastructure</div>
        ${infoRow("Backend", "FastAPI + Uvicorn")}
        ${infoRow("Frontend", "HTML / CSS / JS")}
        ${infoRow("Calcul", data.compute)}
      </section>
      <section>
        <div class="info-section-title">${ICON_LAYERS} Outils &amp; bibliothèques</div>
        <div class="info-tags">
          ${["LangChain", "Ollama", "llama.cpp", "Sentence-Transformers", "PyTorch", "ChromaDB", "pandas", "openpyxl", "Web Speech API"]
            .map((t) => `<span class="info-tag">${escapeHtml(t)}</span>`)
            .join("")}
        </div>
      </section>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Identité (compte réel ou invité) ---

  async function loadMe() {
    try {
      const res = await fetch("/me");
      const data = await res.json();
      if (data.is_guest) {
        accountLink.href = "/login";
        accountLink.setAttribute("aria-label", "Se connecter");
        accountLink.title = "Se connecter";
        accountLink.onclick = null;
      } else {
        accountLink.href = "#";
        accountLink.setAttribute("aria-label", `Déconnexion (${data.username})`);
        accountLink.title = `Déconnexion (${data.username})`;
        accountLink.onclick = async (e) => {
          e.preventDefault();
          await fetch("/logout", { method: "POST" }).catch(() => {});
          window.location.href = "/";
        };
      }
      guestNotice.hidden = !data.is_guest;
      return data;
    } catch (err) {
      return { is_guest: true };
    }
  }

  // --- Sidebar des conversations ---

  function openConversations() {
    conversationsOverlay.hidden = false;
    requestAnimationFrame(() => {
      conversationsSidebar.classList.add("open");
      conversationsOverlay.classList.add("open");
    });
    conversationsSidebar.setAttribute("aria-hidden", "false");
    conversationsToggle.setAttribute("aria-expanded", "true");
    loadConversations();
  }

  function closeConversations() {
    conversationsSidebar.classList.remove("open");
    conversationsOverlay.classList.remove("open");
    conversationsSidebar.setAttribute("aria-hidden", "true");
    conversationsToggle.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      if (!conversationsOverlay.classList.contains("open")) conversationsOverlay.hidden = true;
    }, 220);
  }

  conversationsToggle.addEventListener("click", () => {
    if (conversationsSidebar.classList.contains("open")) {
      closeConversations();
    } else {
      openConversations();
    }
  });
  conversationsClose.addEventListener("click", closeConversations);
  conversationsOverlay.addEventListener("click", closeConversations);

  async function loadConversations({ autoSelect = false } = {}) {
    try {
      const res = await fetch("/conversations");
      if (!res.ok) throw new Error("bad response");
      conversations = await res.json();
      renderConversationList();
      if (autoSelect && conversations.length && currentConversationId === null) {
        await selectConversation(conversations[0].id, { closeSidebar: false });
      }
    } catch (err) {
      conversationList.innerHTML = `<p class="conversation-empty">Impossible de charger les discussions.</p>`;
    }
  }

  function renderConversationList() {
    if (!conversations.length) {
      conversationList.innerHTML = `<p class="conversation-empty">Aucune discussion pour le moment.</p>`;
      return;
    }
    conversationList.innerHTML = conversations
      .map(
        (c) => `
        <div class="conversation-item${c.id === currentConversationId ? " active" : ""}" data-id="${c.id}">
          <span class="conversation-item-title">${escapeHtml(c.title)}</span>
          <button type="button" class="conversation-item-delete" aria-label="Supprimer cette discussion" data-id="${c.id}">
            ${ICON_TRASH}
          </button>
        </div>`
      )
      .join("");
  }

  async function selectConversation(id, { closeSidebar = true } = {}) {
    const res = await fetch(`/conversations/${id}/messages`);
    if (!res.ok) return;
    const messages = await res.json();

    currentConversationId = id;
    renderConversationList();
    messagesEl.innerHTML = "";
    emptyState.style.display = messages.length ? "none" : "";

    messages.forEach((m) => {
      if (m.role === "user") {
        addUserMessage(m.content);
      } else {
        const el = document.createElement("div");
        el.className = "msg msg-assistant";
        messagesEl.appendChild(el);
        renderAssistantMessage(el, { answer: m.content, sources: m.sources || [] });
      }
    });

    scrollToBottom();
    if (closeSidebar) closeConversations();
  }

  newConversationBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/conversations", { method: "POST" });
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body.detail === "guest_limit") {
          alert("Connectez-vous ou créez un compte pour démarrer une nouvelle discussion.");
          return;
        }
      }
      if (!res.ok) return;

      const conv = await res.json();
      currentConversationId = conv.id;
      messagesEl.innerHTML = "";
      emptyState.style.display = "";
      await loadConversations();
      closeConversations();
    } catch (err) {
      // silencieux : l'utilisateur peut réessayer
    }
  });

  conversationList.addEventListener("click", async (e) => {
    const delBtn = e.target.closest(".conversation-item-delete");
    if (delBtn) {
      e.stopPropagation();
      const id = Number(delBtn.dataset.id);
      await fetch(`/conversations/${id}`, { method: "DELETE" }).catch(() => {});
      if (id === currentConversationId) {
        currentConversationId = null;
        messagesEl.innerHTML = "";
        emptyState.style.display = "";
      }
      loadConversations();
      return;
    }

    const item = e.target.closest(".conversation-item");
    if (item) selectConversation(Number(item.dataset.id));
  });

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

  function ensureAssistantBubble(el) {
    if (!el.querySelector(".msg-bubble")) {
      el.innerHTML = `
        <div class="msg-header">
          <span class="msg-avatar">Assistant OHADA</span>
          <button type="button" class="speak-btn" aria-label="Écouter la réponse" title="Écouter la réponse">${SPEAK_ICON}</button>
        </div>
        <div class="msg-bubble"></div>
      `;
    }
    return el.querySelector(".msg-bubble");
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

  function renderGuestLimit(el) {
    el.innerHTML = `
      <div class="msg-avatar">Assistant OHADA</div>
      <div class="guest-notice">Vous avez atteint la limite d'une discussion en tant qu'invité. <a href="/login">Connectez-vous</a> ou <a href="/register">créez un compte</a> pour en démarrer une nouvelle.</div>
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

    let answer = "";
    let receivedAnyToken = false;

    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, conversation_id: currentConversationId }),
        signal: currentController.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403 && body.detail === "guest_limit") {
          renderGuestLimit(typingEl);
          return;
        }
        throw new Error(`Erreur serveur (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalData = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);

          if (evt.type === "meta") {
            if (currentConversationId !== evt.conversation_id) {
              currentConversationId = evt.conversation_id;
              loadConversations();
            }
          } else if (evt.type === "token") {
            answer += evt.token;
            receivedAnyToken = true;
            ensureAssistantBubble(typingEl).textContent = answer;
            scrollToBottom();
          } else if (evt.type === "done") {
            finalData = evt;
          }
        }
      }

      if (finalData) {
        renderAssistantMessage(typingEl, { answer: finalData.answer, sources: finalData.sources });
      } else if (!receivedAnyToken) {
        renderError(typingEl, "Désolé, aucune réponse reçue. Réessayez.");
      }
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

  loadMe();
  loadConversations({ autoSelect: true });
})();
