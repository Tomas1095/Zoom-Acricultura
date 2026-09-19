// Lanzar N pedidos al server al mismo tiempo, sin límite, es lo que venía
// saturando Postgres con timeouts reales (código 57014 "canceling
// statement due to statement timeout") cada vez que alguien con acceso a
// muchos lotes entraba al árbol/mis lotes — confirmado con los logs de
// Supabase del usuario. Este helper procesa un array de a tandas chicas
// en vez de lanzar todo junto, para cualquier lugar que necesite pegarle
// al server una vez por cada lote (precarga offline, resumen de avance).

const TANDA_POR_DEFECTO = 3;

/** Corre `fn` para cada item de `items`, de a `tamanoTanda` a la vez (en
 * vez de lanzar todos los pedidos juntos) — espera a que termine una tanda
 * antes de arrancar la siguiente. Si `fn` de un item puntual rechaza, no
 * frena a los demás (se atrapa acá mismo). No relanza ni devuelve nada:
 * pensado para llamadas "fire and forget" en segundo plano. */
export async function procesarEnTandas<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  tamanoTanda: number = TANDA_POR_DEFECTO
): Promise<void> {
  for (let i = 0; i < items.length; i += tamanoTanda) {
    const tanda = items.slice(i, i + tamanoTanda);
    await Promise.all(
      tanda.map((item) =>
        fn(item).catch(() => {
          // Un item puntual que falla no frena a los demás — quien llama
          // ya decide qué hacer con ese error puntual dentro de `fn` si le
          // importa (ver los .catch internos en cada call site).
        })
      )
    );
  }
}
