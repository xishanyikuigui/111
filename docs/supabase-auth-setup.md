# Configure self-service accounts

The Pages build reads two public Supabase Auth settings from GitHub Actions repository variables:

- `VITE_SUPABASE_URL`: Project URL from Supabase Project Settings → API.
- `VITE_SUPABASE_ANON_KEY`: The project's publishable/anon key. Never use the `service_role` key here.

In Supabase Authentication → URL Configuration:

- Set the Site URL to `https://zhouliang9405-dot.github.io/111/`.
- Add that same URL to the allowed redirect URLs. If using email confirmation or password recovery, the redirect must be allowed.

Keep email confirmations enabled so new accounts must verify their email address.

In GitHub, open the repository's Settings → Secrets and variables → Actions → Variables and add the two variables above. Do not add a service-role key. After the change is merged to `main`, the Pages workflow rebuilds the app with login enabled.

The workbench still parses uploaded Amazon reports in the browser. Supabase receives only authentication requests and account details; uploaded report files are not sent to Supabase by this login integration.
