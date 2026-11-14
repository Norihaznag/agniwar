import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/local/bin/chromium',args:['--no-sandbox']});
try {
 for(const [width,height] of [[320,568],[360,640],[390,844],[600,700],[768,1024],[960,540],[1280,720],[1365,900],[1536,1024]]) {
  const context=await browser.newContext({viewport:{width,height},colorScheme:'light'});
  const page=await context.newPage();
  await page.goto('http://localhost:5173/transfer');
  await page.waitForSelector('#connection:text("Connected")');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}x${height} overflow`);
  for(const sel of ['.mark','#theme','.empty-icon']) {
   assert.equal(await page.locator(sel).evaluate(el=>el.childNodes.length),0,`${sel} should contain only its CSS icon`);
   const tracks=await page.locator(sel).evaluate(el=>getComputedStyle(el).gridTemplateRows.split(' ').length);
   assert.equal(tracks,1,`${sel} icon must stay in one centered grid track`);
  }
  if(width===1280){await page.screenshot({path:'/data/agniwar-responsive-desktop.png',fullPage:true});}
  if(width===320){await page.screenshot({path:'/data/agniwar-responsive-mobile.png',fullPage:true});}
  await page.goto('http://localhost:5173/guides/');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}x${height} guides overflow`);
  assert.equal(await page.locator('.brand > span').evaluate(el=>el.childNodes.length),0,'guide logo icon must be centered');
  await context.close();
 }
 const a=await browser.newContext({viewport:{width:390,height:844}}), b=await browser.newContext();
 const p=await a.newPage(),q=await b.newPage();await Promise.all([p.goto('http://localhost:5173/transfer'),q.goto('http://localhost:5173/transfer')]);
 await p.locator('.device').first().waitFor();
 assert.equal(await p.locator('.device-arrow').first().evaluate(el=>el.childNodes.length),0,'device arrow must be centered');
 assert.equal(await p.locator('.device-arrow').first().evaluate(el=>getComputedStyle(el).gridTemplateRows.split(' ').length),1);
 await a.close();await b.close();
 console.log('PASS: nine viewport sizes, empty and real-device icon grid alignment, guides, no horizontal overflow');
} finally {await browser.close();}
