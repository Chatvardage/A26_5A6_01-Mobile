#!/usr/bin/env node
/**
 * Démarre Expo en adaptant la configuration au poste. Usage : `npm start [options expo]`.
 *
 * - Hors WSL2 : équivaut à `npx expo start`.
 * - Sous WSL2 : ajoute `--tunnel` (le téléphone n'atteint pas Metro autrement) et, si
 *   EXPO_PUBLIC_API_URL n'est définie ni dans l'environnement ni dans `.env`, la déduit de
 *   l'IP Wi-Fi actuelle de Windows (port 3001 : voir la redirection « netsh » du README).
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const WSL_API_PORT = 3001;
const args = process.argv.slice(2);
const env = { ...process.env };

function isWsl() {
  try {
    return process.platform === 'linux' && /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

function isIpv4(value) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
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
