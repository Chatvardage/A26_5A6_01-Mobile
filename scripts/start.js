#!/usr/bin/env node
/**
 * Démarre Expo en adaptant la configuration au poste. Usage : `npm start [options expo]`.
 *
 * - Hors WSL2 : met à jour l'IP LAN de l'API dans `.env`, puis équivaut à `npx expo start`.
 * - Sous WSL2 : ajoute `--tunnel` (le téléphone n'atteint pas Metro autrement) et, si
 *   EXPO_PUBLIC_API_URL n'est définie ni dans l'environnement ni dans `.env`, la déduit de
 *   l'IP Wi-Fi actuelle de Windows (port 3006 : voir la redirection « netsh » du README).
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WSL_API_PORT = 3006;
const API_VARIABLE = 'EXPO_PUBLIC_API_URL';
const DEFAULT_API_PORT = 3000;
const ENV_FILE = path.join(__dirname, '..', '.env');
const args = process.argv.slice(2);
const env = { ...process.env };

function isWsl() {
  try {
    return process.platform === 'linux' && /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

function isPrivateIpv4(value) {
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function isIpv4(value) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function getLocalIpv4Addresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((network) => network.family === 'IPv4' && !network.internal && isPrivateIpv4(network.address))
    .map((network) => network.address);
}

function readConfiguredUrl(content) {
  const match = content.match(/^\s*EXPO_PUBLIC_API_URL\s*=\s*(\S+)\s*$/m);
  return match?.[1] ?? null;
}

function buildApiUrl(configuredUrl, ip) {
  if (!configuredUrl) return `http://${ip}:${DEFAULT_API_PORT}`;

  try {
    const url = new URL(configuredUrl);
    url.hostname = ip;
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${API_VARIABLE} doit être une URL valide (ex. http://192.168.1.10:3000).`);
  }
}

function updateEnvContent(content, apiUrl) {
  const line = `${API_VARIABLE}=${apiUrl}`;
  const expression = /^(\s*EXPO_PUBLIC_API_URL\s*=\s*)[^\r\n]*$/m;
  if (expression.test(content)) return content.replace(expression, line);
  return `${content.replace(/\s*$/, '')}\n${line}\n`;
}

function powershell(command) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', timeout: 5000 });
  return result.status === 0 ? result.stdout.replace(/\r/g, '').trim() : null;
}

function definedInDotEnv() {
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    return /^\s*EXPO_PUBLIC_API_URL\s*=\s*\S+/m.test(content);
  } catch {
    return false;
  }
}

function updateApiIp() {
  const ip = getLocalIpv4Addresses()[0];
  if (!ip) {
    throw new Error("Aucune IPv4 LAN détectée. Utiliser `npm run update-ip -- --ip <IPv4-du-PC>`.");
  }

  let content = '';
  try {
    content = fs.readFileSync(ENV_FILE, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const apiUrl = buildApiUrl(readConfiguredUrl(content), ip);
  fs.writeFileSync(ENV_FILE, updateEnvContent(content, apiUrl));
  console.log(`[start] API mise à jour : ${apiUrl}`);
}

if (isWsl()) {
  if (!args.includes('--tunnel') && !args.includes('--lan') && !args.includes('--localhost')) args.unshift('--tunnel');

  if (!env.EXPO_PUBLIC_API_URL && !definedInDotEnv()) {
    console.log("[start] WSL2 : détection de l'IP Windows…");
    const ip = powershell(
      "$i=(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceIndex;" +
        '(Get-NetIPAddress -InterfaceIndex $i -AddressFamily IPv4 | Select-Object -First 1).IPAddress',
    );
    if (ip && isIpv4(ip)) {
      env.EXPO_PUBLIC_API_URL = `http://${ip}:${WSL_API_PORT}`;
      console.log(`[start] WSL2 : API détectée à ${env.EXPO_PUBLIC_API_URL}`);
      const rules = powershell('netsh interface portproxy show v4tov4');
      if (rules !== null && !new RegExp(`\\b${WSL_API_PORT}\\b`).test(rules)) {
        console.warn(
          `[start] Aucune redirection du port ${WSL_API_PORT} trouvée côté Windows : l'API sera injoignable depuis le téléphone.\n` +
            '        Voir la section « WSL2 » du README (commande netsh, une seule fois).',
        );
      }
    } else {
      console.warn("[start] IP Windows introuvable : définir EXPO_PUBLIC_API_URL dans .env (voir le README).");
    }
  }
} else {
  try {
    updateApiIp();
  } catch (error) {
    console.error(`[start] ${error.message}`);
    process.exit(1);
  }
}

let expoCli;
try {
  expoCli = require.resolve('expo/bin/cli');
} catch (err) {
  console.error(`[start] CLI Expo introuvable : exécuter npm ci dans le dépôt Mobile.\n${err.message}`);
  process.exit(1);
}

const child = spawn(process.execPath, [expoCli, 'start', ...args], { stdio: 'inherit', env });
child.on('error', (err) => {
  console.error(`[start] Impossible de lancer expo : ${err.message}`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
