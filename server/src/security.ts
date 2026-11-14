import type { IncomingMessage } from 'node:http';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { isPrivateIPv4Address } from './presence.js';
export function originAllowed(req: IncomingMessage, lan=process.argv.includes('--lan'), interfaces:Record<string,NetworkInterfaceInfo[]|undefined>=networkInterfaces()): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  const configured = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim());
  if(configured.includes(origin))return true;
  // In local dev only, permit the web server on the machine's own private IPv4 address.
  // Never accept arbitrary LAN origins or apply this relaxation to production mode.
  if(lan)for(const list of Object.values(interfaces))for(const iface of list||[]){if(!iface.internal && iface.family==='IPv4' && isPrivateIPv4Address(iface.address) && origin===`http://${iface.address}:5173`)return true;}
  return false;
}
export function clientAddress(req: IncomingMessage): string {
  // Only enable behind a proxy which overwrites X-Forwarded-For; otherwise spoofable.
  const forwarded = process.env.TRUST_PROXY === 'true' ? req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() : '';
  return forwarded || req.socket.remoteAddress || 'unknown';
}
