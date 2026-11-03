// Server-only Deriv OAuth and account endpoints, compatible with Vercel Node.js.
const DEFAULT_APP_ID = '34Qe611c7mms83D7TD4GM';
function appId(env){return env.DERIV_APP_ID?.trim()||DEFAULT_APP_ID;}
function trustedOrigins(env){
 const values=[env.PUBLIC_SITE_URL||'https://tradenexaai.site'];
 for(const key of ['VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL','VERCEL_BRANCH_URL'])if(env[key])values.push('https://'+env[key]);
 return new Set(values.map(value=>{const url=new URL(value);const local=['localhost','127.0.0.1'].includes(url.hostname);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(local&&url.protocol==='http:')))throw new Error('Invalid configured site origin.');return url.origin;}));
}
function redirectUri(request,env){const origin=new URL(request.url).origin;if(!trustedOrigins(env).has(origin))throw new HttpError('This hostname is not configured for Deriv login. Use the primary site address.',421);return origin+'/auth/deriv/callback';}
const API_BASE = 'https://api.derivws.com';
const SESSION = '__Host-tradenexa_session';
const FLOW = '__Host-tradenexa_flow';
const encoder = new TextEncoder();
const securityHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' wss://api.derivws.com; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'"
};
class HttpError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function response(body, status = 200, headers = {}) { return new Response(body, { status, headers: {...securityHeaders, ...headers} }); }
function json(body, status = 200) { return response(JSON.stringify(body), status, {'Content-Type':'application/json'}); }
function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function unb64(value) { return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0)); }
function random(size = 32) { return b64(crypto.getRandomValues(new Uint8Array(size))); }
async function key(env) { if (!env.DERIV_SESSION_SECRET || env.DERIV_SESSION_SECRET.length < 32) throw new HttpError('Secure login is not configured. Please contact the platform owner.',503); return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256',encoder.encode(env.DERIV_SESSION_SECRET)), 'AES-GCM',false,['encrypt','decrypt']); }
async function seal(value,env,purpose) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(purpose)},await key(env),encoder.encode(JSON.stringify(value))); return b64(iv)+'.'+b64(new Uint8Array(encrypted)); }
async function unseal(value,env,purpose) { try { if(!value||value.length>4096||value.split('.').length!==2)return null; const [iv,data]=value.split('.'); const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(purpose)},await key(env),unb64(data)); const result=JSON.parse(new TextDecoder().decode(decoded)); return result.exp>Date.now()?result:null; }catch{return null;} }
function cookie(name,value,age) { return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(age)}`; }
function readCookie(request,name) { return (request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||''; }
async function session(request,env) { const data=await unseal(readCookie(request,SESSION),env,SESSION); if(!data?.token||data.appId!==appId(env))return null; return data; }
function requireOrigin(request) { if(request.headers.get('Origin')!==new URL(request.url).origin)throw new HttpError('This request must originate from the trading terminal.',403); }
async function upstream(path,token,method='GET') { let res;try{res=await fetch(API_BASE+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(15000)});}catch{throw new HttpError('Deriv did not respond. Please retry shortly.',502);} if(res.status===401)throw new HttpError('Your Deriv login has expired. Connect Deriv again.',401); if(res.status===403)throw new HttpError('Deriv denied access. Check that your OAuth app has the trade permission.',403); if(!res.ok)throw new HttpError('Deriv could not complete the account request. Please retry shortly.',502);return res.json(); }
function accountList(payload) { const data=payload.data; const accounts=Array.isArray(data)?data:Array.isArray(data?.accounts)?data.accounts:null; if(!accounts)throw new HttpError('Deriv returned an unexpected account list.',502); return accounts.filter(a=>a.account_id&&a.currency&&['demo','real'].includes(a.account_type)&&(!a.status||a.status==='active')).map(a=>({account_id:String(a.account_id),currency:String(a.currency),account_type:a.account_type,balance:a.balance})); }
async function login(request,env) {
  const verifier=random(48), state=random(), exp=Date.now()+600000;
  const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))));
  const flow=await seal({verifier,state,exp,appId:appId(env),redirectUri:redirectUri(request,env)},env,FLOW);
  const url=new URL('https://auth.deriv.com/oauth2/auth');
  url.search=new URLSearchParams({...(new URL(request.url).pathname.endsWith('/signup')?{prompt:'registration'}:{}),response_type:'code',client_id:appId(env),redirect_uri:redirectUri(request,env),scope:'trade',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  return response(null,302,{'Location':url.href,'Set-Cookie':cookie(FLOW,flow,600)});
}
async function callback(request,env) {
  const url=new URL(request.url),flow=await unseal(readCookie(request,FLOW),env,FLOW);
  const headers=new Headers({...securityHeaders,'Location':'/','Set-Cookie':cookie(FLOW,'',0)});
  const fail=reason=>{headers.set('Location','/?connection_error='+reason);return new Response(null,{status:303,headers});};
  if(!flow||flow.appId!==appId(env)||flow.redirectUri!==redirectUri(request,env)||!url.searchParams.get('state')||url.searchParams.get('state')!==flow.state)return fail('state');
  if(url.searchParams.has('error'))return fail('denied');
  const code=url.searchParams.get('code');if(!code)return fail('code');
  let res;try{res=await fetch('https://auth.deriv.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',client_id:appId(env),code,code_verifier:flow.verifier,redirect_uri:flow.redirectUri}),signal:AbortSignal.timeout(15000)});}catch{return fail('exchange');}
  if(!res.ok){let error;try{error=await res.json();}catch{}const known=['invalid_client','invalid_grant','invalid_scope','unauthorized_client'];return fail(known.includes(error?.error)?error.error:'exchange');}
  let data;try{data=await res.json();}catch{return fail('exchange');}
  const lifetime=Number(data.expires_in);if(!data.access_token||!Number.isFinite(lifetime)||lifetime<=0)return fail('exchange');
  const age=Math.min(lifetime,28800);
  const encrypted=await seal({token:data.access_token,appId:appId(env),exp:Date.now()+age*1000},env,SESSION);
  if(encrypted.length>3800)return fail('session');
  headers.append('Set-Cookie',cookie(SESSION,encrypted,age));return new Response(null,{status:303,headers});
}
async function handle(request,env) {
  const {pathname}=new URL(request.url);
  if(request.method==='GET'&&['/auth/deriv/login','/auth/deriv/signup'].includes(pathname))return login(request,env);
  if(request.method==='GET'&&pathname==='/auth/deriv/callback')return callback(request,env);
  if(pathname==='/api/session'&&request.method==='GET'){const auth=await session(request,env);return json({authenticated:!!auth,expiresAt:auth?.exp||null,loginReady:!!env.DERIV_SESSION_SECRET&&env.DERIV_SESSION_SECRET.length>=32,appId:appId(env),redirectUri:redirectUri(request,env),requestedMarkup:3});}
  if(pathname==='/api/logout'&&request.method==='POST'){requireOrigin(request);return response(JSON.stringify({ok:true}),200,{'Content-Type':'application/json','Set-Cookie':cookie(SESSION,'',0)});}
  if(pathname==='/api/accounts'&&request.method==='GET'){const auth=await session(request,env);if(!auth)throw new HttpError('Connect your Deriv account first.',401);return json({accounts:accountList(await upstream('/trading/v1/options/accounts',auth.token))});}
  if(pathname==='/api/connection'&&request.method==='POST'){
    requireOrigin(request);const auth=await session(request,env);if(!auth)throw new HttpError('Connect your Deriv account first.',401);
    if(Number(request.headers.get('Content-Length'))>1024)throw new HttpError('Invalid account selection.');
    let body;try{body=await request.json();}catch{throw new HttpError('Invalid account selection.');}
    const id=body.accountId;if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw new HttpError('Select a valid account.');
    const accounts=accountList(await upstream('/trading/v1/options/accounts',auth.token));
    const account=accounts.find(a=>a.account_id===id);if(!account)throw new HttpError('This account is unavailable for your Deriv login.',403);
    const data=await upstream('/trading/v1/options/accounts/'+encodeURIComponent(id)+'/otp',auth.token,'POST');
    let url;try{url=new URL(data.data?.url);}catch{throw new HttpError('Deriv returned an invalid trading connection.',502);}
    if(url.protocol!=='wss:'||url.hostname!=='api.derivws.com'||url.pathname!=='/trading/v1/options/ws/'+account.account_type||!url.searchParams.get('otp'))throw new HttpError('Deriv returned an invalid trading connection.',502);
    return json({url:url.href,account});
  }
  if(['/favicon.ico','/favicon.svg'].includes(pathname)&&['GET','HEAD'].includes(request.method))return response(request.method==='HEAD'?null:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill="#13b99c"/><text x="32" y="47" font-family="Georgia,serif" font-style="italic" font-weight="bold" text-anchor="middle" font-size="47" fill="#081b18">N</text></svg>',200,{'Content-Type':'image/svg+xml'});
  if(pathname.startsWith('/api/')||pathname.startsWith('/auth/'))return json({error:'Endpoint not found.'},404);
  if(!['GET','HEAD'].includes(request.method))return response('Method not allowed',405);
  return response('Not found',404);
}
export default {async fetch(request,env){try{return await handle(request,env);}catch(e){return json({error:e instanceof HttpError?e.message:'Unable to complete this request. Please retry.'},e instanceof HttpError?e.status:500);}}};
