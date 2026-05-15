#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION = '0.2.0';

const DEFAULTS = {
  webTarget: 'http://127.0.0.1:3000',
  apiTarget: 'http://127.0.0.1:8787',
  repoRoot: process.cwd(),
  nextConfig: 'apps/web/next.config.ts',
  envFile: 'apps/web/.env.local',
  apiEnvKey: 'NEXT_PUBLIC_API_BASE_URL',
  webEnvKey: null,
  botTokenEnv: 'TELEGRAM_BOT_TOKEN',
  menuText: 'Play',
  logDir: resolve(tmpdir(), 'tg-dev-tunnels'),
  maxWait: 60,
  patchNextConfig: true,
  patchEnv: true,
  updateTelegram: true,
  startApi: true,
  config: null,
};

function printHelp() {
  console.log(`tg-dev-tunnels ${VERSION}

Start Cloudflare quick tunnels for a Telegram Mini App dev setup.

Usage:
  tg-dev-tunnels [options]

Options:
  --config <path>            Config file path. Auto-detected by default.
  --web-target <url>         Local web server URL. Default: http://127.0.0.1:3000
  --api-target <url>         Local API server URL. Default: http://127.0.0.1:8787
  --repo-root <path>         Project root. Default: current working directory
  --next-config <path>       Path to next.config.ts/js. Default: apps/web/next.config.ts
  --env-file <path>          Path to env file. Default: apps/web/.env.local
  --api-env-key <name>       Env key patched with API tunnel URL. Default: NEXT_PUBLIC_API_BASE_URL
  --web-env-key <name>       Optional env key patched with web tunnel URL. Default: disabled
  --bot-token-env <name>     Env key containing Telegram bot token. Default: TELEGRAM_BOT_TOKEN
  --menu-text <text>         Telegram menu button text. Default: Play
  --log-dir <path>           Directory for cloudflared logs. Default: OS tmp dir/tg-dev-tunnels
  --max-wait <seconds>       Seconds to wait for tunnel URLs. Default: 60
  --skip-next-config         Do not patch allowedDevOrigins
  --skip-env                 Do not patch env file
  --skip-telegram            Do not update Telegram bot menu button
  --no-api                   Start web tunnel only
  --help                     Show help
  --version                  Show version

Examples:
  tg-dev-tunnels
  tg-dev-tunnels --web-target http://localhost:5173 --no-api --skip-next-config
  tg-dev-tunnels --api-env-key VITE_API_URL --bot-token-env BOT_TOKEN
`);
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const config = { ...raw };

  // Friendly aliases for config files.
  if ('noApi' in config) config.startApi = !config.noApi;
  if ('skipNextConfig' in config) config.patchNextConfig = !config.skipNextConfig;
  if ('skipEnv' in config) config.patchEnv = !config.skipEnv;
  if ('skipTelegram' in config) config.updateTelegram = !config.skipTelegram;

  delete config.noApi;
  delete config.skipNextConfig;
  delete config.skipEnv;
  delete config.skipTelegram;
  return config;
}

function parseArgs(argv, { partial = false } = {}) {
  const opts = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      return value;
    };

    switch (arg) {
      case '--config': opts.config = next(); break;
      case '--web-target': if (!partial) opts.webTarget = next(); else i += 1; break;
      case '--api-target': if (!partial) opts.apiTarget = next(); else i += 1; break;
      case '--repo-root': opts.repoRoot = resolve(next()); break;
      case '--next-config': if (!partial) opts.nextConfig = next(); else i += 1; break;
      case '--env-file': if (!partial) opts.envFile = next(); else i += 1; break;
      case '--api-env-key': if (!partial) opts.apiEnvKey = next(); else i += 1; break;
      case '--web-env-key': if (!partial) opts.webEnvKey = next(); else i += 1; break;
      case '--bot-token-env': if (!partial) opts.botTokenEnv = next(); else i += 1; break;
      case '--menu-text': if (!partial) opts.menuText = next(); else i += 1; break;
      case '--log-dir': if (!partial) opts.logDir = resolve(next()); else i += 1; break;
      case '--max-wait': if (!partial) opts.maxWait = Number(next()); else i += 1; break;
      case '--skip-next-config': if (!partial) opts.patchNextConfig = false; break;
      case '--skip-env': if (!partial) opts.patchEnv = false; break;
      case '--skip-telegram': if (!partial) opts.updateTelegram = false; break;
      case '--no-api': if (!partial) opts.startApi = false; break;
      case '--help': opts.help = true; break;
      case '--version': opts.version = true; break;
      default:
        if (!partial) throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

function findConfigFile(repoRoot) {
  const names = [
    'tg-dev-tunnels.config.mjs',
    'tg-dev-tunnels.config.js',
    'tg-dev-tunnels.config.cjs',
    'tg-dev-tunnels.config.json',
  ];
  return names.map((name) => resolve(repoRoot, name)).find((path) => existsSync(path)) ?? null;
}

async function loadConfigFile(path) {
  if (!path) return {};
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`Config file not found: ${resolved}`);

  if (resolved.endsWith('.json')) {
    return normalizeConfig(JSON.parse(readFileSync(resolved, 'utf8')));
  }

  const module = await import(`${pathToFileURL(resolved).href}?t=${Date.now()}`);
  return normalizeConfig(module.default ?? module.config ?? module);
}

