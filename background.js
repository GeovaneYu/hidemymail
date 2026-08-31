// background.js - Firefox MV3 (compatível com MV2 via scripts)
// Lógica baseada em dedoussis/icloud-hide-my-email-browser-extension - MIT

const DEFAULT_SETUP_URL = 'https://setup.icloud.com/setup/ws/1';
const CN_SETUP_URL = 'https://setup.icloud.com.cn/setup/ws/1';
const CONTEXT_MENU_ID = 'hidemymail-generate';

// ---------- ICloudClient ----------
class ICloudClient {
  constructor(setupUrl, webservices) {
    this.setupUrl = setupUrl;
    this.webservices = webservices;
  }

  async request(method, url, { headers = {}, data, timeout = 8000 } = {}) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data !== undefined ? JSON.stringify(data) : undefined,
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Request ${method} ${url} failed: ${response.status}`);
      }
      return response.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(`Tempo esgotado ao contatar iCloud (${url}) — verifique conexão e login em icloud.com`);
      throw e;
    } finally {
      clearTimeout(tid);
    }
  }

  webserviceUrl(serviceName) {
    if (!this.webservices) throw new Error('webservices não inicializado - faça validate() primeiro');
    return this.webservices[serviceName].url;
  }

  async isAuthenticated() {
    try {
      await this.validateToken();
      return true;
    } catch { return false; }
  }

  async validateToken() {
    const { webservices } = await this.request('POST', `${this.setupUrl}/validate`);
    if (webservices) this.webservices = webservices;
  }

  async signOut({ trust = false } = {}) {
    await this.request('POST', `${this.setupUrl}/logout`, {
      data: { trustBrowsers: trust, allBrowsers: trust }
    }).catch(() => {});
  }
}

class PremiumMailSettings {
  constructor(client) {
    this.client = client;
    this.baseUrl = `${client.webserviceUrl('premiummailsettings')}/v1`;
    this.v2BaseUrl = `${client.webserviceUrl('premiummailsettings')}/v2`;
  }

  async listHme() {
    const { result } = await this.client.request('GET', `${this.v2BaseUrl}/hme/list`);
    return result;
  }

  async generateHme() {
    const resp = await this.client.request('POST', `${this.baseUrl}/hme/generate`);
    if (!resp.success) throw new Error(resp.error?.errorMessage || 'Falha ao gerar HME');
    return resp.result.hme;
  }

  async reserveHme(hme, label, note = 'Gerado via Hide My Email Firefox') {
    const resp = await this.client.request('POST', `${this.baseUrl}/hme/reserve`, {
      data: { hme, label, note }
    });
    if (!resp.success) throw new Error(resp.error?.errorMessage || 'Falha ao reservar HME');
    return resp.result.hme;
  }

  async deactivateHme(anonymousId) {
    const resp = await this.client.request('POST', `${this.baseUrl}/hme/deactivate`, { data: { anonymousId } });
    if (!resp.success) throw new Error(resp.error?.errorMessage || 'Falha ao desativar — tente atualizar a lista primeiro');
  }
  async reactivateHme(anonymousId) {
    const resp = await this.client.request('POST', `${this.baseUrl}/hme/reactivate`, { data: { anonymousId } });
    if (!resp.success) throw new Error(resp.error?.errorMessage || 'Falha ao reativar');
  }
  async deleteHme(anonymousId) {
    let resp = await this.client.request('POST', `${this.baseUrl}/hme/delete`, { data: { anonymousId } });
    if (!resp.success) {
      const msg = (resp.error?.errorMessage || '').toLowerCase();
      // Apple só deixa apagar se já estiver desativado — tenta desativar e apagar novamente
      if (msg.includes('invalid request for private email') || msg.includes('invalid request') || msg.includes('cannot delete')) {
        try {
          await this.deactivateHme(anonymousId);
          resp = await this.client.request('POST', `${this.baseUrl}/hme/delete`, { data: { anonymousId } });
          if (resp.success) return;
        } catch {}
      }
      throw new Error(resp.error?.errorMessage || 'Falha ao deletar — tente desativar primeiro (⏸) e depois apagar');
    }
  }
  async updateForwardTo(email) {
    const resp = await this.client.request('POST', `${this.baseUrl}/hme/updateForwardTo`, { data: { forwardToEmail: email } });
    if (!resp.success) throw new Error(resp.error?.errorMessage || 'Falha ao atualizar forwardTo');
  }
  async updateMetadata(anonymousId, label, note) {
    const resp = await this.client.request('POST', `${this.baseUrl}/hme/updateMetaData`, { data: { anonymousId, label, note } });
    if (!resp.success) throw new Error(resp.error?.errorMessage || 'Falha ao atualizar rótulo/nota');
  }
}

// ---------- Storage helpers ----------
async function getStorage(key) {
  const r = await browser.storage.local.get(key);
  return r[key];
}
async function setStorage(key, value) {
  if (value === undefined) await browser.storage.local.remove(key);
  else await browser.storage.local.set({ [key]: value });
}

async function getClient() {
  const clientState = await getStorage('clientState');
  if (!clientState) return new ICloudClient(DEFAULT_SETUP_URL);
  return new ICloudClient(clientState.setupUrl, clientState.webservices);
}

async function saveClientState(client) {
  await setStorage('clientState', { setupUrl: client.setupUrl, webservices: client.webservices });
}

// ---------- Context Menu ----------
async function setupContextMenu() {
  try { await browser.contextMenus.remove(CONTEXT_MENU_ID); } catch {}
  browser.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Gerar Hide My Email',
    contexts: ['editable'],
    enabled: false,
  });
  // tenta validar auth em background
  const client = await getClient();
  const ok = await client.isAuthenticated();
  if (ok) {
    await saveClientState(client);
    browser.contextMenus.update(CONTEXT_MENU_ID, { enabled: true }).catch(() => {});
  }
}

browser.runtime.onInstalled.addListener(setupContextMenu);
browser.runtime.onStartup?.addListener(setupContextMenu);
// Firefox não persiste contextMenus após restart, então garante na carga
setupContextMenu();

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  try {
    const clientState = await getStorage('clientState');
    if (!clientState) throw new Error('Não autenticado - faça login em icloud.com');
    const client = new ICloudClient(clientState.setupUrl, clientState.webservices);
    if (!await client.isAuthenticated()) throw new Error('Sessão expirada - faça login novamente em icloud.com');
    const pms = new PremiumMailSettings(client);
    const hme = await pms.generateHme();
    // tenta reservar com hostname da aba
    let label = 'Firefox';
    try { if (tab?.url) label = new URL(tab.url).hostname; } catch {}
    const reserved = await pms.reserveHme(hme, label);
    if (tab?.id) {
      browser.tabs.sendMessage(tab.id, { type: 'AUTOFILL', hme: reserved.hme }).catch(() => {});
      // fallback: copy via notification
      browser.notifications?.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'Hide My Email',
        message: `${reserved.hme} copiado - colado no campo`
      }).catch(() => {});
    }
  } catch (e) {
    browser.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Hide My Email - erro',
      message: String(e.message || e)
    }).catch(() => {});
  }
});

// ---------- Message handling (popup <-> background <-> content) ----------
browser.runtime.onMessage.addListener(async (msg, sender) => {
  // Usado pelo popup
  if (msg.type === 'VALIDATE') {
    const client = await getClient();
    const ok = await client.isAuthenticated();
    if (ok) await saveClientState(client);
    else await setStorage('clientState', undefined);
    return { authenticated: ok, setupUrl: client.setupUrl };
  }
  if (msg.type === 'SIGN_OUT') {
    const client = await getClient();
    await client.signOut();
    await setStorage('clientState', undefined);
    browser.contextMenus.update(CONTEXT_MENU_ID, { enabled: false }).catch(() => {});
    return { ok: true };
  }
  if (msg.type === 'GENERATE') {
    const clientState = await getStorage('clientState');
    if (!clientState) throw new Error('Não autenticado');
    const client = new ICloudClient(clientState.setupUrl, clientState.webservices);
    if (!await client.isAuthenticated()) {
      await setStorage('clientState', undefined);
      throw new Error('Sessão expirada');
    }
    await saveClientState(client);
    const pms = new PremiumMailSettings(client);
    const hme = await pms.generateHme();
    return { hme };
  }
  if (msg.type === 'RESERVE') {
    const { hme, label, note } = msg;
    const client = await getClient();
    const pms = new PremiumMailSettings(client);
    const reserved = await pms.reserveHme(hme, label, note);
    return { reserved };
  }
  if (msg.type === 'LIST') {
    const client = await getClient();
    const pms = new PremiumMailSettings(client);
    const result = await pms.listHme();
    await saveClientState(client);
    return result;
  }
  if (msg.type === 'DEACTIVATE') {
    const client = await getClient();
    // Garante sessão válida (o erro que você viu era webservices expirado)
    if (!await client.isAuthenticated()) {
      await setStorage('clientState', undefined);
      throw new Error('Sessão expirou — abra icloud.com e clique em Confiar novamente, depois Atualizar');
    }
    await saveClientState(client);
    const pms = new PremiumMailSettings(client);
    await pms.deactivateHme(msg.anonymousId);
    return { ok: true };
  }
  if (msg.type === 'REACTIVATE') {
    const client = await getClient();
    if (!await client.isAuthenticated()) {
      await setStorage('clientState', undefined);
      throw new Error('Sessão expirou — faça login novamente em icloud.com');
    }
    await saveClientState(client);
    const pms = new PremiumMailSettings(client);
    await pms.reactivateHme(msg.anonymousId);
    return { ok: true };
  }
  if (msg.type === 'DELETE') {
    const client = await getClient();
    if (!await client.isAuthenticated()) {
      await setStorage('clientState', undefined);
      throw new Error('Sessão expirou — faça login novamente em icloud.com');
    }
    await saveClientState(client);
    const pms = new PremiumMailSettings(client);
    await pms.deleteHme(msg.anonymousId);
    return { ok: true };
  }
  if (msg.type === 'UPDATE_FORWARD') {
    const client = await getClient();
    if (!await client.isAuthenticated()) {
      await setStorage('clientState', undefined);
      throw new Error('Sessão expirou — faça login novamente em icloud.com');
    }
    await saveClientState(client);
    const pms = new PremiumMailSettings(client);
    await pms.updateForwardTo(msg.email);
    return { ok: true };
  }
  if (msg.type === 'UPDATE_METADATA') {
    const client = await getClient();
    if (!await client.isAuthenticated()) {
      await setStorage('clientState', undefined);
      throw new Error('Sessão expirou — faça login novamente em icloud.com');
    }
    await saveClientState(client);
    const pms = new PremiumMailSettings(client);
    await pms.updateMetadata(msg.anonymousId, msg.label, msg.note);
    return { ok: true };
  }
  if (msg.type === 'GET_CONTAINER') {
    try {
      const tab = msg.tabId ? await browser.tabs.get(msg.tabId) : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      if (!tab) return { name: 'Sem container' };
      if (tab.cookieStoreId && tab.cookieStoreId !== 'firefox-default') {
        try {
          const ctx = await browser.contextualIdentities.get(tab.cookieStoreId);
          return { name: ctx.name, color: ctx.color, icon: ctx.icon, id: ctx.cookieStoreId };
        } catch { return { name: tab.cookieStoreId }; }
      }
      return { name: 'Padrão', id: 'firefox-default' };
    } catch (e) { return { name: 'Desconhecido', error: String(e) }; }
  }
  if (msg.type === 'CHECK_SYNC') {
    const results = { time: new Date().toISOString(), checks: [] };
    // 1. Internet
    try {
      const r = await fetch('https://www.icloud.com', { method: 'HEAD', cache: 'no-store' });
      results.checks.push({ name: 'Internet', ok: r.ok, detail: r.ok ? 'Conectado' : `HTTP ${r.status}` });
    } catch (e) {
      results.checks.push({ name: 'Internet', ok: false, detail: String(e.message || e).slice(0,80) });
    }
    // 2. iCloud auth
    try {
      const client = await getClient();
      const ok = await client.isAuthenticated();
      if (ok) await saveClientState(client);
      results.checks.push({ name: 'iCloud', ok, detail: ok ? `Autenticado (${client.setupUrl.includes('icloud.com.cn') ? 'CN' : 'Global'})` : 'Não autenticado — faça login em icloud.com' });
      results.webservices = ok ? Object.keys(client.webservices || {}).join(', ') : '';
    } catch (e) {
      results.checks.push({ name: 'iCloud', ok: false, detail: String(e.message || e).slice(0,100) });
    }
    // 3. Hide My Email
    try {
      const client = await getClient();
      const pms = new PremiumMailSettings(client);
      const data = await pms.listHme();
      results.checks.push({ name: 'Hide My Email', ok: true, detail: `${(data.hmeEmails||[]).length} aliases · Encaminhar para ${data.selectedForwardTo || '—'}` });
      results.count = (data.hmeEmails||[]).length;
      results.forwardTo = data.selectedForwardTo;
    } catch (e) {
      const msg = String(e.message || e);
      const isInvalid = msg.toLowerCase().includes('invalid request');
      results.checks.push({ name: 'Hide My Email', ok: false, detail: isInvalid ? 'iCloud+ não ativo — ative em icloud.com/icloudplus/hidemyemail' : msg.slice(0,120) });
    }
    await setStorage('lastSync', results);
    return results;
  }
  if (msg.type === 'AUTOFILL_REQUEST') {
    // popup pede para autofill na aba ativa
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await browser.tabs.sendMessage(tab.id, { type: 'AUTOFILL', hme: msg.hme });
    return { ok: true };
  }
});
