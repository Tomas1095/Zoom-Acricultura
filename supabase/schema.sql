-- Zoom Monitoreos — esquema inicial de Supabase (Postgres + RLS)
--
-- Portado del modelo de datos del prototipo (reference/prototipo-app.jsx),
-- normalizado para un backend relacional real. Correr en el SQL Editor del
-- proyecto de Supabase, en orden, una sola vez (o vía `supabase db push` si
-- se usa el CLI con migraciones) — para un proyecto YA provisionado con una
-- versión anterior de este archivo, correr en cambio los archivos nuevos de
-- `supabase/migrations/` en orden, no este archivo entero de nuevo.
--
-- Este archivo ya incluye, consolidado, lo que en su momento se aplicó como
-- migraciones separadas (`supabase/migrations/000N_*.sql`) — están ahí
-- para documentar la historia y para aplicarlas a un proyecto que ya
-- estaba corriendo una versión vieja de este esquema.
--
-- Jerarquía de roles (ver reference/CONTEXTO.md), POR comunidad — ver más
-- abajo:
--   socio_fundador  -> todo + único que asciende/degrada socios_gerente
--   socio_gerente   -> todo + "Mi equipo" + invitar con código
--   encargado       -> todo el árbol de lotes, puede crear pero NO eliminar
--   monitoreador    -> solo sus lotes asignados (tabla `accesos`)
--
-- Comunidades (multi-tenant): cada empresa de monitoreo que usa la app es
-- una comunidad aislada de las demás — ni ve ni puede tocar los datos de
-- otra. Alta de una comunidad nueva NO es self-service: alguien la pide
-- (con un nombre) y queda "pendiente" hasta que el administrador de la
-- plataforma (columna `admin_plataforma` en `usuarios`, aparte del `rol`
-- de arriba, que es POR comunidad) la aprueba. Un empleado, en cambio, se
-- suma como siempre: con un código de invitación que le da alguien de dentro
-- de su comunidad — automáticamente entra a esa misma comunidad, no a otra.
--
-- Para un proyecto realmente desde cero (sin ningún usuario todavía): la
-- primera persona que llama a `solicitar_comunidad` no tiene a nadie que
-- apruebe su solicitud (nadie es `admin_plataforma` todavía) — hay que
-- aprobarla a mano una única vez, directo en el SQL Editor:
--   update comunidades set estado = 'activa' where nombre = '...';
--   update usuarios set admin_plataforma = true where mail = '...';

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────────────────────────────────

-- Primero que las demás: usuarios/clientes/lotes/invitaciones cuelgan de acá.
create table comunidades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'rechazada')),
  creada_por_id uuid references usuarios (id), -- FK circular con usuarios, ver ALTER más abajo
  aprobada_por_id uuid references usuarios (id),
  created_at timestamptz not null default now()
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  comunidad_id uuid not null references comunidades (id),
  nombre text not null,
  mail text not null unique,
  color text not null default '#1F9350',
  rol text not null default 'monitoreador'
    check (rol in ('socio_fundador', 'socio_gerente', 'encargado', 'monitoreador')),
  activo boolean not null default true,
  -- Aparte de `rol` (que es POR comunidad): marca a quien administra la
  -- plataforma entera, cruzando comunidades — es quien aprueba o rechaza
  -- las solicitudes de comunidades nuevas (ver revisar_comunidad).
  admin_plataforma boolean not null default false,
  created_at timestamptz not null default now()
);

-- comunidades.creada_por_id no se pudo declarar arriba (usuarios todavía no
-- existía) — Postgres permite la referencia circular agregando la FK acá.
alter table comunidades add constraint comunidades_creada_por_id_fkey
  foreign key (creada_por_id) references usuarios (id);
alter table comunidades add constraint comunidades_aprobada_por_id_fkey
  foreign key (aprobada_por_id) references usuarios (id);

create table invitaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  comunidad_id uuid not null references comunidades (id), -- la completa un trigger, ver más abajo
  usado boolean not null default false,
  usado_por_id uuid references usuarios (id),
  creado_por_id uuid not null references usuarios (id),
  created_at timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  comunidad_id uuid not null references comunidades (id), -- la completa un trigger, ver más abajo
  nombre text not null,
  created_at timestamptz not null default now()
);

