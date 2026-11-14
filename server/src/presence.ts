import { createHmac, randomBytes } from 'node:crypto';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import type { WebSocket } from 'ws';
import type { Device } from '../../packages/shared/src/types.js';
const secret = randomBytes(32);
export type Peer = { ws: WebSocket; device: Device; scopes: Set<string>; endsAt: number; alive: boolean; count: number; reset: number };
export const peers = new Map<string, Peer>();
export function networkScope(value:string): string { return createHmac('sha256', secret).update(value).digest('hex'); }
const normalize=(ip:string)=>ip.startsWith('::ffff:')?ip.slice(7):ip;
function ipv4(address:string):number|undefined {const parts=address.split('.');if(parts.length!==4 || parts.some(p=>!/^\d{1,3}$/.test(p)||+p>255))return;return parts.reduce((n,p)=>((n<<8)|Number(p))>>>0,0);}
function privateAddress(n:number):boolean{return (n>>>24)===10 || (n>>>20)===0xac1 || (n>>>16)===0xc0a8 || (n>>>16)===0xa9fe;}
export function isPrivateIPv4Address(address:string):boolean {const n=ipv4(address);return n!==undefined && privateAddress(n);}
type Ifaces=Record<string,NetworkInterfaceInfo[]|undefined>;
// LAN mode groups only direct private IPv4 subnets of the machine running this server.
// A loopback client belongs to each such subnet because it is the server host itself.
export function discoveryScopes(address:string,lan:boolean,interfaces:Ifaces=networkInterfaces()):Set<string>{
 const normalized=normalize(address);const scopes=new Set([networkScope(`address:${normalized}`)]);
 if(!lan)return scopes;
 const ip=ipv4(normalized);const loopback=normalized==='::1'||(ip!==undefined && (ip>>>24)===127);
 for(const list of Object.values(interfaces)){for(const iface of list||[]){
  if(iface.internal || iface.family!=='IPv4')continue;
  const host=ipv4(iface.address), mask=ipv4(iface.netmask);if(host===undefined||mask===undefined||!privateAddress(host)||mask===0)continue;
  const subnet=(host & mask)>>>0;
  if(loopback || (ip!==undefined && privateAddress(ip) && ((ip & mask)>>>0)===subnet))scopes.add(networkScope(`lan:${subnet}/${mask}`));
 }}
 return scopes;
}
export function related(a: Peer, b: Peer): boolean { return a !== b && [...a.scopes].some(s => b.scopes.has(s)); }
export function broadcast(): void {for (const a of peers.values()) {const visible=[...peers.values()].filter(b=>related(a,b)).map(b=>b.device);if(a.ws.readyState===1)a.ws.send(JSON.stringify({type:'peers',peers:visible}));}}
