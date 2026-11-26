/* TandagFix v2 features: reviews, cancel/reschedule, availability, favorites, barangay filter,
   urgent jobs, job photos, receipts + commission ledger, chat, server sync, ID upload, Bisaya, PWA. */
(() => {
const $ = id => document.getElementById(id);
const L = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const S = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("Storage is full — remove old bookings or photos."); } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sb = () => window.tandagfixClient || null;
const uid = () => account?.userId || null;
const isStaff = () => ["provider", "admin"].includes(account?.role);
let favs = L("tfFavs", []), reviews = L("tfReviews", []), dayoff = L("tfDayoff", {}), chats = L("tfChats", {});
let favOnly = false, pendingPhotos = [], pendingUrgent = false, uuidCache = {};
const BARANGAYS = ["Bagong Lungsod", "Awasian", "Telaje", "Mabua", "Bongtud", "Dagocdoc", "Pandanon", "Quezon"]; // sample assignment; edit to your real list
providers.forEach(p => { p.barangay = p.barangay || BARANGAYS[p.id % BARANGAYS.length]; });
const applyReview = r => { const p = providers.find(x => x.id === r.pid); if (p) { p.rating = (p.rating * p.reviews + r.rating) / (p.reviews + 1); p.reviews++; } };
reviews.forEach(applyReview);

/* ---------- server sync (bookings) ---------- */
const row = b => ({ customer_id: uid(), local_id: b.id, provider_sample_id: String(b.providerId), provider_name: b.providerName, service_category: b.category, service_price: b.price, platform_fee: b.platformFee || 0, status: b.status, service_date: b.date, service_time: b.time, service_address: b.address, job_description: b.description, payment_method: b.paymentMethod || "Cash", urgent: !!b.urgent, payment_status: b.paymentStatus || "Unpaid", receipt_path: b.receiptPath || null });
async function push(b, insert) {
  if (!sb() || !uid()) return;
  const q = insert ? sb().from("bookings").insert(row(b)) : sb().from("bookings").update({ status: b.status, service_date: b.date, service_time: b.time, payment_status: b.paymentStatus || "Unpaid", receipt_path: b.receiptPath || null }).eq("local_id", b.id);
  const { error } = await q; if (error) console.warn("sync", error.message);
}
async function pull() {
  if (!sb() || !uid()) return;
  const { data, error } = await sb().from("bookings").select("*").order("created_at", { ascending: false });
  if (error || !data) return;
  data.forEach(r => {
    const i = bookings.findIndex(b => b.id === Number(r.local_id));
    const m = { id: Number(r.local_id), providerId: Number(r.provider_sample_id), providerName: r.provider_name, category: r.service_category, price: Number(r.service_price), platformFee: Number(r.platform_fee), providerEarnings: Number(r.service_price) - Number(r.platform_fee), paymentMethod: r.payment_method, date: r.service_date, time: r.service_time, address: r.service_address, description: r.job_description, status: r.status, urgent: r.urgent, paymentStatus: r.payment_status, receiptPath: r.receipt_path, customerId: r.customer_id, rating: null };
    if (i < 0) bookings.push(m); else bookings[i] = { ...bookings[i], ...m, rating: bookings[i].rating, photos: bookings[i].photos, receipt: bookings[i].receipt };
  });
  persist(); if (!$("bookingsView").classList.contains("hidden")) renderBookings(); if (!$("providerView").classList.contains("hidden")) { renderProviderRequests(); renderEarnings(); }
}
setInterval(pull, 20000); setTimeout(pull, 2500);
const bookingUuid = async id => { if (uuidCache[id]) return uuidCache[id]; const { data } = await sb().from("bookings").select("id").eq("local_id", id).maybeSingle(); return (uuidCache[id] = data?.id || null); };

/* ---------- urgent + photos + slots at booking time ---------- */
const form = $("bookingForm");
$("jobDescription").closest(".field").insertAdjacentHTML("afterend", `<div class="field"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="urgent" style="width:auto"> 🚨 Urgent — I need help as soon as possible</label></div><div class="field"><label for="jobPhotos">Photos of the problem (optional, up to 3)</label><input id="jobPhotos" type="file" accept="image/*" multiple><div id="photoPreview" class="muted"></div></div>`);
function shrink(file, max = 640) { return new Promise(res => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", .6)); }; img.onerror = () => res(null); img.src = u; }); }
$("jobPhotos").onchange = async e => { pendingPhotos = (await Promise.all([...e.target.files].slice(0, 3).map(f => shrink(f)))).filter(Boolean); $("photoPreview").textContent = pendingPhotos.length ? `${pendingPhotos.length} photo(s) ready` : ""; };
form.addEventListener("submit", () => { pendingUrgent = $("urgent").checked; }, true);
form.addEventListener("submit", () => {
  const b = bookings[0]; if (!b) return;
  b.urgent = pendingUrgent; b.photos = pendingPhotos; b.paymentStatus = "Unpaid"; b.chatName = account?.name || "Customer"; b.customerId = uid();
  pendingPhotos = []; $("photoPreview").textContent = ""; persist(); push(b, true);
  if (b.urgent) addNotification(`🚨 Urgent request sent to ${b.providerName}.`);
});
async function refreshSlots() {
  const sel = $("bookingTime"), d = $("bookingDate").value; if (!currentProvider) return;
  const pid = currentProvider.id; let off = (dayoff[pid] || []).includes(d);
  let taken = bookings.filter(b => b.providerId === pid && b.date === d && !["Cancelled", "Declined"].includes(b.status)).map(b => b.time);
  if (sb() && d) { try { const r = await sb().rpc("booked_slots", { p_provider: String(pid), p_day: d }); (r.data || []).forEach(t => taken.push(t)); const a = await sb().from("availability").select("day_off").eq("provider_sample_id", String(pid)).eq("day_off", d); if (a.data?.length) off = true; } catch (e) {} }
  [...sel.options].forEach(o => { if (!o.value) return; o.dataset.l = o.dataset.l || o.textContent.trim(); const t = taken.includes(o.value); o.disabled = off || t; o.textContent = o.dataset.l + (off ? " — provider day off" : t ? " — already booked" : ""); });
  if (sel.selectedOptions[0]?.disabled) sel.value = "";
}
$("bookingDate").addEventListener("change", refreshSlots);
const _sb = startBooking; startBooking = function (id) { _sb(id); refreshSlots(); };

/* ---------- booking cards: status, cancel, reschedule, review, receipt, chat ---------- */
const slotOptions = () => [...$("bookingTime").options].filter(o => o.value).map(o => `<option>${esc(o.value)}</option>`).join("");
const today = () => new Date().toISOString().slice(0, 10);
function bookingCard(b) {
  const dead = ["Cancelled", "Declined"].includes(b.status), open = ["Requested", "Accepted"].includes(b.status);
  const steps = dead ? "" : `<div class="steps">${statuses.map((s, i) => `<div class="step ${i <= statusIndex(b.status) ? "done" : ""}">${s}</div>`).join("")}</div>`;
  const review = b.status !== "Completed" ? "" : b.rating ? `<p>⭐ Your review: ${b.rating}/5${b.comment ? " — " + esc(b.comment) : ""}</p>` : `<div class="field"><label for="rating-${b.id}">Rate this service</label><select id="rating-${b.id}"><option value="">Choose rating</option><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Okay</option><option value="2">2 — Poor</option><option value="1">1 — Very poor</option></select><textarea id="comment-${b.id}" maxlength="500" placeholder="Tell others about your experience (optional)"></textarea><button class="secondary" onclick="saveRating(${b.id})">Submit review</button></div>`;
  const pay = b.paymentMethod && b.paymentMethod !== "Cash" && b.paymentStatus !== "Paid" && !dead ? `<div class="field"><label>${esc(b.paymentMethod)} receipt — ${esc(b.paymentStatus || "Unpaid")}</label><input type="file" accept="image/*" onchange="TF.receipt(${b.id},this.files[0])"></div>` : `<p class="muted">Payment: ${esc(b.paymentMethod || "Cash")} · ${esc(b.paymentStatus || "Unpaid")}</p>`;
  return `<article class="provider"><div class="provider-top"><div class="avatar">🛠️</div><div><h3>${esc(b.providerName)}</h3><p>${esc(b.category)}</p><span class="pill">${esc(b.status)}</span>${b.urgent ? ' <span class="pill">🚨 Urgent</span>' : ""}</div></div>
<p style="margin-top:13px"><strong>${esc(b.date)}</strong> · ${esc(b.time)}</p><p>${esc(b.address)}</p><p class="muted">${esc(b.description)}</p>
${(b.photos || []).map(p => `<img src="${p}" alt="Job photo" style="width:64px;height:64px;object-fit:cover;border-radius:8px;margin:2px">`).join("")}${steps}${review}${pay}
${open ? `<details><summary>Reschedule</summary><input type="date" id="rd-${b.id}" min="${today()}"><select id="rt-${b.id}">${slotOptions()}</select><button class="secondary" onclick="TF.resched(${b.id})">Save new time</button></details><button class="secondary" onclick="TF.cancel(${b.id})">Cancel booking</button>` : ""}
<button class="secondary tf-msg-btn" onclick="TFChat.openBooking(${b.id})">💬 Message provider${window.TFChat ? TFChat.badgeForBooking(b.id) : ""}</button>
${["Completed", "Cancelled", "Declined"].includes(b.status) ? `<button class="ghost" onclick="startBooking(${b.providerId})">Book again</button>` : ""}<button class="ghost" onclick="removeBooking(${b.id})">Remove from list</button></article>`;
}
renderBookings = function () {
  const mine = bookings.filter(b => !uid() || !b.customerId || b.customerId === uid());
  $("bookingList").innerHTML = mine.length ? mine.map(bookingCard).join("") : '<div class="panel empty" style="grid-column:1/-1"><div style="font-size:34px">🗓️</div><h3>No bookings yet</h3><p>Choose a service provider and send your first request.</p><button onclick="goHome()">Find a provider</button></div>';
};
const upd = (id, f) => { const b = bookings.find(x => x.id === id); if (!b) return; f(b); persist(); push(b); return b; };
window.saveRating = async id => {
  const v = Number($("rating-" + id)?.value); if (!v) return toast("Please choose a rating first.");
  const c = ($("comment-" + id)?.value || "").trim(), b = upd(id, b => { b.rating = v; b.comment = c; });
  const r = { pid: b.providerId, bid: id, rating: v, comment: c, name: account?.name || "Customer", date: today() };
  reviews.push(r); S("tfReviews", reviews); applyReview(r); renderProviders(); renderBookings(); toast("Thank you for your review!");
  if (sb() && uid()) { const u = await bookingUuid(id); if (u) await sb().from("reviews").insert({ booking_id: u, customer_id: uid(), provider_sample_id: String(b.providerId), customer_name: r.name, rating: v, comment: c }); }
};
const T = window.TF = {
  cancel(id) { if (!confirm("Cancel this booking?")) return; const b = upd(id, b => { b.status = "Cancelled"; }); addNotification(`Booking with ${b.providerName} was cancelled.`); renderBookings(); toast("Booking cancelled."); },
  resched(id) { const d = $("rd-" + id).value, t = $("rt-" + id).value; if (!d || !t) return toast("Pick a new date and time."); if ((dayoff[bookings.find(b => b.id === id).providerId] || []).includes(d)) return toast("That provider is off on that day."); const b = upd(id, b => { b.date = d; b.time = t; b.status = "Requested"; }); addNotification(`Reschedule requested with ${b.providerName}: ${d}, ${t}.`); renderBookings(); toast("New time sent to the provider."); },
  async receipt(id, file) {
    if (!file) return; const data = await shrink(file, 900); if (!data) return toast("Could not read that image.");
    let path = null; if (sb() && uid()) { path = `${uid()}/${id}.jpg`; const { error } = await sb().storage.from("receipts").upload(path, await (await fetch(data)).blob(), { upsert: true, contentType: "image/jpeg" }); if (error) { path = null; console.warn(error.message); } }
    upd(id, b => { b.receipt = data; b.receiptPath = path; b.paymentStatus = "Receipt uploaded"; }); addNotification("Payment receipt uploaded. Waiting for the provider to confirm."); renderBookings(); toast("Receipt sent.");
  },
  confirmPay(id) { upd(id, b => { b.paymentStatus = "Paid"; }); addNotification("Payment confirmed by provider."); renderProviderRequests(); renderEarnings(); },
  async viewReceipt(id) { const b = bookings.find(x => x.id === id); if (b?.receipt) { const w = window.open(); w.document.write(`<img src="${b.receipt}" style="max-width:100%">`); } else if (b?.receiptPath && sb()) { const { data } = await sb().storage.from("receipts").createSignedUrl(b.receiptPath, 60); if (data) window.open(data.signedUrl); } },
  async chat(id) { if (window.TFChat) TFChat.openBooking(id); },
  async send() { if (window.TFChat) TFChat.focusComposer(); },
  async dayOff(add, pid, d) {
    pid = Number(pid || $("availProvider").value); d = d || $("availDate").value; if (!d) return toast("Choose a date.");
    const a = dayoff[pid] = (dayoff[pid] || []).filter(x => x !== d); if (add) a.push(d); S("tfDayoff", dayoff); renderAvail();
    if (sb() && uid()) { const q = sb().from("availability"); const { error } = add ? await q.insert({ provider_sample_id: String(pid), day_off: d }) : await q.delete().eq("provider_sample_id", String(pid)).eq("day_off", d); if (error) console.warn(error.message); }
  },
  fav(id) { favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id]; S("tfFavs", favs); renderProviders(); },
  async settle() { bookings.forEach(b => { if (b.status === "Completed" && b.paymentStatus === "Paid") b.settled = true; }); persist(); renderEarnings(); toast("Commission marked as settled."); }
};

/* ---------- provider dashboard: requests (urgent first), availability, ledger ---------- */
renderProviderRequests = function () {
  const list = [...bookings].sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
  $("providerRequests").innerHTML = list.length ? list.map(b => `<article class="provider"><div class="provider-top"><div class="avatar">📋</div><div><h3>${esc(b.category)} request</h3><p>Provider: ${esc(b.providerName)}</p><span class="pill">${esc(b.status)}</span>${b.urgent ? ' <span class="pill">🚨 Urgent</span>' : ""}</div></div><p><strong>Date:</strong> ${esc(b.date)} · ${esc(b.time)}</p><p><strong>Address:</strong> ${esc(b.address)}</p><p>${esc(b.description)}</p>${(b.photos || []).map(p => `<img src="${p}" alt="Job photo" style="width:64px;height:64px;object-fit:cover;border-radius:8px;margin:2px">`).join("")}<p class="muted">Payment: ${esc(b.paymentMethod || "Cash")} · ${esc(b.paymentStatus || "Unpaid")}</p><div class="actions" style="flex-wrap:wrap;margin-top:12px">${b.status === "Requested" ? `<button onclick="updateStatus(${b.id},'Accepted')">Accept</button><button class="secondary" onclick="updateStatus(${b.id},'Declined')">Decline</button>` : ""}${b.status === "Accepted" ? `<button onclick="updateStatus(${b.id},'On the Way')">On the way</button>` : ""}${b.status === "On the Way" ? `<button onclick="updateStatus(${b.id},'Completed')">Mark completed</button>` : ""}<button class="secondary tf-msg-btn" onclick="TFChat.openBooking(${b.id})">💬 Message homeowner${window.TFChat ? TFChat.badgeForBooking(b.id) : ""}</button>${b.receipt || b.receiptPath ? `<button class="secondary" onclick="TF.viewReceipt(${b.id})">View receipt</button>` : ""}${b.paymentStatus !== "Paid" && !["Cancelled", "Declined"].includes(b.status) ? `<button class="secondary" onclick="TF.confirmPay(${b.id})">Confirm payment received</button>` : ""}</div></article>`).join("") : '<div class="panel empty" style="grid-column:1/-1">No incoming requests yet.</div>';
  renderAvail();
};
const _us = updateStatus; updateStatus = function (id, s) { _us(id, s); const b = bookings.find(x => x.id === id); if (b) push(b); };
function renderAvail() {
  let box = $("availBox"); if (!box) { $("providerRequests").insertAdjacentHTML("beforebegin", '<div class="panel" id="availBox" style="margin-bottom:16px"></div>'); box = $("availBox"); }
  const sel = $("availProvider")?.value || (providers.find(p => p.name === account?.name) || providers[0]).id;
  box.innerHTML = `<h3>My availability (days off)</h3><p class="muted">Customers cannot book you on these dates, and booked time slots are hidden automatically.</p><div class="filters"><select id="availProvider" aria-label="Provider listing">${providers.map(p => `<option value="${p.id}" ${p.id == sel ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select><input type="date" id="availDate" min="${today()}"><button onclick="TF.dayOff(true)">Add day off</button></div><p>${(dayoff[sel] || []).sort().map(d => `<span class="pill">${d} <a href="#" onclick="TF.dayOff(false,${sel},'${d}');return false">✕</a></span>`).join(" ") || '<span class="muted">No days off set.</span>'}</p>`;
  $("availProvider").onchange = renderAvail;
}
const _re = renderEarnings; renderEarnings = function () {
  _re(); const due = bookings.filter(b => b.status === "Completed" && b.paymentStatus === "Paid" && !b.settled).reduce((s, b) => s + (b.platformFee || 0), 0);
  $("providerEarnings").insertAdjacentHTML("beforeend", `<p><strong>Commission owed to TandagFix (paid jobs, unsettled): ₱${due.toFixed(2)}</strong> ${account?.role === "admin" ? '<button class="secondary" onclick="TF.settle()">Mark settled</button>' : ""}</p>`);
};

/* ---------- provider profile reviews ---------- */
const _op = openProfile; openProfile = async function (id) {
  _op(id); const p = providers.find(x => x.id === id); let list = reviews.filter(r => r.pid === id);
  if (sb()) { const { data } = await sb().from("reviews").select("rating,comment,customer_name,created_at").eq("provider_sample_id", String(id)).order("created_at", { ascending: false }).limit(10); if (data) list = [...data.map(r => ({ rating: r.rating, comment: r.comment, name: r.customer_name, date: r.created_at.slice(0, 10) })), ...list.filter(l => !data.some(d => d.comment === l.comment && d.rating === l.rating))]; }
  const html = `<h3>Recent reviews (${p.reviews})</h3>` + (list.length ? list.slice(0, 10).map(r => `<p>⭐ ${r.rating} — ${esc(r.comment || "No comment")} <span class="muted">· ${esc(r.name)}, ${esc(r.date)}</span></p>`).join("") : '<p class="muted">No written reviews yet.</p>');
  $("profileContent").querySelector(".panel").insertAdjacentHTML("beforeend", `<div id="liveReviews">${html}</div>`);
};

/* ---------- discovery: favorites + barangay filter + card extras ---------- */
$("sortFilter").insertAdjacentHTML("afterend", `<select id="barangayFilter" aria-label="Filter by barangay"><option value="">All barangays</option>${BARANGAYS.map(b => `<option>${b}</option>`).join("")}</select><button type="button" class="secondary" id="favToggle">♡ Favorites only</button>`);
$("barangayFilter").onchange = () => renderProviders();
$("favToggle").onclick = () => { favOnly = !favOnly; $("favToggle").textContent = favOnly ? "♥ Favorites only" : "♡ Favorites only"; renderProviders(); };
const _fp = filteredProviders; filteredProviders = () => _fp().filter(p => (!$("barangayFilter").value || p.barangay === $("barangayFilter").value) && (!favOnly || favs.includes(p.id)));
const _rp = renderProviders; renderProviders = function () {
  _rp(); document.querySelectorAll("#providerList .compare-check").forEach(c => {
    const id = Number(c.dataset.provider), p = providers.find(x => x.id === id), card = c.closest("article");
    card.querySelector(".provider-top").insertAdjacentHTML("beforeend", `<button class="ghost" style="margin-left:auto" aria-label="Save to favorites" onclick="TF.fav(${id})">${favs.includes(id) ? "♥" : "♡"}</button>`);
    card.querySelector(".muted").insertAdjacentHTML("afterend", `<p class="muted">📍 ${esc(p.barangay)}</p>`);
  });
};

/* ---------- real ID upload (private bucket) + admin review ---------- */
const vf = $("verificationFile"), nvf = vf.cloneNode(true); vf.replaceWith(nvf);
document.querySelectorAll("#accountView p.muted").forEach(p => { if (p.textContent.includes("stays in this browser")) p.textContent = "Upload an ID image/PDF. When you are signed in, it is stored privately and only you and TandagFix admins can open it."; });
nvf.addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 5e6) return toast("File is too large (max 5 MB).");
  if (!sb() || !uid()) { toast("Sign in with a provider account first to upload your ID."); e.target.value = ""; return; }
  const path = `${uid()}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
  const up = await sb().storage.from("id-documents").upload(path, f, { contentType: f.type });
  if (up.error) return toast("Upload failed: " + up.error.message);
  const ins = await sb().from("id_verifications").insert({ user_id: uid(), full_name: account?.name || "", file_path: path });
  if (ins.error) return toast("Could not record upload: " + ins.error.message);
  $("verificationStatus").textContent = `Verification status: Pending review — ${f.name}`; addNotification("ID submitted. An admin will review it."); toast("ID uploaded securely.");
});
const _ra = renderAdmin; renderAdmin = async function () {
  _ra(); if (!sb() || account?.role !== "admin") return;
  const { data } = await sb().from("id_verifications").select("*").order("created_at", { ascending: false });
  if (data) $("adminVerificationRequests").innerHTML = data.length ? data.map(r => `<article class="provider"><h3>${esc(r.full_name || "Provider")}</h3><span class="tag">${r.status}</span><div class="actions"><button class="secondary" onclick="TF.viewId('${r.file_path}')">View ID</button><button onclick="TF.review('${r.id}','Approved')">Approve</button><button class="secondary" onclick="TF.review('${r.id}','Rejected')">Reject</button></div></article>`).join("") : '<p class="muted">No uploaded ID documents yet.</p>';
};
T.viewId = async p => { const { data } = await sb().storage.from("id-documents").createSignedUrl(p, 60); if (data) window.open(data.signedUrl); };
T.review = async (id, s) => { const { error } = await sb().from("id_verifications").update({ status: s }).eq("id", id); if (error) return toast(error.message); toast("Marked " + s.toLowerCase() + "."); renderAdmin(); };

/* ---------- Bisaya toggle ---------- */
const CEB = { "Home": "Panimalay", "My Bookings": "Akong mga Booking", "Provider Dashboard": "Dashboard sa Tigserbisyo", "Alerts": "Mga Pahibalo", "Account": "Akawnt", "Admin": "Admin", "Find a service ↓": "Pangita og serbisyo ↓", "What do you need help with?": "Unsa imong gikinahanglan nga tabang?", "Local service providers": "Mga lokal nga tigserbisyo", "Home repairs, made easier.": "Mas sayon na ang pag-ayo sa balay.", "My bookings": "Akong mga booking", "Book": "I-book", "View profile": "Tan-awa ang profile", "Add to compare": "Idugang sa pagtandi", "Available today": "Anaa karon", "Schedule needed": "Kinahanglan og iskedyul", "Describe the job": "Ihulagway ang trabaho", "Book a service": "Mag-book og serbisyo", "Notifications": "Mga pahibalo" };
let lang = localStorage.getItem("tfLang") || "en", busy = false; const orig = new WeakMap();
function translate() {
  if (busy) return; busy = true; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const t = n.nodeValue.trim(); if (!t || n.parentElement.closest("script,style")) continue; if (lang === "ceb" && CEB[t]) { orig.set(n, n.nodeValue); n.nodeValue = n.nodeValue.replace(t, CEB[t]); } else if (lang === "en" && orig.has(n)) { n.nodeValue = orig.get(n); orig.delete(n); } }
  busy = false;
}
$("themeToggle").insertAdjacentHTML("afterend", '<button class="secondary" id="langToggle" aria-label="Change language"></button>');
const setLang = l => { lang = l; localStorage.setItem("tfLang", l); $("langToggle").textContent = l === "ceb" ? "🌐 English" : "🌐 Bisaya"; translate(); };
$("langToggle").onclick = () => setLang(lang === "ceb" ? "en" : "ceb"); setLang(lang);
new MutationObserver(() => { if (lang === "ceb") translate(); }).observe(document.body, { childList: true, subtree: true });

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
renderBookings(); renderProviders();
})();