create table establecimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  comunidad_id uuid not null references comunidades (id), -- la completa un trigger, ver más abajo
  nombre text not null
);

create table lotes (
  id uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos (id) on delete cascade,
  comunidad_id uuid not null references comunidades (id), -- la completa un trigger, ver más abajo
  nombre text not null,
  cultivo text not null default 'Sin especificar',
  -- null hasta que se procesa el KMZ y se genera la grilla real (ver
  -- generarGrillaDesdeKmz en el prototipo: el lote existe antes de eso).
  hectareas numeric,
  ha_por_punto numeric not null default 1.5,
  campana_actual text not null default '25/26',
  perimetro jsonb not null default '[]'::jsonb, -- [[{x,y}, ...], ...] una lista de vértices por pieza de terreno (casi siempre una sola pieza), metros relativos al centro
  tiene_grilla boolean not null default false,
  created_at timestamptz not null default now()
);

create table puntos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes (id) on delete cascade,
  linea int not null,
  punto_num int not null,
  lat double precision not null,
  lon double precision not null,
  x numeric not null,
  y numeric not null,
  unique (lote_id, linea, punto_num)
);

-- Quién puede ver/cargar cada lote (lo administra socio_gerente/fundador/encargado).
create table accesos (
  lote_id uuid not null references lotes (id) on delete cascade,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  primary key (lote_id, usuario_id)
);

-- Los datos de monitoreo de un punto, por campaña. A diferencia del prototipo
-- (que guardaba un snapshot jsonb completo por campaña archivada), acá cada
-- carga ya lleva su `campana`: ver el historial es filtrar por esa columna,
-- no duplicar datos.
create table cargas (
  id uuid primary key default gen_random_uuid(),
  punto_id uuid not null references puntos (id) on delete cascade,
  campana text not null,
  bicho int not null default 0,
  babosa int not null default 0,
  huevo_babosas boolean not null default false,
  gusano_arroz boolean not null default false,
  isoca_cortadora boolean not null default false,
  gusano_blanco boolean not null default false,
  humedad text check (humedad in ('seco', 'humedo', 'muy_humedo')),
  observaciones text not null default '',
  fotos text[] not null default '{}', -- paths dentro del bucket 'fotos-monitoreo'
  cargado boolean not null default false,
  confirmado boolean not null default false,
  cargado_por_id uuid references usuarios (id),
  conflicto_con_id uuid references cargas (id),
  updated_at timestamptz not null default now(),
  unique (punto_id, campana)
);

-- Cuando el cambio que está por subirse pisaría una carga ya CONFIRMADA por
-- otra persona (dos personas cargaron el mismo punto sin señal), queda acá
-- en vez de pisarla — un Socio Gerente/Fundador decide después cuál de las
-- dos versiones se queda (ver resolver_conflicto_carga).
create table cargas_en_conflicto (
  id uuid primary key default gen_random_uuid(),
  carga_activa_id uuid not null references cargas (id) on delete cascade,
  punto_id uuid not null references puntos (id) on delete cascade,
  campana text not null,
  bicho int not null default 0,
  babosa int not null default 0,
  huevo_babosas boolean not null default false,
  gusano_arroz boolean not null default false,
  isoca_cortadora boolean not null default false,
  gusano_blanco boolean not null default false,
  observaciones text not null default '',
  cargado_por_id uuid references usuarios (id),
  creado_en timestamptz not null default now()
);

create index on comunidades (estado);
create index on usuarios (comunidad_id);
create index on clientes (comunidad_id);
create index on establecimientos (cliente_id);
create index on establecimientos (comunidad_id);
create index on lotes (establecimiento_id);
create index on lotes (comunidad_id);
create index on puntos (lote_id);
create index on accesos (usuario_id);
create index on cargas (punto_id, campana);
create index on cargas_en_conflicto (carga_activa_id);
create index on cargas_en_conflicto (punto_id, campana);

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers para las políticas (evitan repetir subqueries en cada policy)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function current_usuario_id()
returns uuid
language sql stable
as $$
  select id from usuarios where auth_user_id = auth.uid()
$$;

create or replace function current_rol()
returns text
language sql stable
as $$
  select rol from usuarios where auth_user_id = auth.uid()
$$;

