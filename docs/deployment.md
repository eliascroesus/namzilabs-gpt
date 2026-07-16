# Deploying Namzi Data

This is the production order. Do not put secrets in GitHub or commit `.env.local`.

## 1. Publish GitHub

The intended repository is `eliascroesus/namzilabs-gpt` with `main` as the production branch.

```bash
brew install gh
gh auth login
gh auth status
```

After authentication, commit the complete project on a feature branch, push it, open a pull request
into `main`, and merge only after CI passes.

## 2. Create Neon production storage

1. Open the Neon Console and click **New project**.
2. Name it `namzilabs-production` and choose the region closest to the Vercel Function region.
3. On the project dashboard click **Connect**.
4. Select the production branch, database and owner role.
5. Turn **Connection pooling** on and copy that URL as `DATABASE_URL`.
6. Turn pooling off and copy the direct URL as `DATABASE_DIRECT_URL`.
7. Put both URLs in a local `.env.local` and run `pnpm db:migrate` once.

Use the pooled `-pooler` host at runtime. Use the direct host only for migrations and administrative scripts.

## 3. Configure the prototype password wall

This prototype deliberately uses one shared password and must not be described as customer-grade
authentication. Put the password only in `.env.local` and Vercel encrypted environment variables;
never commit it.

Add the prototype identity variables to `.env.local`, run `pnpm db:migrate`, then run
`pnpm db:provision`.

```dotenv
APP_PASSWORD=<long private prototype password>
APP_ORGANIZATION_ID=00000000-0000-4000-8000-000000000001
APP_USER_ID=prototype-admin
APP_ROLE=owner
ORGANIZATION_NAME=Namzi Labs
ORGANIZATION_SLUG=namzi-labs
ORGANIZATION_TIMEZONE=Europe/Stockholm
```

## 4. Import into Vercel

1. Open Vercel Dashboard and click **Add New…** → **Project**.
2. Choose GitHub and click **Import** beside `eliascroesus/namzilabs-gpt`.
3. Keep Framework Preset as **Next.js**, Root Directory as `./`, and Build Command as `pnpm build`.
4. Add the production environment variables below before clicking **Deploy**.

Required production values:

```dotenv
APP_ENV=production
APP_URL=https://namzilabs.co
APP_PASSWORD=<long private prototype password>
APP_ORGANIZATION_ID=00000000-0000-4000-8000-000000000001
APP_USER_ID=prototype-admin
APP_ROLE=owner
DATABASE_URL=<Neon pooled URL>
ENCRYPTION_KEY_BASE64=<openssl rand -base64 32>
INNGEST_EVENT_KEY=<Inngest production event key>
INNGEST_SIGNING_KEY=<Inngest production signing key>
INNGEST_SERVE_ORIGIN=https://namzilabs.co
GOOGLE_CLIENT_ID=<Google OAuth web client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth web client secret>
GOOGLE_REDIRECT_URI=https://namzilabs.co/api/integrations/google/callback
CALENDLY_CLIENT_ID=<Calendly OAuth client ID>
CALENDLY_CLIENT_SECRET=<Calendly OAuth client secret>
CALENDLY_WEBHOOK_SIGNING_KEY=<Calendly webhook signing key>
CALCOM_CLIENT_ID=<Cal.com OAuth client ID>
CALCOM_CLIENT_SECRET=<Cal.com OAuth client secret>
CLOSE_CLIENT_ID=<Close OAuth client ID>
CLOSE_CLIENT_SECRET=<Close OAuth client secret>
```

API-key connectors are entered in the Namzi integration wizard and encrypted in Neon; do not put
customer API keys in Vercel. The complete provider setup is in `docs/integrations.md`.

Keep `DATABASE_DIRECT_URL` only in the local/CI migration environment. Do not expose the direct migration credential to Vercel Functions.

## 5. Attach namzilabs.co

1. In the Vercel project open **Settings** → **Domains** → **Add Domain**.
2. Add `namzilabs.co` and make it the production domain.
3. Add `www.namzilabs.co` and configure it to redirect permanently to `namzilabs.co`.
4. At the current DNS provider, copy the exact A/CNAME/TXT records Vercel displays. Do not delete MX records used for email.
5. Wait until Vercel shows **Valid Configuration** and the SSL certificate is active.

## 6. Configure Google OAuth

In Google Cloud Console → **Google Auth Platform**:

1. **Branding**: use app name `Namzi Data`, a monitored support email, homepage `https://namzilabs.co`, privacy policy `https://namzilabs.co/privacy`, and terms `https://namzilabs.co/terms`.
2. **Audience**: use External. Keep Testing while validating and add your own Google account as a test user.
3. **Data Access**: enable the Drive metadata read-only and Google Sheets read-only scopes used by the connector.
4. Add `namzilabs.co` under **Authorized domains**. Verify the domain through Google Search Console using the same Google account that is an owner/editor of the Cloud project.
5. **Clients** → your Web application: add `https://namzilabs.co` as an authorized JavaScript origin and add the exact redirect URI `https://namzilabs.co/api/integrations/google/callback`.
6. Enable the Google Calendar API and add the second exact redirect URI `https://namzilabs.co/api/integrations/google-calendar/callback` before connecting Calendar.
7. The redirect URI is exact: scheme, host, path and trailing slash must match. This project uses no trailing slash.
8. After the deployed pages work, complete Branding verification, publish branding, then request data-access verification if Google requires it for the selected scopes.

## 7. Connect Inngest

The easiest path is the official Inngest integration in the Vercel Marketplace. Scope it only to this project and production environment. It adds the event and signing keys and syncs `/api/inngest` on each deployment. Alternatively, create the keys in Inngest and manually sync `https://namzilabs.co/api/inngest`.

## 8. Production smoke test

1. Open `https://namzilabs.co`, `/privacy`, `/terms`, `/robots.txt`, and `/sitemap.xml` in a private browser window.
2. Click **Open workspace**, enter the Vercel `APP_PASSWORD`, and confirm `/overview` opens.
3. Open **Integrations** → **Google Sheets** → **Sign in to Google Sheets**.
4. Approve the two read-only scopes.
5. Confirm the connection detail page shows the Google account as `active`; do not select a specific spreadsheet on the connection.
6. Open **Metrics** → **Build metric**, select the Google account, and confirm the searchable spreadsheet picker lists every accessible spreadsheet.
7. Select a spreadsheet and worksheet tab, click **Find new records**, and verify the latest genuine rows and detected columns appear in the data inspector.
8. Add filters, test the live matching-record count, and publish the metric. Publishing now performs an immediate resource-scoped reconciliation so the dashboard can query the rows as soon as the request completes; Inngest remains the retry and scheduled-refresh layer.
9. Open **Dashboards** and use **Refresh all data**. Confirm the metric value, Data page source records, pipeline freshness, and 30-day graph update together.
10. Open the dashboard and verify the saved metric appears without customer payloads being written to Vercel logs.
