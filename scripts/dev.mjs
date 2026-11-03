import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {endpoint} from '../src/handler.mjs';
// Local development only. Production values come from Vercel's environment.
try{for(const line of (await readFile(new URL('../.env.local',import.meta.url),'utf8')).split('\n')){const match=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].trim();}}catch(e){if(e.code!=='ENOENT')throw e;}
const port=Number(process.env.PORT||3000);
process.env.PUBLIC_SITE_URL||='http://localhost:'+port;
process.env.DERIV_SESSION_SECRET||=randomBytes(48).toString('base64url');
const routes=new Map(['/api/session','/api/accounts','/api/connection','/api/logout','/auth/deriv/login','/auth/deriv/signup','/auth/deriv/callback'].map(path=>[path,endpoint(path)]));
const assets=new Map([['/','index.html'],['/index.html','index.html'],['/style.css','style.css'],['/app.js','app.js'],['/tools.js','tools.js'],['/config.js','config.js'],['/favicon.ico','favicon.svg'],['/favicon.svg','favicon.svg']]);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,process.env.PUBLIC_SITE_URL),path=url.pathname;
  if(routes.has(path)){const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await routes.get(path).fetch(new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}));res.statusCode=response.status;response.headers.forEach((value,name)=>{if(name!=='set-cookie')res.setHeader(name,value);});if(response.headers.getSetCookie().length)res.setHeader('Set-Cookie',response.headers.getSetCookie());res.end(Buffer.from(await response.arrayBuffer()));return;}
  const file=assets.get(path);if(!file){res.statusCode=404;res.end('Not found');return;}res.setHeader('Content-Type',types[file.split('.').at(-1)]);res.end(await readFile(new URL('../public/'+file,import.meta.url)));
 }catch{res.statusCode=500;res.end('Development request failed');}
}).listen(port,()=>console.log('Local: http://localhost:'+port));
