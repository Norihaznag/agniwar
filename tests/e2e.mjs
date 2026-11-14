import { chromium } from 'playwright';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'agniwar-test-'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : chromium.executablePath()),args:['--no-sandbox']});
const contexts=[];
try{
  const a=await browser.newContext({acceptDownloads:true});const b=await browser.newContext({acceptDownloads:true});contexts.push(a,b);
  await Promise.all([a.addInitScript(()=>{Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true});}),b.addInitScript(()=>{Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true});})]);const p=await a.newPage(),q=await b.newPage();
  const errors=[];for(const page of [p,q])page.on('pageerror',e=>errors.push(e.message));
  await Promise.all([p.goto('http://localhost:5173/transfer'),q.goto('http://localhost:5173/transfer')]);
  await Promise.all([p.locator('.device').first().waitFor({timeout:15000}),q.locator('.device').first().waitFor({timeout:15000})]);
  await p.screenshot({path:'/data/agniwar-desktop.png',fullPage:true});
  const data=randomBytes(Number(process.env.TEST_MIB || 10)*1024*1024+13);const expected=createHash('sha256').update(data).digest('hex');await writeFile(join(dir,'test.bin'),data);await writeFile(join(dir,'note.txt'),'second file');
  // The user selects a peer before opening the file picker.
  await p.locator('.device').first().click();
  await p.locator('input[type=file]').setInputFiles([join(dir,'test.bin'),join(dir,'note.txt')]);
  await p.getByRole('button',{name:'Send files'}).click();
  await q.getByRole('heading',{name:'Incoming files'}).waitFor({timeout:25000});
  await q.screenshot({path:'/data/agniwar-incoming.png',fullPage:true});await q.getByRole('button',{name:'Accept files'}).click();
  await Promise.all([p.getByRole('heading',{name:'Transfer complete.'}).waitFor({timeout:180000}),q.getByRole('heading',{name:'Transfer complete.'}).waitFor({timeout:180000})]);
  const actual=await q.locator('.download').first().evaluate(async el=>{const r=await fetch(el.href);const b=await r.arrayBuffer();const d=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(d),v=>v.toString(16).padStart(2,'0')).join('');});
  assert.equal(actual,expected);assert.equal(await q.locator('.download').count(),2);assert.equal(await q.locator('.download').nth(1).evaluate(async el=>(await fetch(el.href)).text()),'second file');assert.deepEqual(errors,[]);console.log('PASS: discovery, consent, WebRTC transfer, SHA-256, download');
  await p.getByRole('button',{name:'Done'}).click();await q.getByRole('button',{name:'Done'}).click();
  await p.locator('.device').first().click();await p.locator('input[type=file]').setInputFiles({name:'rejected.txt',mimeType:'text/plain',buffer:Buffer.from('no')});await p.getByRole('button',{name:'Send files'}).click();await q.getByRole('button',{name:'Decline'}).click();await p.getByRole('heading',{name:'Transfer declined'}).waitFor({timeout:10000});console.log('PASS: receiver rejection');
  await p.getByRole('button',{name:'Done'}).click();await p.locator('.device').first().click();await p.locator('input[type=file]').setInputFiles({name:'cancel.txt',mimeType:'text/plain',buffer:Buffer.from('cancel')});await p.getByRole('button',{name:'Send files'}).click();await q.getByRole('heading',{name:'Incoming files'}).waitFor({timeout:25000});await p.getByRole('button',{name:'Cancel transfer'}).click();await q.getByRole('heading',{name:'Transfer stopped'}).waitFor({timeout:10000});await p.waitForTimeout(500);assert.equal(await p.locator('dialog').evaluate(el=>el.open),false);console.log('PASS: cancellation and recovery to idle');
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});await mobile.goto('http://localhost:5173/transfer');await mobile.screenshot({path:'/data/agniwar-mobile.png',fullPage:true});await mobile.close();
} finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();await rm(dir,{recursive:true,force:true});}
