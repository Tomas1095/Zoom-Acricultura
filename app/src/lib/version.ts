// Identificador de versión visible en la app — ver el comentario en
// app.config.js. Sirve para que cualquiera (el usuario o quien lo ayude a
// distancia) pueda confirmar en un toque qué código tiene instalado un
// build, en vez de tener que adivinarlo por fecha/memoria de una
// conversación — mezclar builds viejos con arreglos nuevos ya generó
// confusión real más de una vez.

import Constants from "expo-constants";

/** El commit corto (7 caracteres, como los que usa GitHub) con el que se
 * compiló este build — `null` en un build local (`npx expo start`, sin
 * pasar por EAS), donde no hay un commit "del build" en sí. */
export function commitDelBuild(): string | null {
  const commit = Constants.expoConfig?.extra?.gitCommit;
  return typeof commit === "string" && commit.length > 0 ? commit.slice(0, 7) : null;
}
