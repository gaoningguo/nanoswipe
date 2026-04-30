import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.nanoswipe.omni',
  appName: 'NanoSwipe Omni',
  webDir: '../web/dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
}

export default config
