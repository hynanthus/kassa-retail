import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'kz.kassa.retail',
  appName: 'Розница для Казахстана',
  webDir: 'dist',
  android: {
    backgroundColor: '#f9fafb',
    insetsHandling: 'css',
  },
}

export default config
