import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "me.galihh.audin",
  appName: "Audin",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: true,
  },
}

export default config
