/* TandagFix v6 — messaging centre for homeowners and service providers.
   Works offline with localStorage and upgrades to Supabase when configured. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const saveRaw = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  const CHAT_KEY = "tfChat";
  const DRAFT_KEY = "tfChatDrafts";
  const AUTO_KEY = "tfChatAutoReply";
  const MAX_IMAGE_EDGE = 900;
  const BASE_TITLE = document.title;

  const sb = () => window.tandagfixClient || null;
  const uid = () => (typeof account !== "undefined" && account?.userId) || null;
  const role = () => (typeof account !== "undefined" && account?.role) || "customer";
  const mySide = () => (["provider", "admin"].includes(role()) ? "provider" : "customer");
  const otherSide = s => (s === "customer" ? "provider" : "customer");
  const unreadKey = s => (s === "provider" ? "unreadProvider" : "unreadCustomer");
  const nowISO = () => new Date().toISOString();
  const mid = () => "m_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const providerOf = t => providers.find(p => p.id === Number(t.providerId)) || null;
  const bookingOf = t => (t.bookingId ? bookings.find(b => b.id === Number(t.bookingId)) : null);
  const myUnread = t => Number(t[unreadKey(mySide())] || 0);

  let store = load(CHAT_KEY, null);
  if (!store || typeof store !== "object" || !store.threads || typeof store.threads !== "object") {
    store = { version: 1, seeded: false, threads: {} };
  }
  if (!store.version) store.version = 1;

  let activeId = null, filter = "all", query = "", pendingImage = null, draftTimer = 0;
  let drafts = load(DRAFT_KEY, {}) || {};
  const typing = {}, replyTimers = {}, signing = new Set(), serverIds = {};

  const threadForBooking = id => store.threads["b:" + id] || null;

  function saveChat() {
    if (saveRaw(CHAT_KEY, store)) return true;
    Object.values(store.threads).forEach(t => {
      const cut = Math.max(0, t.messages.length - 8);
      t.messages.forEach((m, i) => { if (i < cut) m.image = null; });
    });
    if (saveRaw(CHAT_KEY, store)) return true;
    toast("Storage is full — delete old conversations or photos.");
    return false;
  }

  function saveDrafts() { saveRaw(DRAFT_KEY, drafts); }
  function saveDraft(id, value) {
    drafts[id] = value;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDrafts, 500);
  }

  /* ---------- sample inbox so the feature is discoverable ---------- */
  function minutesAgo(n) { return new Date(Date.now() - n * 60000).toISOString(); }
  function mkMsg(from, text, at) { return { id: mid(), from, text, image: null, at, readAt: null }; }
  function mkSys(text, at) { return { id: mid(), from: "system", system: true, text, at, readAt: null }; }

  function mkThread(data) {
    const id = data.id || (data.bookingId ? "b:" + data.bookingId : "p:" + data.providerId);
    let t = store.threads[id];
    if (!t) {
      t = store.threads[id] = {
        id,
        kind: data.kind || (data.bookingId ? "booking" : "direct"),
        bookingId: data.bookingId || null,
        providerId: Number(data.providerId),
        providerName: data.providerName || "",
        category: data.category || "",
        customerName: data.customerName || "Homeowner",
        createdAt: nowISO(),
        updatedAt: nowISO(),
        archived: false, pinned: false, muted: false, blocked: false, reported: false,
        unreadCustomer: 0, unreadProvider: 0,
        messages: data.messages || [],
        demo: data.demo !== undefined ? !!data.demo : !sb()
      };
    } else {
      if (data.providerName) t.providerName = data.providerName;
      if (data.category) t.category = data.category;
      if (data.customerName) t.customerName = data.customerName;
      if (data.bookingId) { t.bookingId = data.bookingId; t.kind = "booking"; }
      if (data.demo !== undefined) t.demo = !!data.demo;
    }
    return t;
  }

  function seed() {
    if (store.seeded) return;
    store.seeded = true;
    const juan = providers.find(p => p.id === 1) || providers[0];
    const maria = providers.find(p => p.id === 3) || providers[2];
    const mark = providers.find(p => p.id === 12) || providers[11];
    if (!juan || !maria || !mark) return;

    const t1 = mkThread({ demo: true, kind: "direct", providerId: juan.id, providerName: juan.name, category: juan.category, customerName: "Ana Dela Cruz" });
    t1.createdAt = minutesAgo(360); t1.updatedAt = minutesAgo(38);
    t1.messages = [
      mkSys("Conversation started from the TandagFix provider directory.", minutesAgo(360)),
      mkMsg("customer", "Hi kuya Juan! Our kitchen outlet sparks when we plug in the rice cooker. Can you check it?", minutesAgo(320)),
      mkMsg("provider", "Hello! Please unplug it for now and avoid using that outlet. I can come tomorrow between 8–10 AM.", minutesAgo(315)),
      mkMsg("customer", "That works. Salamat!", minutesAgo(310)),
      mkMsg("provider", "See you tomorrow. Please send a photo of the outlet if you can. 🙏", minutesAgo(38))
    ];
    t1.messages.forEach(m => m.readAt = m.at);
    t1.unreadCustomer = 1;

    const t2 = mkThread({ demo: true, kind: "direct", providerId: maria.id, providerName: maria.name, category: maria.category, customerName: "Ana Dela Cruz" });
    t2.createdAt = minutesAgo(90); t2.updatedAt = minutesAgo(21);
    t2.messages = [
      mkMsg("customer", "Hi Ma'am Maria, do you have a slot this Saturday for a deep clean of a 2-bedroom house?", minutesAgo(90)),
      mkMsg("provider", "Good morning! Yes, I'm available this Saturday. Would 1 PM work for you?", minutesAgo(21))
    ];
    t2.messages.forEach(m => m.readAt = m.at);
    t2.unreadCustomer = 1;

    const t3 = mkThread({ demo: true, kind: "direct", providerId: mark.id, providerName: mark.name, category: mark.category, customerName: "Ana Dela Cruz" });
    t3.createdAt = minutesAgo(45); t3.updatedAt = minutesAgo(12);
    t3.messages = [mkMsg("customer", "Sir Mark, our electric fan stopped spinning. Are you free this afternoon?", minutesAgo(12))];
    t3.messages.forEach(m => m.readAt = m.at);
    t3.unreadProvider = 1;
  }

  function ensureBookingThread(b) {
    const t = mkThread({
      kind: "booking",
      bookingId: b.id,
      providerId: b.providerId,
      providerName: b.providerName,
      category: b.category,
      customerName: b.chatName || b.customerName || (role() === "customer" ? (account?.name || "") : "") || "Homeowner"
    });
    if (!t.messages.length) {
      t.messages.push(mkSys(`Booking ${String(b.status || "requested").toLowerCase()} for ${b.category} on ${b.date} (${b.time}). Coordinate the final price and arrival here.`, nowISO()));
      t.updatedAt = nowISO();
    }
    return t;
  }

  /* ---------- names, avatars and dates ---------- */
  function counterpart(t) {
    return mySide() === "provider" ? (t.customerName || "Homeowner") : (t.providerName || "Service provider");
  }
  function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  }
  function avatarFor(t) {
    if (mySide() === "provider") return `<span class="chat-avatar-initials">${esc(initials(t.customerName || "Homeowner"))}</span>`;
    const p = providerOf(t);
    return `<span aria-hidden="true">${p?.emoji || "👷"}</span>`;
  }
  function preview(t) {
    const last = t.messages[t.messages.length - 1];
    if (!last) return "No messages yet";
    if (last.system) return last.text;
    const body = last.image ? "📷 Photo" : (last.text || "Message");
    return (last.from === mySide() ? "You: " : "") + body;
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
  function dayDiff(iso) { return Math.round((startOfDay(new Date()) - startOfDay(iso)) / 86400000); }
  function fmtDay(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    const diff = dayDiff(iso);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  function fmtWhen(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    const diff = dayDiff(iso);
    if (diff === 0) return fmtTime(iso);
    if (diff === 1) return "Yesterday";
    if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  function grow(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(130, Math.max(44, el.scrollHeight)) + "px";
  }

    /* ---------- rendering ---------- */
  function filteredThreads() {
    let list = Object.values(store.threads).filter(t => (filter === "archived" ? t.archived : !t.archived));
    if (filter === "unread") list = list.filter(t => myUnread(t) > 0);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(t => {
      const hay = `${counterpart(t)} ${t.category} ${t.providerName} ${t.customerName} ${t.messages.map(m => m.text || "").join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function threadRow(t) {
    const unread = myUnread(t);
    const b = bookingOf(t);
    return `<button type="button" class="thread ${t.id === activeId ? "active" : ""}" data-thread="${esc(t.id)}" aria-current="${t.id === activeId ? "true" : "false"}">
      <span class="chat-avatar">${avatarFor(t)}</span>
      <span class="thread-main">
        <span class="thread-top"><strong>${esc(counterpart(t))}</strong><small>${esc(fmtWhen(t.updatedAt))}</small></span>
        <span class="thread-sub">${t.pinned ? "📌 " : ""}${t.muted ? "🔕 " : ""}${b ? `<span class="thread-tag">${esc(b.status)}</span>` : ""}${esc(preview(t))}</span>
      </span>
      ${unread ? `<span class="thread-unread" aria-label="${unread} unread messages">${unread > 9 ? "9+" : unread}</span>` : ""}
    </button>`;
  }

  function renderThreadList() {
    const box = $("chatThreads");
    if (!box) return;
    const list = filteredThreads();
    box.innerHTML = list.length ? list.map(threadRow).join("") : `<div class="chat-empty-list">${filter === "archived" ? "No archived conversations." : filter === "unread" ? "You're all caught up. 🎉" : "No conversations yet.<br>Message a provider from their profile or a booking."}</div>`;
  }

  function bubbleHTML(t, m) {
    if (m.system) return `<div class="msg-system"><span>${esc(m.text)}</span></div>`;
    const mine = m.from === mySide();
    const img = m.image ? `<img class="msg-img" src="${esc(m.image)}" alt="Shared photo" loading="lazy" onclick="TFChat.zoom(this.src)">` : "";
    const receipt = mine ? `<span class="msg-receipt">${m.readAt ? "✓✓ Seen" : "✓ Sent"}</span>` : "";
    return `<div class="msg ${mine ? "mine" : "theirs"}">${mine ? "" : `<span class="msg-avatar" aria-hidden="true">${avatarFor(t)}</span>`}<div class="msg-body"><div class="bubble">${img}${m.text ? `<p>${esc(m.text)}</p>` : ""}</div><small class="msg-meta">${esc(fmtTime(m.at))} ${receipt}</small></div></div>`;
  }

  function typingHTML(t) {
    return `<div class="msg theirs"><span class="msg-avatar" aria-hidden="true">${avatarFor(t)}</span><div class="msg-body"><div class="bubble typing-dots" aria-label="${esc(counterpart(t))} is typing"><i></i><i></i><i></i></div></div></div>`;
  }

  function renderMessages(t, opts = {}) {
    const box = $("chatMessages");
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    let html = "", day = "";
    t.messages.forEach(m => {
      const d = fmtDay(m.at);
      if (d !== day) { html += `<div class="msg-day"><span>${esc(d)}</span></div>`; day = d; }
      html += bubbleHTML(t, m);
    });
    if (typing[t.id]) html += typingHTML(t);
    box.innerHTML = html || `<div class="chat-empty"><div class="chat-empty-icon">👋</div><h3>Start the conversation</h3><p>Ask about availability, confirm the price, or share a photo of the job.</p></div>`;
    if (opts.scroll || nearBottom) box.scrollTop = box.scrollHeight;
    updateStatusLine(t);
  }

  function updateStatusLine(t) {
    const el = $("chatStatus");
    if (!el) return;
    if (typing[t.id]) { el.textContent = "typing…"; return; }
    if (t.blocked) { el.textContent = "Blocked"; return; }
    if (t.demo) { el.textContent = mySide() === "provider" ? "Homeowner · demo conversation" : "Sample provider · demo replies"; return; }
    el.textContent = mySide() === "provider" ? "Homeowner · TandagFix member" : "Service provider · TandagFix member";
  }

  function quickReplies() {
    return mySide() === "provider"
      ? ["On my way 🚗", "Running 15 minutes late", "Job complete ✅", "Can you send a photo?", "Please confirm the address"]
      : ["Are you available today?", "How much for this job?", "I'll send a photo 📷", "Salamat!", "Can we reschedule?"];
  }

  function contextHTML(t, b) {
    if (!b) {
      return `<div class="chat-context"><span class="pill">Direct message</span><span>No booking yet — agree on scope and price here, then book.</span><button type="button" class="ghost" onclick="TFChat.bookProvider()">Book this provider</button></div>`;
    }
    return `<div class="chat-context"><span class="pill">${esc(b.status)}</span>${b.urgent ? '<span class="pill">🚨 Urgent</span>' : ""}<span>${esc(b.date)} · ${esc(b.time)}</span><span>${esc(b.category)} · ₱${Number(b.price || 0).toFixed(2)}</span><button type="button" class="ghost" onclick="TFChat.viewBooking()">Open booking</button></div>`;
  }

  function paneHTML(t) {
    const cp = counterpart(t), b = bookingOf(t);
    const status = typing[t.id] ? "typing…" : t.demo ? (mySide() === "provider" ? "Homeowner · demo conversation" : "Sample provider · demo replies") : "TandagFix member";
    return `<div class="chat-head">
      <button type="button" class="ghost chat-back" aria-label="Back to conversations" onclick="TFChat.back()">←</button>
      <span class="chat-avatar">${avatarFor(t)}</span>
      <div class="chat-who"><strong>${esc(cp)}</strong><small id="chatStatus">${esc(status)}</small></div>
      <div class="chat-head-actions">
        ${b ? `<button type="button" class="secondary" onclick="TFChat.viewBooking()">Booking</button>` : `<button type="button" class="secondary" onclick="TFChat.bookProvider()">Book</button>`}
        <details class="chat-menu"><summary aria-label="Conversation options" title="Conversation options">⋯</summary><div class="chat-menu-body">
          <button type="button" class="ghost" onclick="TFChat.togglePin()">${t.pinned ? "📌 Unpin conversation" : "📌 Pin conversation"}</button>
          <button type="button" class="ghost" onclick="TFChat.toggleArchive()">${t.archived ? "📥 Move to inbox" : "🗄️ Archive conversation"}</button>
          <button type="button" class="ghost" onclick="TFChat.toggleMute()">${t.muted ? "🔔 Unmute notifications" : "🔕 Mute notifications"}</button>
          <button type="button" class="ghost" onclick="TFChat.block()">${t.blocked ? "✅ Unblock" : "🚫 Block"} contact</button>
          <button type="button" class="ghost" onclick="TFChat.report()">⚠️ Report conversation</button>
          <button type="button" class="ghost" onclick="TFChat.remove()">🗑️ Delete conversation</button>
        </div></details>
      </div>
    </div>
    ${contextHTML(t, b)}
    <div class="chat-messages" id="chatMessages" aria-live="polite" aria-label="Messages"></div>
    ${t.blocked
      ? `<div class="chat-blocked">You blocked ${esc(cp)}. Unblock this contact from the ⋯ menu to send messages again.</div>`
      : `<div class="chat-quick" aria-label="Quick replies">${quickReplies().map(q => `<button type="button" class="pill chip" data-q="${esc(q)}" onclick="TFChat.quick(this.dataset.q)">${esc(q)}</button>`).join("")}</div>
    <form class="chat-composer" id="chatComposer" autocomplete="off">
      <div class="chat-attach" id="chatAttach"></div>
      <textarea id="chatInput" rows="1" maxlength="1000" placeholder="Message ${esc(cp)}…" aria-label="Message"></textarea>
      <input type="file" id="chatFile" accept="image/*" hidden>
      <button type="button" class="secondary chat-icon" aria-label="Attach a photo" title="Attach a photo" onclick="document.getElementById('chatFile').click()">📷</button>
      <button type="submit" class="chat-send" aria-label="Send message">Send</button>
    </form>
    <p class="chat-hint">Enter to send · Shift + Enter for a new line · Keep payments inside TandagFix.</p>`}`;
  }

  function emptyPane() {
    return `<div class="chat-empty"><div class="chat-empty-icon">💬</div><h3>Select a conversation</h3><p>Choose a chat on the left, or message a provider from their profile or a booking.</p><button type="button" class="secondary" onclick="go('home')">Find a provider</button></div>`;
  }

  function renderChat(opts = {}) {
    const shell = $("chatShell");
    if (!shell) return;
    const t = activeId ? store.threads[activeId] : null;
    shell.classList.toggle("thread-open", !!t);
    renderThreadList();
    const pane = $("chatPane");
    if (!pane) return;
    if (!t) {
      pane.dataset.thread = "";
      pane.innerHTML = emptyPane();
      return;
    }
    if (pane.dataset.thread !== t.id || opts.rebuild) {
      pane.dataset.thread = t.id;
      pane.innerHTML = paneHTML(t);
      bindComposer();
      const input = $("chatInput");
      if (input) { input.value = drafts[t.id] || ""; grow(input); }
    }
    renderMessages(t, { scroll: !!opts.forceBottom });
    renderAttach();
    updateBadge();
  }

  function bindComposer() {
    const form = $("chatComposer"), input = $("chatInput"), file = $("chatFile");
    if (!form || !input) return;
    input.addEventListener("input", () => { grow(input); saveDraft(activeId, input.value); });
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendCurrent(); }
    });
    form.addEventListener("submit", e => { e.preventDefault(); sendCurrent(); });
    file?.addEventListener("change", e => { attachFile(e.target.files && e.target.files[0]); e.target.value = ""; });
  }

  function renderAttach() {
    const box = $("chatAttach");
    if (!box) return;
    box.innerHTML = pendingImage ? `<div class="attach-preview"><img src="${esc(pendingImage)}" alt="Attachment preview"><button type="button" class="ghost" aria-label="Remove photo" onclick="TFChat.clearAttach()">✕</button></div>` : "";
  }

  function updateBadge() {
    const total = Object.values(store.threads).reduce((sum, t) => (t.archived || t.muted ? sum : sum + myUnread(t)), 0);
    const badge = $("chatNavBadge");
    if (badge) {
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.classList.toggle("hidden", total === 0);
    }
    document.title = total ? `(${total > 99 ? "99+" : total}) ${BASE_TITLE}` : BASE_TITLE;
  }

  function isViewing(t) {
    const v = $("messagesView");
    return !!t && activeId === t.id && v && !v.classList.contains("hidden") && !document.hidden;
  }

    /* ---------- conversation actions ---------- */
  function openThread(id, opts = {}) {
    const t = store.threads[id];
    if (!t) return toast("Conversation not found.");
    activeId = id;
    pendingImage = null;
    markRead(t);
    saveChat();
    if (!$("messagesView") || $("messagesView").classList.contains("hidden")) go("messages");
    renderChat({ forceBottom: true });
    updateBadge();
    if (opts.focus !== false && window.innerWidth >= 900) setTimeout(() => $("chatInput")?.focus(), 40);
    syncRead(t);
    loadServerMessages(t);
  }

  function openBooking(bookingId) {
    const b = bookings.find(x => x.id === Number(bookingId));
    if (!b) return toast("Booking not found.");
    const t = ensureBookingThread(b);
    t.customerName = b.chatName || b.customerName || t.customerName;
    saveChat();
    activeId = t.id;
    pendingImage = null;
    markRead(t);
    go("messages");
    renderChat({ forceBottom: true });
    updateBadge();
    syncRead(t);
    loadServerMessages(t);
    if (window.innerWidth >= 900) setTimeout(() => $("chatInput")?.focus(), 40);
  }

  function openProvider(providerId) {
    const p = providers.find(x => x.id === Number(providerId));
    if (!p) return toast("Provider not found.");
    const t = mkThread({
      demo: true,
      kind: "direct",
      providerId: p.id,
      providerName: p.name,
      category: p.category,
      customerName: (typeof account !== "undefined" && account?.name) || "Homeowner"
    });
    saveChat();
    activeId = t.id;
    pendingImage = null;
    markRead(t);
    go("messages");
    renderChat({ forceBottom: true });
    updateBadge();
    if (window.innerWidth >= 900) setTimeout(() => $("chatInput")?.focus(), 40);
  }

  function markRead(t) {
    let changed = false;
    t.messages.forEach(m => { if (!m.system && m.from !== mySide() && !m.readAt) { m.readAt = nowISO(); changed = true; } });
    const key = unreadKey(mySide());
    if (Number(t[key] || 0) !== 0) { t[key] = 0; changed = true; }
    if (changed) saveChat();
  }

  function sendCurrent() {
    const t = activeId ? store.threads[activeId] : null;
    if (!t) return;
    const input = $("chatInput");
    const text = (input?.value || "").trim();
    if (!text && !pendingImage) { input?.focus(); return; }
    if (t.blocked) return toast("Unblock this contact before sending messages.");
    const m = { id: mid(), from: mySide(), text: text.slice(0, 1000), image: pendingImage, at: nowISO(), readAt: null };
    t.messages.push(m);
    t.updatedAt = m.at;
    const other = unreadKey(otherSide(mySide()));
    t[other] = Number(t[other] || 0) + 1;
    if (input) { input.value = ""; grow(input); }
    pendingImage = null;
    drafts[t.id] = "";
    saveDrafts();
    saveChat();
    renderThreadList();
    renderMessages(t, { scroll: true });
    renderAttach();
    updateBadge();
    syncSend(t, m);
    maybeAutoReply(t);
  }

  function receive(t, m) {
    if (m.serverId && t.messages.some(x => x.serverId === m.serverId)) return;
    t.messages.push(m);
    t.updatedAt = m.at;
    if (t.archived) t.archived = false;
    const viewing = isViewing(t);
    if (viewing) m.readAt = nowISO();
    else {
      const key = unreadKey(mySide());
      t[key] = Number(t[key] || 0) + 1;
    }
    saveChat();
    renderThreadList();
    updateBadge();
    if (viewing) { renderMessages(t, { scroll: true }); syncRead(t); }
    else notify(t, m);
  }

  function notify(t, m) {
    if (t.muted) return;
    const name = counterpart(t);
    const body = m.image ? "📷 Photo" : String(m.text || "New message").slice(0, 80);
    if (typeof addNotification === "function") addNotification(`💬 New message from ${name}: ${body}`, t.id);
    toast(`💬 ${name}: ${body}`);
  }

  function autoReplyText(t, text) {
    const s = String(text).toLowerCase();
    if (mySide() === "provider") {
      if (/price|quote|how much|magkano|rate|bayad/.test(s)) return "Noted! I can give a final price after seeing the photos. My usual starting rate is ₱" + (providerOf(t)?.price || 300) + ".";
      if (/available|today|tomorrow|schedule|time|when/.test(s)) return "Yes, that schedule works for me. Please confirm the address here so I can plan my route.";
      if (/photo|picture|pic/.test(s)) return "Please attach the photo here. I'll check it before I head over.";
      if (/thank|salamat/.test(s)) return "You're welcome! See you on the scheduled date. 😊";
      return "Thanks for the message! I'll confirm the details shortly.";
    }
    if (/price|quote|how much|magkano|rate|bayad/.test(s)) return "Thanks for asking! My starting rate is ₱" + (providerOf(t)?.price || 300) + ". The final price depends on the scope — can you send a photo?";
    if (/photo|picture|pic|send/.test(s)) return "Got it — please attach the photo here so I can check before I come.";
    if (/today|tomorrow|available|schedule|time|when|ugma/.test(s)) return "I can be there tomorrow between 8–10 AM. Does that work for you?";
    if (/address|location|where|asa/.test(s)) return "Please confirm the barangay and nearest landmark here, and I'll head over.";
    if (/thank|salamat/.test(s)) return "You're welcome! Message me anytime. 😊";
    return "Thanks for the message! I'll check my schedule and get back to you shortly.";
  }

  function maybeAutoReply(t) {
    if (t.blocked || t.muted || !t.demo) return;
    if (localStorage.getItem(AUTO_KEY) === "off") return;
    if (!providerOf(t)) return;
    clearTimeout(replyTimers[t.id]);
    typing[t.id] = true;
    updateStatusLine(t);
    if (activeId === t.id) renderMessages(t, { scroll: true });
    replyTimers[t.id] = setTimeout(() => {
      typing[t.id] = false;
      const lastMine = [...t.messages].reverse().find(m => m.from === mySide() && !m.system);
      t.messages.forEach(m => { if (m.from === mySide() && !m.readAt) m.readAt = nowISO(); });
      receive(t, { id: mid(), from: otherSide(mySide()), text: autoReplyText(t, lastMine?.text || ""), at: nowISO(), readAt: null, auto: true });
      if (activeId === t.id) { updateStatusLine(t); renderMessages(t, { scroll: true }); }
    }, 1500 + Math.random() * 1200);
  }

  async function attachFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast("Please choose an image file.");
    if (file.size > 8 * 1024 * 1024) return toast("Photo is too large (max 8 MB).");
    const data = await shrink(file, MAX_IMAGE_EDGE, 0.62);
    if (!data) return toast("Could not read that photo.");
    pendingImage = data;
    renderAttach();
    $("chatInput")?.focus();
  }

  function shrink(file, max, quality) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  let lightbox = null;
  function zoom(src) {
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.className = "chat-lightbox";
      lightbox.innerHTML = '<button type="button" class="ghost" aria-label="Close photo">✕</button><img alt="Shared photo">';
      lightbox.addEventListener("click", () => lightbox.classList.remove("open"));
      document.addEventListener("keydown", e => { if (e.key === "Escape") lightbox.classList.remove("open"); });
      document.body.appendChild(lightbox);
    }
    lightbox.querySelector("img").src = src;
    lightbox.classList.add("open");
  }

  /* ---------- Supabase sync (optional) ---------- */
  async function serverBookingId(localId) {
    if (localId in serverIds) return serverIds[localId];
    const { data, error } = await sb().from("bookings").select("id").eq("local_id", localId).maybeSingle();
    if (error) { console.warn("chat booking lookup", error.message); return null; }
    return (serverIds[localId] = data?.id || null);
  }

  async function syncSend(t, m) {
    if (!sb() || !uid() || !t.bookingId) return;
    try {
      const bid = t.serverBookingId || await serverBookingId(t.bookingId);
      if (!bid) return;
      t.serverBookingId = bid;
      let path = null;
      if (m.image) {
        const blob = await (await fetch(m.image)).blob();
        path = `${bid}/${Date.now()}.jpg`;
        const up = await sb().storage.from("chat-images").upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) { console.warn("chat upload", up.error.message); path = null; }
        else { m.attachmentPath = path; saveChat(); }
      }
      const { error } = await sb().from("messages").insert({ booking_id: bid, sender_id: uid(), body: (m.text || "📷 Photo").slice(0, 1000), attachment_path: path });
      if (error) console.warn("chat sync", error.message);
    } catch (e) { console.warn("chat sync skipped", e); }
  }

  async function syncRead(t) {
    if (!sb() || !uid() || !t.bookingId) return;
    try {
      const bid = t.serverBookingId || await serverBookingId(t.bookingId);
      if (!bid) return;
      t.serverBookingId = bid;
      const { error } = await sb().from("messages").update({ read_at: nowISO() }).eq("booking_id", bid).neq("sender_id", uid()).is("read_at", null);
      if (error) console.warn("chat read sync", error.message);
    } catch (e) {}
  }

  async function signAttachment(m, t) {
    if (!sb() || !m.attachmentPath || signing.has(m.id)) return;
    signing.add(m.id);
    try {
      const { data } = await sb().storage.from("chat-images").createSignedUrl(m.attachmentPath, 3600);
      if (data?.signedUrl) {
        m.image = data.signedUrl;
        if (activeId === t.id) renderMessages(t);
      }
    } catch (e) {} finally { signing.delete(m.id); }
  }

  async function loadServerMessages(t) {
    if (!sb() || !uid() || !t.bookingId) return;
    try {
      const bid = t.serverBookingId || await serverBookingId(t.bookingId);
      if (!bid) return;
      t.serverBookingId = bid;
      const { data, error } = await sb().from("messages").select("id,sender_id,body,attachment_path,read_at,created_at").eq("booking_id", bid).order("created_at");
      if (error || !data) return;
      let changed = false;
      data.forEach(row => {
        const existing = t.messages.find(m => m.serverId === row.id);
        if (existing) {
          if (row.read_at && existing.readAt !== row.read_at) { existing.readAt = row.read_at; changed = true; }
          return;
        }
        const mine = row.sender_id === uid();
        t.messages.push({ id: mid(), serverId: row.id, from: mine ? mySide() : otherSide(mySide()), text: row.body || "", image: null, attachmentPath: row.attachment_path || null, at: row.created_at || nowISO(), readAt: row.read_at || null });
        changed = true;
      });
      if (changed) {
        t.messages.sort((a, b) => new Date(a.at) - new Date(b.at));
        t.updatedAt = t.messages[t.messages.length - 1]?.at || t.updatedAt;
        saveChat();
        if (activeId === t.id) { markRead(t); renderMessages(t, { scroll: true }); }
        renderThreadList();
        updateBadge();
      }
      t.messages.filter(m => m.attachmentPath).forEach(m => signAttachment(m, t));
    } catch (e) {}
  }

  let channel = null, syncStarted = false;
  function subscribeRealtime() {
    if (channel || !sb() || !uid()) return;
    channel = sb().channel("tf-chat");
    channel.on("postgres_changes", { event: "insert", schema: "public", table: "messages" }, payload => {
      const row = payload.new || {};
      const t = Object.values(store.threads).find(x => x.serverBookingId === row.booking_id);
      if (!t || row.sender_id === uid()) return;
      if (t.messages.some(m => m.serverId === row.id)) return;
      receive(t, { id: mid(), serverId: row.id, from: otherSide(mySide()), text: row.body || "", image: null, attachmentPath: row.attachment_path || null, at: row.created_at || nowISO(), readAt: null });
      const m = t.messages[t.messages.length - 1];
      if (m && row.attachment_path) signAttachment(m, t);
    }).on("postgres_changes", { event: "update", schema: "public", table: "messages" }, payload => {
      const row = payload.new || {};
      if (!row.read_at) return;
      const t = Object.values(store.threads).find(x => x.serverBookingId === row.booking_id);
      if (!t) return;
      const m = t.messages.find(x => x.serverId === row.id);
      if (!m || m.readAt === row.read_at) return;
      m.readAt = row.read_at;
      saveChat();
      if (activeId === t.id) renderMessages(t);
    }).subscribe();
  }

  function startServerSync() {
    if (syncStarted || !sb() || !uid()) return;
    syncStarted = true;
    subscribeRealtime();
    Object.values(store.threads).forEach(t => { if (t.bookingId) loadServerMessages(t); });
    const note = $("chatDemoNote");
    if (note) note.textContent = "Messages sync with your TandagFix account.";
  }

  /* ---------- public API ---------- */
  window.TFChat = {
    open: openThread,
    openThread,
    openBooking,
    openProvider,
    back() { activeId = null; pendingImage = null; renderChat(); },
    send: sendCurrent,
    focusComposer() { $("chatInput")?.focus(); },
    quick(text) { const i = $("chatInput"); if (!i) return; i.value = text; grow(i); saveDraft(activeId, i.value); i.focus(); },
    attach: attachFile,
    clearAttach() { pendingImage = null; renderAttach(); },
    zoom,
    viewBooking() { go("bookings"); },
    bookProvider() { const t = activeId ? store.threads[activeId] : null; if (t) startBooking(t.providerId); },
    togglePin() { const t = activeId ? store.threads[activeId] : null; if (!t) return; t.pinned = !t.pinned; saveChat(); renderChat(); toast(t.pinned ? "Conversation pinned." : "Conversation unpinned."); },
    toggleArchive() { const t = activeId ? store.threads[activeId] : null; if (!t) return; t.archived = !t.archived; const msg = t.archived ? "Moved to archive." : "Moved back to inbox."; if (t.archived) activeId = null; saveChat(); renderChat(); toast(msg); },
    toggleMute() { const t = activeId ? store.threads[activeId] : null; if (!t) return; t.muted = !t.muted; saveChat(); renderChat(); toast(t.muted ? "Notifications muted." : "Notifications on."); },
    block() {
      const t = activeId ? store.threads[activeId] : null; if (!t) return;
      if (!confirm(t.blocked ? "Unblock this contact?" : `Block ${counterpart(t)}? You will not be able to send messages.`)) return;
      t.blocked = !t.blocked; saveChat(); renderChat(); toast(t.blocked ? "Contact blocked." : "Contact unblocked.");
    },
    report() {
      const t = activeId ? store.threads[activeId] : null; if (!t) return;
      const reason = prompt(`Report the conversation with ${counterpart(t)}. What happened?`);
      if (reason === null) return;
      t.reported = true; t.reportReason = reason.trim(); saveChat();
      if (typeof addNotification === "function") addNotification(`⚠️ Conversation with ${counterpart(t)} reported: ${reason.trim() || "No details provided"}.`, t.id);
      renderChat(); toast("Report sent to the TandagFix admin.");
    },
    remove() {
      const t = activeId ? store.threads[activeId] : null; if (!t) return;
      if (!confirm("Delete this conversation from this device?")) return;
      delete store.threads[t.id]; delete drafts[t.id]; activeId = null;
      saveChat(); saveDrafts(); renderChat(); toast("Conversation deleted.");
    },
    badgeForBooking(id) { const t = threadForBooking(id); const n = t ? myUnread(t) : 0; return n ? ` <span class="thread-unread">${n > 9 ? "9+" : n}</span>` : ""; },
    unreadForBooking(id) { const t = threadForBooking(id); return t ? myUnread(t) : 0; }
  };

  /* ---------- notification integration ---------- */
  const baseAddNotification = typeof addNotification === "function" ? addNotification : null;
  if (baseAddNotification) {
    addNotification = function (message, threadId) {
      baseAddNotification(message);
      if (threadId && notifications[0]) {
        notifications[0].threadId = threadId;
        if (typeof saveNotifications === "function") saveNotifications();
      }
    };
  }
  const baseRenderNotifications = typeof renderNotifications === "function" ? renderNotifications : null;
  if (baseRenderNotifications) {
    renderNotifications = function () {
      baseRenderNotifications();
      document.querySelectorAll("#notificationList article.provider").forEach((card, i) => {
        const n = notifications[i];
        if (!n || !n.threadId || card.querySelector(".open-thread")) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "secondary open-thread";
        btn.style.marginTop = "10px";
        btn.textContent = "💬 Open conversation";
        btn.onclick = () => openThread(n.threadId);
        card.appendChild(btn);
      });
    };
  }

  /* ---------- navigation + boot ---------- */
  function bindStatic() {
    $("chatSearch")?.addEventListener("input", e => { query = e.target.value || ""; renderThreadList(); });
    document.querySelectorAll("[data-chat-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.chatTab || "all";
        document.querySelectorAll("[data-chat-tab]").forEach(b => {
          const on = b === btn;
          b.classList.toggle("active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        renderThreadList();
      });
    });
    $("chatThreads")?.addEventListener("click", e => {
      const row = e.target.closest("[data-thread]");
      if (row) openThread(row.dataset.thread);
    });
    $("saveAccount")?.addEventListener("click", () => setTimeout(() => { renderChat(); updateBadge(); }, 0));
    $("bookingForm")?.addEventListener("submit", () => {
      setTimeout(() => {
        const b = bookings[0];
        if (!b || Date.now() - Number(b.id) > 8000) return;
        const t = ensureBookingThread(b);
        t.customerName = b.chatName || t.customerName;
        saveChat();
        renderThreadList();
        updateBadge();
        if (activeId === t.id) renderChat();
      }, 160);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden || !activeId) return;
      const t = store.threads[activeId];
      if (!t) return;
      markRead(t); renderChat();
    });
  }

  const baseGo = typeof go === "function" ? go : null;
  if (baseGo) {
    window.go = function (view) {
      const mv = $("messagesView");
      if (view === "messages") {
        ["home", "bookings", "provider", "account", "profile", "bookingForm", "admin", "notifications"].forEach(v => {
          const el = $(v + "View"); if (el) el.classList.add("hidden");
        });
        if (mv) mv.classList.remove("hidden");
        document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
        window.scrollTo({ top: 0, behavior: "smooth" });
        renderChat();
        updateBadge();
        startServerSync();
        return;
      }
      if (mv) mv.classList.add("hidden");
      const out = baseGo(view);
      updateBadge();
      startServerSync();
      return out;
    };
  }

  function init() {
    seed();
    Object.values(store.threads).forEach(t => { if (!t.bookingId && !t.serverBookingId) t.demo = true; });
    saveChat();
    bindStatic();
    renderChat();
    updateBadge();
    const note = $("chatDemoNote");
    if (note) note.textContent = sb() && uid() ? "Messages sync with your TandagFix account." : "Demo inbox — conversations are saved on this device.";
    setTimeout(startServerSync, 2500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();


})();
