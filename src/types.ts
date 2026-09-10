export interface Address {
  ID: string;
  NOME: string;
  ENDERECO: string;
  LAT?: number | string;
  LNG?: number | string;
}

export interface Stop {
  ID: string;
  ROTA_ID: string;
  ENDERECO_ID: string;
  TIPO: 'PARADA' | 'DESTINO';
  ORDEM: number | string;
  STATUS: string;
  ETA_PREVISTA?: string;
  CHEGADA_REAL?: string;
  ENDERECO_NOME: string;
  ENDERECO: string;
  MAPS_URL?: string;
}

export interface Route {
  ID: string;
  NOME: string;
  STATUS: string;
  TEMPO_RESTANTE_MIN?: number | string;
  DISTANCIA_KM?: number | string;
  ETA_FIM?: string;
  ORIGEM: Address;
  DESTINO: Address;
  PARADAS: Stop[];
}

export interface DriverDashboard {
  valid: boolean;
  motorista?: { ID: string; NOME: string };
  rotas: Route[];
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: string;
}
