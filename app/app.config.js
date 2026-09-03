// Reemplaza a app.json (JSON plano) — la única razón de que sea un .js y
// no JSON es poder leer, en el momento del build, el commit de git con el
// que se está compilando (EAS ya pone sola la variable de entorno
// EAS_BUILD_GIT_COMMIT_HASH, no hace falta configurar nada de nuestro
// lado) y guardarlo en `extra.gitCommit` — de ahí lo lee
// `lib/version.ts` para mostrarlo en la app (pantalla de ingreso). Sirve
// para que cualquiera pueda confirmar en un toque qué versión tiene
// instalada un build, en vez de tener que adivinarlo por fecha/memoria de
// la conversación (mezclar builds viejos con arreglos nuevos ya generó
// más de una confusión real).
module.exports = {
  expo: {
    name: "Zoom Monitoreos",
    slug: "zoom-agricultura",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "zoomagricultura",
    userInterfaceStyle: "automatic",
    ios: {
      icon: "./assets/images/icon-ios.png",
      bundleIdentifier: "com.zoomagricultura.app",
      buildNumber: "1",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.zoomagricultura.app",
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: "#FFFFFF",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      permissions: ["android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_FINE_LOCATION"],
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
          backgroundColor: "#FFFFFF",
          image: "./assets/images/splash-icon.png",
          imageWidth: 180,
        },
      ],
      [
        "expo-notifications",
        {
          color: "#1B8A4A",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Zoom Agricultura usa tu ubicación para mostrarte dónde estás parado dentro del lote mientras monitoreás.",
        },
      ],
      [
        "expo-image-picker",
        {
          cameraPermission: "Zoom Agricultura usa la cámara para sacar fotos de cada punto de monitoreo.",
          photosPermission: "Zoom Agricultura accede a tus fotos para adjuntar alguna ya existente a un punto de monitoreo.",
          microphonePermission: false,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "ff80311d-9e0e-4cd8-907c-23084a12a3ed",
      },
      // undefined en un build local (`npx expo start`) — ahí no hay
      // ningún commit "del build" en sí, es el código corriendo en vivo.
      gitCommit: process.env.EAS_BUILD_GIT_COMMIT_HASH ?? null,
    },
    owner: "zoom-agricultura",
  },
};
