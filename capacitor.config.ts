import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.rotas.motorista',
  appName: 'Rotas Motorista',
  webDir: 'dist',
  android: {
    useLegacyBridge: true
  }
};

export default config;
