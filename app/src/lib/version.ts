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
 * Apple muestre en ningún lado). El número de build sale de
 * `expoConfig.ios.buildNumber` — aunque EAS lo ignora como "fuente de
 * verdad" de versionado (usa uno propio, remoto, ver eas.json
 * appVersionSource), sigue quedando grabado en el manifest de cada
 * build ya compilado, así que acá refleja el valor real que se subió. */
export function versionDelBuild(): string | null {
  const version = Constants.expoConfig?.version;
  if (typeof version !== "string" || version.length === 0) return null;
  const build = Constants.expoConfig?.ios?.buildNumber;
  return typeof build === "string" && build.length > 0 ? `${version} (${build})` : version;
}
