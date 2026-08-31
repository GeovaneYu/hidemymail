async function init(){
  const sel=document.getElementById('fwd-select'), st=document.getElementById('status'), badge=document.getElementById('badge');
  try{
    const r=await browser.runtime.sendMessage({type:'VALIDATE'});
    if(!r.authenticated){
      st.textContent='Desconectado — faça login em iCloud.com';
      badge.textContent='Desconectado'; badge.className='badge err';
      sel.innerHTML='<option>Faça login em iCloud.com</option>'; return;
    }
    st.textContent='Conectado ao iCloud'; badge.textContent='Conectado'; badge.className='badge ok';
    const res=await browser.runtime.sendMessage({type:'LIST'});
    const list=res.forwardToEmails||[], cur=res.selectedForwardTo;
    sel.innerHTML=list.map(e=>`<option value="${e}" ${e===cur?'selected':''}>${e}</option>`).join('');
    sel.onchange=async()=>{
      const prev=sel.value;
      try{ await browser.runtime.sendMessage({type:'UPDATE_FORWARD', email: sel.value}); sel.style.color='#30d158'; setTimeout(()=>sel.style.color='',700);}catch(e){ alert(String(e.message||e)); sel.value=prev; }
    };
  }catch(e){ st.textContent='Erro: '+String(e.message||e); badge.textContent='Erro'; badge.className='badge err'; }
}
init();
