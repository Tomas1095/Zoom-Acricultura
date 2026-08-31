-- Migración 08: hotfix de la 07 — la 07 resolvió la recursión infinita en
-- "lotes: lectura según acceso" (usaba tiene_acceso_a_lote(id), que
-- re-consulta `lotes` desde adentro de la propia política de `lotes`) con
-- SECURITY DEFINER. Eso arregló las lecturas normales (SELECT), pero dejó
-- un problema distinto: `crearLote` hace INSERT ... RETURNING (necesita la
-- fila recién creada para actualizar la UI), y Postgres evalúa la política
-- de SELECT también sobre esa fila para decidir si te la devuelve — el
-- problema es que la sub-consulta interna de tiene_acceso_a_lote()
-- ("select 1 from lotes where id = ...") NO ve todavía la fila que se
-- acaba de insertar EN LA MISMA sentencia (aunque sea SECURITY DEFINER),
-- así que la política falla igual y Postgres tira "new row violates
-- row-level security policy for table lotes" — el insert queda revertido
-- del todo (RETURNING que falla aborta la sentencia completa), aunque un
-- SELECT normal después sí la encuentre sin problema.
--
-- El arreglo: para la política de LOTES sobre sí misma, en vez de volver a
-- consultar `lotes` por id (innecesario: ya estamos parados en la fila),
-- comparamos directo su propia columna `comunidad_id` — sin sub-consulta a
-- la tabla, no hay problema de visibilidad de la fila nueva. El resto de
-- usos de tiene_acceso_a_lote() (puntos, establecimientos, clientes,
-- cargas_en_conflicto — todos consultándola desde OTRA tabla) queda igual,
-- no le pasa esto porque ahí no se re-consulta la tabla que se está
-- evaluando.

drop policy if exists "lotes: lectura según acceso" on lotes;
create policy "lotes: lectura según acceso"
  on lotes for select using (
    comunidad_id = current_comunidad_id()
    and (
      es_administrador()
      or exists (select 1 from accesos where lote_id = lotes.id and usuario_id = current_usuario_id())
    )
  );
