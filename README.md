# StudyCircle

StudyCircle is a small full-stack collaborative web app for college students to discover and create **in-person study meetups** on campus.

## Features
- Email/password authentication with Supabase Auth
- Create, edit and delete study sessions
- Join/leave a session with live participant counts
- Search by topic/subject/location
- Filter all sessions, today's sessions, and joined sessions
- Responsive UI with loading skeletons, empty states, validation and error handling
- Supabase PostgreSQL persistence + Row Level Security + Realtime

## Tech Stack
- Next.js 16 + React 19 + TypeScript
- Supabase Auth, PostgreSQL and Realtime
- Plain CSS
- Vercel deployment

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env.local`
3. Add your Supabase URL and publishable key
4. Run `supabase.sql` in the Supabase SQL Editor
5. `npm run dev`

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=https://rmsvvgnaftpgabgypsse.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xRjd78C2hzaODaFwcj0RXA_3qWeFi9E

```

## Demo flow
## Live Demo
https://your-public-study-circle-url.vercel.app
Create account → create a study session → sign in as another user → join the session → participant count updates → leave/edit/delete according to permissions.
