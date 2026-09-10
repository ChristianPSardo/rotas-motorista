import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { locationUrl } from './api';

const ACTIVE_ROUTE_KEY = 'rotas.activeTrackingRoute';

export function getTrackedRouteId(): string {
  return localStorage.getItem(ACTIVE_ROUTE_KEY) || '';
}

export async function startBackgroundTracking(routeId: string): Promise<void> {
  try { await BackgroundGeolocation.stop(); } catch {}

  await BackgroundGeolocation.start(
    {
      backgroundTitle: 'Rota em andamento',
      backgroundMessage: 'Sua localização está sendo compartilhada durante a rota.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 10,
      minIntervalMs: 10000,
      url: locationUrl(routeId)
    },
    (_location, error) => {
      if (error?.code === 'NOT_AUTHORIZED') {
        console.warn('Localização não autorizada.');
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
