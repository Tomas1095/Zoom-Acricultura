// Identificador de versión visible en la app — ver el comentario en
// app.config.js. Sirve para que cualquiera (el usuario o quien lo ayude a
// distancia) pueda confirmar en un toque qué versión/código tiene
// instalado un build, en vez de tener que adivinarlo por fecha/memoria de
// una conversación — mezclar builds viejos con arreglos nuevos ya generó
// confusión real más de una vez.

import * as Application from "expo-application";
import Constants from "expo-constants";

/** El commit corto (7 caracteres, como los que usa GitHub) con el que se
 * compiló este build — `null` en un build local (`npx expo start`, sin
 * pasar por EAS), donde no hay un commit "del build" en sí. */
export function commitDelBuild(): string | null {
  const commit = Constants.expoConfig?.extra?.gitCommit;
  return typeof commit === "string" && commit.length > 0 ? commit.slice(0, 7) : null;
}

/** La versión "real" tal como la ve Apple/Google (ej. "1.0.7") + el
 * versionCode/buildNumber real (ej. "8") — a pedido del usuario: para
 * confirmar que todo el equipo ya tiene la última actualización,
 * comparando contra lo que figura en Play Console/App Store Connect, hace
 * falta ESTE número (el mismo que se ve ahí), no el commit de git (que es
 * interno, no algo que las tiendas muestren en ningún lado).
 *
 * `expo-application` (no `Constants.expoConfig`) a propósito: con
 * `appVersionSource: "remote"` en eas.json, EAS le asigna a cada build un
 * versionCode/buildNumber que va SUBIENDO SOLO (ver "Incremented
 * versionCode from 7 to 8" en la salida de `eas build`) — pero ese
 * incremento pasa del lado de EAS/las tiendas, nunca se escribe de vuelta
 * en `app.config.js` ni en el manifest que expo-constants expone en
 * runtime (que se queda pegado en lo que decía app.config.js AL MOMENTO
 * del build — hoy un "1" fijo, para siempre). Confirmado con un build
 * real (ver conversación del 15/9): con esa fuente, `versionDelBuild()`
 * mostraba "1.0.7 (1)" en vez de "1.0.7 (8)" — el número que de verdad
 * hace falta para comparar contra la tienda. `expo-application` en cambio
 * lee el valor REAL grabado en el binario nativo (`versionCode` de
 * Android / `CFBundleVersion` de iOS), que EAS sí actualiza de verdad en
 * cada build — por eso es la fuente correcta acá. */
export function versionDelBuild(): string | null {
  const version = Application.nativeApplicationVersion;
  if (!version) return null;
  const build = Application.nativeBuildVersion;
  return build ? `${version} (${build})` : version;
}
