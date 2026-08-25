# Deployment Guide

## Database

Choose the backend with `DB_PROVIDER`:

- `supabase`: run `DATABASE.sql` in the Supabase SQL editor and set `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`.
- `neon`: set `DATABASE_URL`. The Neon adapter automatically applies the checked-in `DATABASE.sql` before serving requests.
- `mongodb`: set `MONGODB_URI` and optionally `MONGODB_DATABASE` (default `post_bot`). The MongoDB adapter creates the collections and required indexes on startup.

The bot uses the same repository API for all three providers. The Supabase service-role key and all database connection strings are used only by the trusted backend. Do not put them in a browser bundle.

The `publications_active_post_target_idx` index makes concurrent publish clicks converge on one active publication for a post and target.

## Webhook

The server accepts only `POST ${WEBHOOK_PATH}` and checks the `X-Telegram-Bot-Api-Secret-Token` header. `npm run set-webhook` configures both the URL and Telegram's matching `secret_token`.

Check the deployment with:

```bash
curl -i https://your-domain.example/health
```

## Hosting Requirements

Use a Node 20+ host that supports a long-running HTTP process. Configure the build command as `npm run build` and the start command as `npm start`.

The server listens on `APP_PORT` when set, then the platform-provided `PORT`, then port `3000`. Leave `APP_PORT` blank on managed hosts unless the provider requires a fixed port. The process must be reachable over HTTPS so Telegram can deliver updates.

Set these common environment variables on every provider:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
APP_URL
```

Set the database variables for the selected provider:

```text
# Always choose one: supabase, neon, or mongodb
DB_PROVIDER

# DB_PROVIDER=supabase
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# DB_PROVIDER=neon
DATABASE_URL

# DB_PROVIDER=mongodb
MONGODB_URI
MONGODB_DATABASE   # optional, defaults to post_bot
```

Optional variables are `WEBHOOK_PATH` (default `/telegram/webhook`), `BOT_USERNAME`, and `ADMIN_TELEGRAM_USER_IDS`. Do not add a trailing slash to `APP_URL`. Do not commit `.env` or any secret.

Deploy one running instance for the first launch. The scheduler claims rows atomically, but multiple replicas are unnecessary for this bot and make operations harder to reason about.

## Switching Providers

Changing `DB_PROVIDER` changes the backend used by the bot; it does not copy existing records automatically. Before switching, back up the current database, initialize the target provider, migrate the data, update the target environment variables, and redeploy. Keep the same Telegram bot token and `APP_URL`.

Supabase and Neon both use PostgreSQL, so a PostgreSQL dump/restore is the simplest path between them. The Neon adapter applies the checked-in schema on startup, but changing providers still does not copy existing records. MongoDB uses document collections and must be migrated with a mapping tool or an application-specific export/import process. The adapter preserves the logical entities used by the bot: users, drafts, templates, publishing targets, posts, scheduled posts, publications, and processed updates.

After switching, run `npm run set-webhook` only if `APP_URL` or `WEBHOOK_PATH` changed. Telegram stores the webhook independently of the database provider.

## Mobile Migration Workflow

If you are deploying from a phone, use the included GitHub Actions workflow instead of putting a database password in chat or Git history:

1. In the GitHub repository, open **Settings -> Secrets and variables -> Actions**.
2. Create a repository secret named `SUPABASE_DB_URL` containing the rotated Supabase PostgreSQL connection string.
3. Open **Actions -> Apply Supabase schema -> Run workflow** and select the `main` branch.
4. Wait for the job to finish. It runs `DATABASE.sql` with `ON_ERROR_STOP=1`, so a failed statement fails the workflow instead of appearing successful.

The workflow is manual only and does not run on every push. It uses a masked GitHub secret and needs no Supabase management token.

## Railway

1. Open [railway.com](https://railway.com), create a project, and choose **Deploy from GitHub repo**.
2. Select `Stevenbots274/post-bot` and deploy the service.
3. In the service variables, add the common variables and the variables for your selected database provider. Leave `APP_PORT` unset or blank so Railway's `PORT` is used.
4. In service settings, use `npm run build` as the build command and `npm start` as the start command. Railway usually detects the Node project automatically, but setting the commands explicitly avoids ambiguity.
5. Generate a Railway domain. Set `APP_URL` to that HTTPS origin, for example `https://post-bot-production.up.railway.app`.
6. Set the health check path to `/health` if health checks are enabled, then redeploy.
7. After the deployment is healthy, run `npm run set-webhook` once from a machine with the same environment variables, or from the Railway service shell.
8. Confirm `https://your-railway-domain/health` returns JSON containing `"ok":true`.