-- SECURITY DEFINER acá (a diferencia de current_rol()/current_usuario_id()
-- de arriba) a propósito: estas dos se usan DENTRO de las políticas de la
-- propia tabla `usuarios` (ver más abajo) — sin esto, resolver "¿puedo leer
-- mi fila?" necesitaría evaluar esta función, que lee `usuarios`, lo que
-- dispara la MISMA política de nuevo — recursión infinita ("infinite
-- recursion detected in policy for relation usuarios"). SECURITY DEFINER
-- las corre con los permisos de quien las creó (dueño de las tablas), que
-- por default está exento de la RLS de sus propias tablas — la consulta
-- interna a `usuarios` no vuelve a disparar la política, y el círculo se
-- corta ahí.
create or replace function current_comunidad_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select comunidad_id from usuarios where auth_user_id = auth.uid()
$$;

create or replace function es_admin_plataforma()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce((select admin_plataforma from usuarios where auth_user_id = auth.uid()), false)
$$;

-- Mientras una comunidad está "pendiente" (recién pedida) o quedó
-- "rechazada", nadie de ahí adentro puede hacer nada más que ver el estado
-- de su propia solicitud (ver comunidad-pendiente.tsx en la app) — se
-- aplica solo con que `es_administrador()`/`es_socio()` lo exijan.
create or replace function comunidad_activa()
returns boolean
language sql stable
as $$
  select exists (select 1 from comunidades where id = current_comunidad_id() and estado = 'activa')
$$;

create or replace function es_administrador()
returns boolean
language sql stable
as $$
  select current_rol() in ('socio_fundador', 'socio_gerente', 'encargado') and comunidad_activa()
$$;

-- Resolver conflictos de carga y gestionar invitaciones es cosa de los
-- socios, no de Encargado (ver puedeCerrarCampana/puedeResolverConflictos
-- en roles.ts / CONTEXTO.md).
create or replace function es_socio()
returns boolean
language sql stable
as $$
  select current_rol() in ('socio_fundador', 'socio_gerente') and comunidad_activa()
$$;

-- SECURITY DEFINER acá por lo mismo que current_comunidad_id()/
-- es_admin_plataforma() más arriba: esta función se usa como política de
-- lectura de la propia tabla `lotes` ("lotes: lectura según acceso" más
-- abajo), y la consulta interna de acá también es contra `lotes` — sin
-- SECURITY DEFINER, evaluar "¿puedo leer esta fila?" dispara la MISMA
-- política de nuevo, recursión infinita ("stack depth limit exceeded").
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

-- ─────────────────────────────────────────────────────────────────────────
-- Auto-completar comunidad_id en cascada al crear — así el código de la
-- app (crearCliente/crearEstablecimiento/crearLote/generarInvitacion en
-- lib/db/*.ts) inserta exactamente igual que si no existieran las
-- comunidades: cada fila nueva hereda la comunidad de su padre (o, para
-- clientes, de quien está logueado) sola. Como corre ANTES del INSERT,
-- también blindea contra que alguien mande un comunidad_id propio a mano.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function set_comunidad_id_desde_sesion()
returns trigger
language plpgsql
as $$
begin
  new.comunidad_id := current_comunidad_id();
  return new;
end;
$$;
create trigger trg_clientes_comunidad
  before insert on clientes
  for each row execute function set_comunidad_id_desde_sesion();

create or replace function set_comunidad_id_desde_cliente()
returns trigger
language plpgsql
as $$
begin
  select comunidad_id into new.comunidad_id from clientes where id = new.cliente_id;
  return new;
end;
$$;
create trigger trg_establecimientos_comunidad
  before insert on establecimientos
  for each row execute function set_comunidad_id_desde_cliente();

create or replace function set_comunidad_id_desde_establecimiento()
returns trigger
language plpgsql
as $$
begin
  select comunidad_id into new.comunidad_id from establecimientos where id = new.establecimiento_id;
  return new;
end;
$$;
create trigger trg_lotes_comunidad
  before insert on lotes
  for each row execute function set_comunidad_id_desde_establecimiento();

create or replace function set_comunidad_id_desde_creador()
returns trigger
language plpgsql
as $$
begin
  select comunidad_id into new.comunidad_id from usuarios where id = new.creado_por_id;
  return new;
end;
$$;
create trigger trg_invitaciones_comunidad
  before insert on invitaciones
  for each row execute function set_comunidad_id_desde_creador();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table comunidades enable row level security;
alter table usuarios enable row level security;
alter table invitaciones enable row level security;
alter table clientes enable row level security;
alter table establecimientos enable row level security;
alter table lotes enable row level security;
alter table puntos enable row level security;
alter table accesos enable row level security;
alter table cargas enable row level security;
alter table cargas_en_conflicto enable row level security;

-- comunidades: sin política de insert/update/delete a propósito — nace y
-- cambia de estado únicamente vía `solicitar_comunidad`/`revisar_comunidad`
-- (SECURITY DEFINER, más abajo), nunca por INSERT/UPDATE directo.
create policy "comunidades: lectura de la propia, o todas para admin de plataforma"
  on comunidades for select
  using (id = current_comunidad_id() or es_admin_plataforma());

-- usuarios: todos los del equipo se ven entre sí (nombre/color hacen falta
-- para "Mi equipo" y para mostrar quién cargó cada punto / conflicto),
-- pero solo dentro de la misma comunidad — salvo admin de plataforma, que
-- ve todos (para poder revisar solicitudes de comunidades nuevas).
create policy "usuarios: lectura para cualquier miembro autenticado"
  on usuarios for select
  using (comunidad_id = current_comunidad_id() or es_admin_plataforma());

create policy "usuarios: cada uno edita su propio perfil (no su rol, comunidad ni admin_plataforma)"
  on usuarios for update
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and rol = (select rol from usuarios where auth_user_id = auth.uid())
    and comunidad_id = (select comunidad_id from usuarios where auth_user_id = auth.uid())
    and admin_plataforma = (select admin_plataforma from usuarios where auth_user_id = auth.uid())
  );

-- Los cambios de rol (ascender/degradar/transferir fundador/dar de baja) NO
-- se hacen con UPDATE directo — pasan por las funciones de abajo, que son
-- las únicas que pueden tocar la columna `rol` de otro usuario. Así la regla
-- "solo el Fundador asciende/degrada Socios Gerentes" queda garantizada en
-- un solo lugar en vez de repetida en cada policy.

-- clientes / establecimientos / lotes: administradores gestionan el árbol
-- completo; monitoreador solo ve lo que tiene en `accesos`. Todo esto ya
-- queda acotado a la propia comunidad porque `es_administrador()` y
-- `tiene_acceso_a_lote()` lo exigen — la inserción no necesita chequeo
-- aparte (el trigger de arriba fija comunidad_id siempre a la propia).
create policy "clientes: lectura para administradores o con acceso a algún lote propio"
  on clientes for select
  using (
    es_administrador()
    or exists (
      select 1 from establecimientos e
      join lotes l on l.establecimiento_id = e.id
      where e.cliente_id = clientes.id and tiene_acceso_a_lote(l.id)
    )
  );
create policy "clientes: escritura para administradores"
  on clientes for insert with check (es_administrador());
create policy "clientes: actualización para administradores"
  on clientes for update using (comunidad_id = current_comunidad_id() and es_administrador());
-- Encargado puede crear pero no eliminar (ver CONTEXTO.md).
create policy "clientes: borrado solo socio_fundador/socio_gerente"
  on clientes for delete using (comunidad_id = current_comunidad_id() and current_rol() in ('socio_fundador', 'socio_gerente'));

create policy "establecimientos: lectura para administradores o con acceso a algún lote propio"
  on establecimientos for select
  using (
    es_administrador()
    or exists (select 1 from lotes l where l.establecimiento_id = establecimientos.id and tiene_acceso_a_lote(l.id))
  );
create policy "establecimientos: escritura para administradores"
  on establecimientos for insert with check (es_administrador());
create policy "establecimientos: actualización para administradores"
  on establecimientos for update using (comunidad_id = current_comunidad_id() and es_administrador());
create policy "establecimientos: borrado solo socio_fundador/socio_gerente"
  on establecimientos for delete using (comunidad_id = current_comunidad_id() and current_rol() in ('socio_fundador', 'socio_gerente'));

-- No usa tiene_acceso_a_lote(id) a propósito (a diferencia de puntos/
-- establecimientos/clientes/cargas_en_conflicto más abajo, que sí la usan):
-- esa función re-consulta `lotes` desde adentro, y esa sub-consulta no ve
-- una fila de `lotes` recién insertada en la MISMA sentencia — rompe
-- crearLote (INSERT ... RETURNING) con "new row violates row-level
-- security policy" aunque la fila exista un instante después. Acá
-- comparamos directo la columna `comunidad_id` de la propia fila, sin
-- volver a consultar la tabla, así no hay problema de visibilidad.
--
-- El chequeo de `accesos` (Monitoreador con ese lote asignado) tampoco es
-- una consulta cruda: la política de LECTURA de `accesos` (más abajo)
-- vuelve a consultar `lotes` para confirmar la comunidad — una consulta
-- cruda acá cerraría un círculo lotes → accesos → lotes ("infinite
-- recursion detected in policy for relation lotes"). Por eso está aislada
-- en una función SECURITY DEFINER aparte, mismo motivo que
-- current_comunidad_id()/tiene_acceso_a_lote() más arriba.
create or replace function usuario_tiene_acceso_en_accesos(p_lote_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (select 1 from accesos where lote_id = p_lote_id and usuario_id = current_usuario_id())
$$;

create policy "lotes: lectura según acceso"
  on lotes for select using (
    comunidad_id = current_comunidad_id()
    and (
      es_administrador()
      or usuario_tiene_acceso_en_accesos(lotes.id)
    )
  );
create policy "lotes: escritura para administradores"
  on lotes for insert with check (es_administrador());
create policy "lotes: actualización para administradores"
  on lotes for update using (comunidad_id = current_comunidad_id() and es_administrador());
create policy "lotes: borrado solo socio_fundador/socio_gerente"
  on lotes for delete using (comunidad_id = current_comunidad_id() and current_rol() in ('socio_fundador', 'socio_gerente'));

-- puntos: a diferencia de clientes/establecimientos/lotes, `lote_id` no lo
-- pone ningún trigger — lo elige quien inserta, así que sí hace falta el
-- chequeo explícito de comunidad acá.
create policy "puntos: lectura según acceso al lote"
  on puntos for select using (tiene_acceso_a_lote(lote_id));
create policy "puntos: escritura para administradores"
  on puntos for all
  using (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()))
  with check (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()));

create policy "accesos: lectura de lo propio o administrador"
  on accesos for select
  using (
    usuario_id = current_usuario_id()
    or (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()))
  );
create policy "accesos: gestión solo administradores"
  on accesos for all
  using (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()))
  with check (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()));

-- cargas: cualquiera con acceso al lote puede leer/cargar datos del punto,
-- pero solo en la campaña vigente del lote (las archivadas quedan de solo
-- lectura, igual que "modo campaña histórica" en el prototipo).
create policy "cargas: lectura según acceso al lote del punto"
  on cargas for select
  using (
    exists (
      select 1 from puntos p where p.id = punto_id and tiene_acceso_a_lote(p.lote_id)
    )
  );
create policy "cargas: escritura según acceso, solo en campaña vigente"
  on cargas for insert
  with check (
    exists (
      select 1 from puntos p
      join lotes l on l.id = p.lote_id
      where p.id = punto_id
        and tiene_acceso_a_lote(p.lote_id)
        and l.campana_actual = campana
    )
  );
create policy "cargas: actualización según acceso, solo en campaña vigente"
  on cargas for update
  using (
    exists (
      select 1 from puntos p
      join lotes l on l.id = p.lote_id
      where p.id = punto_id
        and tiene_acceso_a_lote(p.lote_id)
        and l.campana_actual = campana
    )
  );

-- cargas_en_conflicto: la lectura es para socios, PERO solo del conflicto
-- de un lote al que además tengan acceso (con administrador de por medio,
-- vía tiene_acceso_a_lote) — así un socio de una comunidad no ve conflictos
-- de otra.
create policy "cargas_en_conflicto: lectura para socios"
  on cargas_en_conflicto for select
  using (
    es_socio()
    and exists (select 1 from puntos p where p.id = punto_id and tiene_acceso_a_lote(p.lote_id))
  );
-- La inserción la hace el dispositivo de CUALQUIERA con acceso al lote —
-- es quien sincroniza su cola offline y se encuentra con que su cambio
-- pisaría algo ya confirmado por otra persona.
create policy "cargas_en_conflicto: insertar con acceso al lote del punto"
  on cargas_en_conflicto for insert
  with check (
    exists (select 1 from puntos p where p.id = punto_id and tiene_acceso_a_lote(p.lote_id))
  );

-- invitaciones: solo se ven/crean por quienes pueden invitar; canjearlas se
-- hace por la función `usar_invitacion` de abajo (SECURITY DEFINER), no por
-- INSERT/UPDATE directo, para evitar la carrera de "dos personas usan el
-- mismo código a la vez". `es_socio()` ya exige comunidad activa, así que
-- una comunidad todavía pendiente no puede generar códigos.
create policy "invitaciones: lectura para quien puede invitar"
  on invitaciones for select using (comunidad_id = current_comunidad_id() and es_socio());
create policy "invitaciones: creación para quien puede invitar"
  on invitaciones for insert with check (es_socio());

-- ─────────────────────────────────────────────────────────────────────────
-- Canje de invitación (atómico, evita condición de carrera de uso doble)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function usar_invitacion(p_codigo text, p_nombre text)
returns usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitacion invitaciones;
  v_usuario usuarios;
begin
  select * into v_invitacion
  from invitaciones
  where codigo = upper(trim(p_codigo)) and usado = false
  for update; -- bloquea la fila: si dos personas canjean a la vez, la segunda espera y falla el "usado=false"

  if v_invitacion is null then
    raise exception 'codigo_invalido';
  end if;

  if not exists (select 1 from comunidades where id = v_invitacion.comunidad_id and estado = 'activa') then
    raise exception 'comunidad_no_activa';
  end if;

  update usuarios set nombre = trim(p_nombre), activo = true
  where auth_user_id = auth.uid()
  returning * into v_usuario;

  if v_usuario is null then
    insert into usuarios (auth_user_id, nombre, mail, rol, comunidad_id)
    values (auth.uid(), trim(p_nombre), (select email from auth.users where id = auth.uid()), 'monitoreador', v_invitacion.comunidad_id)
    returning * into v_usuario;
  end if;

  update invitaciones
  set usado = true, usado_por_id = v_usuario.id
  where id = v_invitacion.id;

  return v_usuario;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Comunidades: pedir una nueva (queda "pendiente") y revisarla
-- (admin_plataforma aprueba/rechaza — ver reference/CONTEXTO.md).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function solicitar_comunidad(p_nombre_comunidad text, p_nombre_persona text)
returns usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comunidad_id uuid;
  v_usuario usuarios;
begin
  if exists (select 1 from usuarios where auth_user_id = auth.uid()) then
    raise exception 'ya_tenes_una_cuenta';
  end if;
  if trim(coalesce(p_nombre_comunidad, '')) = '' or trim(coalesce(p_nombre_persona, '')) = '' then
    raise exception 'faltan_datos';
  end if;

  insert into comunidades (nombre, estado)
  values (trim(p_nombre_comunidad), 'pendiente')
  returning id into v_comunidad_id;

  -- Socio Fundador de una — pero de una comunidad "pendiente", así que
  -- comunidad_activa() lo deja sin poder hacer nada hasta que se apruebe
  -- (ver es_administrador()/es_socio() arriba).
  insert into usuarios (auth_user_id, nombre, mail, rol, comunidad_id)
  values (auth.uid(), trim(p_nombre_persona), (select email from auth.users where id = auth.uid()), 'socio_fundador', v_comunidad_id)
  returning * into v_usuario;

  update comunidades set creada_por_id = v_usuario.id where id = v_comunidad_id;

  return v_usuario;
end;
$$;

create or replace function revisar_comunidad(p_comunidad_id uuid, p_aprobar boolean)
returns comunidades
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comunidad comunidades;
begin
  if not es_admin_plataforma() then
    raise exception 'sin_permiso';
  end if;

  update comunidades
  set estado = case when p_aprobar then 'activa' else 'rechazada' end,
      aprobada_por_id = current_usuario_id()
  where id = p_comunidad_id and estado = 'pendiente'
  returning * into v_comunidad;

  if v_comunidad is null then
    raise exception 'solicitud_no_encontrada_o_ya_resuelta';
  end if;

  return v_comunidad;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Gestión de equipo (ascender/degradar/transferir fundador/dar de baja)
--
-- Regla (ver reference/CONTEXTO.md): solo socio_fundador puede tocar el
-- nivel socio_gerente; socio_gerente puede categorizar entre encargado y
-- monitoreador nomás; encargado no gestiona equipo.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function cambiar_rol_usuario(p_usuario_id uuid, p_nuevo_rol text)
returns usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_rol text := current_rol();
  v_target usuarios;
begin
  if p_nuevo_rol not in ('socio_gerente', 'encargado', 'monitoreador') then
    raise exception 'rol_invalido';
  end if;

  select * into v_target from usuarios where id = p_usuario_id;
  if v_target is null then
    raise exception 'usuario_no_encontrado';
  end if;
  if v_target.rol = 'socio_fundador' then
    raise exception 'no_se_puede_cambiar_el_rol_del_fundador_por_esta_via';
  end if;

  if v_caller_rol = 'socio_fundador' then
    -- puede mover a cualquiera entre socio_gerente/encargado/monitoreador
    null;
  elsif v_caller_rol = 'socio_gerente' then
    if p_nuevo_rol = 'socio_gerente' or v_target.rol = 'socio_gerente' then
      raise exception 'solo_el_fundador_puede_tocar_socios_gerentes';
    end if;
  else
    raise exception 'sin_permiso';
  end if;

  update usuarios set rol = p_nuevo_rol where id = p_usuario_id returning * into v_target;
  return v_target;
end;
$$;

create or replace function transferir_fundador(p_nuevo_fundador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := current_usuario_id();
begin
  if current_rol() <> 'socio_fundador' then
    raise exception 'solo_el_fundador_puede_transferir';
  end if;
  update usuarios set rol = 'socio_fundador' where id = p_nuevo_fundador_id;
  update usuarios set rol = 'socio_gerente' where id = v_caller_id;
end;
$$;

-- Baja lógica (no se borra la fila: si esa persona vuelve más adelante,
-- `usar_invitacion` la reactiva en vez de duplicarla — igual que el
-- prototipo, ver `activo === false` en unirseConCodigo).
create or replace function eliminar_miembro_equipo(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_rol() not in ('socio_fundador', 'socio_gerente') then
    raise exception 'sin_permiso';
  end if;
  if (select rol from usuarios where id = p_usuario_id) = 'socio_fundador' then
    raise exception 'no_se_puede_eliminar_al_fundador';
  end if;
  update usuarios set activo = false where id = p_usuario_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Resolver conflictos de carga: reemplaza (o descarta) en una sola
-- operación atómica — ver el comentario de la tabla `cargas_en_conflicto`
-- más arriba.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function resolver_conflicto_carga(p_conflicto_id uuid, p_quedarse_con_nueva boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflicto cargas_en_conflicto;
begin
  if not es_socio() then
    raise exception 'sin_permiso';
  end if;

  select * into v_conflicto from cargas_en_conflicto where id = p_conflicto_id;
  if v_conflicto is null then
    raise exception 'conflicto_no_encontrado';
  end if;
  if not exists (select 1 from puntos p where p.id = v_conflicto.punto_id and tiene_acceso_a_lote(p.lote_id)) then
    raise exception 'sin_permiso';
  end if;

  if p_quedarse_con_nueva then
    update cargas set
      bicho = v_conflicto.bicho,
      babosa = v_conflicto.babosa,
      huevo_babosas = v_conflicto.huevo_babosas,
      gusano_arroz = v_conflicto.gusano_arroz,
      isoca_cortadora = v_conflicto.isoca_cortadora,
      gusano_blanco = v_conflicto.gusano_blanco,
      observaciones = v_conflicto.observaciones,
      cargado_por_id = v_conflicto.cargado_por_id,
      updated_at = now()
    where id = v_conflicto.carga_activa_id;
  end if;

  delete from cargas_en_conflicto where id = p_conflicto_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Storage: bucket privado para fotos de monitoreo
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('fotos-monitoreo', 'fotos-monitoreo', false)
on conflict (id) do nothing;

create policy "fotos: lectura para autenticados"
  on storage.objects for select
  using (bucket_id = 'fotos-monitoreo' and auth.role() = 'authenticated');
create policy "fotos: subida para autenticados"
  on storage.objects for insert
  with check (bucket_id = 'fotos-monitoreo' and auth.role() = 'authenticated');
