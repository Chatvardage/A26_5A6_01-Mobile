#!/usr/bin/env node
/**
 * Met à jour l'adresse LAN de l'API dans `.env`.
 *
 * Usage : `npm run update-ip` ou `node scripts/update-api-ip.js --ip 192.168.1.10`.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENV_FILE = path.join(__dirname, '..', '.env');
const API_VARIABLE = 'EXPO_PUBLIC_API_URL';
const DEFAULT_API_PORT = 3000;

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function getLocalIpv4Addresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((network) => network.family === 'IPv4' && !network.internal && isPrivateIpv4(network.address))
    .map((network) => network.address);
}

function isWsl() {
  try {
    return process.platform === 'linux' && /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
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
    if (process.platform === 'linux' && !isWsl()) url.port = String(DEFAULT_API_PORT);
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

function parseArguments(args) {
  const ipIndex = args.indexOf('--ip');
  if (ipIndex !== -1) {
    const ip = args[ipIndex + 1];
    if (!ip || !isPrivateIpv4(ip)) throw new Error('L’option --ip doit contenir une IPv4 privée valide.');
    return ip;
  }
  if (args.length > 0) throw new Error('Option inconnue. Utiliser `--ip <IPv4>` ou aucune option.');
  return null;
}

function main() {
  const requestedIp = parseArguments(process.argv.slice(2));
  const ip = requestedIp ?? getLocalIpv4Addresses()[0];
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
  console.log(`[update-ip] ${API_VARIABLE}=${apiUrl}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[update-ip] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildApiUrl, getLocalIpv4Addresses, isPrivateIpv4, readConfiguredUrl, updateEnvContent };
