(() => {
  function formatDuration(us) {
    if (us < 1000) return `${us}µs`;
    return `${(us / 1000).toFixed(1)}ms`;
  }

  function renderResult(result) {
    const dur = formatDuration(result.duration_us);
    if (result.value === null) {
      return `${result.kind}\n\nnull`;
    }

    if (typeof result.value === "object") {
      return `${result.kind} in ${dur}\n\n${JSON.stringify(result.value, null, 2)}`;
    }

    return `${result.kind} in ${dur}\n\n${String(result.value)}`;
  }

  const SOUND_KEY = "sound";
  let cuelume = null;

  /* Storage access throws outright when a browser denies it (private modes,
     blocked cookies, sandboxed embeds), so every read and write is guarded.
     A preference we cannot reach is simply the default. */
  function readStored(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStored(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Preference cannot be persisted; the session still honors it.
    }
  }

  /** Resolves the vendored cuelume module, loading it on first use. */
  async function loadCuelume() {
    if (cuelume) return cuelume;
    try {
      cuelume = await import("/static/vendor/cuelume/index.js");
      cuelume.setEnabled(soundEnabled());
    } catch {
      cuelume = { play() {}, setEnabled() {} };
    }
    return cuelume;
  }

  /* Held in memory so muting still works for the session when storage is
     unavailable; storage only seeds this and persists it across visits. */
  let soundPreference = null;

  function soundEnabled() {
    if (soundPreference === null) {
      soundPreference = readStored(SOUND_KEY) !== "off";
    }
    return soundPreference;
  }

  function setSoundEnabled(on) {
    soundPreference = on;
    writeStored(SOUND_KEY, on ? "on" : "off");
  }

  async function playCue(name) {
    if (!soundEnabled()) return;
    const audio = await loadCuelume();
    audio.play(name);
  }

  /* Safari only lets an AudioContext start inside a user gesture, and the
     result cue plays after an await, by which point the activation may have
     expired. Playing a cue synchronously on click opens the context while the
     gesture is live, so later cues are audible. Needs the module already
     resolved, hence the preload. */
  function unlockAudioDuringGesture() {
    if (!cuelume || !soundEnabled()) return;
    cuelume.play("press");
  }

  function preloadAudio() {
    if (!document.querySelector("[data-run-button]")) return;
    if (!soundEnabled()) return;
    loadCuelume();
  }

  /** Restarts a CSS animation that may already have run on this element. */
  function replay(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function initSoundToggle() {
    const toggle = document.querySelector("[data-sound-toggle]");
    if (!toggle) return;

    // Stable label naming the control, with aria-pressed carrying the state:
    // an action label plus aria-pressed announces the state inverted.
    const sync = () => {
      const on = soundEnabled();
      document.documentElement.setAttribute("data-sound", on ? "on" : "off");
      toggle.setAttribute("aria-pressed", String(on));
    };

    sync();
    toggle.addEventListener("click", async () => {
      const next = !soundEnabled();
      setSoundEnabled(next);
      sync();
      if (next) {
        const audio = await loadCuelume();
        audio.setEnabled(true);
        audio.play("toggle");
      } else if (cuelume) {
        cuelume.setEnabled(false);
      }
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function highlightVibescript(source) {
    const lines = source.split("\n");
    const result = [];

    const keywords = new Set([
      "def", "end", "if", "elsif", "else", "enum", "return",
      "while", "for", "in", "do", "class", "module", "require",
      "and", "or", "not", "then", "unless", "until", "case",
      "when", "break", "next", "yield", "begin", "rescue",
      "ensure", "raise", "import", "export", "let", "const",
      "var", "fn", "match", "struct", "impl", "trait", "pub",
      "self", "super", "new", "puts", "print", "println",
    ]);
    const constants = new Set(["true", "false", "nil"]);

    for (const line of lines) {
      const tokens = [];
      let i = 0;

      while (i < line.length) {
        // Comment
        if (line[i] === "#") {
          tokens.push(`<span class="tok-comment">${escapeHtml(line.slice(i))}</span>`);
          i = line.length;
          continue;
        }

        // String
        if (line[i] === '"') {
          let j = i + 1;
          while (j < line.length && line[j] !== '"') {
            if (line[j] === "\\") j++;
            j++;
          }
          j = Math.min(j + 1, line.length);
          tokens.push(`<span class="tok-string">${escapeHtml(line.slice(i, j))}</span>`);
          i = j;
          continue;
        }

        // Number
        if (/\d/.test(line[i]) && (i === 0 || /[^a-zA-Z_]/.test(line[i - 1]))) {
          let j = i;
          while (j < line.length && /[\d.]/.test(line[j])) j++;
          if (j > i && !/[a-zA-Z_]/.test(line[j] || "")) {
            tokens.push(`<span class="tok-number">${line.slice(i, j)}</span>`);
            i = j;
            continue;
          }
        }

        // Word (identifiers, keywords, constants)
        if (/[a-zA-Z_]/.test(line[i])) {
          let j = i;
          while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
          const word = line.slice(i, j);

          if (constants.has(word)) {
            tokens.push(`<span class="tok-constant">${word}</span>`);
          } else if (keywords.has(word)) {
            if (word === "def") {
              // Look ahead for function name
              let k = j;
              while (k < line.length && line[k] === " ") k++;
              let nameStart = k;
              while (k < line.length && /[a-zA-Z0-9_]/.test(line[k])) k++;
              if (k > nameStart) {
                tokens.push(`<span class="tok-keyword">def</span>`);
                tokens.push(escapeHtml(line.slice(j, nameStart)));
                tokens.push(`<span class="tok-function">${escapeHtml(line.slice(nameStart, k))}</span>`);
                i = k;
                continue;
              }
            }
            tokens.push(`<span class="tok-keyword">${word}</span>`);
          } else if (/^[A-Z]/.test(word)) {
            // Check for Enum::Variant
            if (line.slice(j, j + 2) === "::") {
              let k = j + 2;
              let vs = k;
              while (k < line.length && /[a-zA-Z0-9_]/.test(line[k])) k++;
              tokens.push(`<span class="tok-type">${escapeHtml(word)}</span>::<span class="tok-type">${escapeHtml(line.slice(vs, k))}</span>`);
              i = k;
              continue;
            }
            tokens.push(`<span class="tok-type">${escapeHtml(word)}</span>`);
          } else {
            // Check if followed by ( → method/function call
            let k = j;
            while (k < line.length && line[k] === " ") k++;
            if (line[k] === "(" && i > 0 && line[i - 1] === ".") {
              tokens.push(`<span class="tok-function">${escapeHtml(word)}</span>`);
            } else {
              tokens.push(escapeHtml(word));
            }
          }
          i = j;
          continue;
        }

        // Operators
        const twoChar = line.slice(i, i + 2);
        if (["->", "==", "!=", "<=", ">=", "&&", "||"].includes(twoChar)) {
          tokens.push(`<span class="tok-operator">${escapeHtml(twoChar)}</span>`);
          i += 2;
          continue;
        }
        if ("=+-*/%<>!".includes(line[i])) {
          tokens.push(`<span class="tok-operator">${escapeHtml(line[i])}</span>`);
          i++;
          continue;
        }

        // Default: plain character
        tokens.push(escapeHtml(line[i]));
        i++;
      }

      result.push(tokens.join(""));
    }

    return result.join("\n");
  }

  /* Minimal Go tokenizer for the host-configuration snippets on the
     reference page. Same token classes as the Vibescript highlighter, so
     both languages share the palette. Capitalized words are only typed when
     they open a composite literal; Go struct fields stay plain ink. */
  function highlightGo(source) {
    const lines = source.split("\n");
    const result = [];

    const keywords = new Set([
      "func", "var", "const", "type", "struct", "interface", "map", "chan",
      "if", "else", "for", "range", "return", "go", "defer", "package",
      "import", "select", "switch", "case", "break", "continue",
      "string", "int", "int64", "bool", "byte", "error", "any",
    ]);
    const constants = new Set(["true", "false", "nil", "iota"]);

    for (const line of lines) {
      const tokens = [];
      let i = 0;

      while (i < line.length) {
        if (line[i] === "/" && line[i + 1] === "/") {
          tokens.push(`<span class="tok-comment">${escapeHtml(line.slice(i))}</span>`);
          i = line.length;
          continue;
        }

        if (line[i] === '"' || line[i] === "`") {
          const quote = line[i];
          let j = i + 1;
          while (j < line.length && line[j] !== quote) {
            if (quote === '"' && line[j] === "\\") j++;
            j++;
          }
          j = Math.min(j + 1, line.length);
          tokens.push(`<span class="tok-string">${escapeHtml(line.slice(i, j))}</span>`);
          i = j;
          continue;
        }

        if (/\d/.test(line[i]) && (i === 0 || /[^a-zA-Z_]/.test(line[i - 1]))) {
          let j = i;
          while (j < line.length && /[\d._]/.test(line[j])) j++;
          if (j > i && !/[a-zA-Z]/.test(line[j] || "")) {
            tokens.push(`<span class="tok-number">${line.slice(i, j)}</span>`);
            i = j;
            continue;
          }
        }

        if (/[a-zA-Z_]/.test(line[i])) {
          let j = i;
          while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
          const word = line.slice(i, j);
          let k = j;
          while (k < line.length && line[k] === " ") k++;

          if (constants.has(word)) {
            tokens.push(`<span class="tok-constant">${word}</span>`);
          } else if (keywords.has(word)) {
            tokens.push(`<span class="tok-keyword">${word}</span>`);
          } else if (line[j] === "(") {
            tokens.push(`<span class="tok-function">${escapeHtml(word)}</span>`);
          } else if (/^[A-Z]/.test(word) && line[k] === "{") {
            tokens.push(`<span class="tok-type">${escapeHtml(word)}</span>`);
          } else {
            tokens.push(escapeHtml(word));
          }
          i = j;
          continue;
        }

        const threeChar = line.slice(i, i + 3);
        const twoChar = line.slice(i, i + 2);
        if (["<<=", ">>=", "..."].includes(threeChar)) {
          tokens.push(`<span class="tok-operator">${escapeHtml(threeChar)}</span>`);
          i += 3;
          continue;
        }
        if ([":=", "<<", ">>", "==", "!=", "<=", ">=", "&&", "||", "->"].includes(twoChar)) {
          tokens.push(`<span class="tok-operator">${escapeHtml(twoChar)}</span>`);
          i += 2;
          continue;
        }
        if ("=+-*/%<>!&|".includes(line[i])) {
          tokens.push(`<span class="tok-operator">${escapeHtml(line[i])}</span>`);
          i++;
          continue;
        }

        tokens.push(escapeHtml(line[i]));
        i++;
      }

      result.push(tokens.join(""));
    }

    return result.join("\n");
  }

  function initThemeToggle() {
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) return;

    toggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      writeStored("theme", next);
    });
  }

  function initCatalog() {
    const grid = document.querySelector("[data-catalog-grid]");
    const nav = document.querySelector("[data-catalog-nav]");
    const filtersEl = document.querySelector("[data-active-filters]");
    if (!grid || !nav) return;

    const cards = Array.from(grid.querySelectorAll(".example-card"));
    const categories = {};
    cards.forEach((card) => {
      const cat = card.dataset.category || "Other";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(card);
    });

    const sorted = Object.keys(categories).sort((a, b) => {
      if (a === "Vibescript Showcase") return -1;
      if (b === "Vibescript Showcase") return 1;
      return a.localeCompare(b);
    });

    let activeCategory = null;
    let activeTag = new URLSearchParams(window.location.search).get("tag");

    function cardHasTag(card, tag) {
      return (card.dataset.tags || "").trim().split(/\s+/).includes(tag);
    }

    function render() {
      cards.forEach((card) => {
        const cat = card.dataset.category || "Other";
        const categoryOk = !activeCategory || cat === activeCategory;
        const tagOk = !activeTag || cardHasTag(card, activeTag);
        card.hidden = !(categoryOk && tagOk);
      });

      nav.querySelectorAll(".catalog-nav-item").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.cat === (activeCategory || "__all__"));
      });

      if (filtersEl) {
        filtersEl.innerHTML = "";
        if (activeCategory) {
          const pill = document.createElement("button");
          pill.className = "filter-pill";
          pill.innerHTML = `${escapeHtml(activeCategory)} <span class="filter-x">&times;</span>`;
          pill.addEventListener("click", () => {
            activeCategory = null;
            render();
          });
          filtersEl.appendChild(pill);
        }
        if (activeTag) {
          const pill = document.createElement("button");
          pill.className = "filter-pill";
          pill.innerHTML = `tag: ${escapeHtml(activeTag)} <span class="filter-x">&times;</span>`;
          pill.addEventListener("click", () => {
            activeTag = null;
            window.history.replaceState({}, "", window.location.pathname);
            render();
          });
          filtersEl.appendChild(pill);
        }
      }
    }

    const allBtn = document.createElement("button");
    allBtn.className = "catalog-nav-item is-active";
    allBtn.dataset.cat = "__all__";
    allBtn.innerHTML = `<span class="catalog-nav-dot catalog-nav-dot-all"></span><span>All</span><span class="catalog-nav-count">${cards.length}</span>`;
    allBtn.addEventListener("click", () => {
      activeCategory = null;
      render();
    });
    nav.appendChild(allBtn);

    sorted.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "catalog-nav-item";
      btn.dataset.cat = cat;
      // Reuse the palette slot Go already assigned to this category's cards.
      btn.dataset.accent = categories[cat][0].dataset.accent || "0";
      btn.innerHTML = `<span class="catalog-nav-dot"></span><span>${escapeHtml(cat)}</span><span class="catalog-nav-count">${categories[cat].length}</span>`;
      btn.addEventListener("click", () => {
        activeCategory = cat;
        render();
      });
      nav.appendChild(btn);
    });

    render();
  }

  /* Highlights the reference sidebar link whose heading was scrolled past
     last, so the nav tracks the reading position. */
  function initReferenceNav() {
    const nav = document.querySelector("[data-reference-nav]");
    if (!nav) return;

    const links = Array.from(nav.querySelectorAll("a[href^='#']"));
    const targets = links
      .map((link) => document.getElementById(decodeURIComponent(link.getAttribute("href").slice(1))))
      .filter(Boolean);
    if (!targets.length) return;

    let current = null;
    function update() {
      const line = 96;
      let active = targets[0];
      for (const target of targets) {
        if (target.getBoundingClientRect().top > line) break;
        active = target;
      }
      if (current === active) return;
      current = active;
      links.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === `#${active.id}`);
      });
    }

    let scheduled = false;
    window.addEventListener(
      "scroll",
      () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          update();
        });
      },
      { passive: true },
    );
    update();
  }

  function initExpandToggle() {
    const toggle = document.querySelector("[data-expand-toggle]");
    if (!toggle) return;

    toggle.addEventListener("click", () => {
      const grid = toggle.closest(".detail-grid");
      if (!grid) return;
      grid.classList.toggle("output-expanded");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initExpandToggle();

    document.querySelectorAll("code.language-vibescript, code.language-vibe").forEach((el) => {
      el.innerHTML = highlightVibescript(el.textContent);
    });

    document.querySelectorAll("code.language-go").forEach((el) => {
      el.innerHTML = highlightGo(el.textContent);
    });

    initReferenceNav();
    initThemeToggle();
    initSoundToggle();
    initCatalog();
  });
})();
