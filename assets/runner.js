(() => {
  const workerURL = {{ .worker | jsonify | safeJS }};
  const wallTime = 5000;
  const downloadTime = 20000;

  function diagnosticsText(response) {
    return (response.diagnostics || []).map((item) => {
      const position = item.span;
      const location = typeof position === "object" ? `${position.line}:${position.column}` : "";
      const fixes = (item.fixes || []).map((fix) => `  Suggestion: ${fix.message}${fix.edits?.length ? `\n${fix.edits.map((edit) => `    Replace with: ${edit.replacement}`).join("\n")}` : ""}`).join("\n");
      return [`${item.code || ""} ${location} ${item.message}`.trim(), fixes].filter(Boolean).join("\n");
    }).join("\n\n");
  }

  for (const root of document.querySelectorAll("[data-playground]")) {
    const editor = root.querySelector("[data-source]");
    const run = root.querySelector("[data-run-button]");
    const stop = root.querySelector("[data-stop-button]");
    const format = root.querySelector("[data-format-button]");
    const reset = root.querySelector("[data-reset-button]");
    const output = root.querySelector("[data-run-output]");
    const diagnostics = root.querySelector("[data-diagnostics]");
    const original = editor ? editor.value : root.querySelector("code.language-vibescript").textContent;
    const source = () => editor ? editor.value : original;
    let worker, active, deadline, debounce, revealStop, sequence = 0, loaded = false;
    if (format) format.disabled = true;

    function buttons(busy) {
      run.disabled = busy;
      stop.disabled = !busy;
      // Stop appears only for a run that outlasts a blink, so quick runs and background checks never flash it.
      clearTimeout(revealStop);
      if (busy && active?.op === "run") revealStop = setTimeout(() => { stop.hidden = false; }, 250);
      else stop.hidden = true;
      if (format) format.disabled = busy || !loaded;
      root.setAttribute("aria-busy", String(busy));
    }

    // site.js listens for these to animate the output.
    function announce(type) {
      root.dispatchEvent(new CustomEvent(type, { bubbles: true }));
    }

    function cancel(message) {
      clearTimeout(deadline);
      clearTimeout(debounce);
      worker?.terminate();
      worker = null;
      if (message) {
        if (active?.op === "check" && diagnostics) diagnostics.textContent = message;
        else output.textContent = message;
      }
      const cancelled = active;
      active = null;
      buttons(false);
      if (cancelled?.op === "run") announce("playground:finish");
    }

    function timeout(ms) {
      clearTimeout(deadline);
      deadline = setTimeout(() => cancel(`Stopped after ${ms / 1000} seconds. Try a smaller program, or Run again.`), ms);
    }

    function show(response, job) {
      const checks = diagnosticsText(response);
      const error = response.error ? `${response.error.kind || "Error"}: ${response.error.message}` : "";
      if (diagnostics && source() === job.source) diagnostics.textContent = checks || error || "No type errors.";
      if (job.op === "format") {
        if (response.ok && typeof response.source === "string" && source() === job.source) {
          editor.value = response.source;
          changed();
        } else if (error) output.textContent = error;
      }
      if (job.op === "run") {
        const lines = [...(response.output || []), ...(response.stderr || []).map((line) => `stderr: ${line}`)];
        if (error) lines.push(error);
        if (checks) lines.push(checks);
        if (response.ok) lines.push(`Result\n${response.result_text}`);
        if (response.stats) lines.push(`${response.stats.steps} steps · ${response.stats.peak_memory_bytes} bytes peak memory`);
        output.textContent = lines.join("\n\n");
      }
    }

    function request(op) {
      clearTimeout(debounce);
      if (active) cancel();
      const job = { id: ++sequence, op, source: source(), previews: root.dataset.previews || "", entry: root.dataset.function || undefined };
      // An edited script may remove run and use top-level statements instead.
      if (!/^def run\b/m.test(job.source)) job.entry = undefined;
      active = job;
      buttons(true);
      if (op === "run") {
        output.textContent = loaded ? "Starting…" : "Loading the browser runtime…";
        announce("playground:start");
      }
      else if (diagnostics) diagnostics.textContent = op === "format" ? "Formatting…" : "Checking…";
      try {
        if (!worker) {
          worker = new Worker(workerURL, { type: "module" });
          worker.onmessage = ({ data }) => {
            if (!active || data.id !== active.id) return;
            if (data.started) {
              loaded = true;
              if (active.op === "run") output.textContent = "Running…";
              timeout(wallTime);
              return;
            }
            const completed = active;
            clearTimeout(deadline);
            active = null;
            buttons(false);
            if (data.error) {
              const target = completed.op === "check" && diagnostics ? diagnostics : output;
              target.textContent = data.error;
            } else show(data.response, completed);
            if (completed.op === "run") announce("playground:finish");
            if (source() !== completed.source) scheduleCheck();
          };
          worker.onerror = (event) => { event.preventDefault(); cancel("The browser runtime could not start. Try Run again."); };
        }
        timeout(downloadTime);
        worker.postMessage(job);
      } catch (error) { cancel(error.message); }
    }

    // Setting value from script fires no input event; raise one so the highlighter and checker both see the edit.
    function changed() {
      editor.dispatchEvent(new Event("input"));
    }

    function scheduleCheck() {
      clearTimeout(debounce);
      if (!loaded || !editor) return;
      debounce = setTimeout(() => {
        if (!active || active.op === "check") request("check");
      }, 400);
    }

    run.addEventListener("click", () => request("run"));
    stop.addEventListener("click", () => cancel("Stopped."));
    format?.addEventListener("click", () => request("format"));
    reset?.addEventListener("click", () => {
      cancel();
      editor.value = original;
      output.textContent = "Reset to the original example.";
      if (diagnostics) diagnostics.textContent = loaded ? "Checking…" : "Run once to load the checker. Your code stays in this browser.";
      changed();
    });
    editor?.addEventListener("input", () => {
      if (active?.op === "check") cancel();
      scheduleCheck();
    });
    editor?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); request("run"); }
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
        changed();
      }
    });
    window.addEventListener("pagehide", () => cancel());
  }
})();