Railway's service should remain at one replica because the bot includes the scheduled-publishing worker.

## Koyeb

1. Open [app.koyeb.com](https://app.koyeb.com) and choose **Create Web Service**.
2. Choose **GitHub** as the deployment source, authorize GitHub if prompted, and select `Stevenbots274/post-bot` on the `main` branch.
3. Set the build command to `npm run build` and the run command to `npm start`.
4. Add the common variables and the variables for your selected database provider. Leave `APP_PORT` unset so the service can use Koyeb's `PORT` value. Configure the service HTTP port according to the port shown by Koyeb; the application will read the injected port.
5. Deploy the service and copy its public HTTPS domain into `APP_URL` without a trailing slash. Redeploy after saving the URL.
6. Configure the health check path as `/health` and use one instance.
7. Run `npm run set-webhook` once after the public domain is active.
8. Verify the public `/health` URL returns a successful response.

## Render

1. Open [dashboard.render.com](https://dashboard.render.com), choose **New**, then **Web Service**.
2. Connect the GitHub repository `Stevenbots274/post-bot` and use the `main` branch.
3. Set the runtime to Node, the build command to `npm ci && npm run build`, and the start command to `npm start`.
4. Add the common variables and the variables for your selected database provider. Do not set a fixed `APP_PORT`; Render provides `PORT`.
5. Set the health check path to `/health`, create the service, and copy its public HTTPS URL into `APP_URL`.
6. Redeploy after setting `APP_URL`, then run `npm run set-webhook` once.
7. Use a continuously running instance for production. A sleeping service can delay Telegram webhook delivery.

## Fly.io

1. Install the Fly CLI, sign in, and run `fly launch` from the repository directory. Choose a unique application name and do not deploy until the configuration has been reviewed.
2. Set the generated service to build with `npm run build` and start with `npm start`. Keep the internal application port at `3000`, or set `APP_PORT` to the internal port you configure.
3. Set secrets with `fly secrets set` for the common variables and the variables for your selected database provider.
4. Deploy with `fly deploy` and copy the resulting `https://<app-name>.fly.dev` URL into `APP_URL` if it was not set before deployment.
5. Run `npm run set-webhook` once after the deployment is reachable.
6. Use one machine for the initial deployment. If you scale later, keep scheduler behavior and Telegram update delivery in mind.

## Other Node Hosts

The bot also works on any VPS, Docker host, or Node hosting service that provides HTTPS and keeps the process running. Use `npm ci && npm run build` for installation and compilation, `npm start` to run, `/health` for the health check, and the required environment variables above. Point `APP_URL` at the public origin and run `npm run set-webhook` once.

## Target registration

Add the bot as an administrator with permission to post. An administrator sends `/register` inside the group or channel. The target is stored for that Telegram user and is checked again immediately before publishing.

## Scheduled publishing

From a preview, choose **Schedule**, select a registered target, and enter a future UTC time as `YYYY-MM-DD HH:MM`. A single scheduler worker runs inside the bot process and claims due rows atomically, so multiple deployed instances will not intentionally publish the same schedule twice. Use `/scheduled` to review or cancel pending schedules.

From the publish screen, **Publish to All Targets** provides channel-sync behavior across every target explicitly registered by the user. Each target is permission-checked and independently idempotent.

## Operations

- Keep structured logs limited to update type, Telegram IDs, operation, and Telegram error code.
- Do not log full message text, tokens, webhook secrets, or database errors to end users.
- Monitor the `/health` endpoint and Telegram webhook error responses.
- Apply Supabase backups and retention policies appropriate for your users.
- Add a privacy policy and deletion workflow before a broad public launch.
