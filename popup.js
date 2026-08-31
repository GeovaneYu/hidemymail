// popup.js - Apple Hide My Email v1.1 - Dark Mode, Export, Inline Edit, Pagination, Filter, Containers, Sound
const $ = (id) => document.getElementById(id);

let pendingHme = null;
let currentTabHost = '';
let forwardToEmails = [];
let selectedForwardTo = '';
let allItems = [];
let filteredItems = [];
let currentFilter = 'all';
let currentSort = 'recent';
const PAGE_SIZE = 20;
let currentPage = 1;
let containerInfo = null;

// --- Sound pop Apple ---
let audioCtx = null;
function playPop() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.08);
    g.gain.setValueAtTime(0.18, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.2);
  } catch {}
}
function animateSuccess(el) {
  if (!el) return;
  el.classList.remove('pop-animate');
  void el.offsetWidth;
  el.classList.add('pop-animate');
}

async function init() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      try { currentTabHost = new URL(tab.url).hostname; $('label-input').value = currentTabHost; } catch {}
    }
    // container detection — estilo Firefox nativo premium
    try {
      containerInfo = await browser.runtime.sendMessage({ type: 'GET_CONTAINER', tabId: tab?.id });
      if (containerInfo && containerInfo.name) {
        const badge = $('container-badge');
        badge.classList.remove('hidden');
        $('container-name').textContent = containerInfo.name;
        const dot = $('container-dot');
        const colorMap = { blue: '#007aff', red: '#ff3b30', orange: '#ff9500', green: '#30d158', pink: '#ff2d55', purple: '#af52de', yellow: '#ffcc02', turquoise: '#5ac8fa' };
        const col = colorMap[containerInfo.color] || '#86868b';
        dot.style.background = col;
        // mantém discreto — só o dot colorido, sem card
      }
    } catch {}
  } catch {}
  // retrátil - inicia minimizada
  try {
    const { meusEnderecosOpen } = await browser.storage.local.get('meusEnderecosOpen');
    if (meusEnderecosOpen === true) $('meus-enderecos-details').setAttribute('open', '');
    else $('meus-enderecos-details').removeAttribute('open');
    $('meus-enderecos-details').addEventListener('toggle', async () => {
      await browser.storage.local.set({ meusEnderecosOpen: $('meus-enderecos-details').open });
    });
  } catch {}
  // filtros
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      currentPage = 1;
      applyFilters();
    });
  });
  $('sort-select').addEventListener('change', () => {
    currentSort = $('sort-select').value;
    currentPage = 1;
    applyFilters();
  });
  // paginação
  $('prev-page').addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderList(filteredItems); } });
  $('next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE) || 1;
    if (currentPage < totalPages) { currentPage++; renderList(filteredItems); }
  });
  // export
  $('btn-export-csv').addEventListener('click', exportCSV);
  $('btn-export-json').addEventListener('click', exportJSON);
  // search
  $('search').addEventListener('input', () => { currentPage = 1; applyFilters(); });

  await checkAuth();
}

let _authTimer = null;
async function checkAuth() {
  $('loading').classList.remove('hidden');
  $('signed-in').classList.add('hidden');
  $('signed-out').classList.add('hidden');
  $('status-dot').className = 'status-dot';
  // timeout de segurança — evita travar em "Verificando..."
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Tempo esgotado — toque para tentar novamente')), 7500);
  });
  try {
    const res = await Promise.race([
      browser.runtime.sendMessage({ type: 'VALIDATE' }),
      timeout
    ]);
    clearTimeout(timeoutId);
    $('loading').classList.add('hidden');
    if (res && res.authenticated) {
      $('status-dot').className = 'status-dot ok';
      $('signed-in').classList.remove('hidden');
      await loadForwardTo();
      loadList();
    } else {
      $('status-dot').className = 'status-dot err';
      $('signed-out').classList.remove('hidden');
    }
  } catch (e) {
    clearTimeout(timeoutId);
    $('loading').classList.add('hidden');
    $('status-dot').className = 'status-dot err';
    $('signed-out').classList.remove('hidden');
    // mostra motivo discreto no card de login
    try {
      const box = document.querySelector('#signed-out .apple-desc');
      if (box && e && e.message && !String(e.message).includes('Receiving end')) {
        const err = document.createElement('div');
        err.className = 'apple-error';
        err.style.marginTop = '12px';
        err.textContent = String(e.message).slice(0,120);
        const retry = document.createElement('button');
        retry.className = 'apple-link-btn';
        retry.textContent = 'Tentar novamente';
        retry.onclick = checkAuth;
        err.appendChild(document.createElement('br'));
        err.appendChild(retry);
        box.parentNode.insertBefore(err, box.nextSibling);
        setTimeout(() => err.remove(), 6000);
      }
    } catch {}
  }
}
// clique no loading também tenta novamente (caso trave)
try { $('loading').addEventListener('click', checkAuth); $('loading').style.cursor = 'pointer'; $('loading').title = 'Toque para tentar novamente'; } catch {}
try { $('status-dot').addEventListener('click', checkAuth); $('status-dot').style.cursor = 'pointer'; } catch {}