async function buildOptions(argv) {
  const partial = parseArgs(argv, { partial: true });
  if (partial.help) return { ...DEFAULTS, help: true };
  if (partial.version) return { ...DEFAULTS, version: true };

  const repoRoot = partial.repoRoot ?? DEFAULTS.repoRoot;
  const configPath = partial.config ? resolve(repoRoot, partial.config) : findConfigFile(repoRoot);
  const fileConfig = await loadConfigFile(configPath);
  const cliConfig = parseArgs(argv);

  const opts = {
    ...DEFAULTS,
    ...fileConfig,
    ...cliConfig,
    repoRoot: resolve(cliConfig.repoRoot ?? fileConfig.repoRoot ?? DEFAULTS.repoRoot),
    config: configPath,
  };

  if (!Number.isFinite(Number(opts.maxWait)) || Number(opts.maxWait) <= 0) {
    throw new Error('--max-wait must be a positive number');
  }

  opts.maxWait = Number(opts.maxWait);
  opts.logDir = resolve(opts.logDir);
  opts.nextConfigPath = resolve(opts.repoRoot, opts.nextConfig);
  opts.envFilePath = resolve(opts.repoRoot, opts.envFile);
  return opts;
}

function hasCommand(command) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolvePromise(false));
    child.on('close', (code) => resolvePromise(code === 0));
  });
}

function startTunnel(label, target, logPath) {
  const out = [];
  const child = spawn('cloudflared', ['tunnel', '--url', target], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const write = (chunk) => {
    const text = chunk.toString();
    out.push(text);
    writeFileSync(logPath, out.join(''), 'utf8');
  };

  child.stdout.on('data', write);
  child.stderr.on('data', write);
  child.on('error', (error) => {
    console.error(`Failed to start ${label} tunnel: ${error.message}`);
  });

  return { child, getLog: () => out.join('') };
}

function extractTryCloudflareUrl(text) {
  return text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0] ?? null;
}

async function waitForUrl(tunnel, label, maxWait) {
  const started = Date.now();
  while ((Date.now() - started) / 1000 < maxWait) {
    const url = extractTryCloudflareUrl(tunnel.getLog());
    if (url) return url;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }

  const tail = tunnel.getLog().split('\n').slice(-20).join('\n');
  throw new Error(`Timed out waiting for ${label} tunnel. Last log:\n${tail}`);
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    result[key] = value;
  }
  return result;
}

function upsertEnvValue(path, key, value) {
  if (!key) return;
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexp = new RegExp(`^${escapedKey}=.*$`, 'm');
  const next = regexp.test(current)
    ? current.replace(regexp, `${key}=${value}`)
    : `${current}${current.endsWith('\n') || current.length === 0 ? '' : '\n'}${key}=${value}\n`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, 'utf8');
}

