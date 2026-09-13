(() => {
  function getNextUrl() {
    return new URLSearchParams(window.location.search).get("next") || "/app";
  }

  async function submitForm(form) {
    const endpoint = form.dataset.authEndpoint;
    const errorEl = form.querySelector(".form-error");
    const submitBtn = form.querySelector('button[type="submit"]');

    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    const data = Object.fromEntries(new FormData(form).entries());

    if ("confirm" in data) {
      if (data.confirm !== data.password) {
        if (errorEl) {
          errorEl.textContent = "Les mots de passe ne correspondent pas.";
          errorEl.hidden = false;
        }
        return;
      }
      delete data.confirm;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Une erreur est survenue.");
      window.location.href = getNextUrl();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form[data-auth-endpoint]").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        submitForm(form);
      });
    });

    // Préserve le paramètre ?next= en passant de /login à /register et vice-versa.
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) {
      document.querySelectorAll("a[data-preserve-next]").forEach((a) => {
        const url = new URL(a.href, window.location.origin);
        url.searchParams.set("next", next);
        a.href = url.pathname + url.search;
      });
    }
  });
})();
