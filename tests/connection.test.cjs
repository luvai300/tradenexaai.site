const assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs');
const elements=new Map(),timers=new Map();let nextTimer=0;
function element(id){if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',hidden:false,disabled:false,classList:{add(){},remove(){},toggle(){}},selectedOptions:[{textContent:id}],addEventListener(){},replaceChildren(){},append(){},getBoundingClientRect:()=>({width:0}),showModal(){},close(){}});return elements.get(id);}
const context=vm.createContext({console,URL,Map,Set,Date,Number,String,Math,Error,Promise,navigator:{onLine:true},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},setInterval:()=>1,clearInterval(){},location:{href:'https://example.test/',origin:'https://example.test',pathname:'/'},document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>({append(){}})},window:{TRADE_CONFIG:{appId:'test'},addEventListener(){}},requestAnimationFrame(){}});
const run=s=>vm.runInContext(s,context);
run(readFileSync(__dirname+'/../public/app.js','utf8').replace('bootstrap();',''));
(async()=>{
 run("generation=7;desiredAccount={account_id:'ROT456',account_type:'real'};loggedIn=true;reconnectAttempt=0;calls=[];connect=async account=>{calls.push(account);};scheduleReconnect(7)");
 let timer=timers.get(run('reconnectTimer'));assert.equal(timer.ms,1000);await timer.fn();assert.equal(run('calls.length'),1);assert.equal(run('calls[0].account_id'),'ROT456');
 run('scheduleReconnect(7);generation=8');timer=timers.get(run('reconnectTimer'));await timer.fn();assert.equal(run('calls.length'),1);
 run('generation=9;reconnectAttempt=5;scheduleReconnect(9)');assert.match(element('connectionNoticeTitle').textContent,/Unable to reach/);
 run("reconnectAttempt=0;navigator.onLine=false;scheduleReconnect(9)");assert.equal(element('connectionNoticeTitle').textContent,'You are offline');
 run("loggedIn=false;auth={loginid:'ROT456',is_virtual:false};quote={id:'old'};expireDerivSession()");assert.equal(run('auth'),null);assert.equal(run('quote'),null);assert.equal(element('noticeLogin').hidden,false);
 const digits=[{contract_type:'DIGITEVEN',min_contract_duration:'1t',max_contract_duration:'10t'}];context.specs=digits;
 assert.equal(run("supportsDuration(specs,'DIGITEVEN','t',5)"),true);assert.equal(run("supportsDuration(specs,'DIGITEVEN','m',5)"),false);assert.equal(run("supportsDuration(specs,'DIGITEVEN','t',11)"),false);
 context.specs=[{contract_type:'CALL',min_contract_duration:'15s',max_contract_duration:'1d'}];assert.equal(run("supportsDuration(specs,'CALL','m',1)"),true);assert.equal(run("supportsDuration(specs,'CALL','t',5)"),false);
 console.log('PASS: capped reconnection; fresh account selection; stale reconnect rejection; offline state; session expiry invalidates quotes; provider duration validation. No orders executed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