async function loadForwardTo() {
  const sel = $('forward-select');
  try {
    const result = await browser.runtime.sendMessage({ type: 'LIST' });
    forwardToEmails = result.forwardToEmails || [];
    selectedForwardTo = result.selectedForwardTo || forwardToEmails[0] || '';
    if (!forwardToEmails.length) { sel.innerHTML = `<option>Sem e-mail</option>`; return; }
    sel.innerHTML = forwardToEmails.map(e => `<option value="${escapeHtml(e)}" ${e===selectedForwardTo?'selected':''}>${escapeHtml(e)}</option>`).join('');
    sel.onchange = async () => {
      const newVal = sel.value;
      if (newVal === selectedForwardTo) return;
      const old = selectedForwardTo;
      selectedForwardTo = newVal;
      try {
        await browser.runtime.sendMessage({ type: 'UPDATE_FORWARD', email: newVal });
        playPop(); animateSuccess(sel);
      } catch (e) { selectedForwardTo = old; sel.value = old; showError(String(e.message||e)); }
    };
  } catch (e) { sel.innerHTML = `<option>Erro ao carregar</option>`; }
}

function showError(msg) {
  const el = $('gen-error');
  // Mensagem amigável para erro específico da Apple
  if (String(msg).toLowerCase().includes('invalid request for private email') || String(msg).toLowerCase().includes('invalid request')) {
    el.innerHTML = `⚠️ <b>iCloud+ não ativado ou Hide My Email desativado.</b><br>
      1. Acesse <a href="https://www.icloud.com/icloudplus/hidemyemail" target="_blank">icloud.com/icloudplus/hidemyemail</a> e ative o Ocultar Meu E-mail uma vez manualmente.<br>
      2. Confirme que seu plano iCloud+ está ativo em <a href="https://www.icloud.com/settings" target="_blank">icloud.com/settings</a>.<br>
      3. Depois clique em Atualizar aqui.<br>
      <small style="color:#86868b">Erro original: ${escapeHtml(String(msg))}</small>`;
  } else {
    el.textContent = msg;
  }
  el.classList.remove('hidden');
  el.style.display = 'block';
  // não esconde automaticamente se for erro de ativação
  if (!String(msg).toLowerCase().includes('invalid request')) {
    setTimeout(() => el.classList.add('hidden'), 5000);
  }
}

// --- Geração (agora via topo) ---
const _btnGenTop = $('btn-top-generate');
const _btnGenRefresh = $('btn-refresh-email');
const _btnGenAgain = $('btn-generate-again');
if (_btnGenRefresh) _btnGenRefresh.addEventListener('click', handleGenerate);
if (_btnGenAgain) _btnGenAgain.addEventListener('click', handleGenerate);

