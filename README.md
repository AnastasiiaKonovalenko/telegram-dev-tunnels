# telegram-dev-tunnels

Universal CLI for local Telegram Mini App development with Cloudflare quick tunnels.

> **Unofficial tool:** this package is an independent development utility. It is not affiliated with, endorsed by, or sponsored by Telegram, Cloudflare, or Vercel.

It starts Cloudflare tunnels for your web app and API, then can automatically:

- patch `allowedDevOrigins` in `next.config.ts/js` with the generated web tunnel host;
- patch an env file with the generated API tunnel URL under whatever variable name your project uses;
- optionally patch an env file with the generated web tunnel URL;
- update the Telegram bot menu button to open the generated web tunnel URL.

The original project script was Bash-specific and tied to one repository layout. This package is Node-based, cross-platform, and configurable through CLI flags or a config file.

## Install

This is a development-only CLI tool. Install it as a dev dependency:

```bash
npm install -D telegram-dev-tunnels
```

Then add a script to your app `package.json`:

```json
{
  "scripts": {
    "tunnels": "tg-dev-tunnels"
  }
}
```

Run:

```bash
npm run tunnels
```

> Note: npmjs.com may show `npm i telegram-dev-tunnels` in its automatic install block. For real projects, use `npm install -D telegram-dev-tunnels`.

## Install locally from a folder

For local testing before publishing:

```bash
npm install -D ./telegram-dev-tunnels
```

Then add a script to your app `package.json`:

```json
{
  "scripts": {
    "tunnels": "tg-dev-tunnels"
  }
}
```

Run:

```bash
npm run tunnels
```

## Requirements

Install `cloudflared` first:

```bash
brew install cloudflare/cloudflare/cloudflared
```

Node.js 18+ is required.

## Default behavior

By default the CLI expects this layout:

```text
repo-root/
  apps/web/next.config.ts
  apps/web/.env.local
```

It starts:

```text
web → http://127.0.0.1:3000
api → http://127.0.0.1:8787
```

It reads the Telegram bot token from:

```env
TELEGRAM_BOT_TOKEN=...
```

It writes the generated API tunnel URL to:

```env
NEXT_PUBLIC_API_BASE_URL=https://generated-api-url.trycloudflare.com
```

## Configure different env variable names

For Vite:

```bash
tg-dev-tunnels --api-env-key VITE_API_URL
```

For Nuxt:

```bash
tg-dev-tunnels --api-env-key NUXT_PUBLIC_API_BASE_URL
```

For a custom bot token variable:

```bash
tg-dev-tunnels --bot-token-env BOT_TOKEN
```

To also write the generated web URL into the env file:

```bash
tg-dev-tunnels --web-env-key NEXT_PUBLIC_WEB_APP_URL
```

## Config file

You can avoid long commands by adding one of these files in the project root:

```text
tg-dev-tunnels.config.mjs
tg-dev-tunnels.config.js
tg-dev-tunnels.config.cjs
tg-dev-tunnels.config.json
```

Example:

```js
export default {
  webTarget: "http://127.0.0.1:3000",
  apiTarget: "http://127.0.0.1:8787",
  nextConfig: "apps/web/next.config.ts",
  envFile: "apps/web/.env.local",
  apiEnvKey: "NEXT_PUBLIC_API_BASE_URL",
  webEnvKey: "NEXT_PUBLIC_WEB_APP_URL",
  botTokenEnv: "TELEGRAM_BOT_TOKEN",
  menuText: "Play"
};
```

Then run:

```bash
tg-dev-tunnels
```

CLI flags override config file values.

## Options

```bash
tg-dev-tunnels \
  --web-target http://127.0.0.1:3000 \
  --api-target http://127.0.0.1:8787 \
  --repo-root . \
  --next-config apps/web/next.config.ts \
  --env-file apps/web/.env.local \
  --api-env-key NEXT_PUBLIC_API_BASE_URL \
  --web-env-key NEXT_PUBLIC_WEB_APP_URL \
  --bot-token-env TELEGRAM_BOT_TOKEN \
  --menu-text Play
```

Useful flags:

```bash
--config ./tg-dev-tunnels.config.mjs
--skip-next-config
--skip-env
--skip-telegram
--no-api
--max-wait 90
```

## Examples

### Next.js web + Cloudflare Worker API

```bash
tg-dev-tunnels
```

### Vite frontend + API

```bash
tg-dev-tunnels \
  --web-target http://127.0.0.1:5173 \
  --api-target http://127.0.0.1:8787 \
  --skip-next-config \
  --env-file .env.local \
  --api-env-key VITE_API_URL
```

### Frontend only

```bash
tg-dev-tunnels \
  --web-target http://127.0.0.1:5173 \
  --no-api \
  --skip-next-config \
  --skip-env
```

### Do not touch Telegram bot settings

```bash
tg-dev-tunnels --skip-telegram
```
