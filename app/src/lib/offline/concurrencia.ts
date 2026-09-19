// Lanzar N pedidos al server al mismo tiempo, sin límite, es lo que venía
// saturando Postgres con timeouts reales (código 57014 "canceling
// statement due to statement timeout") cada vez que alguien con acceso a
// muchos lotes entraba al árbol/mis lotes — confirmado con los logs de
// Supabase del usuario. Este helper procesa un array de a tandas chicas
// en vez de lanzar todo junto, para cualquier lugar que necesite pegarle
// al server una vez por cada lote (precarga offline, resumen de avance).
//
// La tanda de 3 (sin pausa entre una y otra) alcanzaba para comunidades
// chicas, pero con esta ya pasando los 50 lotes con grilla volvió el mismo
// 57014 — confirmado de nuevo con logs reales: entrar al árbol dispara
// PRECARGA (2 pedidos por lote) Y el resumen de avance (1 pedido por lote)
// casi juntos, sin esperarse entre sí, así que en la práctica había hasta
// 6 pedidos pesados en simultáneo sin ningún respiro entre tanda y tanda —
// suficiente para mantener a Postgres saturado el rato entero que tarda en
// procesar 50+ lotes, y ahí es cuando cualquier pedido en primer plano
// (entrar a un lote a mano) quedaba compitiendo y se caía también. Bajar
// más la tanda sola no alcanzaba (menos pedidos en simultáneo, pero
// seguían sin parar); la pausa entre tandas es lo que de verdad le da
// lugar a la base para ponerse al día entre una tanda y la siguiente.
const TANDA_POR_DEFECTO = 2;
const PAUSA_ENTRE_TANDAS_MS = 400;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Corre `fn` para cada item de `items`, de a `tamanoTanda` a la vez (en
 * vez de lanzar todos los pedidos juntos), con una pausa corta entre tanda
 * y tanda — espera a que termine una tanda antes de arrancar la siguiente.
 * Si `fn` de un item puntual rechaza, no frena a los demás (se atrapa acá
 * mismo). No relanza ni devuelve nada: pensado para llamadas "fire and
 * forget" en segundo plano — tarda más en terminar que antes, pero es
 * trabajo invisible, así que ese costo no lo nota nadie; lo que sí se nota
 * es que ya no le gana la carrera a un pedido en primer plano. */
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
    if (i + tamanoTanda < items.length) await esperar(PAUSA_ENTRE_TANDAS_MS);
  }
}
