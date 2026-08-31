-- Migración 09: hotfix de la 08 — "infinite recursion detected in policy
-- for relation lotes" (código 42P17), un caso nuevo de recursión: la 08
-- sacó la sub-consulta a `lotes` de la política de `lotes` (bien, resolvía
-- lo de RETURNING), pero dejó una consulta CRUDA a `accesos` para el caso
-- de Monitoreador. La política de LECTURA de `accesos` (más abajo, sin
-- tocar) a su vez consulta `lotes` para saber si ese acceso pertenece a la
-- comunidad actual — así que evaluar "¿puedo leer este lote?" termina
-- evaluando "¿puedo leer este acceso?", que evalúa "¿puedo leer ese lote?"
-- de nuevo: lotes → accesos → lotes, un círculo entre dos tablas distintas
-- (a diferencia de la 07/08, que eran una tabla contra sí misma).
--
-- El arreglo, mismo patrón: aislar la consulta a `accesos` en una función
-- SECURITY DEFINER — así se resuelve con los permisos del dueño de las
-- tablas (exento de RLS en `accesos` también, no solo en `lotes`), y el
-- círculo se corta ahí. La columna `comunidad_id` de la propia fila
-- (agregada en la 08) sigue sin sub-consulta, sin cambios.

create or replace function usuario_tiene_acceso_en_accesos(p_lote_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (select 1 from accesos where lote_id = p_lote_id and usuario_id = current_usuario_id())
$$;

drop policy if exists "lotes: lectura según acceso" on lotes;
create policy "lotes: lectura según acceso"
  on lotes for select using (
    comunidad_id = current_comunidad_id()
    and (
      es_administrador()
      or usuario_tiene_acceso_en_accesos(lotes.id)
    )
  );
