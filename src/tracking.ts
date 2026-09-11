import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { locationUrl } from './api';

const ACTIVE_ROUTE_KEY = 'rotas.activeTrackingRoute';

export function getTrackedRouteId(): string {
  return localStorage.getItem(ACTIVE_ROUTE_KEY) || '';
}

export async function startBackgroundTracking(routeId: string): Promise<void> {
  try { await BackgroundGeolocation.stop(); } catch {}

  const permissions = await BackgroundGeolocation.requestPermissions({
    permissions: ['location', 'notification']
  });

  if (permissions.location !== 'granted') {
    throw new Error('Permita o acesso à localização para iniciar a rota.');
  }

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
    (_location, error) => {
      if (error) {
        console.warn('Erro de localização:', error.code, error.message);
      }
    }
  );

  localStorage.setItem(ACTIVE_ROUTE_KEY, routeId);
}

export async function stopBackgroundTracking(): Promise<void> {
  try { await BackgroundGeolocation.stop(); }
  finally { localStorage.removeItem(ACTIVE_ROUTE_KEY); }
}

export async function openLocationSettings(): Promise<void> {
  await BackgroundGeolocation.openSettings();
}
