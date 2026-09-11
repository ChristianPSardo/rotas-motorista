import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { locationUrl, sendLocation } from './api';

const ACTIVE_ROUTE_KEY = 'rotas.activeTrackingRoute';
const LAST_SENT_KEY = 'rotas.lastLocationSentAt';
const LAST_ERROR_KEY = 'rotas.lastLocationError';

export function getTrackedRouteId(): string {
  return localStorage.getItem(ACTIVE_ROUTE_KEY) || '';
}

export function getLastLocationSentAt(): string {
  return localStorage.getItem(LAST_SENT_KEY) || '';
}

export function getLastLocationError(): string {
  return localStorage.getItem(LAST_ERROR_KEY) || '';
}

function markSent() {
  localStorage.setItem(LAST_SENT_KEY, new Date().toISOString());
  localStorage.removeItem(LAST_ERROR_KEY);
  window.dispatchEvent(new CustomEvent('gps-status-changed'));
}

function markError(message: string) {
  localStorage.setItem(LAST_ERROR_KEY, message);
  window.dispatchEvent(new CustomEvent('gps-status-changed'));
}

export async function startBackgroundTracking(routeId: string): Promise<void> {
  try { await BackgroundGeolocation.stop(); } catch {}

  const permissions = await BackgroundGeolocation.requestPermissions({
    permissions: ['location', 'notification']
  });

  if (permissions.location !== 'granted') {
    throw new Error('Permita o acesso à localização para iniciar a rota.');
  }

  let lastFallbackSent = 0;

  await BackgroundGeolocation.start(
    {
      backgroundTitle: 'Rota em andamento',
      backgroundMessage: 'Sua localização está sendo compartilhada durante a rota.',
      requestPermissions: false,
      stale: true,
      distanceFilter: 5,
      minIntervalMs: 7000,
      url: locationUrl(routeId)
    },
    (location, error) => {
      if (error) {
        const message = error.message || 'Erro ao obter localização.';
        console.warn('Erro de localização:', error.code, message);
        markError(message);
        return;
      }

      if (!location) return;

      const now = Date.now();
      if (!lastFallbackSent || now - lastFallbackSent >= 30000) {
        lastFallbackSent = now;
        void sendLocation(routeId, location)
          .then(markSent)
          .catch(err => {
            const message = err instanceof Error ? err.message : String(err);
            console.warn('Falha ao enviar localização:', message);
            markError(message);
          });
      }
    }
  );

  localStorage.setItem(ACTIVE_ROUTE_KEY, routeId);
  window.dispatchEvent(new CustomEvent('gps-status-changed'));
}

export async function stopBackgroundTracking(): Promise<void> {
  try { await BackgroundGeolocation.stop(); }
  finally {
    localStorage.removeItem(ACTIVE_ROUTE_KEY);
    window.dispatchEvent(new CustomEvent('gps-status-changed'));
  }
}

export async function openLocationSettings(): Promise<void> {
  await BackgroundGeolocation.openSettings();
}
