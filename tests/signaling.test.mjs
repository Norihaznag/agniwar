import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {networkInterfaces} from 'node:os';
import WebSocket from 'ws';
import {once} from 'node:events';
const port=18787, origin='https://agniwar-test.example';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function connect(ip,originHeader=origin){return new WebSocket(`ws://127.0.0.1:${port}/signal`,{headers:{Origin:originHeader,'X-Forwarded-For':ip}});}
function inbox(ws){const messages=[];ws.on('message',m=>messages.push(JSON.parse(m)));return async predicate=>{for(let n=0;n<100;n++){const i=messages.findIndex(predicate);if(i>=0)return messages.splice(i,1)[0];await wait(30);}throw Error('Expected signaling message not received: '+JSON.stringify(messages));};}
test('LAN discovery connects loopback and local subnet, while isolating outsiders',async t=>{
 const iface=Object.values(networkInterfaces()).flat().find(x=>x&&!x.internal&&x.family==='IPv4'&&(/^(10\.|192\.168\.|169\.254\.)/.test(x.address)||/^172\.(1[6-9]|2\d|3[01])\./.test(x.address)));
 if(!iface){t.skip('No private IPv4 interface available; unit test uses synthetic interfaces');return;}
 // XFF is enabled solely to simulate separate client addresses; never expose it without a trusted proxy.
 const server=spawn(process.execPath,['server/dist/server/src/server.js','--lan'],{env:{...process.env,PORT:String(port),ALLOWED_ORIGINS:origin,TRUST_PROXY:'true'},stdio:'ignore'});let a,b,c,bad;
 try{await wait(500);bad=connect('203.0.113.9','https://invalid.example');const err=await once(bad,'error');assert.match(String(err[0]),/403/);
 a=connect('127.0.0.1');b=connect(iface.address);c=connect('203.0.113.99');const ma=inbox(a),mb=inbox(b),mc=inbox(c);
 const [ha,hb]=await Promise.all([ma(x=>x.type==='hello'),mb(x=>x.type==='hello'),mc(x=>x.type==='hello')]);
 const [pa,pb,pc]=await Promise.all([ma(x=>x.type==='peers'&&x.peers.some(d=>d.id===hb.device.id)),mb(x=>x.type==='peers'&&x.peers.some(d=>d.id===ha.device.id)),mc(x=>x.type==='peers')]);
 assert.equal(pa.peers.length,1);assert.equal(pb.peers.length,1);assert.equal(pc.peers.length,0);
 a.send(JSON.stringify({type:'signal',to:hb.device.id,data:{test:'hello'}}));assert.equal((await mb(x=>x.type==='signal')).data.test,'hello');
 b.close();await ma(x=>x.type==='peers'&&x.peers.length===0);
 }finally{a?.close();b?.close();c?.close();bad?.terminate();server.kill();}
});