async function handleGenerate() {
  const btn = $('btn-top-generate') || $('btn-refresh-email');
  const prevText = btn ? btn.textContent : '';
  $('gen-error').classList.add('hidden');
  if (btn) { btn.textContent = 'Gerando…'; btn.disabled = true; }
  try {
    const { hme } = await browser.runtime.sendMessage({ type: 'GENERATE' });
    pendingHme = hme;
    $('generated-email').textContent = hme;
    $('email-preview-row').classList.remove('hidden');
    $('email-empty').classList.add('hidden');
    const ag = $('action-generate'); if (ag) ag.classList.add('hidden');
    $('action-pending').classList.remove('hidden');
    $('action-reserve').classList.add('hidden');
    playPop(); animateSuccess($('email-preview-row'));
  } catch (e) { showError(String(e.message||e)); }
  finally { if (btn) { btn.textContent = prevText || '＋ Gerar novo'; btn.disabled = false; } }
}
const _btnValidate = $('btn-validate');
if (_btnValidate) _btnValidate.addEventListener('click', checkAuth);
const _btnRetryAuth = $('btn-retry-auth');
if (_btnRetryAuth) _btnRetryAuth.addEventListener('click', checkAuth);

// --- Reservar ---
$('btn-reserve').addEventListener('click', async () => {
  if (!pendingHme) return;
  const label = $('label-input').value.trim() || currentTabHost || 'Firefox';
  const note = $('note-input').value.trim() || undefined;
  const forwardSel = $('forward-select').value;
  if (forwardSel !== selectedForwardTo) {
    try { await browser.runtime.sendMessage({ type: 'UPDATE_FORWARD', email: forwardSel }); selectedForwardTo = forwardSel; } catch (e) { showError(String(e.message||e)); return; }
  }
  $('btn-reserve').textContent = 'Criando…';
  $('btn-reserve').disabled = true;
  try {
    const { reserved } = await browser.runtime.sendMessage({ type: 'RESERVE', hme: pendingHme, label, note });
    $('generated-email').textContent = reserved.hme;
    await navigator.clipboard.writeText(reserved.hme).catch(()=>{});
    browser.runtime.sendMessage({ type: 'AUTOFILL_REQUEST', hme: reserved.hme }).catch(()=>{});
    $('action-pending').classList.add('hidden');
    $('action-reserve').classList.remove('hidden');
    playPop(); animateSuccess($('action-reserve'));
    pendingHme = null;
    loadList();
  } catch (e) { showError(String(e.message||e)); }
  finally { $('btn-reserve').disabled = false; $('btn-reserve').textContent = 'Criar e usar endereço'; }
});

$('btn-copy').addEventListener('click', async () => {
  const t = $('generated-email').textContent;
  if (t && t!=='—') { await navigator.clipboard.writeText(t); playPop(); $('btn-copy').textContent = '✓ Copiado'; setTimeout(()=> $('btn-copy').textContent='Copiar', 1200); }
});
$('btn-autofill').addEventListener('click', () => {
  const t = $('generated-email').textContent;
  if (t && t!=='—') { browser.runtime.sendMessage({ type: 'AUTOFILL_REQUEST', hme: t }); playPop(); window.close(); }
});

// --- Lista com filtro, ordenação, paginação ---
async function loadList() {
  const list = $('list');
  list.innerHTML = `<div class="apple-item"><span style="color:#86868b;font-size:12px;">Carregando…</span></div>`;
  $('list-error').classList.add('hidden');
  $('list-empty').classList.add('hidden');
  $('list-count').classList.add('hidden');
  $('pagination').classList.add('hidden');
  try {
    const result = await browser.runtime.sendMessage({ type: 'LIST' });
    allItems = result.hmeEmails || [];
    if (result.forwardToEmails) {
      forwardToEmails = result.forwardToEmails;
      selectedForwardTo = result.selectedForwardTo;
      const sel = $('forward-select');
      sel.innerHTML = forwardToEmails.map(e => `<option value="${escapeHtml(e)}" ${e===selectedForwardTo?'selected':''}>${escapeHtml(e)}</option>`).join('');
    }
    $('list-count').textContent = String(allItems.length);
    $('list-count').classList.remove('hidden');
    currentPage = 1;
    applyFilters();
  } catch (e) {
    list.innerHTML = '';
    $('list-error').textContent = String(e.message||e);
    $('list-error').classList.remove('hidden');
  }
}

