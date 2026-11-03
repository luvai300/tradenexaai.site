const assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs');
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,hidden:false,style:{},classList:{add(){},remove(){},toggle(){}},selectedOptions:[{textContent:'Volatility 100 Index'}],addEventListener(){},replaceChildren(){},append(){},childElementCount:0,getBoundingClientRect:()=>({width:0}),showModal(){},close(){}});return elements.get(id);}
const document={getElementById:element,querySelectorAll:()=>[],querySelector:element,createElement:()=>({append(){},style:{}})};
const context=vm.createContext({location:{origin:'https://example.test'},document,window:{TRADE_CONFIG:{appId:'test'},addEventListener(){}},URL,Blob,console,Map,Set,Date,Number,String,Math,Error,Promise,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame(){}});
const run=s=>vm.runInContext(s,context);
run(readFileSync(__dirname+'/../public/app.js','utf8').replace('bootstrap();',''));
run(readFileSync(__dirname+'/../public/tools.js','utf8').replace("page('home');updateAccountMode();updateAnalysis();updateBotMarket();startTicker();",''));
(async()=>{
 let risk=run('calculateRisk(100,2,5)');assert.equal(risk.stake,2);assert.equal(risk.exposure,10);assert.throws(()=>run('calculateRisk(100,101,5)'),/positive capital/);
 run("basePlan={version:1,contractType:'DIGITEVEN',unit:'t',duration:5,maxTrades:2,stake:1,maxCost:1.1,stopLoss:5,takeProfit:5,barrier:5,account:'DOT123',currency:'USD',isVirtual:true,generation:0,symbol:'R_100'}");
 assert.throws(()=>run('validatePlan({...basePlan,maxTrades:100})'),/1 and 50/);
 assert.throws(()=>run('validatePlan({...basePlan,maxCost:0.5})'),/cost cap/);
 run("auth={loginid:'DOT123',currency:'USD',is_virtual:true}; buying=false; calls=[]; n=0; request=async p=>{calls.push(p);if(p.contracts_for)return {contracts_for:{available:[{contract_type:'DIGITEVEN'}]}};if(p.proposal)return {proposal:{id:'quote-'+n,ask_price:1.03,payout:1.9}};if(p.buy)return {buy:{contract_id:++n,buy_price:1.03}};};trackContract=async id=>updateContract({contract_id:id,is_sold:1,profit:0.87});");
 await run('runAutomation(basePlan)');assert.equal(run('calls.filter(c=>c.buy).length'),2);assert.equal(run('automation.completed'),2);assert.equal(run('automation.running'),false);assert.ok(Math.abs(run('automation.spent')-2.06)<0.000001);
 run("calls=[]; request=async p=>{calls.push(p);if(p.contracts_for)return {contracts_for:{available:[{contract_type:'DIGITEVEN'}]}};if(p.proposal)return {proposal:{id:'too-expensive',ask_price:2}};};");
 await run('runAutomation(basePlan)');assert.equal(run('calls.filter(c=>c.buy).length'),0);assert.match(element('botStatusText').textContent,/exceeds your approved cap/);
 run("calls=[]; n=0; contracts.clear(); request=async p=>{calls.push(p);if(p.contracts_for)return {contracts_for:{available:[{contract_type:'DIGITEVEN'}]}};if(p.proposal)return {proposal:{id:'loss-quote',ask_price:1}};if(p.buy)return {buy:{contract_id:++n,buy_price:1}};};trackContract=async id=>updateContract({contract_id:id,is_sold:1,profit:-1});");
 await run('runAutomation({...basePlan,maxTrades:5,stopLoss:1})');assert.equal(run('calls.filter(c=>c.buy).length'),1);assert.equal(run('automation.profit'),-1);
 run("calls=[]; contracts.clear(); trackContract=async id=>{automation.stop=true;updateContract({contract_id:id,is_sold:1,profit:0.5});};");
 await run('runAutomation({...basePlan,maxTrades:5})');assert.equal(run('calls.filter(c=>c.buy).length'),1);
 run("calls=[]; request=async p=>{calls.push(p);if(p.contracts_for)return {contracts_for:{available:[{contract_type:'DIGITEVEN'}]}};if(p.proposal){auth={loginid:'ROT456',currency:'USD',is_virtual:false};return {proposal:{id:'stale-account',ask_price:1}};}};");
 await run('runAutomation(basePlan)');assert.equal(run('calls.filter(c=>c.buy).length'),0);
 console.log('PASS: risk arithmetic; strategy validation; max-trade cap; provider-cost cap; loss stop; user stop; account-change rejection. All Deriv calls mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;});
