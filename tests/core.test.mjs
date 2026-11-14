import {test} from 'node:test';
import assert from 'node:assert/strict';
import {networkScope,discoveryScopes} from '../server/dist/server/src/presence.js';
import {originAllowed,clientAddress} from '../server/dist/server/src/security.js';
const intersects=(a,b)=>[...a].some(x=>b.has(x));
const interfaces={wifi:[{address:'192.168.1.76',netmask:'255.255.255.0',family:'IPv4',internal:false}],loop:[{address:'127.0.0.1',netmask:'255.0.0.0',family:'IPv4',internal:true}]};
test('LAN mode groups localhost and distinct devices on the actual host subnet',()=>{const laptop=discoveryScopes('::1',true,interfaces),phone=discoveryScopes('::ffff:192.168.1.53',true,interfaces),other=discoveryScopes('192.168.2.53',true,interfaces);assert.ok(intersects(laptop,phone));assert.ok(!intersects(laptop,other));assert.ok(!intersects(phone,other));});
test('normal public mode uses exact IP, not subnet',()=>{assert.ok(!intersects(discoveryScopes('192.168.1.7',false,interfaces),discoveryScopes('192.168.1.8',false,interfaces)));assert.equal(networkScope('address:192.0.2.1'),networkScope('address:192.0.2.1'));});
test('origin is exact and forwarding is disabled by default',()=>{delete process.env.ALLOWED_ORIGINS;delete process.env.TRUST_PROXY;const req={headers:{origin:'http://localhost:5173','x-forwarded-for':'203.0.113.1'},socket:{remoteAddress:'127.0.0.1'}};assert.equal(originAllowed(req),true);assert.equal(clientAddress(req),'127.0.0.1');req.headers.origin='https://evil.example';assert.equal(originAllowed(req),false);});

test('LAN dev allows only the host private address on the Vite port',()=>{const req={headers:{origin:'http://192.168.1.76:5173'}};assert.equal(originAllowed(req,true,interfaces),true);assert.equal(originAllowed(req,false,interfaces),false);req.headers.origin='http://192.168.1.53:5173';assert.equal(originAllowed(req,true,interfaces),false);req.headers.origin='http://192.168.1.76:80';assert.equal(originAllowed(req,true,interfaces),false);});
