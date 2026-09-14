-- Arregla la lentitud/timeouts reportados con datos reales cargados: las
-- consultas a `cargas` (traer las cargas de un lote, ver
-- fetchCargasDeLote en lib/db/puntos.ts) empezaron a tirar
-- "canceling statement due to statement timeout" en los logs de
-- Supabase — confirmado NO es un tema de potencia del proyecto (probado
-- subiendo de compute Nano a Micro, sin ningún cambio), es un tema de
-- cómo está armada la política de seguridad (RLS) de `cargas`.
--
-- La causa: la política de lectura de `cargas` evalúa, por CADA fila que
-- se revisa, `tiene_acceso_a_lote(p.lote_id)` — y esa función, tal como
-- estaba (ver migración 07), llama a `current_comunidad_id()` DOS veces
-- (una directa, otra adentro de `es_administrador()` → `comunidad_activa()`),
-- a `current_rol()` una vez y a `current_usuario_id()` otra — cuatro
-- consultas por separado a la tabla `usuarios`, todas para lo MISMO (el
-- usuario logueado no cambia fila a fila, es siempre el mismo para toda
-- la consulta) — un desperdicio real que, con pocas filas en `cargas` no
-- se nota, pero escala mal a medida que la tabla crece (justo lo que pasó
-- hoy, con mucha carga de prueba junta).
--
-- El arreglo: la MISMA lógica (ver el `and`/`or` — no cambia en nada la
-- respuesta, sea true o false, para ningún caso), pero resolviendo los
-- datos del usuario logueado UNA sola vez (con un `with`) y reusándolos,
-- en vez de volver a consultar `usuarios` en cada sub-llamada. Ningún
-- otro código (ni las políticas que llaman a esta función, ni el resto de
-- la app) necesita cambiar — la firma y el comportamiento son idénticos.
create or replace function tiene_acceso_a_lote(p_lote_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  with yo as (
    select id, comunidad_id, rol from usuarios where auth_user_id = auth.uid()
  )
  select exists (select 1 from lotes where id = p_lote_id and comunidad_id = (select comunidad_id from yo))
    and (
      (
        (select rol from yo) in ('socio_fundador', 'socio_gerente', 'encargado')
        and exists (select 1 from comunidades where id = (select comunidad_id from yo) and estado = 'activa')
      )
      or exists (
        select 1 from accesos
        where lote_id = p_lote_id and usuario_id = (select id from yo)
      )
    )
$$;

-- Además, a `cargas` le faltaba un índice para filtrar directo por
-- `campana` (ya tenía uno por `punto_id, campana` — ver schema.sql — que
-- sirve para buscar la carga de UN punto puntual, pero no ayuda cuando el
-- filtro arranca por campaña, como en fetchCargasDeLote/
-- fetchResumenLote). Sin este índice, filtrar "todas las cargas de la
-- campaña vigente" obligaba a recorrer la tabla entera fila por fila
-- (además de evaluar la política de arriba en cada una) — el índice deja
-- que Postgres vaya directo a las filas que corresponden.
create index if not exists cargas_campana_idx on cargas (campana);

-- Con tanta carga/borrado de prueba en el día de hoy, las estadísticas
-- internas que usa Postgres para decidir CÓMO ejecutar cada consulta
-- (cuántas filas esperar de cada filtro, y en qué orden conviene cruzar
-- las tablas) pueden haber quedado desactualizadas — se refrescan solas
-- con el tiempo, pero pedirlo ahora a mano evita esperar a que eso pase
-- solo.
analyze cargas;
analyze puntos;
analyze accesos;
analyze usuarios;
