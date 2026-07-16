# Production integration setup

Namzi uses the same ingestion pattern for every provider:

1. Validate the OAuth token or API key before marking a connection active.
2. Store credentials encrypted per organization and connection.
3. Register a signed webhook when the provider supports one.
4. Commit the immutable raw event and durable outbox item before acknowledging the webhook.
5. Normalize idempotently, then run cursor-based reconciliation every 15 minutes to repair missed,
   duplicated or out-of-order deliveries.

Provider credentials are never public browser variables. Only the OAuth application credentials
below belong in Vercel; customer API keys are entered in the Namzi integration screen and encrypted
in Neon.

## Universal catch hooks

Use **Integrations → Webhook** when an app can send webhooks but does not yet have a dedicated Namzi
connector. Copy the complete URL shown on the connection page, including
`/api/webhooks/<connection-id>`. Do not enter only `https://namzilabs.co`.

Catch hooks intentionally behave like Zapier's Catch Hook: the unguessable URL is the credential,
normal provider POST/PUT requests receive a fast HTTP 200 response, and the newest captured requests
become reusable metric-builder test records. JSON arrays are split into records; JSON, form-encoded,
XML and text bodies are retained; nested JSON fields are exposed as dot paths such as
`payload.booking.startTime`.

The optional signing secret is for senders that can add `x-namzi-webhook-secret` or
`x-namzi-signature` headers. Do not paste it into a provider's unrelated signing-secret field and
expect a Namzi header—the dedicated provider connector validates that provider's native signature.
For Whop, Stripe, Cal.com, Calendly, Brevo, Close and Instantly, prefer the named integration tile so
Namzi can create the subscription and store the correct provider signing key automatically.

On the connection page, use **Send test record** first. It must appear immediately under **Recent
events**. Then trigger one real event in the sending app and use **View captured fields** or **Find
new records** in the metric builder to verify the exact payload.

## Required Vercel variables

Use **Vercel → Project → Settings → Environment Variables** and add these to Production (and Preview
only when the matching preview callback URL is registered):

```dotenv
APP_URL=https://namzilabs.co
APP_ENV=production
APP_PASSWORD=<private prototype password>
APP_ORGANIZATION_ID=00000000-0000-4000-8000-000000000001
APP_USER_ID=prototype-admin
APP_ROLE=owner
DATABASE_URL=<Neon pooled runtime URL>
ENCRYPTION_KEY_BASE64=<32-byte base64 key>
ENCRYPTION_KEY_VERSION=1
ENCRYPTION_PREVIOUS_KEYS_JSON={}
INNGEST_EVENT_KEY=<production event key>
INNGEST_SIGNING_KEY=<production signing key>
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

After changing variables, redeploy the latest `main` deployment. Keep `DATABASE_DIRECT_URL` out of
the function runtime; migrations use it locally or in a protected CI environment.

## Google Sheets and Google Calendar

Use the existing Google OAuth web client in **Google Cloud Console → Google Auth Platform → Clients**.

- Enable both **Google Drive API**, **Google Sheets API**, and **Google Calendar API**.
- Authorized JavaScript origin: `https://namzilabs.co`
- Authorized redirect URIs:
  - `https://namzilabs.co/api/integrations/google/callback`
  - `https://namzilabs.co/api/integrations/google-calendar/callback`
- Keep the existing Drive metadata and Sheets read-only scopes. Add Calendar read-only access.
- Add the connecting Google account as a test user until the consent screen is published/verified.

Calendar watch notifications contain no event body. Namzi verifies the channel token, enqueues a
reconciliation immediately, then uses the Calendar events API and its incremental sync token to read
the actual event and attendee response state. Watch channels expire and are renewed automatically by
the six-hour renewal worker.

Live test: connect Calendar, create/update a named event on the account's primary calendar, and change
an attendee to accepted/declined/tentative. Confirm the event name, attendee fields and response counts
appear after the webhook-triggered incremental pull, then filter the metric by the event name.

## Calendly

In Calendly's developer portal create an OAuth app with the read scopes for scheduled events,
invitees and users plus webhook read/write. Register:

