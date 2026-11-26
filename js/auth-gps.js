/* TandagFix authentication, role-gated navigation and optional booking GPS. */
(() => {
  const $ = id => document.getElementById(id);
  const configured = () => window.supabase?.createClient && window.TANDAGFIX_SUPABASE_URL &&
    !window.TANDAGFIX_SUPABASE_URL.includes('YOUR-PROJECT') && window.TANDAGFIX_SUPABASE_ANON_KEY &&
    !window.TANDAGFIX_SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  let client = null, sessionUser = null, gpsPoint = null;
  if (configured()) client = window.supabase.createClient(window.TANDAGFIX_SUPABASE_URL, window.TANDAGFIX_SUPABASE_ANON_KEY);
  window.tandagfixClient = client;
  const status = (msg, isError=false) => { const el=$('authStatus'); if(el){el.textContent=msg;el.style.borderColor=isError?'#c33':'';} };
  // Booking requires a real Supabase session when configured; offline demo mode
  // accepts only a saved local demo profile. Expose this for booking guards.
  const syncAuthFlag = () => {
    const demoAccount = !client && !!localStorage.getItem('tandagfixAccount');
    window.tandagfixIsAuthenticated = !!sessionUser || demoAccount;
    window.tandagfixAuthConfigured = !!client;
  };
  syncAuthFlag();
  const setNav = role => {
    document.querySelectorAll('[data-view="provider"]').forEach(el=>el.classList.toggle('hidden', !['provider','admin'].includes(role)));
    document.querySelectorAll('[data-view="admin"]').forEach(el=>el.classList.toggle('hidden', role!=='admin'));
    $('signOutBtn')?.classList.toggle('hidden', !sessionUser);
    syncAuthFlag();
    $('signUpBtn')?.classList.toggle('hidden', !!sessionUser);
    $('signInBtn')?.classList.toggle('hidden', !!sessionUser);
    $('role')?.closest('.field')?.classList.toggle('hidden', !!sessionUser);
    if ($('authHelp')) $('authHelp').textContent = client ? 'Accounts are authenticated by Supabase. Admin roles must be granted by the project owner.' : 'Backend is not configured yet. Set up Supabase using the included README and SQL file to enable real online accounts.';
  };
  async function loadProfile(user) {
    let profile = null;
    if (client && user) {
      const {data, error} = await client.from('profiles').select('id, full_name, role').eq('id', user.id).maybeSingle();
      if (error) console.warn('Could not load profile', error.message); else profile=data;
    }
    const role = profile?.role || 'customer';
    window.tandagfixRole = role;
    // app.js uses this account object for role-gated screens.
    try { account = {name: profile?.full_name || user?.user_metadata?.full_name || $('fullName')?.value || '', email:user?.email || '', role, userId:user?.id || null}; } catch(e) {}
    if ($('fullName') && account?.name) $('fullName').value=account.name;
    if ($('email') && user?.email) $('email').value=user.email;
    setNav(role);
  }
  async function refreshAuth() {
    if (!client) { setNav(account?.role || 'guest'); status('Backend not connected. Sign up/sign in will become live after Supabase setup.'); return; }
    const {data:{session}, error}=await client.auth.getSession();
    if(error) status(error.message,true);
    sessionUser=session?.user || null;
    syncAuthFlag();
    if(sessionUser) { await loadProfile(sessionUser); status(`Signed in as ${sessionUser.email} (${window.tandagfixRole}).`); }
    else { window.tandagfixRole='guest'; setNav('guest'); status('Not signed in.'); }
  }
  async function signUp() {
    const name=$('fullName')?.value.trim(), email=$('email')?.value.trim(), password=$('password')?.value, role=$('role')?.value || 'customer';
    if(!name || !email || !password) return status('Enter your name, email, and password.',true);
    if(password.length<6) return status('Use a password with at least 6 characters.',true);
    if(!client) { status('Supabase is not configured. Follow SETUP-SUPABASE.md before creating a real account.',true); return; }
    const {data,error}=await client.auth.signUp({email,password,options:{data:{full_name:name, role:role === 'provider' ? 'provider' : 'customer'}}});
    if(error) return status(error.message,true);
    sessionUser=data.session?.user || null;
    if(sessionUser){await loadProfile(sessionUser);syncAuthFlag();status('Account created. You are signed in.');}
    else status('Account created. Check your email to confirm, then sign in.');
  }
  async function signIn() {
    const email=$('email')?.value.trim(), password=$('password')?.value;
    if(!email||!password) return status('Enter your email and password.',true);
    if(!client) { status('Supabase is not configured. Follow SETUP-SUPABASE.md before signing in.',true); return; }
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error) return status(error.message,true);
    sessionUser=data.user; syncAuthFlag(); await loadProfile(sessionUser); status(`Welcome back, ${sessionUser.email}.`); if(typeof go==='function') go('home');
  }
  async function signOut() {
    if(client) { const {error}=await client.auth.signOut(); if(error) return status(error.message,true); }
    else localStorage.removeItem('tandagfixAccount');
    sessionUser=null; syncAuthFlag(); window.tandagfixRole='guest';
    try { account=null; } catch(e) {}
    setNav('guest'); status('Signed out.'); if(typeof go==='function') go('home');
  }
  // Block opening the booking form unless the customer is signed in / has a demo account.
  const originalStartBooking = window.startBooking;
  if (typeof originalStartBooking === 'function') window.startBooking = function(id) {
    syncAuthFlag();
    if (!window.tandagfixIsAuthenticated) {
      status('Please create an account or sign in before booking a provider.', true);
      if (typeof window.go === 'function') window.go('account');
      const help = $('accountMessage');
      if (help) { help.textContent = 'You need an account to book a provider. Create an account or sign in, then return to choose a provider.'; help.classList.remove('hidden'); }
      return;
    }
    return originalStartBooking(id);
  };
  const bookingForm = $('bookingForm');
  if (bookingForm) bookingForm.addEventListener('submit', function(e) {
    syncAuthFlag();
    if (!window.tandagfixIsAuthenticated) {
      e.preventDefault(); e.stopImmediatePropagation();
      status('Please create an account or sign in before sending a booking request.', true);
      if (typeof window.go === 'function') window.go('account');
    }
  }, true);
  $('signUpBtn')?.addEventListener('click',signUp); $('signInBtn')?.addEventListener('click',signIn); $('signOutBtn')?.addEventListener('click',signOut);
  $('gpsBtn')?.addEventListener('click',()=>{
    const label=$('gpsStatus');
    if(!navigator.geolocation){label.textContent='This browser does not support GPS location.';return;}
    label.textContent='Getting your location…';
    navigator.geolocation.getCurrentPosition(pos=>{
      gpsPoint={latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:Math.round(pos.coords.accuracy)};
      localStorage.setItem('tandagfixBookingGPS',JSON.stringify(gpsPoint));
      const addr=$('address'); const gpsText=`GPS ${gpsPoint.latitude.toFixed(6)}, ${gpsPoint.longitude.toFixed(6)} (±${gpsPoint.accuracy} m)`;
      if(addr && !addr.value.includes('GPS ')) addr.value=(addr.value.trim()?addr.value.trim()+' — ':'')+gpsText;
      label.textContent=`Location attached: ${gpsPoint.latitude.toFixed(5)}, ${gpsPoint.longitude.toFixed(5)} (accuracy about ${gpsPoint.accuracy} m).`;
    },err=>{label.textContent=err.code===1?'Location permission was denied. You can enter the address manually.':'Could not get GPS. Check location settings and try again.';},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
  });
  // Save booking data to the shared database when configured. Existing local prototype remains usable without it.
  $('bookingForm')?.addEventListener('submit', async () => {
    setTimeout(async()=>{
      if(!client || !sessionUser) return;
      try {
        const rows=JSON.parse(localStorage.getItem('tandagfixBookings')||'[]'); const b=rows[0]; if(!b || Date.now()-Number(b.id)>15000) return;
        const gps=JSON.parse(localStorage.getItem('tandagfixBookingGPS')||'null');
        const {error}=await client.from('bookings').insert({customer_id:sessionUser.id,provider_sample_id:String(b.providerId),provider_name:b.providerName,service_category:b.category,service_price:b.price,platform_fee:b.platformFee,status:b.status,service_date:b.date,service_time:b.time,service_address:b.address,job_description:b.description,payment_method:b.paymentMethod,gps_latitude:gps?.latitude ?? null,gps_longitude:gps?.longitude ?? null});
        if(error) console.error('Booking database save failed:',error.message); else status('Booking saved to your account database.');
      } catch(e){console.warn('Booking database sync skipped',e);}
    },100);
  });
  if(client) client.auth.onAuthStateChange((_event,session)=>{ sessionUser=session?.user||null; syncAuthFlag(); if(sessionUser) setTimeout(()=>loadProfile(sessionUser),0); else {window.tandagfixRole='guest';setNav('guest');} });
  // Add map links to any booking carrying a GPS coordinate snapshot.
  if (typeof window.renderBookings === 'function') {
    const baseBookingsRender = window.renderBookings;
    window.renderBookings = function(){
      baseBookingsRender();
      document.querySelectorAll('#bookingList article.provider').forEach((card,i)=>{
        const rows=JSON.parse(localStorage.getItem('tandagfixBookings')||'[]'); const b=rows[i];
        const match=(b?.address||'').match(/GPS\s+(-?\d+\.\d+),\s*(-?\d+\.\d+)/i);
        if(match && !card.querySelector('.gps-map-link')){
          const a=document.createElement('a'); a.className='secondary gps-map-link'; a.style.display='inline-block'; a.style.marginTop='8px'; a.target='_blank'; a.rel='noopener noreferrer';
          a.href=`https://www.google.com/maps?q=${match[1]},${match[2]}`; a.textContent='Open booking location in Maps'; card.appendChild(a);
        }
      });
    };
  }
  if (typeof window.renderProviderRequests === 'function') {
    const baseProviderRender = window.renderProviderRequests;
    window.renderProviderRequests = function(){
      baseProviderRender();
      document.querySelectorAll('#providerRequests article.provider').forEach(card=>{
        const text=card.innerText||''; const match=text.match(/GPS\s+(-?\d+\.\d+),\s*(-?\d+\.\d+)/i);
        if(match && !card.querySelector('.gps-map-link')){const a=document.createElement('a');a.className='secondary gps-map-link';a.style.display='inline-block';a.style.marginTop='8px';a.target='_blank';a.rel='noopener noreferrer';a.href=`https://www.google.com/maps?q=${match[1]},${match[2]}`;a.textContent='Open customer location in Maps';card.appendChild(a);}
      });
    };
  }
  // Initial access policy also applies to direct navigation.
  const originalGo=window.go;
  if(typeof originalGo==='function') window.go=function(view){
    const role=window.tandagfixRole || account?.role || 'guest';
    if(view==='provider' && !['provider','admin'].includes(role)){status('Provider dashboard requires a provider or admin account.',true);view='account';}
    if(view==='admin' && role!=='admin'){status('Admin panel requires an authorized admin account.',true);view='account';}
    return originalGo(view);
  };
  refreshAuth();
})();
