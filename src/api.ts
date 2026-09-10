import { CapacitorHttp } from '@capacitor/core';
import type { ApiEnvelope, DriverDashboard } from './types';

const API_URL = 'https://myrmbhrvhqrqtnkkazzr.supabase.co/functions/v1/driver-api';
const TOKEN_KEY = 'rotas.driverToken';

export function getApiUrl(): string { return API_URL; }
export function getDriverToken(): string { return localStorage.getItem(TOKEN_KEY)?.trim() || ''; }
export function saveConnection(token: string): void { localStorage.setItem(TOKEN_KEY, token.trim()); }
export function clearConnection(): void { localStorage.removeItem(TOKEN_KEY); }

async function post<T>(action: string, data: Record<string, unknown>): Promise<T> {
  const response = await CapacitorHttp.post({
    url: API_URL,
    headers: { 'Content-Type': 'application/json' },
    data: { action, ...data },
    connectTimeout: 20000,
    readTimeout: 30000
  });

  let payload = response.data as ApiEnvelope<T> | string;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload) as ApiEnvelope<T>; }
    catch { throw new Error(`Resposta inválida do servidor (HTTP ${response.status}).`); }
  }
  if (response.status < 200 || response.status >= 300 || !payload?.ok) {
    throw new Error(payload?.error || payload?.message || `Erro HTTP ${response.status}.`);
  }
  return payload.data as T;
}

export async function healthCheck(): Promise<string> {
  const data = await post<{ message: string }>('health', {});
  return data.message;
}
export async function fetchDashboard(): Promise<DriverDashboard> {
  const token = getDriverToken();
  if (!token) throw new Error('Informe o token do motorista.');
  return post<DriverDashboard>('driverDashboard', { token });
}
export async function startRoute(routeId: string): Promise<DriverDashboard> {
  return post<DriverDashboard>('startRoute', { token: getDriverToken(), routeId });
}
export async function checkStop(stopId: string): Promise<DriverDashboard> {
  return post<DriverDashboard>('checkStop', { token: getDriverToken(), stopId });
}
export async function sendLocation(routeId: string, location: {
  latitude: number; longitude: number; accuracy?: number | null; speed?: number | null; bearing?: number | null; time?: number | null;
}): Promise<void> {
  await post('location', {
    token: getDriverToken(),
    routeId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    speed: location.speed ?? null,
    bearing: location.bearing ?? null,
    recordedAt: location.time ? new Date(location.time).toISOString() : new Date().toISOString()
  });
}
export function locationUrl(routeId: string): string {
  return `${API_URL}?action=location&token=${encodeURIComponent(getDriverToken())}&routeId=${encodeURIComponent(routeId)}`;
}