function applyFilters() {
  const q = $('search').value.toLowerCase().trim();
  let items = [...allItems];
  // filtro ativo
  if (currentFilter === 'active') items = items.filter(i => i.isActive);
  if (currentFilter === 'inactive') items = items.filter(i => !i.isActive);
  // busca
  if (q) items = items.filter(i => (`${i.hme} ${i.label} ${i.note} ${i.forwardToEmail}`.toLowerCase().includes(q)));
  // ordenação
  if (currentSort === 'recent') items.sort((a,b) => b.createTimestamp - a.createTimestamp);
  else if (currentSort === 'oldest') items.sort((a,b) => a.createTimestamp - b.createTimestamp);
  else if (currentSort === 'az') items.sort((a,b) => (a.label||a.hme).localeCompare(b.label||b.hme));
  else if (currentSort === 'za') items.sort((a,b) => (b.label||b.hme).localeCompare(a.label||a.hme));
  filteredItems = items;
  // paginação: ajusta página se fora do range
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  renderList(filteredItems);
}

function renderList(items) {
  const list = $('list');
  if (!items.length) {
    if (!allItems.length) { list.innerHTML=''; $('list-empty').classList.remove('hidden'); $('pagination').classList.add('hidden'); return; }
    list.innerHTML = `<div data-empty style="text-align:center; color:var(--secondary); padding:32px 16px; font-size:13px;">Nenhum resultado para filtro/busca</div>`;
    $('pagination').classList.add('hidden');
    return;
  }
  $('list-empty').classList.add('hidden');
  // paginação slice
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  list.innerHTML = pageItems.map(i => {
    const domain = extractDomain(i.label) || extractDomain(i.note) || '';
    const favicon = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32` : '';
    const dateStr = formatDate(i.createTimestamp);
    const useLabel = escapeHtml(i.label||'(sem rótulo)');
    const noteHtml = i.note ? `<span class="sub-note" title="${escapeHtml(i.note)}">· ${escapeHtml(i.note)}</span>` : '';
    const faviconHtml = favicon ? `<img class="favicon" src="${favicon}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<span class="favicon placeholder">◍</span>`;
    const badgeHtml = i.isActive ? '' : `<span class="item-badge off">Desativado</span>`;
    return `
    <div class="apple-item ${i.isActive?'active':''} ${i.isActive?'':'inactive'}" data-id="${escapeHtml(i.anonymousId)}">
      <div class="item-top">
        <div class="item-icon" aria-label="${i.isActive?'Ativo':'Desativado'}" title="${i.isActive?'Ativo':'Desativado'}"></div>
        <div class="item-main">
          <div class="item-hme" title="${escapeHtml(i.hme)}">${escapeHtml(i.hme)}</div>
          <div class="item-meta-row" id="label-${escapeHtml(i.anonymousId)}">
            ${faviconHtml}
            <span class="sub-label" title="${escapeHtml(i.label||'')}">${useLabel}</span>
            ${noteHtml}
            <span class="sub-dot">·</span>
            <span class="sub-date">${dateStr}</span>
          </div>
        </div>
        ${badgeHtml}
      </div>
      <div class="inline-edit hidden" id="edit-${escapeHtml(i.anonymousId)}">
        <input data-role="label" value="${escapeHtml(i.label||'')}" placeholder="Rótulo (ex: amazon.com)" maxlength="30" />
        <input data-role="note" value="${escapeHtml(i.note||'')}" placeholder="Nota" maxlength="60" />
        <button class="save" data-save="${escapeHtml(i.anonymousId)}">Salvar</button>
        <button class="cancel" data-cancel="${escapeHtml(i.anonymousId)}">Cancelar</button>
      </div>
      <div class="item-actions">
        <button class="act-copy" data-copy="${escapeHtml(i.hme)}" title="Copiar">⎘</button>
        <button class="act-use" data-autofill="${escapeHtml(i.hme)}" title="Usar no site">↗</button>
        <button class="act-edit" data-edit="${escapeHtml(i.anonymousId)}" title="Editar rótulo/nota">✎</button>
        <button class="act-toggle" data-toggle="${escapeHtml(i.anonymousId)}" data-active="${i.isActive?1:0}" title="${i.isActive?'Desativar':'Reativar'}">${i.isActive?'⏸':'▶'}</button>
        <button class="act-delete" data-delete="${escapeHtml(i.anonymousId)}" title="Apagar">✕</button>
      </div>
    </div>
  `}).join('');

  // paginação UI
  if (totalPages > 1) {
    $('pagination').classList.remove('hidden');
    $('page-info').textContent = `Página ${currentPage}/${totalPages} · ${items.length} endereços`;
    $('prev-page').disabled = currentPage === 1;
    $('next-page').disabled = currentPage === totalPages;
  } else {
    $('pagination').classList.add('hidden');
  }

  // empty state styling — sem grid quebrado
  const emptyDiv = list.querySelector('[data-empty]');
  if (emptyDiv) emptyDiv.style.cssText = 'text-align:center;color:var(--secondary);padding:32px 16px;font-size:13px;';

  // listeners — toggle inline edit (compatível com novo layout)
  list.querySelectorAll('.act-edit').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.edit;
    const labelRow = document.getElementById(`label-${id}`);
    const editRow = document.getElementById(`edit-${id}`);
    if (labelRow) labelRow.classList.add('hidden');
    if (editRow) editRow.classList.remove('hidden');
    b.classList.add('hidden');
  }));
  list.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.cancel;
    const labelRow = document.getElementById(`label-${id}`);
    const editRow = document.getElementById(`edit-${id}`);
    if (labelRow) labelRow.classList.remove('hidden');
    if (editRow) editRow.classList.add('hidden');
    const editBtn = list.querySelector(`.act-edit[data-edit="${id}"]`);
    if (editBtn) editBtn.classList.remove('hidden');
  }));
  list.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.save;
    const wrap = document.getElementById(`edit-${id}`);
    const label = wrap.querySelector('[data-role="label"]').value.trim();
    const note = wrap.querySelector('[data-role="note"]').value.trim();
    b.textContent = '…'; b.disabled = true;
    try {
      await browser.runtime.sendMessage({ type: 'UPDATE_METADATA', anonymousId: id, label: label || '(sem rótulo)', note });
      playPop(); loadList();
    } catch (e) { alert(String(e.message||e)); b.textContent='Salvar'; b.disabled=false; }
  }));
  list.querySelectorAll('.act-copy').forEach(b => b.addEventListener('click', async () => {
    await navigator.clipboard.writeText(b.dataset.copy); playPop();
    const o=b.textContent; b.textContent='✓'; setTimeout(()=>b.textContent='⎘',1000);
  }));
  list.querySelectorAll('.act-use').forEach(b => b.addEventListener('click', () => {
    browser.runtime.sendMessage({ type: 'AUTOFILL_REQUEST', hme: b.dataset.autofill }); playPop(); window.close();
  }));
  // Desativar / Reativar (símbolos ⏸ / ▶) — restaura botões que você tinha antes
  list.querySelectorAll('.act-toggle').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.toggle;
    const active = b.dataset.active === '1';
    b.disabled = true;
    const prev = b.textContent;
    b.textContent = '…';
    try {
      if (active) await browser.runtime.sendMessage({ type: 'DEACTIVATE', anonymousId: id });
      else await browser.runtime.sendMessage({ type: 'REACTIVATE', anonymousId: id });
      playPop(); await loadList();
    } catch (e) {
      alert(String(e.message || e));
      b.textContent = prev; b.disabled = false;
    }
  }));
  list.querySelectorAll('.act-delete').forEach(b => b.addEventListener('click', async () => {
    if(!confirm('Apagar este endereço? E-mails futuros serão perdidos e não podem ser recuperados.')) return;
    b.disabled=true;
    const originalText = b.textContent;
    b.textContent = '…';
    try { await browser.runtime.sendMessage({ type:'DELETE', anonymousId:b.dataset.delete }); playPop(); loadList(); } catch(e){
      const msg = String(e.message||e);
      if (msg.toLowerCase().includes('invalid request')) {
        const retry = confirm(`A Apple só apaga aliases desativados.\n\nErro: ${msg}\n\nTentar desativar e apagar automaticamente?`);
        if (retry) {
          try {
            await browser.runtime.sendMessage({ type:'DEACTIVATE', anonymousId:b.dataset.delete });
            await browser.runtime.sendMessage({ type:'DELETE', anonymousId:b.dataset.delete });
            playPop(); loadList(); return;
          } catch(e2) { alert(`Ainda falhou: ${String(e2.message||e2)}\n\nTente: clique em ⏸ para desativar, aguarde 2s, depois clique em ✕ novamente.`); }
        }
      } else {
        alert(msg);
      }
      b.textContent = originalText; b.disabled=false;
    }
  }));
}

