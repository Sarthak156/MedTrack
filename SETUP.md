# MedTrack Setup

## 1. Fill in `.env`
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
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

## 4. Deploy the AI insights edge function
```bash
supabase login
supabase link --project-ref YOUR-REF
supabase functions deploy ai-insights --no-verify-jwt
supabase secrets set MEDTRACK_API_KEY=your_key   # or OPENAI_API_KEY=sk-...
```

## 5. Promote your first admin
After signing up once, run in Supabase SQL Editor:
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## Roles
- **Patient** — adds and tracks own meds, sees AI insights.
- **Caregiver** — sees patients an admin assigned to them.
- **Admin** — manages all users + assignments. First admin set manually (above).