function patchNextAllowedOrigins(path, host) {
  if (!existsSync(path)) return false;
  const current = readFileSync(path, 'utf8');
  let next;

  if (/allowedDevOrigins\s*:\s*\[[\s\S]*?\]/m.test(current)) {
    next = current.replace(/allowedDevOrigins\s*:\s*\[[\s\S]*?\]/m, `allowedDevOrigins: ['${host}']`);
  } else if (/const\s+nextConfig\s*=\s*\{/m.test(current)) {
    next = current.replace(/const\s+nextConfig\s*=\s*\{/m, `const nextConfig = {\n  allowedDevOrigins: ['${host}'],`);
  } else if (/export\s+default\s+\{/m.test(current)) {
    next = current.replace(/export\s+default\s+\{/m, `export default {\n  allowedDevOrigins: ['${host}'],`);
  } else {
    throw new Error(`Cannot safely patch allowedDevOrigins in ${path}`);
  }

  writeFileSync(path, next, 'utf8');
  return true;
}

async function updateTelegramMenuButton(botToken, menuText, webUrl) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text: menuText,
        web_app: { url: webUrl },
      },
    }),
  });

  const body = await response.text();
  let json;
  try { json = JSON.parse(body); } catch { json = null; }
  if (!response.ok || json?.ok !== true) {
    throw new Error(body);
  }
}

function stopAll(tunnels) {
  for (const tunnel of tunnels) {
    if (tunnel?.child && !tunnel.child.killed) tunnel.child.kill('SIGTERM');
  }
}

async function main() {
  const opts = await buildOptions(process.argv.slice(2));
  if (opts.help) return printHelp();
  if (opts.version) return console.log(VERSION);

  if (!(await hasCommand('cloudflared'))) {
    throw new Error('cloudflared not found. Install it first, for example: brew install cloudflare/cloudflare/cloudflared');
  }

  mkdirSync(opts.logDir, { recursive: true });
  rmSync(resolve(opts.logDir, 'web.log'), { force: true });
  rmSync(resolve(opts.logDir, 'api.log'), { force: true });

  if (opts.config) console.log(`Using config → ${opts.config}`);
  console.log('Starting tunnels…');
  const webTunnel = startTunnel('web', opts.webTarget, resolve(opts.logDir, 'web.log'));
  const apiTunnel = opts.startApi ? startTunnel('api', opts.apiTarget, resolve(opts.logDir, 'api.log')) : null;
  const tunnels = [webTunnel, apiTunnel].filter(Boolean);

  const cleanup = () => {
    stopAll(tunnels);
    console.log('\nTunnels stopped.');
  };
  process.once('SIGINT', () => { cleanup(); process.exit(0); });
  process.once('SIGTERM', () => { cleanup(); process.exit(0); });
  process.once('exit', () => stopAll(tunnels));

  const webUrl = await waitForUrl(webTunnel, 'web', opts.maxWait);
  const apiUrl = apiTunnel ? await waitForUrl(apiTunnel, 'api', opts.maxWait) : null;
  const webHost = new URL(webUrl).host;

  if (opts.patchNextConfig) {
    const updated = patchNextAllowedOrigins(opts.nextConfigPath, webHost);
    if (updated) console.log(`Updated allowedDevOrigins → ${webHost}`);
    else console.warn(`Warning: ${opts.nextConfigPath} not found — skipping allowedDevOrigins`);
  }

  if (opts.patchEnv) {
    if (opts.webEnvKey) {
      upsertEnvValue(opts.envFilePath, opts.webEnvKey, webUrl);
      console.log(`Updated ${opts.webEnvKey} → ${webUrl}`);
    }
    if (apiUrl && opts.apiEnvKey) {
      upsertEnvValue(opts.envFilePath, opts.apiEnvKey, apiUrl);
      console.log(`Updated ${opts.apiEnvKey} → ${apiUrl}`);
    }
  }

  if (opts.updateTelegram) {
    const env = parseEnvFile(opts.envFilePath);
    const botToken = env[opts.botTokenEnv] || process.env[opts.botTokenEnv];
    if (botToken) {
      try {
        await updateTelegramMenuButton(botToken, opts.menuText, webUrl);
        console.log(`Updated Telegram menu button → ${webUrl}`);
      } catch (error) {
        console.warn(`Warning: failed to update Telegram menu button: ${error.message}`);
      }
    } else {
      console.warn(`Warning: ${opts.botTokenEnv} not found in env file or process env — skipping menu button update`);
    }
  }

  console.log('\nTunnels ready:');
  console.log(`  Web → ${webUrl}`);
  if (apiUrl) console.log(`  API → ${apiUrl}`);
  console.log('\nPress Ctrl-C to stop tunnels.');

  await Promise.all(tunnels.map((tunnel) => new Promise((resolvePromise) => tunnel.child.on('exit', resolvePromise))));
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
