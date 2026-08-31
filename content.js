// content.js - Apple Hide My Email - React + Shadow DOM + Container aware
let lastFocusedEmailInput = null;
let autofillButton = null;

function isEmailInput(el) {
  if (!el) return false;
  // Check shadow host tag as well
  if (el.tagName === 'INPUT') {
    const t = (el.type || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const ph = (el.placeholder || '').toLowerCase();
    const ac = (el.autocomplete || '').toLowerCase();
    return t === 'email' || ac === 'email' || ac === 'username' || name.includes('email') || id.includes('email') || ph.includes('email') || ph.includes('e-mail') || el.inputMode === 'email';
  }
  // For other elements that might be custom components wrapping input
  if (el.isContentEditable) return false;
  return false;
}

function findAllEmailInputs(root = document) {
  const inputs = [];
  // Standard
  inputs.push(...root.querySelectorAll('input'));
  // Shadow DOM piercing
  root.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot) {
      inputs.push(...findAllEmailInputs(el.shadowRoot));
    }
  });
  return inputs.filter(isEmailInput);
}

function createButton() {
  const btn = document.createElement('button');
  btn.textContent = ' Ocultar Meu E-mail';
  btn.className = 'hidemymail-autofill-btn';
  btn.type = 'button';
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (lastFocusedEmailInput) autofillFromBackground(lastFocusedEmailInput);
  });
  return btn;
}

function positionButton(input) {
  if (!autofillButton) return;
  const rect = input.getBoundingClientRect();
  // fixed positioning — relativo à viewport, não ao document (evita drift em scroll/transform)
  autofillButton.style.top = `${Math.max(8, rect.top - 32)}px`;
  autofillButton.style.left = `${Math.max(8, rect.left)}px`;
  // evita sair da viewport à direita
  const maxLeft = window.innerWidth - autofillButton.offsetWidth - 8;
  if (parseFloat(autofillButton.style.left) > maxLeft) autofillButton.style.left = `${maxLeft}px`;
}

function showButtonFor(input) {
  lastFocusedEmailInput = input;
  if (!autofillButton) {
    autofillButton = createButton();
    document.body.appendChild(autofillButton);
  }
  autofillButton.style.display = 'block';
  positionButton(input);
}

function hideButton() {
  if (autofillButton) autofillButton.style.display = 'none';
}

async function autofillFromBackground(input) {
  try {
    hideButton();
    input.placeholder = 'Gerando endereço Apple…';
    const gen = await browser.runtime.sendMessage({ type: 'GENERATE' });
    if (!gen?.hme) throw new Error('Falha ao gerar');
    const label = location.hostname || 'Firefox';
    const reserved = await browser.runtime.sendMessage({ type: 'RESERVE', hme: gen.hme, label });
    const email = reserved.reserved?.hme || gen.hme;
    fillInput(input, email);
  } catch (e) {
    if (lastFocusedEmailInput) lastFocusedEmailInput.placeholder = 'Erro: faça login em iCloud.com';
    console.error('[HideMyEmail]', e);
  }
}

// React-safe fill: use native setter
function fillInput(input, value) {
  try {
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
  } catch { input.value = value; }
  // Dispatch events for React/Vue/Angular
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  input.focus();
  // Visual feedback
  input.style.boxShadow = '0 0 0 3px rgba(0,122,255,0.3)';
  input.style.borderColor = '#007aff';
  setTimeout(() => { input.style.boxShadow = ''; input.style.borderColor = ''; }, 1400);
  navigator.clipboard.writeText(value).catch(() => {});
  // Play pop sound via inject? Just console
}

// Dead simple observer for dynamically added inputs (React SPA)
const observer = new MutationObserver(() => {
  // Re-attach if new email inputs appear, no-op (focusin will handle)
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// Support Shadow DOM focus via deep listener
document.addEventListener('focusin', (e) => {
  const t = e.target;
  // Handle shadow root targets
  let el = t;
  // If inside shadow, try to get real target
  if (t && t.shadowRoot) el = t;
  if (isEmailInput(el)) showButtonFor(el);
  else {
    // Check if composed path contains email input (for shadow)
    const path = e.composedPath ? e.composedPath() : [];
    const found = path.find(isEmailInput);
    if (found) showButtonFor(found);
    else setTimeout(() => { if (document.activeElement !== autofillButton) hideButton(); }, 200);
  }
}, true);

document.addEventListener('focusout', () => {
  setTimeout(() => { if (document.activeElement !== autofillButton && !autofillButton?.matches(':hover')) hideButton(); }, 150);
});

document.addEventListener('scroll', () => { if (lastFocusedEmailInput && autofillButton?.style.display==='block') positionButton(lastFocusedEmailInput); }, true);
window.addEventListener('resize', () => { if (lastFocusedEmailInput && autofillButton?.style.display==='block') positionButton(lastFocusedEmailInput); });

// Receive autofill from popup/background
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AUTOFILL' && msg.hme) {
    // Try last focused, or any email input, or shadow piercing
    let input = lastFocusedEmailInput;
    if (!input || !document.contains(input)) {
      const all = findAllEmailInputs(document);
      input = all[0] || document.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]');
      // Also check shadow roots
      if (!input) {
        document.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) {
            const shadowCandidates = el.shadowRoot.querySelectorAll('input');
            for (const si of shadowCandidates) if (isEmailInput(si)) { input = si; break; }
          }
        });
      }
    }
    if (input) fillInput(input, msg.hme);
    else navigator.clipboard.writeText(msg.hme).catch(()=>{});
  }
});
