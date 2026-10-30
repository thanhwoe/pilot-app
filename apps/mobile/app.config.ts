import type { ExpoConfig } from "expo/config";

// The E2E script builds with GOP_E2E_BUILD=1 so a Release build can reach the local test API over
// plain HTTP (10.0.2.2 on the Android emulator). Store and production builds keep the default.
const e2eBuild = process.env.GOP_E2E_BUILD === "1";

const config: ExpoConfig = {
  name: "Góp",
  slug: "gop",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "gop",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.thanhwoe.gop",
    icon: "./assets/expo.icon",
  },
  android: {
    package: "com.thanhwoe.gop",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "expo-secure-store",
    ["expo-build-properties", { android: { usesCleartextTraffic: e2eBuild } }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
