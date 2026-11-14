import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { peers, discoveryScopes, broadcast, related, type Peer } from './presence.js';
import { clientAddress } from './security.js';
const colors = ['Blue','Silver','Green','Orange','Violet','Golden','Quiet','Swift'];
const animals = ['Panther','Fox','Falcon','Tiger','Otter','Lynx','Robin','Wolf'];
const pick = (a:string[]) => a[randomBytes(1)[0] % a.length];
function deviceType(ua:string):string {if(/iPad/i.test(ua))return 'Tablet';if(/iPhone|iPod/i.test(ua))return 'iPhone';if(/Android/i.test(ua))return /Mobile/i.test(ua)?'Android phone':'Tablet';if(/Windows/i.test(ua))return 'Windows PC';if(/Macintosh|Mac OS/i.test(ua))return 'Mac';if(/Linux/i.test(ua))return 'Linux PC';return 'Device';}
function send(p:Peer,data:unknown){if(p.ws.readyState===1)p.ws.send(JSON.stringify(data));}
export function attach(ws:WebSocket,req:IncomingMessage){
 if(peers.size>=Number(process.env.MAX_CONNECTIONS||1000)){ws.close(1013,'Server busy');return;}
 const device={id:randomUUID(),name:`${pick(colors)} ${pick(animals)}`,type:deviceType(req.headers['user-agent']||'')};
 const peer:Peer={ws,device,scopes:discoveryScopes(clientAddress(req),process.argv.includes('--lan')),endsAt:Date.now()+12*60*60*1000,alive:true,count:0,reset:Date.now()+10000};
 peers.set(device.id,peer);send(peer,{type:'hello',device});broadcast();
 ws.on('pong',()=>{peer.alive=true;});
 ws.on('message',raw=>{if(Date.now()>peer.reset){peer.reset=Date.now()+10000;peer.count=0;}if(++peer.count>100){ws.close(1008,'Rate limit');return;}
  let msg:any;try{msg=JSON.parse(raw.toString());}catch{ws.close(1003,'Invalid message');return;}
  if(msg && msg.type==='signal' && typeof msg.to==='string' && msg.data && typeof msg.data==='object'){const dest=peers.get(msg.to);if(dest && related(peer,dest))send(dest,{type:'signal',from:device.id,data:msg.data});}
 });
 ws.on('close',()=>{peers.delete(device.id);broadcast();});ws.on('error',()=>ws.terminate());
}