`https://namzilabs.co/api/integrations/calendly/callback`

Copy its client ID, client secret and webhook signing key into the Vercel variables above. Namzi reads
the current organization URI from `/users/me`, registers one organization webhook for
`invitee.created` and `invitee.canceled`, and performs scheduled-event backfill. Organization-wide
delivery requires a Calendly account role/plan that permits organization webhook subscriptions.

## Cal.com

Open **Cal.com → Settings → Developer → OAuth** and create a confidential OAuth client. Register:

`https://namzilabs.co/api/integrations/cal-com/callback`

Enable `PROFILE_READ`, `BOOKING_READ`, `EVENT_TYPE_READ`, `WEBHOOK_READ`, and `WEBHOOK_WRITE`. Copy the
client ID and secret into Vercel. Cal.com reviews new OAuth clients; while pending, only the app owner
can test it. Namzi registers signed booking-created, canceled, rescheduled and no-show webhooks and
backs up delivery with cursor-based booking pulls.

## Close CRM

Create a Close OAuth application and register:

`https://namzilabs.co/api/integrations/close/callback`

Copy the OAuth client ID and secret into Vercel. Namzi requests read/offline access, subscribes to
explicit lead, contact, opportunity, call, SMS and email object/action combinations, and stores the
per-subscription signing key returned by Close. The event-log pull is retained because Close can
consolidate/reorder webhook events.

## Brevo (formerly Sendinblue)

Create a Brevo v3 API key with access to account, contacts, campaigns and webhooks. Enter it in
**Namzi → Integrations → Brevo**. Namzi creates separate signed webhook subscriptions for
transactional email, transactional SMS and marketing/contact events, then backfills contacts.

Brevo limits the total marketing + transactional webhooks per account. Remove unused old test
webhooks if provisioning reports the provider limit.

## Instantly

Create an Instantly API v2 key with workspace, campaign, lead and webhook read/write scopes. Enter it
in the Instantly connection screen. Namzi registers the provider's `all_events` subscription with a
per-connection secret and backs it with cursor-based lead pulls. An active paid Instantly workspace is
required for the webhook endpoints.

## Stripe

For the prototype, create a restricted live-mode key with read access to Account, Products and Events,
plus write access to Webhook Endpoints. Enter it in the Stripe connection screen. Namzi creates its
own endpoint, stores the returned endpoint signing secret, verifies `Stripe-Signature`, and subscribes
to payments, invoices, subscriptions, refunds and disputes.

For a public multi-customer launch, replace pasted keys with a reviewed Stripe Connect OAuth flow;
the ingestion and signature contracts can stay the same.

## Whop

Create a production company API key with membership/payment read access and
`developer:manage_webhook`. Copy the company ID beginning with `biz_`. Enter both in the Whop wizard.
Namzi backfills memberships and creates a Standard Webhooks-compatible subscription for membership,
payment, refund and dispute lifecycle events. Sandbox keys/data use Whop's sandbox API and are
separate from production; the current wizard targets production.

## Propal

In **Propal → Settings → API Keys**, create a key with organization and proposal read scopes and enter
it in Namzi. Propal's current public REST API exposes cursor-paginated proposals but no public signed
webhook contract, so this connector intentionally uses scheduled reconciliation rather than claiming
realtime delivery.

## Go-live verification checklist

For every provider, use a non-production test account first:

1. Connect and confirm the account identity shown by Namzi is correct.
2. Pull a three-record sample and inspect field names/types.
3. Run the initial backfill and compare record totals with the provider.
4. Trigger one real provider event and confirm one raw event and one normalized record appear.
5. Replay the same webhook and confirm the metric total does not double.
6. Temporarily make the endpoint fail, restore it, and confirm scheduled reconciliation repairs it.
7. Revoke the provider credential and confirm the source reports reconnect-required without exposing
   the credential in logs or UI.

The code and contract tests can validate signatures, normalization, cursor handling and idempotency.
Final live certification still requires the real provider credentials, approved OAuth apps, eligible
plans and one controlled event from each provider account.
