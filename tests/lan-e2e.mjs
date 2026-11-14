import {chromium} from 'playwright';
import {networkInterfaces} from 'node:os';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const ip=process.env.LAN_TEST_IP || Object.values(networkInterfaces()).flat().find(x=>x&&!x.internal&&x.family==='IPv4'&&(/^(10\.|192\.168\.|169\.254\.)/.test(x.address)||/^172\.(1[6-9]|2\d|3[01])\./.test(x.address)))?.address;
if(!ip)throw Error('Set LAN_TEST_IP to a private IPv4 address of the server machine');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/local/bin/chromium')?'/usr/local/bin/chromium':chromium.executablePath()),args:['--no-sandbox','--no-proxy-server']});
const pc=await browser.newContext(),phone=await browser.newContext({userAgent:'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'});
try{
 await Promise.all([pc.addInitScript(()=>{Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true});}),phone.addInitScript(()=>{Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true});})]);const a=await pc.newPage(),b=await phone.newPage();const errors=[];for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
 await Promise.all([a.goto('http://localhost:5173/transfer'),b.goto(`http://${ip}:5173/transfer`)]);
 await Promise.all([a.locator('.device').first().waitFor({timeout:15000}),b.locator('.device').first().waitFor({timeout:15000})]);
 assert.match(await a.locator('.device').first().innerText(),/Android phone/);
 assert.equal(await b.evaluate(()=>isSecureContext),false);
 assert.equal(await a.locator('#open-pair').count(),0);
 console.log('PASS: automatic discovery via localhost and LAN address');
 async function send(sender,receiver,text){await sender.locator('.device').first().click();await sender.locator('input[type=file]').setInputFiles({name:'lan.txt',mimeType:'text/plain',buffer:Buffer.from(text)});await sender.getByRole('button',{name:'Send files'}).click();await receiver.getByRole('button',{name:'Accept files'}).click({timeout:25000});await Promise.all([sender.getByRole('heading',{name:'Transfer complete.'}).waitFor({timeout:30000}),receiver.getByRole('heading',{name:'Transfer complete.'}).waitFor({timeout:30000})]);assert.equal(await receiver.locator('.download').evaluate(async el=>(await fetch(el.href)).text()),text);await sender.getByRole('button',{name:'Done'}).click();await receiver.getByRole('button',{name:'Done'}).click();}
 await send(a,b,'PC to Android browser');await b.reload();const history=b.locator('.history-download').first();await history.waitFor();const download=b.waitForEvent('download');await history.click();assert.equal((await readFile(await (await download).path())).toString(),'PC to Android browser');console.log('PASS: HTTP LAN fallback retained the file across refresh');await send(b,a,'Android browser to PC');assert.deepEqual(errors,[]);console.log('PASS: verified transfers in both directions on localhost and HTTP LAN address');
 await b.setViewportSize({width:390,height:844});await b.screenshot({path:'/data/agniwar-lan-mobile.png',fullPage:true});
}finally{await pc.close();await phone.close();await browser.close();}
