const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',hidden:false,disabled:false,classList:{add(){},remove(){},toggle(){}},selectedOptions:[{textContent:id}],addEventListener(){},replaceChildren(){},append(){},getBoundingClientRect:()=>({width:0}),showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
const store={getItem:()=>null,setItem(){},removeItem(){}};
const context=vm.createContext({console,URL,Map,Set,Date,Number,String,Math,Error,Promise,encodeURIComponent,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},localStorage:store,sessionStorage:store,history:{replaceState(){}},location:{href:'https://example.test/',origin:'https://example.test',pathname:'/'},document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>({append(){}})},window:{TRADE_CONFIG:{appId:''},addEventListener(){}},requestAnimationFrame(){}});
vm.runInContext(readFileSync(__dirname+'/../public/app.js','utf8').replace('bootstrap();',''),context);
async function run(s){return vm.runInContext(s,context);}
(async()=>{
await run("$('quote').onclick()");assert.match(element('message').textContent,/Connect a Deriv/);
element('stake').value='1';element('duration').value='5';element('unit').value='t';element('symbol').value='R_100';element('type').value='DIGITEVEN';element('barrierField').hidden=true;
await run("auth={currency:'USD',loginid:'VRTC123',is_virtual:1}; calls=[]; request=async body=>{calls.push(body);if(body.contracts_for)return {contracts_for:{available:[{contract_type:'DIGITEVEN'}]}};if(body.proposal)return {proposal:{id:'quoted-id',ask_price:1.03,payout:1.9}};if(body.buy)return {buy:{contract_id:123,buy_price:1.03}};return {};}; $('quote').onclick()");
assert.equal(element('cost').textContent,'1.03 USD');assert.equal(element('profit').textContent,'0.87 USD');assert.equal(element('buy').disabled,false);
await run("$('buy').onclick()");assert.equal(element('confirmTrade').open,true);assert.equal(await run('calls.some(c=>c.buy)'),false);
await run("$('confirmBuy').onclick()");assert.equal(await run("calls.filter(c=>c.buy).length"),1);assert.equal(await run("calls.find(c=>c.buy).price"),1.03);assert.equal(await run("calls.find(c=>c.buy).buy"),'quoted-id');assert.equal(await run("calls.some(c=>c.paymentagent_transfer||c.transfer_between_accounts)"),false);
assert.equal(element('buy').disabled,true);
await run("invalidate(); $('confirmBuy').onclick()");assert.equal(await run("calls.filter(c=>c.buy).length"),1);
await run("auth={currency:'USD',loginid:'REAL123',is_virtual:0}; $('quote').onclick();");await run("$('buy').onclick()");assert.match(element('confirmDetails').textContent,/REAL account REAL123/);await run("auth={currency:'USD',loginid:'OTHER456',is_virtual:1}; $('confirmBuy').onclick()");assert.equal(await run("calls.filter(c=>c.buy).length"),1);
 element('stake').value='-1';assert.throws(()=>vm.runInContext('orderParameters()',context),/positive stake/);
console.log('PASS: unauthenticated quote gate; provider-priced purchase; explicit confirmation; quote invalidation; no extra deduction; invalid stake rejected.');
})().catch(e=>{console.error(e);process.exitCode=1;});
