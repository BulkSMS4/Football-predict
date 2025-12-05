// scripts.js
const postTypeEl = document.getElementById('postType');
const matchEl = document.getElementById('match');
const analysisEl = document.getElementById('analysis');
const tipEl = document.getElementById('tip');
const previewEl = document.getElementById('preview');
const serverRespEl = document.getElementById('serverResp');
const historyList = document.getElementById('historyList');
const subList = document.getElementById('subList');
const planSelect = document.getElementById('planSelect');
const oddsContainer = document.getElementById('oddsContainer');
const saveOddsBtn = document.getElementById('saveOdds');

let history = JSON.parse(localStorage.getItem('tipHistory')||'[]');
renderHistory();

// Build post
function buildPost() {
  let lines = [];
  if(postTypeEl.value==='announcement') lines.push('📢 ANNOUNCEMENT');
  if(postTypeEl.value==='vip') lines.push('💎 VIP TIP');
  if(postTypeEl.value==='free') lines.push('🆓 FREE TIP');
  if(postTypeEl.value==='result') lines.push('✅ RESULT');
  if(matchEl.value) lines.push('⚽ Match: '+matchEl.value);
  if(analysisEl.value) lines.push('📊 Analysis: '+analysisEl.value);
  if(tipEl.value) lines.push('🎯 Tip: '+tipEl.value);
  lines.push('\n⚠️ Disclaimer: Bet responsibly.');
  return lines.join('\n');
}

// Preview
document.getElementById('previewBtn').addEventListener('click', ()=>{
  previewEl.textContent = buildPost();
});

// Save history
document.getElementById('saveBtn').addEventListener('click', ()=>{
  const item = {
    id: Date.now(),
    postType: postTypeEl.value,
    match: matchEl.value,
    analysis: analysisEl.value,
    tip: tipEl.value,
    text: buildPost()
  };
  history.unshift(item);
  if(history.length>200) history.pop();
  localStorage.setItem('tipHistory', JSON.stringify(history));
  renderHistory();
  alert('Saved locally.');
});

function renderHistory(){
  historyList.innerHTML='';
  if(history.length===0){ historyList.innerHTML='<div class="small">No saved posts.</div>'; return; }
  history.forEach(h=>{
    const d = document.createElement('div'); d.className='history-item';
    d.textContent = `${h.postType}: ${h.match}`;
    historyList.appendChild(d);
  });
}

// Load subscribers
async function loadSubscribers(){
  try{
    const res = await fetch('/api/subscribers');
    const data = await res.json();
    subList.innerHTML='';
    if(data.length===0){ subList.innerHTML='No subscribers.'; return; }
    data.forEach(s=>{
      const d = document.createElement('div'); d.className='sub-item';
      d.textContent = `${s.username || s.id} - ${s.subscriptionType} - ${s.endDate || 'N/A'}`;
      subList.appendChild(d);
    });
  }catch(err){ subList.innerHTML='Failed to load subscribers'; }
}
loadSubscribers();
setInterval(loadSubscribers,60000);

// Odds management
async function loadOdds(plan){
  const res = await fetch('/api/odds');
  const data = await res.json();
  const list = data[plan] || [];
  oddsContainer.innerHTML='';
  list.forEach((o,i)=>{
    oddsContainer.innerHTML+=`<div style="display:flex;gap:4px;margin-bottom:4px">
      <input type="number" value="${o.odds}" placeholder="Odds" data-index="${i}" />
      <input type="number" value="${o.price}" placeholder="Price" data-index="${i}" />
    </div>`;
  });
}

planSelect.addEventListener('change',()=> loadOdds(planSelect.value));
loadOdds(planSelect.value);

saveOddsBtn.addEventListener('click', async ()=>{
  const inputs = oddsContainer.querySelectorAll('input');
  const newOdds = [];
  for(let i=0;i<inputs.length;i+=2){
    newOdds.push({ odds: Number(inputs[i].value), price: Number(inputs[i+1].value) });
  }
  const res = await fetch('/api/odds',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ plan: planSelect.value, oddsList: newOdds })
  });
  const data = await res.json();
  serverRespEl.textContent = JSON.stringify(data,null,2);
  alert('Odds saved.');
});
