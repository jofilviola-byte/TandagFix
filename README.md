# TandagFix — Home Service Marketplace Prototype

## Project structure

- `index.html` — main app page and interface structure
- `css/styles.css` — colors, layout, responsive design, and light/dark themes
- `js/app.js` — provider data, search/filtering, booking flow, status tracking, ratings, and demo account logic
- `assets/images/tandagfix-logo.jpeg` — TandagFix logo

## How to run

1. Extract the `TandagFix-Project.zip` archive.
2. Keep the folder structure unchanged.
3. Open `index.html` in a modern web browser.
4. For local development, open the folder in Visual Studio Code. You may use the Live Server extension, but it is not required for this simple prototype.

## Editing provider names

Open `js/app.js` and find `const providers`. Update each provider's `name` value. Keep the surrounding quotes and commas.

## Notes

This is a front-end demonstration prototype. Provider profiles and prices are sample data. Account details and bookings are stored in the browser's local storage; they are not synced to a server. No real payments, authentication, or provider verification are implemented.

## v2 features
Run `SETUP-SUPABASE.sql`, then `SETUP-SUPABASE-V2.sql`. Link a provider account to a listing with
`update profiles set provider_sample_id='1' where id='<user uid>';` and make an admin as described in the first SQL file.
New: reviews with comments, cancel/reschedule, provider days off + hidden booked slots, urgent jobs, job photos,
GCash/Maya receipt upload + provider confirmation, commission ledger, per-booking chat, favorites, barangay filter,
private ID upload with admin review, server-synced bookings (RLS-protected), Bisaya toggle, installable PWA (manifest + sw.js).
