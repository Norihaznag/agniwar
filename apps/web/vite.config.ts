import { defineConfig, type Connect } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
function staticDirectories(req:Connect.IncomingMessage,_res:unknown,next:()=>void){const pathname=(req.url||'').split('?')[0];if(/^\/(guides|about|contact|privacy|terms)(\/[a-z0-9-]+)?\/?$/.test(pathname)){const path=pathname.replace(/\/$/,'')+'/index.html';if(existsSync(resolve('public',path.slice(1))))req.url=path;}next();}
export default defineConfig({plugins:[{name:'site',configureServer(server){server.middlewares.use(staticDirectories);},configurePreviewServer(server){server.middlewares.use(staticDirectories);},transformIndexHtml(html){const base=(process.env.PUBLIC_SITE_URL||'https://www.agniwar.com').replace(/\/$/,'');return html.replace('</head>', `<link rel="canonical" href="${base}/"><meta property="og:url" content="${base}/"></head>`);}}],build:{target:'es2022'},server:{port:5173}});
