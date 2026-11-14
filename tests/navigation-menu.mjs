import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox']});
try{
 for(const width of [320,375,600,1024]){
  const c=await browser.newContext({viewport:{width,height:720}});const p=await c.newPage();
  for(const path of ['/','/guides/','/about/']){
   await p.goto('http://localhost:5173'+path);assert.equal(await p.locator('.brand').getAttribute('href'),'/');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${path} overflow at ${width}`);
   for(const selector of ['.brand','#theme','#menu-toggle']){const box=await p.locator(selector).boundingBox();if(box) assert.ok(box.x>=0 && box.x+box.width<=width,`${path} ${selector} clipped at ${width}`)}const menu=p.locator('#menu-toggle'), nav=p.locator('#site-nav');
   if(width<=600){assert.equal(await menu.isVisible(),true);assert.equal(await nav.isVisible(),false);await menu.click();assert.equal(await nav.isVisible(),true);assert.equal(await menu.getAttribute('aria-expanded'),'true');assert.equal(await nav.getByText('Guides',{exact:true}).isVisible(),true);await p.keyboard.press('Escape');assert.equal(await nav.isVisible(),false);assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.equal(await menu.evaluate(el=>document.activeElement===el),true);await menu.click();await nav.getByRole('link',{name:'About'}).click();await p.waitForURL('**/about/');}
   else{assert.equal(await menu.isVisible(),false);assert.equal(await nav.isVisible(),true)}
   await p.goto('http://localhost:5173'+path);await p.locator('.brand').click();await p.waitForURL('http://localhost:5173/');assert.equal(await p.locator('h1').innerText(),'Share files between devices.');
  }
  await p.goto('http://localhost:5173/');await p.waitForSelector('#connection:text("Connected")');assert.equal(await p.locator('.connection .dot').evaluate(el=>el.classList.contains('offline')),false);assert.ok(await p.locator('.connection .dot').evaluate(el=>getComputedStyle(el).maskImage.includes('svg')));
  if(width===375){await p.screenshot({path:'/data/agniwar-menu-closed.png'});await p.locator('#menu-toggle').click();await p.screenshot({path:'/data/agniwar-menu-open.png'});}
  await c.close();
 }
 const c=await browser.newContext({viewport:{width:1280,height:720}});const p=await c.newPage();await p.goto('http://localhost:5173/');await p.screenshot({path:'/data/agniwar-menu-desktop.png'});await c.close();
 console.log('PASS: logo home, desktop navigation, mobile menu, Escape, menu links, check icon and no overflow');
} finally {await browser.close();}
