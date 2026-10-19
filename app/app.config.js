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
    // Subida a 1.0.10 — sobre la 1.0.9 ya en producción, casi todo
    // apuntado a estabilizar el GPS en Android a campo:
    // - El bug real: mostrar el cartel del sistema pidiendo el permiso de
    //   ubicación podía, en Android, disparar un pase por
    //   "inactive"/"background" y vuelta a "active" — lo que hacía que el
    //   GPS se pidiera dos veces casi en simultáneo (un listener agregado
    //   para un bug distinto de iOS) y quedara colgado para siempre en
    //   "Buscando GPS…", sin ningún error, en CUALQUIER Android (no uno
    //   puntual — confirmado en el campo con dos celulares distintos).
    // - Si la ubicación del teléfono está apagada del todo (el
    //   interruptor del panel rápido, no el permiso de la app), ahora se
    //   detecta y se muestra "Activá la ubicación del celular", con
    //   reintento solo apenas se prenda.
    // - Si el GPS igual tarda sospechosamente (más de 12s con la
    //   ubicación ya confirmada prendida), un aviso en pantalla con el
    //   estado real de los proveedores de ubicación — para diagnosticar
    //   más rápido la próxima vez, no se supone que haga falta en uso
    //   normal.
    // - Pellizcar para hacer zoom/mover el mapa en Vista general (donde
    //   se marca "Mi recorrido") andaba trabado en Android — el mapa
    //   vivía en un ScrollView común, que en Android le compite el toque
    //   a los gestos de pellizco/pan; cambiado al ScrollView de la propia
    //   librería de gestos.
    // - "Cómo llegar" (antes solo para jefe/encargado) ahora también lo
    //   tiene el Monitoreador, en la misma pantalla del lote.
    // - La solapa "Resultados" ahora scrollea en Android si el contenido
    //   no entra (en iOS entraba bien, sin cambios ahí).
    // - El filtro "Todos/Los míos" al dar acceso a un lote (agregado
    //   después de que se compilara la 1.0.9 real, nunca había llegado a
    //   un build) ya viene incluido.
    //
    // Subida a 1.0.11 — sobre la 1.0.10 ya en producción:
    // - Arreglado: en Android, la solapa Resultados no mostraba los mapas
    //   (regresión de la 1.0.10 — el ScrollView nuevo de esa solapa no
    //   tenía alto definido, así que el mapa nunca terminaba de medirse).
    // - Arreglado: en Android, subir un KMZ elegido desde Google Drive (u
    //   otro proveedor en la nube) fallaba — esos archivos no soportan
    //   abrirse como los locales, ahora hay una vía alternativa para
    //   leerlos igual.
    // - Nuevo: ícono de información al lado de cada establecimiento, con
    //   el historial de informes PDF guardados ahí (agrupados por
    //   campaña) — se llenan con el botón nuevo "Exportar PDF y guardar
    //   en historial" en Salidas, al lado del "Exportar PDF" de siempre.
    // - Nuevo: ícono de información al lado de cada cliente, para subir y
    //   borrar archivos sueltos (el Excel de resumen de aplicación de
    //   cebo que se entrega a cada cliente). Ambos íconos nuevos son
    //   solo para Socio Gerente/Fundador.
    //
    // Nota: el reporte de "la app se cierra sola" sigue sin reproducirse
    // ni diagnosticarse (no llegaron detalles de en qué pantalla/acción
    // pasa) — no entra en este changelog, queda pendiente para cuando
    // haya más información.
    version: "1.0.11",
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
      // "single" (una sola página, todo corre en el navegador), no
      // "static" (pre-renderiza cada ruta en Node al momento del build,
      // pensado para sitios públicos que necesitan SEO) — esta es una
      // herramienta interna con login, sin nada que indexar, y el login
      // de Supabase (que toca `window`/localStorage apenas se inicializa)
      // directamente no puede correr en el entorno de Node del
      // pre-renderizado ("ReferenceError: window is not defined" al
      // exportar). En modo SPA todo el código corre siempre en el
      // navegador de verdad, así que este problema no existe.
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-build-properties",
        {
          // Techo de memoria más alto para el proceso de la app en
          // Android — a pedido de un caso real: procesar un KMZ (que hay
          // que leer entero y descomprimir) tiraba
          // "OutOfMemoryError: Failed to allocate..." en un celular
          // Android de gama más chica, con un límite de heap bastante más
          // bajo que el de un iPhone. `largeHeap` es la bandera estándar
          // de Android para pedir un techo más generoso (varía según el
          // fabricante, pero suele ser 2-3 veces más) — junto con el
          // arreglo del lado del código (leer el archivo una sola vez, no
          // dos, ver parsear-kmz.ts), es la forma correcta de encarar
          // esto en vez de simplemente esperar que el archivo nunca sea
          // grande. Sin efecto en iOS (esa app no tiene este problema).
          android: { largeHeap: true },
        },
      ],
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
