import {readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const files=['public/index.html','public/style.css','public/app.js','public/tools.js','public/config.js','public/favicon.svg','src/server.mjs','src/handler.mjs','api/session.mjs','api/accounts.mjs','api/connection.mjs','api/logout.mjs','api/deriv-login.mjs','api/deriv-signup.mjs','api/deriv-callback.mjs'];
for(const file of files){await access(new URL(file,root));if(/\.(m?js)$/.test(file)){const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL(file,root))],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}}
const config=JSON.parse(await readFile(new URL('vercel.json',root),'utf8'));
if(config.outputDirectory!=='public')throw Error('Unexpected Vercel output directory.');
for(const file of files.filter(f=>f.startsWith('api/'))){const route=await import(new URL(file,root));if(typeof route.default?.fetch!=='function')throw Error('Missing Web handler: '+file);}
console.log('Vercel source validated: static frontend and 7 Node.js API functions.');
