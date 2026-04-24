# MedTrack Setup

## 1. Fill in `.env`
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
GEMINI_API_KEY=your_key
```

## 2. Configure Clerk → Supabase JWT
In **Clerk Dashboard → JWT Templates → New template**:
- Name: **`supabase`** (must be exact)
- Signing algorithm: **HS256**
- Signing key: paste your **Supabase JWT secret** (Supabase → Project Settings → API → JWT Settings → JWT Secret)
- Claims (default is fine; Clerk auto-includes `sub` = Clerk user ID)

## 3. Run the SQL migration
Open Supabase Dashboard → SQL Editor and run the contents of:
```
supabase/migrations/0001_init.sql
```

## 4. Configure AI insights API on Vercel
Create a Vercel environment variable named `GEMINI_API_KEY`.

The app now uses `api/ai-insights.ts` at `/api/ai-insights` (Vercel serverless route),
so no Supabase Edge Function deployment is required for AI insights.

## 5. Promote your first admin
After signing up once, run in Supabase SQL Editor:
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## Roles
- **Patient** — adds and tracks own meds, sees AI insights.
- **Caregiver** — sees patients an admin assigned to them.
- **Admin** — manages all users + assignments. First admin set manually (above).
