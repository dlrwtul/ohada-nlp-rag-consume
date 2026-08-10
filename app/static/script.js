(() => {
  const root = document.documentElement;
  const themeToggle = document.getElementById("theme-toggle");
  const chat = document.getElementById("chat");
  const emptyState = document.getElementById("empty-state");
  const messagesEl = document.getElementById("messages");
  const composer = document.getElementById("composer");
  const input = document.getElementById("question-input");
  const sendBtn = document.getElementById("send-btn");

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

  function addTypingIndicator() {
    const msg = document.createElement("div");
    msg.className = "msg msg-assistant";
    msg.innerHTML = `
      <div class="msg-avatar">Assistant OHADA</div>
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
      <div class="msg-avatar">Assistant OHADA</div>
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

  function scrollToBottom() {
    chat.scrollTop = chat.scrollHeight;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;

    emptyState.style.display = "none";
    addUserMessage(question);
    input.value = "";
    input.style.height = "auto";
    sendBtn.disabled = true;
    scrollToBottom();

    const typingEl = addTypingIndicator();

    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);

      const data = await res.json();
      renderAssistantMessage(typingEl, data);
    } catch (err) {
      renderError(typingEl, "Désolé, une erreur est survenue. Réessayez dans un instant.");
    } finally {
      sendBtn.disabled = false;
      scrollToBottom();
    }
  }

  composer.addEventListener("submit", handleSubmit);
})();
