'use strict';
let calculatedStake=1,reviewedPlan=null,tickerSocket=null,tickerTimer=null,tickerRetryTimer=null,tickerRetries=0;
const settlementWaiters=new Map();
const CONTRACTS=['DIGITEVEN','DIGITODD','DIGITOVER','DIGITUNDER','DIGITMATCH','DIGITDIFF','CALL','PUT'];
function updateAccountMode(){
 const real=!!auth&&!auth.is_virtual,demo=!!auth&&auth.is_virtual;
 $('modeTitle').textContent=auth?(real?'Real account · Real money':'Demo account · Virtual funds'):'Explore first. Connect when you’re ready.';
 $('modeDescription').textContent=auth?(real?'Orders placed here use your Deriv real account balance.':'Practise with your Deriv demo balance. Switch to Real when you choose.'):'Connect Deriv to access your demo and real trading accounts.';
 document.querySelector('.mode-banner').classList.toggle('is-real',real);
 $('account').classList.toggle('real-account',real);$('realTradeNotice').hidden=!real;
 for(const id of ['demoMode','headerDemo'])$(id).classList.toggle('selected',demo);
 for(const id of ['realMode','headerReal']){$(id).classList.toggle('selected',real);$(id).classList.toggle('real-selected',real);}
 $('dashBalance').textContent=auth?$('balance').textContent:'— USD';$('dashAccount').textContent=auth?(real?'REAL':'DEMO')+' · '+auth.loginid:'No trading account connected';
}
async function switchMode(mode){
 if(isBusy())return message('Stop the current session before switching accounts.');
 if(!loggedIn){login();return;}
 const account=accounts.find(a=>a.account_type===mode);
 if(!account)return message('No active '+mode+' Options account found. Create one in Deriv’s Traders Hub, then reconnect.');
 if(auth?.loginid===account.account_id){page('dashboard');return;}
 $('accountSelect').value=account.account_id;page('dashboard');await connect(account);
}
for(const id of ['demoMode','headerDemo'])$(id).onclick=()=>switchMode('demo').catch(e=>message(e.message));
for(const id of ['realMode','headerReal'])$(id).onclick=()=>switchMode('real').catch(e=>message(e.message));
function updateBotMarket(){$('botMarket').textContent=$('symbol').selectedOptions[0]?.textContent||'Choose a market in Charts';}
function updateAnalysis(){
 const counts=Array(10).fill(0);for(const p of points)if(Number.isInteger(p.digit)&&p.digit>=0&&p.digit<=9)counts[p.digit]++;
 const total=counts.reduce((a,b)=>a+b,0),latest=points.at(-1)?.digit;
 $('analysisMarket').textContent=$('symbol').selectedOptions[0]?.textContent||'Waiting for market data';$('sampleSize').textContent=total+' live ticks';
 const columns=counts.map((count,i)=>{const column=document.createElement('div');column.className='digit-column'+(latest===i?' latest':'');const percent=document.createElement('span');percent.textContent=total?(count/total*100).toFixed(1)+'%':'—';const track=document.createElement('div');track.className='digit-track';const fill=document.createElement('div');fill.className='digit-fill';fill.style.height=total?Math.min(100,count/total*400)+'%':'0%';const label=document.createElement('strong');label.textContent=i;track.append(fill);column.append(percent,track,label);return column;});
 $('digitBars').replaceChildren(...columns);const even=counts.filter((_,i)=>i%2===0).reduce((a,b)=>a+b,0);$('evenPercent').textContent=total?(even/total*100).toFixed(1)+'%':'—';$('oddPercent').textContent=total?((total-even)/total*100).toFixed(1)+'%':'—';$('latestDigit').textContent=Number.isInteger(latest)?String(latest):'—';
}
function calculateRisk(capital,percent,trades){if(!Number.isFinite(capital)||capital<=0||!Number.isFinite(percent)||percent<=0||percent>100||!Number.isInteger(trades)||trades<1||trades>100)throw Error('Enter positive capital, risk between 0 and 100%, and 1–100 whole trades.');const stake=Math.floor(capital*percent)/100;if(stake<0.01)throw Error('Your calculated stake is below 0.01. Adjust your inputs.');return {stake,exposure:Math.round(stake*trades*100)/100};}
$('riskForm').onsubmit=e=>{e.preventDefault();try{const capital=Number($('riskCapital').value),trades=Number($('riskTrades').value),result=calculateRisk(capital,Number($('riskPercent').value),trades);calculatedStake=result.stake;$('riskStake').textContent=result.stake.toFixed(2);$('riskExposure').textContent=result.exposure.toFixed(2);$('riskNote').textContent=(result.exposure/capital*100).toFixed(1)+'% of your entered capital, before any difference in Deriv’s quoted cost.';}catch(err){message(err.message);}};
$('useBalance').onclick=()=>{if(!auth)return message('Connect a trading account first.');const n=Number($('balance').textContent.split(' ')[0]);if(!Number.isFinite(n)||n<=0)return message('No positive account balance is available yet.');$('riskCapital').value=n;};
$('useRiskStake').onclick=()=>{if(isBusy())return message('Stop the active session first.');$('stake').value=calculatedStake.toFixed(2);invalidate();page('terminal');message('Stake copied. Get a live quote to check the final purchase cost.');};
document.querySelectorAll('.preset').forEach(button=>button.onclick=()=>{if(isBusy())return message('Stop the active session before changing its configuration.');if(!Array.from($('botType').options).some(o=>o.value===button.dataset.contract))return message('This preset is unavailable on the current market. Choose a different market in Charts.');$('botType').value=button.dataset.contract;normaliseContractControls('botType','botUnit','botDuration');updateBarrier();page('bots');});
function updateBarrier(){$('botBarrierField').hidden=!['DIGITOVER','DIGITUNDER','DIGITMATCH','DIGITDIFF'].includes($('botType').value);}
$('botType').onchange=updateBarrier;
function validatePlan(plan){
 if(!plan||plan.version!==1||!CONTRACTS.includes(plan.contractType)||!['t','m'].includes(plan.unit))throw Error('This strategy format or contract type is unsupported.');
 if(!Number.isInteger(plan.duration)||plan.duration<1||plan.duration>(plan.unit==='t'?10:5))throw Error('Use 1–10 ticks or 1–5 minutes for automated sessions.');
 if(!Number.isInteger(plan.maxTrades)||plan.maxTrades<1||plan.maxTrades>50)throw Error('Set maximum trades between 1 and 50.');
 for(const field of ['stake','maxCost','stopLoss','takeProfit'])if(!Number.isFinite(plan[field])||plan[field]<=0)throw Error('Stake, cost limit and stopping limits must be positive numbers.');
 if(plan.maxCost<plan.stake)throw Error('The cost cap must be at least the requested stake.');
 if(!Number.isFinite(plan.maxCost*plan.maxTrades))throw Error('The total session budget is invalid.');
 if(!Number.isInteger(plan.barrier)||plan.barrier<0||plan.barrier>9)throw Error('The digit barrier must be 0–9.');
 return {version:1,contractType:plan.contractType,unit:plan.unit,duration:plan.duration,maxTrades:plan.maxTrades,stake:plan.stake,maxCost:plan.maxCost,stopLoss:plan.stopLoss,takeProfit:plan.takeProfit,barrier:plan.barrier};
}
function readPlan(){return validatePlan({version:1,contractType:$('botType').value,unit:$('botUnit').value,duration:Number($('botDuration').value),maxTrades:Number($('botTrades').value),stake:Number($('botStake').value),maxCost:Number($('botMaxCost').value),stopLoss:Number($('botStopLoss').value),takeProfit:Number($('botTakeProfit').value),barrier:Number($('botBarrier').value)});}
function fillPlan(plan){const fields={botType:'contractType',botUnit:'unit',botDuration:'duration',botTrades:'maxTrades',botStake:'stake',botMaxCost:'maxCost',botStopLoss:'stopLoss',botTakeProfit:'takeProfit',botBarrier:'barrier'};for(const [id,key] of Object.entries(fields))$(id).value=String(plan[key]);updateBarrier();}
$('exportStrategy').onclick=()=>{try{const plan=readPlan(),url=URL.createObjectURL(new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='tradenexaai-strategy.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){message(e.message);}};
$('importStrategy').onchange=async()=>{const file=$('importStrategy').files[0];if(!file)return;try{if(isBusy())throw Error('Stop the active session before importing.');if(file.size>20000)throw Error('Strategy file is too large.');const plan=validatePlan(JSON.parse(await file.text()));fillPlan(plan);message('Strategy loaded. Review all settings before running it.');}catch(e){message(e.message);}finally{$('importStrategy').value='';}};
$('reviewBot').onclick=()=>{
 if(isBusy())return message('A trade or automated session is already active.');if(!auth)return message('Connect your Deriv trading account first.');
 try{const plan=readPlan();reviewedPlan={...plan,account:auth.loginid,currency:auth.currency,isVirtual:auth.is_virtual,generation,symbol:$('symbol').value};
 $('botConfirmDetails').textContent=`${auth.is_virtual?'DEMO · VIRTUAL FUNDS':'REAL · REAL MONEY'}\nAccount: ${auth.loginid}\nMarket: ${$('symbol').selectedOptions[0].textContent}\nContract: ${$('botType').selectedOptions[0].textContent}\nDuration: ${plan.duration} ${plan.unit==='t'?'ticks':'minutes'}\nRequested stake: ${plan.stake.toFixed(2)} ${auth.currency}\nMaximum cost per purchase: ${plan.maxCost.toFixed(2)} ${auth.currency}\nMaximum trades: ${plan.maxTrades}\nMaximum total cost: ${(plan.maxCost*plan.maxTrades).toFixed(2)} ${auth.currency}\nStop after settled net loss: ${plan.stopLoss.toFixed(2)} or net profit: ${plan.takeProfit.toFixed(2)} ${auth.currency}.`;
 $('confirmStartBot').textContent=auth.is_virtual?'Start demo session':'Start REAL-money session';$('confirmBot').showModal();}catch(e){message(e.message);}
};
$('cancelBot').onclick=()=>{$('confirmBot').close();reviewedPlan=null;};
$('confirmStartBot').onclick=()=>{const plan=reviewedPlan;reviewedPlan=null;$('confirmBot').close();if(!plan||isBusy()||!auth||plan.account!==auth.loginid||plan.generation!==generation)return message('Account or connection changed. Review the session again.');runAutomation(plan);};
function logBot(text){const p=document.createElement('p');p.textContent=new Date().toLocaleTimeString()+' · '+text;$('botLog').append(p);while($('botLog').childElementCount>100)$('botLog').firstChild.remove();$('botLog').scrollTop=$('botLog').scrollHeight;}
function updateRunMetrics(run){$('botCompleted').textContent=String(run.completed);$('botPnl').textContent=run.profit.toFixed(2);$('botSpent').textContent=run.spent.toFixed(2);}
function setSessionControls(active){for(const id of ['symbol','accountSelect','quote','buy','reviewBot','exportStrategy','importStrategy','botType','botUnit','botDuration','botTrades','botStake','botMaxCost','botStopLoss','botTakeProfit','botBarrier'])$(id).disabled=active;if(!active)invalidate();$('stopBot').disabled=!active;}
function onContractUpdate(contract){const key=String(contract.contract_id),waiter=settlementWaiters.get(key);if(contract.is_sold&&waiter){clearTimeout(waiter.timer);settlementWaiters.delete(key);waiter.resolve(contract);}}
function awaitSettlement(id,timeout){const existing=contracts.get(id);if(existing?.is_sold)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const key=String(id);const timer=setTimeout(()=>{settlementWaiters.delete(key);reject(Error('Contract settlement was not received. Check positions before starting another session.'));},timeout);settlementWaiters.set(key,{resolve,reject,timer});});}
function stopAutomation(reason='Stopping after the current contract settles.'){if(automation?.running){automation.stop=true;$('stopBot').disabled=true;$('botStatus').textContent='Stopping…';$('botStatusText').textContent=reason;logBot(reason);}if(reason.includes('Connection lost')){for(const waiter of settlementWaiters.values()){clearTimeout(waiter.timer);waiter.reject(Error(reason));}settlementWaiters.clear();}}
$('stopBot').onclick=()=>stopAutomation();
function canContinue(run){return !run.stop&&!!auth&&auth.loginid===run.plan.account&&generation===run.plan.generation&&run.completed<run.plan.maxTrades&&run.profit>-run.plan.stopLoss&&run.profit<run.plan.takeProfit;}
async function runAutomation(plan){
 if(isBusy()||!auth)return;const run={running:true,stop:false,completed:0,spent:0,profit:0,plan};automation=run;invalidate();setSessionControls(true);$('botLog').replaceChildren();updateRunMetrics(run);$('botStatus').textContent=plan.isVirtual?'Demo session running':'REAL-money session running';$('botStatusText').textContent='One contract at a time. Waiting for a live quote.';logBot('Session approved for '+plan.account+'. Maximum total cost '+(plan.maxCost*plan.maxTrades).toFixed(2)+' '+plan.currency+'.');
 try{
  const available=await request({contracts_for:plan.symbol});if(!available.contracts_for.available.some(c=>c.contract_type===plan.contractType))throw Error('This contract type is unavailable on the selected market.');if(!supportsDuration(available.contracts_for.available,plan.contractType,plan.unit,plan.duration))throw Error('The configured duration is unavailable on this market. Change your session settings.');
  while(canContinue(run)){
   const params={proposal:1,amount:plan.stake,basis:'stake',contract_type:plan.contractType,currency:plan.currency,duration:plan.duration,duration_unit:plan.unit,underlying_symbol:plan.symbol};
   if(['DIGITOVER','DIGITUNDER','DIGITMATCH','DIGITDIFF'].includes(plan.contractType))params.barrier=String(plan.barrier);
   const result=await request(params),quote=result.proposal,cost=Number(quote?.ask_price);
   if(!quote?.id||!Number.isFinite(cost)||cost<=0)throw Error('Deriv returned an invalid quote. Session stopped.');
   if(cost>plan.maxCost+0.0000001||run.spent+cost>plan.maxCost*plan.maxTrades+0.0000001)throw Error('Quoted cost exceeds your approved cap. No additional purchase was made.');
   if(!canContinue(run))break;
   buying=true;let bought;try{bought=await request({buy:quote.id,price:cost});}finally{buying=false;}
   if(!bought.buy?.contract_id)throw Error('Purchase confirmation was incomplete. Check your Deriv positions before retrying.');
   const contract=bought.buy;const paid=Number(contract.buy_price??cost);if(!Number.isFinite(paid))throw Error('Purchase cost was unavailable. Check positions.');run.spent+=paid;
   contracts.set(contract.contract_id,{...contract,status:'open'});render();updateRunMetrics(run);logBot('Purchased '+contract.contract_id+' · '+paid.toFixed(2)+' '+plan.currency+'.');$('botStatusText').textContent='Waiting for contract '+contract.contract_id+' to settle.';
   await trackContract(contract.contract_id);
   const settled=await awaitSettlement(contract.contract_id,plan.unit==='m'?(plan.duration*60+60)*1000:180000);
   const profit=Number(settled.profit);if(!Number.isFinite(profit))throw Error('Settled profit was unavailable. Session stopped.');run.profit+=profit;run.completed++;updateRunMetrics(run);logBot('Settled '+contract.contract_id+' · P/L '+profit.toFixed(2)+' '+plan.currency+'.');
  }
  $('botStatus').textContent=run.stop?'Session stopped':'Session complete';$('botStatusText').textContent=run.completed+' completed trades. No further purchases will be made.';logBot('Session finished. Net P/L '+run.profit.toFixed(2)+' '+plan.currency+'.');
 }catch(err){run.stop=true;$('botStatus').textContent='Session stopped';$('botStatusText').textContent=err.message;logBot(err.message);message(err.message);}
 finally{buying=false;run.running=false;setSessionControls(false);}
}
window.addEventListener('beforeunload',e=>{if(automation?.running){e.preventDefault();e.returnValue='';}});
function startTicker(){
 if(tickerSocket)return;const socket=new WebSocket('wss://api.derivws.com/trading/v1/options/ws/public');tickerSocket=socket;
 const names={R_10:'VOL 10',R_25:'VOL 25',R_50:'VOL 50',R_75:'VOL 75',R_100:'VOL 100'},last=new Map(),items=new Map();
 $('marketTicker').replaceChildren(...Object.entries(names).map(([symbol,name])=>{const item=document.createElement('span'),label=document.createElement('b'),value=document.createElement('em');label.textContent=name;value.textContent='—';item.append(label,value);items.set(symbol,value);return item;}));
 socket.onopen=()=>{Object.keys(names).forEach(symbol=>socket.send(JSON.stringify({ticks:symbol,subscribe:1})));tickerTimer=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({ping:1}));},30000);};
 socket.onmessage=e=>{let data;try{data=JSON.parse(e.data);}catch{return;}const t=data.tick;if(!t||!items.has(t.symbol)||t.quote==null)return;tickerRetries=0;const n=Number(t.quote);if(!Number.isFinite(n))return;const item=items.get(t.symbol),prev=last.get(t.symbol);item.textContent=n.toFixed(Math.max(0,Math.min(10,Number(t.pip_size)||0)))+(prev==null?'':n>=prev?' ↑':' ↓');item.className=prev==null?'':n>=prev?'tick-up':'tick-down';last.set(t.symbol,n);};
 socket.onclose=()=>{clearInterval(tickerTimer);tickerSocket=null;for(const item of items.values()){item.textContent='offline';item.className='';}if(tickerRetries<5&&(typeof navigator==='undefined'||navigator.onLine!==false)){clearTimeout(tickerRetryTimer);tickerRetryTimer=setTimeout(startTicker,Math.min(15000,1000*2**tickerRetries++));}};
 socket.onerror=()=>{clearInterval(tickerTimer);};
}
window.addEventListener('online',()=>{if(!tickerSocket){clearTimeout(tickerRetryTimer);tickerRetries=0;startTicker();}});
page('home');updateAccountMode();updateAnalysis();updateBotMarket();startTicker();
