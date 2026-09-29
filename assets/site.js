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

  /* Storage access throws outright when a browser denies it (private modes,
     blocked cookies, sandboxed embeds), so the write is guarded. A preference
     we cannot store still applies for the session. */
  function writeStored(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Preference cannot be persisted; the session still honors it.
    }
  }

  /** Restarts a CSS animation that may already have run on this element. */
  function replay(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  /* The playground runner announces each run: the output pulses while it
     runs, then slides in with the result. */
  function initRunFeedback() {
    document.addEventListener("playground:start", (event) => {
      const output = event.target.querySelector("[data-run-output]");
      output?.classList.remove("slide-in-down");
      output?.classList.add("is-thinking");
    });
    document.addEventListener("playground:finish", (event) => {
      const output = event.target.querySelector("[data-run-output]");
      if (output) {
        output.classList.remove("is-thinking");
        replay(output, "slide-in-down");
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

  /* Puts each highlighted line in its own block so a long line wraps with a
     hanging indent under its own indentation rather than at column zero. */
  function hangLines(el, html) {
    const lines = html.replace(/\n$/, "").split("\n");
    el.innerHTML = lines.map((line) => `<span class="code-line">${line}\n</span>`).join("");
    el.querySelectorAll(".code-line").forEach((line, i) => {
      line.style.setProperty("--hang", lines[i].match(/^ */)[0].length + 2);
    });
  }

  /* Highlights the editor by painting tokens on a layer under the textarea,
     whose own text turns transparent once the layer is live. Both wrap the
     same way, and the stack grows with the layer, so neither ever scrolls. */
  function initEditor() {
    const stack = document.querySelector("[data-source-stack]");
    if (!stack) return;
    const editor = stack.querySelector("[data-source]");
    const layer = stack.querySelector("[data-source-highlight]");
    // The trailing newline needs a character after it to occupy a line.
    const render = () => { layer.innerHTML = highlightVibescript(editor.value) + "\n "; };
    render();
    editor.addEventListener("input", render);
    stack.classList.add("is-highlighted");
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
      const html = highlightVibescript(el.textContent);
      if (el.closest(".code-window")) hangLines(el, html);
      else el.innerHTML = html;
    });

    document.querySelectorAll("code.language-go").forEach((el) => {
      el.innerHTML = highlightGo(el.textContent);
    });

    initEditor();

    initReferenceNav();
    initThemeToggle();
    initRunFeedback();
    initCatalog();
  });
})();
