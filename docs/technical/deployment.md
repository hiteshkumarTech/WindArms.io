# WindArms — Deployment

> Topic-sliced excerpt of the v1 build. Full context in [v1.md](../versions/v1.md); nothing here has been reworded.

## Live

windarms.com

## Client

Zero-config on Vercel — import the repo, preset "Next.js", set `NEXT_PUBLIC_WS_URL` to the deployed server URL.

## Server

Deploy `server/` to Railway or Render (build `npm run build`, start `npm start`, root directory `server`), set `CLIENT_ORIGIN` to the Vercel domain, plus `DATABASE_URL`/`JWT_SECRET` for accounts. A `Dockerfile.server` is included for container platforms (`docker build -f Dockerfile.server .` from the repo root).

`GET /health` reports uptime and whether accounts are enabled.

## Accounts (optional)

The database is optional. Without `DATABASE_URL` the server boots in guest-only mode: auth endpoints return 503 with a clear message, the lobby explains stats aren't saved, and gameplay is untouched. To enable accounts:

```bash
cd server
# create server/.env with:
#   DATABASE_URL=postgresql://...   (free at neon.tech, or local Postgres)
#   JWT_SECRET=some-long-random-string
npm install                  # installs prisma + generates the client
npx prisma db push           # creates the User table
npm run dev
```
