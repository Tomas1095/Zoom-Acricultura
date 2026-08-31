-- Migración 07: hotfix de la 05 — mismo síntoma que la 06 ("stack depth
-- limit exceeded" / infinite recursion), esta vez en `tiene_acceso_a_lote`.
--
-- La 05 le agregó a `tiene_acceso_a_lote` el chequeo de comunidad:
--   select exists (select 1 from lotes where id = p_lote_id and comunidad_id = current_comunidad_id())
-- Esta función se usa como política de lectura de la propia tabla `lotes`
-- ("lotes: lectura según acceso" → using (tiene_acceso_a_lote(id))) — es
-- decir, para decidir si se puede leer una fila de `lotes`, Postgres evalúa
-- esta función, que a su vez hace `select ... from lotes`, lo que dispara
-- la MISMA política de nuevo — recursión infinita hasta agotar el stack.
-- (`usuarios`/`puntos`/etc. no la disparan porque consultan una tabla
-- DISTINTA a la que están protegiendo; acá coinciden: la política de
-- `lotes` termina consultando `lotes`.)
--
-- Mismo arreglo que la 06: SECURITY DEFINER — la consulta interna a `lotes`
-- corre con los permisos del dueño de las tablas, exento de su propia RLS,
-- así no vuelve a disparar la política y el círculo se corta ahí. Ningún
-- otro código cambia.

create or replace function tiene_acceso_a_lote(p_lote_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (select 1 from lotes where id = p_lote_id and comunidad_id = current_comunidad_id())
    and (
      es_administrador()
      or exists (
        select 1 from accesos
        where lote_id = p_lote_id and usuario_id = current_usuario_id()
      )
    )
$$;
