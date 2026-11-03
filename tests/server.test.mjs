import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {endpoint} from '../src/handler.mjs';
import app from '../src/server.mjs';
globalThis.crypto??=webcrypto;

test('Vercel routes preserve OAuth, cookies, account ownership and demo/real isolation',async()=>{
 const keys=['DERIV_APP_ID','DERIV_SESSION_SECRET','PUBLIC_SITE_URL','VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL','VERCEL_BRANCH_URL'];
 const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));const originalFetch=globalThis.fetch;
 Object.assign(process.env,{DERIV_APP_ID:'34Qe611c7mms83D7TD4GM',DERIV_SESSION_SECRET:'test-only-session-encryption-key-32-plus-characters',PUBLIC_SITE_URL:'https://tradenexaai.site',VERCEL_URL:'deployment-example.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'tradenexa-example.vercel.app'});
 let calls=[],failToken=false;
 globalThis.fetch=async(url,options)=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith('/oauth2/token'))return failToken?Response.json({error:'invalid_client',error_description:'do-not-echo'},{status:400}):Response.json({access_token:'test-only-access-token',expires_in:600});
  if(String(url).endsWith('/accounts'))return Response.json({data:[{account_id:'DOT123',currency:'USD',account_type:'demo',balance:10000,status:'active'},{account_id:'ROT456',currency:'USD',account_type:'real',balance:25,status:'active'}]});
  if(String(url).endsWith('/DOT123/otp'))return Response.json({data:{url:'wss://api.derivws.com/trading/v1/options/ws/demo?otp=test-demo'}});
  if(String(url).endsWith('/ROT456/otp'))return Response.json({data:{url:'wss://api.derivws.com/trading/v1/options/ws/real?otp=test-real'}});
  throw Error('Unexpected external request in test');
 };
 const origin='https://tradenexaai.site';
 const call=(target,options={},requestPath=target)=>endpoint(target).fetch(new Request(origin+requestPath,options));
 try{
  let res=await call('/api/session');let data=await res.json();assert.equal(data.loginReady,true);assert.equal(data.authenticated,false);assert.equal(data.appId,process.env.DERIV_APP_ID);assert.equal(data.redirectUri,origin+'/auth/deriv/callback');
  res=await app.fetch(new Request('https://untrusted.test/api/session'),process.env);assert.equal(res.status,421);
  res=await call('/auth/deriv/login',{},'/api/deriv-login');assert.equal(res.status,302);const login=new URL(res.headers.get('Location'));assert.equal(login.origin,'https://auth.deriv.com');assert.equal(login.searchParams.get('client_id'),process.env.DERIV_APP_ID);assert.equal(login.searchParams.get('scope'),'trade');assert.equal(login.searchParams.get('code_challenge_method'),'S256');assert.equal(login.searchParams.get('redirect_uri'),origin+'/auth/deriv/callback');
  const flow=res.headers.getSetCookie()[0].split(';')[0];assert.match(res.headers.getSetCookie()[0],/Secure; HttpOnly; SameSite=Lax/);
  res=await call('/auth/deriv/callback',{headers:{Cookie:flow}},'/api/deriv-callback?code=test-code&state=wrong');assert.equal(res.headers.get('Location'),'/?connection_error=state');assert.equal(calls.length,0);
  res=await call('/auth/deriv/callback',{headers:{Cookie:flow,'oai-authenticated-user-id':'untrusted-header'}},'/api/deriv-callback?code=test-code&state='+login.searchParams.get('state'));assert.equal(res.status,303);assert.equal(res.headers.get('Location'),'/');
  const sessionHeader=res.headers.getSetCookie().find(c=>c.startsWith('__Host-tradenexa_session='));assert.ok(sessionHeader);assert.ok(!sessionHeader.includes('test-only-access-token'));const session=sessionHeader.split(';')[0];
  const tokenCall=calls.find(c=>c.url.endsWith('/oauth2/token'));assert.equal(tokenCall.options.body.get('code'),'test-code');assert.equal(tokenCall.options.body.get('redirect_uri'),origin+'/auth/deriv/callback');const verifier=tokenCall.options.body.get('code_verifier');assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url'),login.searchParams.get('code_challenge'));
  res=await call('/api/session',{headers:{Cookie:session}});assert.equal((await res.json()).authenticated,true);
  res=await call('/api/accounts',{headers:{Cookie:session}});const accountText=await res.text();assert.equal(JSON.parse(accountText).accounts.length,2);assert.ok(!accountText.includes('test-only-access-token'));
  for(const [id,type] of [['DOT123','demo'],['ROT456','real']]){res=await call('/api/connection',{method:'POST',headers:{Cookie:session,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({accountId:id})});assert.equal(res.status,200);const connection=await res.json();assert.equal(connection.account.account_type,type);assert.ok(connection.url.includes('/ws/'+type+'?otp='));}
  res=await call('/api/connection',{method:'POST',headers:{Cookie:session,Origin:'https://attacker.test','Content-Type':'application/json'},body:JSON.stringify({accountId:'DOT123'})});assert.equal(res.status,403);
  res=await call('/api/connection',{method:'POST',headers:{Cookie:session,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({accountId:'OTHER999'})});assert.equal(res.status,403);
  res=await call('/api/session',{headers:{Cookie:session+'tampered'}});assert.equal((await res.json()).authenticated,false);
  const savedApp=process.env.DERIV_APP_ID;process.env.DERIV_APP_ID='another-app';res=await call('/api/session',{headers:{Cookie:session}});assert.equal((await res.json()).authenticated,false);process.env.DERIV_APP_ID=savedApp;
  const now=Date.now;try{Date.now=()=>now()+601000;res=await call('/api/session',{headers:{Cookie:session}});}finally{Date.now=now;}assert.equal((await res.json()).authenticated,false);
  res=await call('/api/logout',{method:'POST',headers:{Cookie:session,Origin:origin}});assert.match(res.headers.get('Set-Cookie'),/Max-Age=0/);
  res=await endpoint('/auth/deriv/login').fetch(new Request('https://tradenexa-example.vercel.app/api/deriv-login'));const vercelLogin=new URL(res.headers.get('Location'));assert.equal(vercelLogin.searchParams.get('redirect_uri'),'https://tradenexa-example.vercel.app/auth/deriv/callback');
  res=await call('/auth/deriv/signup',{},'/api/deriv-signup');assert.equal(new URL(res.headers.get('Location')).searchParams.get('prompt'),'registration');
  failToken=true;res=await call('/auth/deriv/login');const failedLogin=new URL(res.headers.get('Location')),failedFlow=res.headers.getSetCookie()[0].split(';')[0];res=await call('/auth/deriv/callback',{headers:{Cookie:failedFlow}},'/api/deriv-callback?code=failed-test&state='+failedLogin.searchParams.get('state'));assert.equal(res.headers.get('Location'),'/?connection_error=invalid_client');assert.ok(!res.headers.get('Location').includes('do-not-echo'));
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');assert.match(html,/TradeNexaAI/);assert.ok(!html.includes('luvai-trade-terminal'));
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}}
});
