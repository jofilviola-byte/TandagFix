const categories=[["Electrician","⚡"],["Carpenter","🪚"],["Plumber","🚰"],["Painter","🖌️"],["Cleaner","🧹"],["Appliance Technician","🔧"]];
const providers=[
{
    id:1,name:"Juan Dela Cruz",category:"Electrician",rating:4.9,reviews:120,price:350,available:true,emoji:"👷",verified:true,years:5,about:"Licensed electrician with 5+ years of experience in home installations, lighting, and electrical repairs.",services:"Outlet repair, wiring check, light installation",work:"Sample work: home lighting and outlet repair"
}
,
{
    id:2,name:"Rico Santos",category:"Plumber",rating:4.8,reviews:95,price:300,available:true,emoji:"🧑‍🔧",verified:true,years:4,about:"Friendly local plumber for leaks, clogged drains, and basic bathroom or kitchen plumbing.",services:"Leak repair, faucet replacement, drain unclogging",work:"Sample work: sink and pipe repairs"
}
,
{
    id:3,name:"Maria Reyes",category:"Cleaner",rating:4.7,reviews:78,price:250,available:true,emoji:"👩‍🔧",verified:true,years:3,about:"Home cleaner offering regular cleaning and move-in or move-out cleaning services.",services:"General cleaning, kitchen cleaning, deep cleaning",work:"Sample work: tidy kitchen and living areas"
}
,
{
    id:4,name:"Paolo Mendoza",category:"Carpenter",rating:4.6,reviews:53,price:500,available:false,emoji:"🧑‍🏭",verified:false,years:6,about:"Carpentry and small home repair services, including shelves, doors, and furniture fixes.",services:"Door repair, shelf installation, furniture repair",work:"Sample work: shelf and cabinet repairs"
}
,
{
    id:5,name:"Liza Flores",category:"Painter",rating:4.8,reviews:61,price:450,available:true,emoji:"👩‍🎨",verified:true,years:4,about:"Interior and exterior painting for rooms, gates, and small home projects.",services:"Room painting, wall touch-ups, gate painting",work:"Sample work: room repainting"
}
,
{
    id:6,name:"Noel Garcia",category:"Appliance Technician",rating:4.5,reviews:42,price:400,available:true,emoji:"🧑‍🔧",verified:true,years:5,about:"Basic troubleshooting and repair for common household appliances. Ask about your appliance before booking.",services:"Fan repair, washing machine check, small appliance troubleshooting",work:"Sample work: appliance diagnostics"
}
];
let selectedCategory="",currentProvider=null;
let bookings=JSON.parse(localStorage.getItem("tandagfixBookings")||"[]");
let account=JSON.parse(localStorage.getItem("tandagfixAccount")||"null");
const $=id=>document.getElementById(id);
function persist() {
    localStorage.setItem("tandagfixBookings",JSON.stringify(bookings))
}
function toast(msg) {
    $("toast").textContent=msg;
    $("toast").classList.remove("hidden");
    setTimeout(()=>$("toast").classList.add("hidden"),2800)
}
function go(view) {
    const roleNow = account?.role || "guest";
    if(view === "provider" && !["provider","admin"].includes(roleNow)){ toast("Sign in with a provider or admin account to access this dashboard."); view="account"; }
    if(view === "admin" && roleNow !== "admin"){ toast("Admin access is restricted to authorized admin accounts."); view="account"; }
    ["home","bookings","provider","account","profile","bookingForm"].forEach(v=>$(v+"View").classList.toggle("hidden",v!==view));
    document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    window.scrollTo( {
        top:0,behavior:"smooth"
    }
    );
    if(view==="bookings")renderBookings();
    if(view==="provider")renderProviderRequests()
}
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>go(b.dataset.view));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
$("themeToggle").onclick=()=> {
    document.body.classList.toggle("dark");
    const dark=document.body.classList.contains("dark");
    $("themeToggle").textContent=dark?"☀ Light mode":"☾ Dark mode";
    localStorage.setItem("tandagfixTheme",dark?"dark":"light")
}
;
if(localStorage.getItem("tandagfixTheme")==="dark") {
    document.body.classList.add("dark");
    $("themeToggle").textContent="☀ Light mode"
}
$("browseBtn").onclick=()=>$("categories").scrollIntoView( {
    behavior:"smooth",block:"center"
}
);
function renderCategories() {
    const filter = $("categoryFilter");
    // Keep the current dropdown selection when category buttons are re-rendered.
    const currentValue = filter.value;
    $("categories").innerHTML=categories.map(([name,emoji])=>`<button type="button" class="category ${selectedCategory===name?"selected":""}" data-cat="${name}"><span class="emoji">${emoji}</span><strong>${name}</strong></button>`).join("");
    document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=> {
        selectedCategory=selectedCategory===b.dataset.cat?"":b.dataset.cat;
        filter.value=selectedCategory;
        renderCategories();
        renderProviders();
    });
    if (!filter.dataset.optionsReady) {
        filter.innerHTML='<option value="">All categories</option>'+categories.map(([n])=>`<option value="${n}">${n}</option>`).join("");
        filter.dataset.optionsReady="true";
    }
    // Reapply the active category after the options have been initialized.
    if (categories.some(([name])=>name===selectedCategory) || selectedCategory==="") filter.value=selectedCategory;
    else filter.value=currentValue;
}
function filteredProviders() {
    let list=providers.filter(p=>(!$("categoryFilter").value||p.category===$("categoryFilter").value)&&p.rating>=Number($("ratingFilter").value)&&(! $("searchInput").value||(`${p.name} ${p.category} ${p.services}`).toLowerCase().includes($("searchInput").value.toLowerCase())));
    let sort=$("sortFilter").value;
    list.sort((a,b)=>sort==="price"?a.price-b.price:sort==="name"?a.name.localeCompare(b.name):b.rating-a.rating);
    return list
}
function providerCard(p) {
    return `<article class="provider"><div class="provider-top"><div class="avatar avatar-blank" aria-label="Provider profile photo placeholder"><span class="silhouette-head"></span><span class="silhouette-body"></span></div><div><h3>${p.name}</h3><p>${p.category}</p><p>⭐ ${p.rating.toFixed(1)} (${p.reviews} reviews)</p></div></div><span class="tag" style="${p.available?"":"background:#fff0d6;color:#8a5b00"}">${p.available?"Available today":"Schedule needed"}</span><div class="details"><span>From <strong>₱${p.price}</strong></span><span>${p.verified?"✓ Verified":"New provider"}</span></div><div class="actions"><button class="secondary" onclick="openProfile(${p.id})">View profile</button><button onclick="startBooking(${p.id})">Book</button></div></article>`
}
function renderProviders() {
    let list=filteredProviders();
    $("providerList").innerHTML=list.length?list.map(providerCard).join(""):'<div class="empty" style="grid-column:1/-1">No providers match. Try another category or search.</div>';
    $("resultCount").textContent=`${list.length} provider${list.length===1?"":"s"} · sample demo data`
}
["searchInput","categoryFilter","ratingFilter","sortFilter"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",()=> {
    selectedCategory=$("categoryFilter").value;renderCategories();renderProviders()
}
));
function openProfile(id) {
    currentProvider=providers.find(p=>p.id===id);
    $("profileTitle").textContent=currentProvider.name+"'s profile";
    $("profileContent").innerHTML=`<div class="panel"><div class="provider-top"><div class="avatar avatar-blank profile-avatar" aria-label="Provider profile photo placeholder"><span class="silhouette-head"></span><span class="silhouette-body"></span></div><div><h2 style="margin:0">${currentProvider.name}</h2><p class="muted">${currentProvider.category} · ⭐ ${currentProvider.rating} (${currentProvider.reviews} reviews)</p><span class="tag">${currentProvider.verified?"✓ Verified provider":"Provider profile"}</span></div></div><div class="two-col" style="margin-top:20px"><div><h3>About</h3><p>${currentProvider.about}</p><h3>Services offered</h3><p>${currentProvider.services}</p></div><div><h3>Rates & availability</h3><p><strong>Starting rate: ₱${currentProvider.price}</strong></p><p>${currentProvider.available?"Available today (sample status)":"Availability must be confirmed"}</p><h3>Work photos</h3><p class="muted">Work samples can be added by the provider in the full app.</p><h3>Customer reviews</h3><p>⭐ ${currentProvider.rating} average rating from ${currentProvider.reviews} sample reviews.</p></div></div><div class="profile-actions"><button onclick="startBooking(${currentProvider.id})">Book this provider</button><button class="secondary" onclick="go('home')">Back to search</button></div></div>`;
    go("profile")
}
function startBooking(id) {
    currentProvider=providers.find(p=>p.id===id);
    $("bookingProviderInfo").innerHTML=`<div class="provider-top"><div class="avatar avatar-blank"><span class="silhouette-head"></span><span class="silhouette-body"></span></div><div><h3>${currentProvider.name}</h3><p>${currentProvider.category} · ⭐ ${currentProvider.rating}</p></div></div><div class="notice"><strong>Starting rate: ₱${currentProvider.price}</strong><br><span class="muted">Final price should be agreed with the provider before work begins.</span></div><p>${currentProvider.about}</p>`;
    $("bookingDate").min=new Date().toISOString().slice(0,10);
    go("bookingForm")
}
$("bookingForm").onsubmit=e=> {
    e.preventDefault();
    if(!currentProvider)return;
    let b= {
        id:Date.now(),providerId:currentProvider.id,providerName:currentProvider.name,category:currentProvider.category,price:currentProvider.price,date:$("bookingDate").value,time:$("bookingTime").value,address:$("address").value,description:$("jobDescription").value,status:"Requested",rating:null
    }
    ;
    bookings.unshift(b);
    persist();
    $("bookingForm").reset();
    toast("Booking request sent! You can track it in My Bookings.");
    go("bookings")
}
;
const statuses=["Requested","Accepted","On the Way","Completed"];
function statusIndex(s) {
    return statuses.indexOf(s)
}
function goHome() {
    go("home")
}
function renderBookings() {
    let el=$("bookingList");
    if(!bookings.length) {
        el.innerHTML='<div class="panel empty" style="grid-column:1/-1"><div style="font-size:34px">🗓️</div><h3>No bookings yet</h3><p>Choose a service provider and send your first request.</p><button onclick="goHome()">Find a provider</button></div>';
        return
    }
    el.innerHTML=bookings.map(b=>`<article class="provider" style="grid-column:span 1"><div class="provider-top"><div class="avatar">🛠️</div><div><h3>${b.providerName}</h3><p>${b.category}</p><span class="pill">${b.status}</span></div></div><p style="margin-top:13px"><strong>${b.date}</strong> · ${b.time}</p><p>${b.address}</p><p class="muted">${b.description}</p><div class="steps">${statuses.map((s,i)=>`<div class="step ${i<=statusIndex(b.status)?"done":""}">$ {
        s
    }
    </div>`).join("")}</div>${b.status==="Completed"?(b.rating?`<p>⭐ Your rating: $ {
        b.rating
    }
    /5</p>`:`<div class="field"><label for="rating-${b.id}">Rate completed service</label><select id="rating-${b.id}"><option value="">Choose rating</option><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Okay</option><option value="2">2 — Poor</option><option value="1">1 — Very poor</option></select><button class="secondary" onclick="saveRating(${b.id})">Submit rating</button></div>`):""}<button class="ghost" onclick="toast('Demo: contact details would be provided in the full app.')">Contact provider</button></article>`).join("")
}
function renderProviderRequests() {
    let el=$("providerRequests");
    if(!bookings.length) {
        el.innerHTML='<div class="panel empty" style="grid-column:1/-1">No incoming requests yet. Customer bookings will appear here.</div>';
        return
    }
    el.innerHTML=bookings.map(b=>`<article class="provider"><div class="provider-top"><div class="avatar">📋</div><div><h3>${b.category} request</h3><p>Provider: ${b.providerName}</p><span class="pill">${b.status}</span></div></div><p><strong>Date:</strong> ${b.date} · ${b.time}</p><p><strong>Address:</strong> ${b.address}</p><p>${b.description}</p><div class="actions" style="flex-wrap:wrap;margin-top:12px">${b.status==="Requested"?`<button onclick="updateStatus(${b.id},'Accepted')">Accept</button><button class="secondary" onclick="updateStatus(${b.id},'Declined')">Decline</button>`:""}${b.status==="Accepted"?`<button onclick="updateStatus(${b.id},'On the Way')">On the way</button>`:""}${b.status==="On the Way"?`<button onclick="updateStatus(${b.id},'Completed')">Mark completed</button>`:""}${b.status==="Declined"?'<span class="muted">Request declined</span>':""}</div></article>`).join("")
}
function updateStatus(id,status) {
    bookings=bookings.map(b=>b.id===id? {
        ...b,status
    }
    :b);
    persist();
    renderProviderRequests();
    toast("Booking status updated to "+status+".")
}
function saveRating(id) {
    let val=$("rating-"+id).value;
    if(!val) {
        toast("Please choose a rating first.");
        return
    }
    bookings=bookings.map(b=>b.id===id? {
        ...b,rating:Number(val)
    }
    :b);
    persist();
    renderBookings();
    toast("Thank you for your review!")
}
$("saveAccount").onclick=()=> {
    let name=$("fullName").value.trim(),email=$("email").value.trim(),role=$("role").value;
    if(!name||!email) {
        toast("Please enter your name and email.");
        return
    }
    account= {
        name,email,role
    }
    ;
    localStorage.setItem("tandagfixAccount",JSON.stringify(account));
    window.tandagfixIsAuthenticated = true;
    $("accountMessage").textContent=`Welcome, ${name}! Your demo role is set to ${role}. You can now book providers in this demo.`;
    $("accountMessage").classList.remove("hidden");
    toast("Account details saved on this device.")
}
;
if(account) {
    $("fullName").value=account.name||"";
    $("email").value=account.email||"";
    $("role").value=account.role||"customer"
}
/* Initial rendering is performed at the end, after prototype data is initialized. */

