// ---------- Basic UI helpers ----------
const targetEl = document.getElementById('target');
const postTypeEl = document.getElementById('postType');
const matchEl = document.getElementById('match');
const analysisEl = document.getElementById('analysis');
const tipEl = document.getElementById('tip');
const confidenceEl = document.getElementById('confidence');
const kickoffEl = document.getElementById('kickoff');
const notesEl = document.getElementById('notes');
const previewEl = document.getElementById('preview');
const serverRespEl = document.getElementById('serverResp');
const historyList = document.getElementById('historyList');

// Load history from localStorage
let history = JSON.parse(localStorage.getItem('tipHistory') || '[]');
renderHistory();

// Templates
function useTemplate(name){
  if(name==='free'){
    postTypeEl.value='free';
    matchEl.value='Man City vs Wolves';
    analysisEl.value='Man City strong at home; Wolves weak defense.';
    tipEl.value='Over 2.5 Goals';
    confidenceEl.value='Medium';
    kickoffEl.value='20:00 GMT';
  } else if(name==='vip'){
    postTypeEl.value='vip';
    matchEl.value='Arsenal vs Brighton';
    analysisEl.value='Arsenal unbeaten last 5; Brighton poor away.';
    tipEl.value='Correct Score — 2–1';
    confidenceEl.value='High';
    kickoffEl.value='18:45 GMT';
    notesEl.value='VIP: small stake recommended.';
  } else if(name==='result'){
    postTypeEl.value='result';
    matchEl.value='Man Utd vs Chelsea';
    analysisEl.value='';
    tipEl.value='Result: 1–1 (Over 1.5)';
    confidenceEl.value='Low';
    kickoffEl.value='';
  }
}

// Compose preview text
function buildPost(){
  const postType = postTypeEl.value;
  let lines = [];
  if(postType === 'announcement') lines.push('📢 ANNOUNCEMENT');
  if(postType === 'vip') lines.push('💎 VIP ANALYSIS');
  if(postType === 'free') lines.push('🆓 FREE TIP');
  if(postType === 'result') lines.push('✅ RESULT');

  if(matchEl.value) lines.push('⚽ Match: ' + matchEl.value);
  if(analysisEl.value) lines.push('📊 Analysis: ' + analysisEl.value);
  if(tipEl.value) lines.push('🎯 Tip: ' + tipEl.value);
  if(confidenceEl.value) lines.push('📈 Confidence: ' + confidenceEl.value);
  if(kickoffEl.value) lines.push('🕒 Kickoff: ' + kickoffEl.value);
  if(notesEl.value) lines.push('📝 Notes: ' + notesEl.value);

  lines.push('\n⚠️ Disclaimer: All tips are predictions based on analysis. No guarantees. Bet responsibly.');
  return lines.join('\n');
}

// Preview
document.getElementById('previewBtn').addEventListener('click', ()=>{
  previewEl.textContent = buildPost();
});

// Save to local history
document.getElementById('saveBtn').addEventListener('click', ()=>{
  const item = {
    id: Date.now(),
    target: targetEl.value,
    postType: postTypeEl.value,
    match: matchEl.value, analysis: analysisEl.value, tip: tipEl.value,
    confidence: confidenceEl.value, kickoff: kickoffEl.value, notes: notesEl.value,
    text: buildPost()
  };
  history.unshift(item);
  if(history.length>200) history.pop();
  localStorage.setItem('tipHistory', JSON.stringify(history));
  renderHistory();
  alert('Saved locally.');
});

function renderHistory(){
  historyList.innerHTML = '';
  if(history.length===0){ historyList.innerHTML = '<div class="small">No saved posts yet.</div>'; return;}
  history.forEach(h=>{
    const d = document.createElement('div'); d.className='history-item';
    d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${escapeHtml(h.match||h.postType)}</strong><div class="small">${escapeHtml(h.postType)} • ${new Date(h.id).toLocaleString()}</div></div>
      <div style="display:flex;gap:6px">
        <button onclick='useHistory(${h.id})'>Load</button>
        <button onclick='sendFromHistory(${h.id})' style="background:#0ea5a4">Send</button>
      </div>
    </div>
    <div style="margin-top:8px" class="small">${escapeHtml(h.text)}</div>`;
    historyList.appendChild(d);
  });
}

// Load history item into form
window.useHistory = function(id){
  const h = history.find(x=>x.id===id);
  if(!h) return alert('Not found');
  targetEl.value = h.target || '';
  postTypeEl.value = h.postType || 'free';
  matchEl.value = h.match || '';
  analysisEl.value = h.analysis || '';
  tipEl.value = h.tip || '';
  confidenceEl.value = h.confidence || 'Medium';
  kickoffEl.value = h.kickoff || '';
  notesEl.value = h.notes || '';
  previewEl.textContent = buildPost();
}

// Send the composed post to your server
document.getElementById('sendBtn').addEventListener('click', async ()=>{
  const payload = {
    target: targetEl.value || '',
    text: buildPost(),
    meta: {
      postType: postTypeEl.value,
      match: matchEl.value,
      tip: tipEl.value,
      confidence: confidenceEl.value,
      kickoff: kickoffEl.value,
      notes: notesEl.value
    }
  };
  if(!payload.target){ return alert('Enter target channel or chat id'); }
  if(!payload.text){ return alert('Compose a tip first'); }

  try{
    serverRespEl.textContent = 'Sending...';
    const res = await fetch('/api/sendTip', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    serverRespEl.textContent = JSON.stringify(data, null, 2);
    if(res.ok){
      history.unshift({
        id: Date.now(), target: payload.target, postType: postTypeEl.value,
        match: matchEl.value, analysis: analysisEl.value, tip: tipEl.value,
        confidence: confidenceEl.value, kickoff: kickoffEl.value, notes: notesEl.value, text: payload.text
      });
      localStorage.setItem('tipHistory', JSON.stringify(history));
      renderHistory();
    }
  }catch(err){
    serverRespEl.textContent = 'Request failed: ' + err.message;
  }
});

// Send directly from history (shortcut)
window.sendFromHistory = async function(id){
  const h = history.find(x=>x.id===id);
  if(!h) return alert('Not found');
  if(!confirm('Send this saved post?')) return;
  try{
    serverRespEl.textContent = 'Sending...';
    const res = await fetch('/api/sendTip', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ target: h.target||targetEl.value, text: h.text, meta: h })
    });
    const d = await res.json();
    serverRespEl.textContent = JSON.stringify(d, null, 2);
  }catch(err){
    serverRespEl.textContent = 'Request failed: ' + err.message;
  }
}

// Clear form
document.getElementById('clearBtn').addEventListener('click', ()=>{
  if(!confirm('Clear the form?')) return;
  matchEl.value='';analysisEl.value='';tipEl.value='';confidenceEl.value='Medium';kickoffEl.value='';notesEl.value='';
  previewEl.textContent = 'Fill the form and click Preview';
});

// Export / Clear history
document.getElementById('clearHistory').addEventListener('click', ()=>{
  if(!confirm('Clear saved history?')) return;
  history = []; localStorage.removeItem('tipHistory'); renderHistory();
});
document.getElementById('exportHistory').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(history, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'tip_history.json'; a.click(); URL.revokeObjectURL(url);
});

// Escape HTML for safety when rendering
function escapeHtml(str=''){ return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
