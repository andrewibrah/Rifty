# Environment Variable Setup for Demo + Supabase

Follow these steps in every non-local environment (staging, production, CI, etc.) so the app and seed script have the credentials they expect.

1. **Locate your Supabase project values**
   - `SUPABASE_URL`: copy the project URL (looks like `https://your-instance.supabase.co`).
   - `SUPABASE_ANON_KEY`: grab the anon/public API key from *Project Settings → API*.

2. **Choose a demo password**
   - Pick a strong password for the demo account and note it somewhere secure.
   - This will be referenced as `DEMO_PASSWORD`.

3. **Add the variables to each environment**
   - In managed hosts (Vercel, Netlify, Render, etc.): add them in the project’s *Environment Variables* UI.
   - In Docker/Kubernetes: set them in your compose file, deployment spec, or secret manager.
   - In CI systems (GitHub Actions, CircleCI, etc.): add them as repository secrets or workflow `env` entries.

   Required variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `DEMO_PASSWORD`

4. **Redeploy or restart the service**
   - After updating the variables, trigger a rebuild/redeploy so the process loads the new values.

5. **Verify**
   - Run the demo seed script (e.g., `npm run seed-demo`) or launch the app.
   - If any variable is missing, the runtime will throw a clear error pointing to the missing key.
