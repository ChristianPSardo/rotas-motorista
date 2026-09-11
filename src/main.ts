import './style.css';
import { clearConnection, fetchDashboard, getDriverToken, healthCheck, saveConnection, startRoute, checkStop } from './api';
import { getTrackedRouteId, openLocationSettings, startBackgroundTracking, stopBackgroundTracking } from './tracking';
import type { DriverDashboard, Route, Stop } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
let dashboard: DriverDashboard | null = null;
let autoRefreshBusy = false;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!));
const fmt = (v?: string) => v ? new Date(v).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
const mins = (v?: number|string) => {
  if (v === undefined || v === null || v === '') return '-';
  const n = Number(v); if (!Number.isFinite(n)) return '-';
  return n < 60 ? `${Math.round(n)} min` : `${Math.floor(n/60)}h ${Math.round(n%60)}min`;
};

function shell(content: string) {
  app.innerHTML = `
    <header class="top"><div><small>Aplicativo do motorista</small><h1>Rotas Motorista</h1></div><button id="settings">⚙️</button></header>
    <main>${content}</main>
    <div id="toast" class="toast"></div>
  `;
  document.querySelector('#settings')?.addEventListener('click', renderSettings);
}

function toast(message: string, error=false) {
  const el = document.querySelector<HTMLDivElement>('#toast');
  if (!el) return;
  el.textContent = message; el.className = `toast show ${error ? 'error' : ''}`;
  setTimeout(() => el.className='toast', 3000);
}

function renderSettings() {
  shell(`
    <section class="card">
      <h2>Conectar motorista</h2>
      <p>O servidor Supabase já está configurado. Informe apenas o token do motorista.</p>
      <label>Token do motorista<input id="token" value="${esc(getDriverToken())}" placeholder="Token do motorista"></label>
      <button id="connect" class="primary full">Conectar</button>
      <button id="clear" class="secondary full">Limpar</button>
    </section>
  `);

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const token = (document.querySelector<HTMLInputElement>('#token')?.value || '').trim();
    if (!token) return toast('Informe o token.', true);
    try {
      await healthCheck();
      saveConnection(token);
      dashboard = await fetchDashboard();
      renderDashboard();
    } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao conectar.', true); }
  });

  document.querySelector('#clear')?.addEventListener('click', async () => {
    try { await stopBackgroundTracking(); } catch {}
    clearConnection(); renderSettings();
  });
}

function nextStop(route: Route): Stop | undefined {
  return route.PARADAS.find(p => String(p.STATUS).toUpperCase() !== 'CONCLUIDA');
}

function renderDashboard() {
  if (!dashboard?.valid) return renderSettings();
  const routes = dashboard.rotas || [];
  shell(`
    <section class="hello"><div><small>Motorista</small><h2>Olá, ${esc(dashboard.motorista?.NOME || '')}</h2></div><button id="refresh" class="secondary">Atualizar</button></section>
    <section class="gps"><span>${getTrackedRouteId() ? '🟢 GPS em segundo plano ativo' : '⚪ GPS parado'}</span><button id="permissions">Permissões</button></section>
    ${routes.length ? routes.map(renderRoute).join('') : '<section class="card"><h2>Nenhuma rota ativa</h2></section>'}
  `);

  document.querySelector('#refresh')?.addEventListener('click', () => void refresh(true));
  document.querySelector('#permissions')?.addEventListener('click', () => openLocationSettings());
  document.querySelectorAll<HTMLButtonElement>('.start').forEach(b => b.addEventListener('click', () => start(b.dataset.id || '')));
  document.querySelectorAll<HTMLButtonElement>('.stopgps').forEach(b => b.addEventListener('click', stopGps));
  document.querySelectorAll<HTMLButtonElement>('.check').forEach(b => b.addEventListener('click', () => arrive(b.dataset.id || '', b.dataset.name || '')));
  document.querySelectorAll<HTMLButtonElement>('.nav').forEach(b => b.addEventListener('click', () => { const u=b.dataset.url; if(u) location.href=u; }));
}

function renderRoute(route: Route): string {
  const next = nextStop(route); const tracking = getTrackedRouteId() === route.ID;
  const done = route.PARADAS.filter(p => String(p.STATUS).toUpperCase()==='CONCLUIDA').length;
  return `<section class="card route">
    <div class="row"><div><span class="badge">${esc(route.STATUS)}</span><h2>${esc(route.NOME)}</h2><p>${esc(route.ORIGEM?.NOME)} → ${esc(route.DESTINO?.NOME)}</p></div><strong>${esc(route.DISTANCIA_KM || '')}${route.DISTANCIA_KM ? ' km':''}</strong></div>
    <div class="stats"><div><b>${done}/${route.PARADAS.length}</b><small>paradas</small></div><div><b>${mins(route.TEMPO_RESTANTE_MIN)}</b><small>restante</small></div><div><b>${fmt(route.ETA_FIM)}</b><small>chegada</small></div></div>
    <div class="trackbox"><div><b>${tracking ? '📍 Rastreamento ativo' : '📍 Rastreamento desligado'}</b><small>${tracking ? 'Pode usar outro app ou bloquear a tela.' : 'Toque para iniciar a rota e o GPS.'}</small></div>${tracking ? '<button class="secondary stopgps">Parar GPS</button>' : `<button class="primary start" data-id="${esc(route.ID)}">Iniciar rota</button>`}</div>
    ${next ? `<div class="next"><small>PRÓXIMA PARADA</small><h3>${esc(next.ENDERECO_NOME)}</h3><p>${esc(next.ENDERECO)}</p><p><b>ETA:</b> ${fmt(next.ETA_PREVISTA)}</p><div class="actions"><button class="secondary nav" data-url="${esc(next.MAPS_URL || '')}">Navegar</button><button class="primary check" data-id="${esc(next.ID)}" data-name="${esc(next.ENDERECO_NOME)}">✓ Cheguei</button></div></div>` : ''}
  </section>`;
}

async function refresh(showErrors = true) {
  if (autoRefreshBusy) return;
  autoRefreshBusy = true;
  try {
    dashboard = await fetchDashboard();
    renderDashboard();
  } catch (e) {
    if (showErrors) toast(e instanceof Error ? e.message : 'Erro ao atualizar.', true);
  } finally {
    autoRefreshBusy = false;
  }
}

async function start(routeId: string) {
  try {
    dashboard = await startRoute(routeId);
    await startBackgroundTracking(routeId);
    toast('Rota iniciada e GPS em segundo plano ativado.');
    renderDashboard();
  } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao iniciar rota.', true); }
}

async function stopGps() {
  try { await stopBackgroundTracking(); toast('GPS parado.'); renderDashboard(); }
  catch (e) { toast(e instanceof Error ? e.message : 'Erro ao parar GPS.', true); }
}

async function arrive(stopId: string, name: string) {
  if (!confirm(`Confirmar chegada em "${name}"?`)) return;
  try {
    dashboard = await checkStop(stopId);
    const active = getTrackedRouteId();
    if (active && !dashboard.rotas.some(r => r.ID === active)) await stopBackgroundTracking();
    toast('Parada concluída.'); renderDashboard();
  } catch (e) { toast(e instanceof Error ? e.message : 'Erro no check-in.', true); }
}

async function boot() {
  if (!getDriverToken()) return renderSettings();
  try { dashboard = await fetchDashboard(); renderDashboard(); }
  catch { renderSettings(); }
}

void boot();

setInterval(() => {
  if (getDriverToken()) void refresh(false);
}, 8000);
