import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { attach } from './signaling.js';
import { peers } from './presence.js';
import { originAllowed, clientAddress } from './security.js';
const server = createServer((req,res)=>{ if(req.url==='/health'){res.writeHead(200,{'content-type':'text/plain'});res.end('ok');}else{res.writeHead(404);res.end();} });
const attempts = new Map<string,{count:number;reset:number}>();
const wss = new WebSocketServer({noServer:true,maxPayload:32768,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
  const ip=clientAddress(req); const now=Date.now(); const a=attempts.get(ip); if (!a || a.reset<now) attempts.set(ip,{count:1,reset:now+60000}); else a.count++;
  if ((attempts.get(ip)?.count || 0)>60 || !originAllowed(req) || req.url !== '/signal') { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req,socket,head,ws=>attach(ws,req));
});
const timer=setInterval(()=>{for(const [ip,a] of attempts)if(a.reset<Date.now())attempts.delete(ip);for(const p of peers.values()){if(Date.now()>p.endsAt){p.ws.close(1000,'Session expired');continue;}if(!p.alive){p.ws.terminate();continue;}p.alive=false;p.ws.ping();}},30000);
wss.on('close',()=>clearInterval(timer));
const port=Number(process.env.PORT || 8787); server.listen(port,'0.0.0.0',()=>console.log(`AGNIWAR signaling listening on ${port} (${process.argv.includes('--lan') ? 'local LAN discovery' : 'public-IP discovery'})`));