function exportCSV() {
  if (!allItems.length) { alert('Nenhum endereço para exportar'); return; }
  const header = ['hme','label','note','forwardTo','isActive','createTimestamp'];
  const rows = allItems.map(i => [i.hme, `"${(i.label||'').replace(/"/g,'""')}"`, `"${(i.note||'').replace(/"/g,'""')}"`, i.forwardToEmail||'', i.isActive?'ativo':'desativado', new Date(i.createTimestamp).toISOString()]);
  const csv = [header.join(','), ...rows.map(r=>r.join(','))].join('\n');
  downloadBlob(csv, `hidemymail-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
  playPop();
}
function exportJSON() {
  if (!allItems.length) { alert('Nenhum endereço para exportar'); return; }
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), count: allItems.length, forwardTo: selectedForwardTo, aliases: allItems }, null, 2);
  downloadBlob(json, `hidemymail-${new Date().toISOString().slice(0,10)}.json`, 'application/json');
  playPop();
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(()=> { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function extractDomain(text) {
  if (!text) return '';
  // procura domínio com ponto
  const m = String(text).trim().toLowerCase().match(/([a-z0-9-]+\.)+[a-z]{2,}/);
  if (m) return m[0];
  // se já parece domínio simples sem espaço
  const t = String(text).trim();
  if (t && !t.includes(' ') && t.includes('.')) return t;
  return '';
}
function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d)) return '';
    // ts pode ser segundos ou millis - Apple usa millis
    const now = Date.now();
    const diff = now - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'hoje';
    if (days === 1) return 'ontem';
    if (days < 7) return `${days} dias atrás`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: days > 365 ? 'numeric' : undefined });
  } catch { return ''; }
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

$('btn-signout').addEventListener('click', async ()=>{ await browser.runtime.sendMessage({type:'SIGN_OUT'}); checkAuth(); });

const btnTopGen = $('btn-top-generate');
if (btnTopGen) btnTopGen.addEventListener('click', handleGenerate);

// Theme toggle — funciona sempre (header, claro/escuro, sobrescreve system)
const themeBtn = $('btn-theme-toggle');
const themeIcon = $('theme-icon');

function updateThemeIcon(isDark) {
  if (!themeIcon) return;
  try {
    if (isDark) {
      themeIcon.innerHTML = `<path d="M13 8A5 5 0 1 1 8 3a4.5 4.5 0 0 0 5 5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>`;
    } else {
      themeIcon.innerHTML = `<circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M8 3V4M8 12V13M3 8H4M12 8H13M4.2 4.2L5.2 5.2M10.8 10.8L11.8 11.8M4.2 11.8L5.2 10.8M10.8 5.2L11.8 4.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`;
    }
  } catch {}
}

function getEffectiveDark() {
  if (document.body.classList.contains('force-dark')) return true;
  if (document.body.classList.contains('force-light')) return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function setTheme(dark) {
  document.body.classList.toggle('force-dark', dark);
  document.body.classList.toggle('force-light', !dark);
  document.documentElement.classList.toggle('force-dark', dark);
  document.documentElement.classList.toggle('force-light', !dark);
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
  updateThemeIcon(dark);
}

if (themeBtn) {
  themeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isDark = !getEffectiveDark();
    setTheme(isDark);
    try { playPop(); } catch {}
  });
}
// Load saved theme — se não houver, segue sistema e só ajusta ícone
try {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') setTheme(true);
  else if (saved === 'light') setTheme(false);
  else updateThemeIcon(getEffectiveDark());
  // escuta mudança de sistema quando sem escolha salva
  if (!saved && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (ev) => {
      if (!localStorage.getItem('theme')) updateThemeIcon(ev.matches);
    });
  }
} catch {}

init();
