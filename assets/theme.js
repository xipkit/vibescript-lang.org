(function() {
        var t = null, s = null;
        try { t = localStorage.getItem("theme"); s = localStorage.getItem("sound"); } catch (e) {}
        if (!t) t = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", t);
        document.documentElement.setAttribute("data-sound", s === "off" ? "off" : "on");
      })();
