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

## v5 UI refresh
Modern fluid design system, redesigned buttons (press ripple, focus rings, disabled states), smooth + responsive scrolling (scroll-padding under the sticky header, snap-scrolling category strip, scroll progress bar, back-to-top, auto-hiding header on phones, rAF-throttled scroll handler, reduced-motion support).

## v2 features
Run `SETUP-SUPABASE.sql`, then `SETUP-SUPABASE-V2.sql`. Link a provider account to a listing with
`update profiles set provider_sample_id='1' where id='<user uid>';` and make an admin as described in the first SQL file.
New: reviews with comments, cancel/reschedule, provider days off + hidden booked slots, urgent jobs, job photos,
GCash/Maya receipt upload + provider confirmation, commission ledger, per-booking chat, favorites, barangay filter,
private ID upload with admin review, server-synced bookings (RLS-protected), Bisaya toggle, installable PWA (manifest + sw.js).

## v6 messaging centre

A dedicated **Messages** tab now connects homeowners and service providers. It works offline with
`localStorage` and upgrades automatically when Supabase is configured.

**Conversation features**
- Two-pane inbox: search, All / Unread / Archived filters, pin, mute, archive and delete.
- One thread per booking **and** direct threads started from a provider card or profile.
- Unread counts in the nav badge and browser tab title, read receipts (Sent / Seen), typing indicator,
  message timestamps, day separators and an unread-on-open flow.
- Photo attachments (compressed in the browser), image lightbox, quick replies and per-thread drafts.
- Enter to send, Shift + Enter for a new line, auto-growing composer and `aria-live` announcements.
- Booking context strip in the thread (date, time, status, price) with an **Open booking** shortcut.
- Safety controls: block/unblock, report to admin, and a reminder to keep payments inside TandagFix.
- Notifications link straight back to the conversation; guest/demo mode includes sample conversations
  and clearly-labelled simulated provider replies.

**Server mode**
1. Run `SETUP-SUPABASE-V3.sql` after the v1 and v2 scripts.
2. Booking conversations are stored in the existing `messages` table with `attachment_path` and `read_at`.
3. Realtime inserts, read receipts and private `chat-images` storage are enabled by the v3 script.
4. Attachments are stored under `<booking_uuid>/…` and are only readable by the booking's customer,
   linked provider, or an admin.
5. Direct chats started from a provider card are stored on this device; once the homeowner books that
   provider, the booking conversation syncs to the account.

**Files**
- `js/chat.js` — messaging module (inbox, threads, composer, safety, Supabase sync).
- `css/styles.css` — messaging layout, bubbles, badges and responsive/mobile styles.
- `SETUP-SUPABASE-V3.sql` — schema, RLS, realtime and storage policies for chat.

