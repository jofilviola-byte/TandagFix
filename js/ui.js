/* TandagFix v5 UI layer: smooth/responsive scrolling, scroll progress, header tuck, back-to-top,
   staggered reveals, button press ripple, count-up stats, "/" to search. */
(() => {
  const $ = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hdr = $("header"), desktop = matchMedia("(min-width:960px)");

  /* ---- Scroll progress bar + back-to-top ---- */
  const bar = document.createElement("div"); bar.className = "scroll-progress"; bar.setAttribute("aria-hidden", "true");
  const top = document.createElement("button");
  top.type = "button"; top.className = "to-top"; top.setAttribute("aria-label", "Back to top");
  top.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.append(bar, top);
  top.addEventListener("click", () => scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }));

  /* ---- One rAF-throttled scroll handler (keeps scrolling smooth on low-end phones) ---- */
  let lastY = scrollY, ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    top.classList.toggle("show", y > 600);
    if (hdr) {
      hdr.classList.toggle("scrolled", y > 8);
      // On phones, tuck the header away while reading down, bring it back on scroll up.
      const goingDown = y > lastY + 6, goingUp = y < lastY - 6;
      if (!desktop.matches && y > 160 && goingDown) hdr.classList.add("tuck");
      else if (goingUp || y <= 160 || desktop.matches) hdr.classList.remove("tuck");
    }
    if (Math.abs(y - lastY) > 6) lastY = y;
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update, { passive: true });
  update();

  /* ---- Keep header sized for scroll-padding so anchors/scrollIntoView never hide under it ---- */
  const syncHead = () => hdr && document.documentElement.style.setProperty("--head-h", hdr.offsetHeight + "px");
  addEventListener("load", syncHead); addEventListener("resize", syncHead); syncHead();

  /* ---- Staggered scroll reveal ---- */
  const io = "IntersectionObserver" in window && !reduce
    ? new IntersectionObserver(es => {
        let i = 0;
        es.forEach(e => { if (e.isIntersecting) { e.target.style.setProperty("--d", Math.min(i++, 8) * 60 + "ms"); e.target.classList.add("in"); io.unobserve(e.target); } });
      }, { threshold: .06, rootMargin: "0px 0px -6% 0px" })
    : null;
  const watch = () => all(".section-head,.categories,.provider,.panel").forEach(el => {
    if (el.dataset.rv) return; el.dataset.rv = 1;
    if (!io) return;
    el.classList.add("reveal"); io.observe(el);
  });
  let pending = false;
  new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; watch(); centerCategory(); }); } })
    .observe(document.body, { childList: true, subtree: true });
  watch();

  /* ---- Mobile category strip: keep the selected tile centred (scrolls the strip only, never the page) ---- */
  function centerCategory() {
    const box = $("#categories"), sel = box && box.querySelector(".selected");
    if (!sel || desktop.matches || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: sel.offsetLeft - (box.clientWidth - sel.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  }

  /* ---- Button press ripple (pointer position feeds a CSS radial gradient) ---- */
  document.addEventListener("pointerdown", e => {
    const b = e.target.closest && e.target.closest("button"); if (!b || b.disabled || reduce) return;
    const r = b.getBoundingClientRect();
    b.style.setProperty("--rx", ((e.clientX - r.left) / r.width * 100) + "%");
    b.style.setProperty("--ry", ((e.clientY - r.top) / r.height * 100) + "%");
    b.classList.remove("rip"); void b.offsetWidth; b.classList.add("rip");
    setTimeout(() => b.classList.remove("rip"), 450);
  }, { passive: true });

  /* ---- Hero count-up ---- */
  all("[data-count]").forEach(el => {
    const end = +el.dataset.count, suf = el.dataset.suffix || ""; if (reduce) return el.textContent = end + suf;
    let t0; const step = t => { t0 ??= t; const k = Math.min(1, (t - t0) / 1100); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + suf; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });

  /* ---- "/" focuses search ---- */
  addEventListener("keydown", e => {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $("#searchInput")?.focus(); }
  });
})();
