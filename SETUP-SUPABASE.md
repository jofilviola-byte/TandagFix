# TandagFix: real sign-in, database and booking GPS setup

The website is prepared to use Supabase for real email/password authentication and shared booking records. You must connect your own Supabase project before online sign-up/sign-in and database sync work. Never place a Supabase `service_role` key in frontend code.

## 1. Create the database
1. Create a project at https://supabase.com/.
2. Open **SQL Editor** in your project.
3. Paste and run all of `SETUP-SUPABASE.sql`.
4. In **Project Settings → API**, copy the **Project URL** and the **anon/public key**.

## 2. Connect the website
Open `js/supabase-config.js` and replace the two placeholder values:

```js
window.TANDAGFIX_SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.TANDAGFIX_SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Use only the public anon/publishable key. Save and run the project from VS Code Live Server or another localhost web server. Do not open the HTML as a `file://` URL.

## 3. Sign-up and roles
- Users can create customer or provider accounts with email and password.
- Supabase email confirmation settings may require clicking the confirmation email before signing in.
- Admin is intentionally **not** a public sign-up option. Create an account normally, then run the commented admin SQL statement at the bottom of `SETUP-SUPABASE.sql` with that account's email.
- Provider dashboard is available to provider and admin accounts. Admin panel is available only to accounts whose database role is `admin`.

## 4. GPS on bookings
On the booking screen, choose **Use my current GPS location** and allow the browser permission prompt. The booking includes latitude/longitude and estimated accuracy. This is a one-time location snapshot when the button is pressed, not continuous live tracking. A real map/live provider tracking experience needs a map provider and provider-side location sharing, which are not enabled by this starter.

## Important current prototype limits
- The 18 provider profiles are still sample data; they are not real registered provider records.
- This starter saves authenticated customer booking records to Supabase. Full multi-user provider inbox, admin management, file storage for identity documents, realtime booking subscriptions, and payment processing need further backend policies and integration.
- GPS coordinates are sensitive. Only request them with permission and share them with the provider for the relevant booking.
- Keep identity document uploads out of public buckets; use private storage and restrictive policies if you implement that feature.