/* Remove a booking from My Bookings */
function removeBooking(id) {
    if(!confirm("Remove this booking from your list?"))return;
    bookings=bookings.filter(b=>b.id!==id);
    persist();
    renderBookings();
    if(typeof renderProviderRequests==="function")renderProviderRequests();
    toast("Booking removed.")
}
(function() {
    const original=renderBookings;
    renderBookings=function() {
        original();
        document.querySelectorAll("#bookingList article.provider").forEach((card,i)=>{
            if(!bookings[i])return;
            const btn=document.createElement("button");
            btn.className="ghost";
            btn.style.cssText="width:100%;margin-top:10px";
            btn.textContent="Remove booking";
            btn.onclick=()=>removeBooking(bookings[i].id);
            card.appendChild(btn)
        })
    }
})();

/* TandagFix prototype upgrades: comparison, checkout/commission, alerts, admin and verification */
const extraProviders = [
 [7,"Arnel Paredes","Electrician",4.7,38,320,true,"👨‍🔧",false,4,"Light fixtures, breaker checks, and outlet repair"],
 [8,"Cathy Villanueva","Cleaner",4.9,44,280,true,"🧹",true,3,"Deep cleaning, kitchens, and move-in cleaning"],
 [9,"Benjie Maturan","Carpenter",4.5,29,450,true,"🪚",false,7,"Cabinet repairs, doors, shelves, and furniture"],
 [10,"Ramon Ecleo","Plumber",4.6,33,280,false,"🚰",true,5,"Pipe leaks, faucet installation, and drain cleaning"],
 [11,"Jessa Lim","Painter",4.7,26,420,true,"🖌️",false,3,"Room repainting, wall touch-ups, and gates"],
 [12,"Mark Alvarado","Appliance Technician",4.8,51,380,true,"🔧",true,6,"Electric fans, rice cookers, and appliance checks"],
 [13,"Dino Caballes","Electrician",4.4,19,300,false,"⚡",false,2,"Basic wiring checks and lighting installation"],
 [14,"Nora Amante","Cleaner",4.6,31,240,true,"🧽",false,4,"Regular house cleaning and laundry-area cleaning"],
 [15,"Edgar Lanuza","Carpenter",4.8,47,550,true,"🪵",true,8,"Furniture repair, shelves, and door alignment"],
 [16,"Lito Sarmiento","Plumber",4.3,17,250,true,"🛠️",false,2,"Faucets, clogged drains, and minor leaks"],
 [17,"Mika Tan","Painter",4.9,36,480,false,"🎨",true,5,"Interior painting and careful finishing"],
 [18,"Joel Cabilin","Appliance Technician",4.6,24,350,true,"🔩",false,4,"Small appliance troubleshooting and repair"]
];
extraProviders.forEach(([id,name,category,rating,reviews,price,available,emoji,verified,years,services])=>providers.push({id,name,category,rating,reviews,price,available,emoji,verified,years,about:`Tandag-based sample ${category.toLowerCase()} offering home services. Confirm the final scope and price before work begins.`,services,work:"Sample portfolio item — replace with provider's real work photos."}));
let compareSelection = JSON.parse(localStorage.getItem("tandagfixCompare")||"[]");
let notifications = JSON.parse(localStorage.getItem("tandagfixNotifications")||"[]");
// Give the Alerts panel useful sample content on a fresh install.
if (notifications.length === 0) {
 notifications = [
  {id:101,message:"Welcome to TandagFix! Browse local home-service providers and compare their rates.",created:"Demo notification",read:false},
  {id:102,message:"Reminder: Confirm the final service price and schedule with your selected provider.",created:"Demo notification",read:false},
  {id:103,message:"TandagFix charges a sample 10% platform commission per booking. No real payment is taken.",created:"Demo notification",read:false}
 ];
 localStorage.setItem("tandagfixNotifications",JSON.stringify(notifications));
}
let verificationRequests = JSON.parse(localStorage.getItem("tandagfixVerification")||"[]");
function saveNotifications(){localStorage.setItem("tandagfixNotifications",JSON.stringify(notifications));}
function addNotification(message){notifications.unshift({id:Date.now()+Math.random(),message,created:new Date().toLocaleString(),read:false});saveNotifications();}
const originalGo=go;
go=function(view){
 const allViews=["home","bookings","provider","account","profile","bookingForm","admin","notifications"];
 allViews.forEach(v=>{const el=$(v+"View");if(el)el.classList.toggle("hidden",v!==view)});
 document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 window.scrollTo({top:0,behavior:"smooth"});
 if(view==="home")renderProviders(); if(view==="bookings")renderBookings(); if(view==="provider"){renderProviderRequests();renderEarnings();}
 if(view==="admin")renderAdmin(); if(view==="notifications")renderNotifications();
};
function providerCard(p){
 const checked=compareSelection.includes(p.id)?"checked":"";
 return `<article class="provider"><div class="provider-top"><div class="avatar avatar-blank" aria-label="Provider profile photo placeholder"><span class="silhouette-head"></span><span class="silhouette-body"></span></div><div><h3>${p.name}</h3><p>${p.category}</p><p>⭐ ${p.rating.toFixed(1)} (${p.reviews} reviews)</p></div></div><span class="tag" style="${p.available?"":"background:#fff0d6;color:#8a5b00"}">${p.available?"Available today":"Schedule needed"}</span><div class="details"><span>From <strong>₱${p.price}</strong></span><span>${p.verified?"✓ Verified":"New provider"}</span></div><p class="muted">${p.years||1}+ years experience · Tandag sample listing</p><label style="display:flex;align-items:center;gap:8px;margin:8px 0"><input type="checkbox" class="compare-check" data-provider="${p.id}" ${checked} style="width:auto"> Add to compare</label><div class="actions"><button class="secondary" onclick="openProfile(${p.id})">View profile</button><button onclick="startBooking(${p.id})">Book</button></div></article>`;
}
const baseRenderProviders=renderProviders;
renderProviders=function(){
 const list=filteredProviders();
 $("providerList").innerHTML=list.length?list.map(providerCard).join(""):'<div class="empty" style="grid-column:1/-1">No providers match. Try another category or search.</div>';
 $("resultCount").textContent=`${list.length} provider${list.length===1?"":"s"} · 18 sample Tandag providers`;
 document.querySelectorAll(".compare-check").forEach(c=>c.onchange=()=>{const id=Number(c.dataset.provider);compareSelection=c.checked?[...compareSelection.filter(x=>x!==id),id]:compareSelection.filter(x=>x!==id);if(compareSelection.length>3){compareSelection.shift();toast("Compare up to 3 providers at once.")}localStorage.setItem("tandagfixCompare",JSON.stringify(compareSelection));renderProviders();});
};
function renderCompare(){const chosen=compareSelection.map(id=>providers.find(p=>p.id===id)).filter(Boolean);$("compareResults").innerHTML=chosen.length?`<div class="panel" style="grid-column:1/-1;overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Provider</th>${chosen.map(p=>`<th align="left">${p.name}</th>`).join("")}</tr></thead><tbody>${[["Service",p=>p.category],["Starting price",p=>`₱${p.price}`],["Rating",p=>`⭐ ${p.rating} (${p.reviews})`],["Experience",p=>`${p.years||1}+ years`],["Verification",p=>p.verified?"Verified":"Pending / unverified"],["Availability",p=>p.available?"Available today":"Schedule needed"]].map(([label,fn])=>`<tr><th align="left" style="padding:8px;border-top:1px solid var(--line)">${label}</th>${chosen.map(p=>`<td style="padding:8px;border-top:1px solid var(--line)">${fn(p)}</td>`).join("")}</tr>`).join("")}</tbody></table><button class="ghost" onclick="compareSelection=[];localStorage.setItem('tandagfixCompare','[]');renderProviders();renderCompare()">Clear comparison</button></div>`:'<p class="muted" style="grid-column:1/-1">No providers selected yet.</p>';}
if($("compareBtn"))$("compareBtn").onclick=()=>{if(compareSelection.length<2){toast("Select at least 2 providers to compare.");return}if(compareSelection.length>3)compareSelection=compareSelection.slice(-3);renderCompare();$("compareResults").scrollIntoView({behavior:"smooth",block:"nearest"});};
const originalStartBooking=startBooking;
startBooking=function(id){originalStartBooking(id);const fee=Math.round(currentProvider.price*.10*100)/100;$("checkoutBreakdown").innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px"><span>Service estimate</span><strong>₱${currentProvider.price.toFixed(2)}</strong></div><div style="display:flex;justify-content:space-between;gap:10px"><span>TandagFix platform fee (10%)</span><strong>₱${fee.toFixed(2)}</strong></div><hr><div style="display:flex;justify-content:space-between;gap:10px"><strong>Estimated checkout total</strong><strong>₱${(currentProvider.price+fee).toFixed(2)}</strong></div><p class="muted" style="font-size:12px">The platform fee is a prototype illustration. Confirm actual pricing before service.</p>`;};
// Replace the booking handler so booking data records payment choice and commission math.
$("bookingForm").onsubmit=e=>{e.preventDefault();if(!currentProvider)return;const service=Number(currentProvider.price),fee=Math.round(service*.10*100)/100;const b={id:Date.now(),providerId:currentProvider.id,providerName:currentProvider.name,category:currentProvider.category,price:service,platformFee:fee,providerEarnings:service-fee,paymentMethod:$("paymentMethod").value,date:$("bookingDate").value,time:$("bookingTime").value,address:$("address").value,description:$("jobDescription").value,status:"Requested",rating:null};bookings.unshift(b);persist();addNotification(`Booking request sent to ${b.providerName} for ${b.date}.`);$("bookingForm").reset();toast("Booking request saved. Demo checkout only — no payment taken.");go("bookings");};
function renderEarnings(){const completed=bookings.filter(b=>b.status==="Completed");const gross=completed.reduce((s,b)=>s+(b.price||0),0);const commission=completed.reduce((s,b)=>s+(b.platformFee??(b.price||0)*.1),0);const net=gross-commission;$("providerEarnings").innerHTML=`<div class="provider-grid"><article class="provider"><p>Completed bookings</p><h2>${completed.length}</h2></article><article class="provider"><p>Service value</p><h2>₱${gross.toFixed(2)}</h2></article><article class="provider"><p>TandagFix commission (10%)</p><h2>₱${commission.toFixed(2)}</h2></article><article class="provider"><p>Provider earnings estimate</p><h2>₱${net.toFixed(2)}</h2></article></div><p class="muted">Illustrative only; no real payments are processed.</p>`;}
function renderNotifications(){const el=$("notificationList");el.innerHTML=notifications.length?notifications.map(n=>`<article class="provider"><strong>${n.message}</strong><p class="muted">${n.created}</p><span class="tag">${n.read?"Read":"New"}</span></article>`).join(""):'<div class="panel empty" style="grid-column:1/-1">No notifications yet. Booking and verification updates will appear here.</div>';notifications=notifications.map(n=>({...n,read:true}));saveNotifications();}
function renderAdmin(){const active=providers.filter(p=>p.verified).length;const completed=bookings.filter(b=>b.status==="Completed").length;const commission=bookings.filter(b=>b.status==="Completed").reduce((s,b)=>s+(b.platformFee??(b.price||0)*.1),0);$("adminMetrics").innerHTML=`<article class="provider"><p>Total bookings</p><h2>${bookings.length}</h2></article><article class="provider"><p>Active / verified sample providers</p><h2>${active}</h2></article><article class="provider"><p>Completed bookings</p><h2>${completed}</h2></article><article class="provider"><p>Commission earned (completed only)</p><h2>₱${commission.toFixed(2)}</h2></article>`;const pending=providers.filter(p=>!p.verified);$("adminProviders").innerHTML=pending.map(p=>`<article class="provider"><h3>${p.name}</h3><p>${p.category} · Sample provider</p><span class="tag">Verification pending</span><div class="actions"><button onclick="approveProvider(${p.id})">Approve</button><button class="secondary" onclick="rejectProvider(${p.id})">Reject</button></div></article>`).join("")||'<p class="muted">No sample providers are awaiting approval.</p>';const vr=$("adminVerificationRequests");if(vr)vr.innerHTML=verificationRequests.length?verificationRequests.map(r=>`<article class="provider"><h3>${r.name}</h3><p>File: ${r.fileName}</p><span class="tag">${r.status}</span><div class="actions"><button onclick="reviewVerification(${r.id},'Approved')">Approve upload</button><button class="secondary" onclick="reviewVerification(${r.id},'Rejected')">Reject upload</button></div></article>`).join(""):'<p class="muted">No uploaded ID documents yet.</p>';}
function reviewVerification(id,status){verificationRequests=verificationRequests.map(r=>r.id===id?{...r,status}:r);localStorage.setItem("tandagfixVerification",JSON.stringify(verificationRequests));const r=verificationRequests.find(x=>x.id===id);addNotification(`Admin ${status.toLowerCase()} identity verification for ${r?.name||"provider"}.`);renderAdmin();toast(`Verification ${status.toLowerCase()} in demo.`);}
function approveProvider(id){const p=providers.find(x=>x.id===id);if(!p)return;p.verified=true;addNotification(`Admin approved ${p.name}'s sample provider verification.`);renderAdmin();renderProviders();toast("Provider approved in this demo.");}
function rejectProvider(id){const p=providers.find(x=>x.id===id);if(!p)return;p.verified=false;addNotification(`Admin rejected ${p.name}'s sample provider verification.`);renderAdmin();toast("Provider marked as not verified.");}
if($("verificationFile"))$("verificationFile").addEventListener("change",e=>{const file=e.target.files[0];if(!file)return;const request={id:Date.now(),name:account?.name||"Demo provider",fileName:file.name,status:"Pending manual review",size:file.size};verificationRequests.unshift(request);localStorage.setItem("tandagfixVerification",JSON.stringify(verificationRequests));$("verificationStatus").textContent=`Verification status: Pending manual review — ${file.name}`;addNotification(`Verification document submitted: ${file.name}. Awaiting manual admin review.`);toast("Demo upload recorded locally; no file was sent to a server.");});
// Chat/call placeholder, attached to every booking card after render.
const oldRenderBookings=renderBookings;
renderBookings=function(){oldRenderBookings();document.querySelectorAll("#bookingList article.provider").forEach((card,i)=>{const b=bookings[i];if(!b)return;const info=document.createElement("p");info.className="muted";info.textContent=`Payment option: ${b.paymentMethod||"Not selected"} · Platform fee: ₱${Number(b.platformFee||0).toFixed(2)}`;card.appendChild(info);const contact=document.createElement("button");contact.className="ghost";contact.textContent="Chat / call provider";contact.onclick=()=>toast(`Demo placeholder: chat or call ${b.providerName} would open here.`);card.appendChild(contact);});};
// Status changes create a notification and refresh financial/admin summaries.
const originalUpdateStatus=updateStatus;
updateStatus=function(id,status){originalUpdateStatus(id,status);const b=bookings.find(x=>x.id===id);if(b)addNotification(`Booking with ${b.providerName} updated to: ${status}.`);renderEarnings();};
renderCategories();renderProviders();renderCompare();
