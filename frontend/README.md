# Job Trackr — Frontend

The single-page app for [Job Trackr](https://www.jobtrackrproject.work): a dashboard to track job applications, manage CV versions and see how your search is going.

Built with **React 19, TypeScript, Vite and Material UI**, in English and Greek, with light and dark themes.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Routing](#routing)
- [Authentication flow](#authentication-flow)
- [State management](#state-management)
- [Talking to the API](#talking-to-the-api)
- [Domain logic](#domain-logic)
- [Internationalisation](#internationalisation)
- [Theming and styling conventions](#theming-and-styling-conventions)
- [Deployment](#deployment)

---

## Features

**Sign in**
- Google OAuth or a passwordless email code (6 digits, sent by email).
- Returning users with a valid session skip the home page and land on the dashboard.

**Applications tab**
- Add, edit and delete applications (company, title, status, date applied, job link, LinkedIn link, notes up to 500 characters, optional follow-up date).
- Eight statuses: Applied, Interview, Technical Test, Offer, Accepted, Rejected, Ghosted, Withdrawn.
- Search across company, title and notes. Matching ignores case and accents, which matters for Greek text.
- Filter by status and sort by newest, oldest, furthest stage, earliest stage or soonest follow-up.
- **Follow-up reminders**: an alert lists applications whose follow-up is due or overdue, and each row shows a badge (overdue, today, soon, upcoming). Moving an application to *Interview* or *Technical Test* suggests a follow-up date a week out.
- A usage meter shows how many of your application slots are used, and the add button is disabled at the limit.

**CVs tab**
- Upload up to two PDF CVs (max 1 MB), each with a name, optional version label and notes.
- Mark one CV as the default.

**Stats tab**
- KPIs: total, active, response rate and interview rate.
- Applications by status and applications per week over the last 8 weeks.
- Rates are computed from each application's *current* status, because status history is not stored. The tab says so on screen.

**Everywhere**
- English and Greek with browser language detection.
- Light and dark mode, remembered between visits.
- Toast notifications for create, update and delete.
- Cookie consent banner, plus Privacy and Terms pages.
- Responsive layout; modals go full-screen on small devices.
- Vercel Analytics and Speed Insights.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 7 (`vite-tsconfig-paths` for the `@/` alias) |
| UI | Material UI 7 (+ Emotion), MUI icons |
| Routing | React Router 7 |
| Global state | Redux Toolkit (authentication only) |
| HTTP | Axios |
| i18n | i18next, react-i18next, browser language detector |
| Notifications | react-toastify |
| Lint | ESLint 9 with React hooks, React-X and import-sort rules |

---

## Project structure

```
frontend/src
├── main.tsx                 Providers: Redux → theme context → ThemedApp
├── App.tsx                  Router, auth bootstrap, analytics
├── components/
│   ├── ThemedApp.tsx        MUI ThemeProvider + CssBaseline + toasts
│   ├── Navbar/  Footer/  CookieConsent/  Toast/
│   ├── routes/              ProtectedRoute, RedirectIfAuthenticated
│   └── redux/common/        commonSlice (user, isAuthenticated, isAuthLoading)
├── context/                 ThemeContext + ThemeProvider (dark mode)
├── hooks/                   useAuth, useApplications, useCVs, useEmailOtp,
│                            useCookieConsent, useThemeMode
├── services/                api.ts (Axios instance) and one file per resource
├── pages/
│   ├── Home/                Landing page, Google button, email OTP steps
│   ├── AuthCallback/        Finishes the Google login
│   ├── Dashboard/           Tabs: ApplicationsTab, CVTab, StatsTab
│   └── Legal/               Privacy, Terms
├── utils/                   followUp.ts, applicationList.ts, stats.ts (pure logic)
├── types/                   Types mirroring the backend payloads
├── stores/                  Redux store and typed hooks
├── theme/                   MUI theme (light and dark palettes)
├── i18n/ and locales/       Setup and en/el translation files
└── assets/icons/            SVG icon components
```

Conventions:

- Each component keeps its styles in a sibling `*.styles.ts` file.
- Large components are split into small focused files (for example the Applications tab is made of a toolbar, filter bar, table, table row, card, form modal, delete dialog and follow-up alert/badge).
- `@/` maps to `src/`.

---

## Routing

| Path | Screen | Guard |
| --- | --- | --- |
| `/` | Home / sign in | `RedirectIfAuthenticated` sends logged-in users to `/dashboard` |
| `/auth/callback` | Completes Google login | — |
| `/dashboard` | Dashboard (Applications, CVs, Stats) | `ProtectedRoute` sends logged-out users to `/` |
| `/legal/privacy`, `/legal/terms` | Legal pages | — |

Both guards render a loading screen while the session check is in flight, so users never see a flash of the wrong page.

---

## Authentication flow

The browser never sees or stores a token: the backend sets an **HTTP-only cookie** and every request is sent with `withCredentials: true`.

1. **App start** — `useAuthBootstrap()` (called once in `App`) requests `GET /api/auth/me`. Success fills the Redux store; failure clears it. `isAuthLoading` stays `true` until this resolves, and the route guards wait for it. It skips this check on `/auth/callback`, which establishes the session itself.
2. **Google** — the button sends the browser to the backend; after consent the backend redirects to `/auth/callback?code=…`. `AuthCallbackPage` calls `/api/auth/exchange` (which sets the cookie), loads the user, then navigates to the dashboard. Any failure clears the user and returns home.
3. **Email code** — `useEmailOtp` drives a two-step form (`input` → `code`): send the code, verify it, load the user, navigate to the dashboard.
4. **Logout** — calls `/api/auth/logout`, clears the store and reloads at `/`.

---

## State management

| Kind of state | Where it lives |
| --- | --- |
| Auth (user, isAuthenticated, isAuthLoading) | Redux Toolkit (`commonSlice`) |
| Applications and CVs (server data) | Local state inside `useApplications` / `useCVs` |
| UI state (filters, sort, open modals, tabs) | `useState` in the component that owns it |
| Theme (dark mode) | React context + `localStorage` |
| Cookie consent | `localStorage` via `useCookieConsent` |

Redux is deliberately limited to auth. The data hooks expose `create`, `update`, `remove` and `refetch`, and update their local list after each successful call. Each tab mounts its own hook instance, so switching tabs loads that tab's data fresh.

---

## Talking to the API

`services/api.ts` creates one Axios instance:

- **Development**: `baseURL` is `VITE_API_URL` (default `http://localhost:3000`).
- **Production**: `baseURL` is empty, so requests go to `/api/...` on the same origin and Vercel rewrites them to the backend (see `vercel.json`).

Each resource has a service module (`application.service.ts`, `cv.service.ts`, `auth.service.ts`) that returns typed data and turns Axios errors into plain `Error` messages the UI can show. CV uploads are sent as `multipart/form-data`.

Types in `src/types` mirror the backend's, with timestamps as `string` instead of `Date`. Shared constants such as `MAX_APPLICATIONS` must be kept in sync with the backend.

---

## Domain logic

The interesting rules live in small, dependency-free functions in `src/utils`, separate from React:

- **`followUp.ts`**: date-only helpers and `getFollowUpInfo`, which classifies a follow-up as `overdue`, `today`, `soon` (within 2 days) or `upcoming`. Only *open* applications (Applied, Interview, Technical Test, Offer) get follow-up states. `getDueFollowUps` powers the alert banner.
- **`applicationList.ts`**: `filterAndSortApplications` combines status filter, accent-insensitive search and five sort modes. Stage order for "furthest/earliest" comes from `STAGE_RANK`.
- **`stats.ts`**: `computeStats` produces counts, response rate (Interview, Technical Test, Offer, Accepted or Rejected), interview rate (Interview, Technical Test, Offer or Accepted), follow-ups due and an 8-week histogram with Monday-based weeks. Dates are handled as day numbers in UTC to avoid timezone and daylight-saving bugs.

Keeping this logic pure makes it easy to test and reason about.

---

## Internationalisation

- Translation files: `src/locales/en/translation.json` and `src/locales/el/translation.json`.
- `i18n/index.ts` registers both languages, detects the browser language and falls back to English.
- Components use `useTranslation()` and keys such as `Dashboard.ApplicationsTab.addApplication`.
- To add a language: create `src/locales/<code>/translation.json` with the same keys and register it in `i18n/index.ts`.

---

## Theming and styling conventions

- The MUI theme (`src/theme/theme.ts`) has light and dark variants with an indigo primary.
- `CssBaseline` sits inside the MUI `ThemeProvider` (in `ThemedApp`) so the baseline follows the active theme.
- Components use **palette tokens** (`text.primary`, `background.paper`, …) rather than hard-coded colours, which is what keeps dark mode readable. The only fixed colours are the per-status accent colours.
- Dark-mode preference is stored in `localStorage` and read through a context, not Redux.

---

To run the full app locally, start the backend first (see the [backend README](../backend/README.md)) and make sure its `FRONTEND_URL` is `http://localhost:5173`.

---

## Deployment

Deployed as its own Vercel project. `vercel.json` does two things:

1. Rewrites `/api/*` to the backend deployment, so the browser only ever talks to one origin.
2. Rewrites every other path to `/index.html` so client-side routes work on refresh.

GitHub Actions builds the frontend on every push and pull request to `master`.

---

## Author

Konstantinos Platias
