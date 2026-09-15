// Identificador de versión visible en la app — ver el comentario en
// app.config.js. Sirve para que cualquiera (el usuario o quien lo ayude a
// distancia) pueda confirmar en un toque qué versión/código tiene
// instalado un build, en vez de tener que adivinarlo por fecha/memoria de
// una conversación — mezclar builds viejos con arreglos nuevos ya generó
// confusión real más de una vez.

import Constants from "expo-constants";

/** El commit corto (7 caracteres, como los que usa GitHub) con el que se
 * compiló este build — `null` en un build local (`npx expo start`, sin
 * pasar por EAS), donde no hay un commit "del build" en sí. */
export function commitDelBuild(): string | null {
  const commit = Constants.expoConfig?.extra?.gitCommit;
  return typeof commit === "string" && commit.length > 0 ? commit.slice(0, 7) : null;
}

/** La versión "real" tal como la ve Apple/Google (`expo.version` de
 * app.config.js, ej. "1.0.1") + el número de build (`autoIncrement` de
 * EAS, ej. "4") — a pedido del usuario: para confirmar que todo el
 * equipo ya tiene la última actualización, comparando contra lo que
 * figura en App Store Connect/TestFlight, hace falta ESTE número (el
 * mismo que se ve ahí), no el commit de git (que es interno, no algo que
 * Apple muestre en ningún lado).
 *
 * PENDIENTE (encontrado con un build real, ver conversación del
 * 15/9): el supuesto de acá abajo resultó FALSO — `expoConfig.ios.
 * buildNumber` en el build 7 de producción seguía mostrando "1" (el
 * valor fijo de app.config.js), no "7". EAS incrementa el número
 * remoto para lo que le manda a Apple/Google, pero NO reescribe este
 * campo en el manifest que expo-constants expone en runtime — se
 * queda con lo que decía app.config.js en el momento del build. O sea
 * que este número, tal como está armado hoy, NO sirve para comparar
 * versiones entre builds (¡el motivo por el que existe esta función!)
 * — solo `commitDelBuild()` es confiable para eso mientras no se
 * arregle esto. Revisar si hay alguna forma de leer el build number
 * remoto real (constants.expoConfig?.extra, o algún otro campo que
 * EAS sí actualice) antes de seguir mostrando este número como si
 * fuera correcto. */
export function versionDelBuild(): string | null {
  const version = Constants.expoConfig?.version;
  if (typeof version !== "string" || version.length === 0) return null;
  const build = Constants.expoConfig?.ios?.buildNumber;
  return typeof build === "string" && build.length > 0 ? `${version} (${build})` : version;
}
