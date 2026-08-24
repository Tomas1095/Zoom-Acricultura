-- Zoom Monitoreos — esquema inicial de Supabase (Postgres + RLS)
--
-- Portado del modelo de datos del prototipo (reference/prototipo-app.jsx),
-- normalizado para un backend relacional real. Correr en el SQL Editor del
-- proyecto de Supabase, en orden, una sola vez (o vía `supabase db push` si
-- se usa el CLI con migraciones).
--
-- Jerarquía de roles (ver reference/CONTEXTO.md):
--   socio_fundador  -> todo + único que asciende/degrada socios_gerente
--   socio_gerente   -> todo + "Mi equipo" + invitar con código
--   encargado       -> todo el árbol de lotes, puede crear pero NO eliminar
--   monitoreador    -> solo sus lotes asignados (tabla `accesos`)

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────────────────────────────────

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  nombre text not null,
  mail text not null unique,
  color text not null default '#1F9350',
  rol text not null default 'monitoreador'
    check (rol in ('socio_fundador', 'socio_gerente', 'encargado', 'monitoreador')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table invitaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  usado boolean not null default false,
  usado_por_id uuid references usuarios (id),
  creado_por_id uuid not null references usuarios (id),
  created_at timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

create table establecimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  nombre text not null
);

create table lotes (
  id uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos (id) on delete cascade,
  nombre text not null,
  cultivo text not null default 'Sin especificar',
  -- null hasta que se procesa el KMZ y se genera la grilla real (ver
  -- generarGrillaDesdeKmz en el prototipo: el lote existe antes de eso).
  hectareas numeric,
  ha_por_punto numeric not null default 1.5,
  campana_actual text not null default '25/26',
  perimetro jsonb not null default '[]'::jsonb, -- [{x,y}, ...] metros relativos al centro
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

create index on establecimientos (cliente_id);
create index on lotes (establecimiento_id);
create index on puntos (lote_id);
create index on accesos (usuario_id);
create index on cargas (punto_id, campana);

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

create or replace function es_administrador()
returns boolean
language sql stable
as $$
  select current_rol() in ('socio_fundador', 'socio_gerente', 'encargado')
$$;

create or replace function tiene_acceso_a_lote(p_lote_id uuid)
returns boolean
language sql stable
as $$
  select es_administrador()
    or exists (
      select 1 from accesos
      where lote_id = p_lote_id and usuario_id = current_usuario_id()
    )
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table usuarios enable row level security;
alter table invitaciones enable row level security;
alter table clientes enable row level security;
alter table establecimientos enable row level security;
alter table lotes enable row level security;
alter table puntos enable row level security;
alter table accesos enable row level security;
alter table cargas enable row level security;

-- usuarios: todos los del equipo se ven entre sí (nombre/color hacen falta
-- para "Mi equipo" y para mostrar quién cargó cada punto / conflicto).
create policy "usuarios: lectura para cualquier miembro autenticado"
  on usuarios for select
  using (auth.role() = 'authenticated');

create policy "usuarios: cada uno edita su propio perfil (no su rol)"
  on usuarios for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid() and rol = (select rol from usuarios where auth_user_id = auth.uid()));

create policy "usuarios: socio_fundador asciende/degrada y admins gestionan bajas"
  on usuarios for update
  using (current_rol() in ('socio_fundador', 'socio_gerente'));

-- clientes / establecimientos / lotes: administradores gestionan el árbol
-- completo; monitoreador solo ve lo que tiene en `accesos`.
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
  on clientes for update using (es_administrador());
-- Encargado puede crear pero no eliminar (ver CONTEXTO.md).
create policy "clientes: borrado solo socio_fundador/socio_gerente"
  on clientes for delete using (current_rol() in ('socio_fundador', 'socio_gerente'));

create policy "establecimientos: lectura para administradores o con acceso a algún lote propio"
  on establecimientos for select
  using (
    es_administrador()
    or exists (select 1 from lotes l where l.establecimiento_id = establecimientos.id and tiene_acceso_a_lote(l.id))
  );
create policy "establecimientos: escritura para administradores"
  on establecimientos for insert with check (es_administrador());
create policy "establecimientos: actualización para administradores"
  on establecimientos for update using (es_administrador());
create policy "establecimientos: borrado solo socio_fundador/socio_gerente"
  on establecimientos for delete using (current_rol() in ('socio_fundador', 'socio_gerente'));

create policy "lotes: lectura según acceso"
  on lotes for select using (tiene_acceso_a_lote(id));
create policy "lotes: escritura para administradores"
  on lotes for insert with check (es_administrador());
create policy "lotes: actualización para administradores"
  on lotes for update using (es_administrador());
create policy "lotes: borrado solo socio_fundador/socio_gerente"
  on lotes for delete using (current_rol() in ('socio_fundador', 'socio_gerente'));

create policy "puntos: lectura según acceso al lote"
  on puntos for select using (tiene_acceso_a_lote(lote_id));
create policy "puntos: escritura para administradores"
  on puntos for all using (es_administrador()) with check (es_administrador());

create policy "accesos: lectura de lo propio o administrador"
  on accesos for select
  using (usuario_id = current_usuario_id() or es_administrador());
create policy "accesos: gestión solo administradores"
  on accesos for all using (es_administrador()) with check (es_administrador());

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

-- invitaciones: solo se ven/crean por quienes pueden invitar; canjearlas se
-- hace por la función `usar_invitacion` de abajo (SECURITY DEFINER), no por
-- INSERT/UPDATE directo, para evitar la carrera de "dos personas usan el
-- mismo código a la vez".
create policy "invitaciones: lectura para quien puede invitar"
  on invitaciones for select using (current_rol() in ('socio_fundador', 'socio_gerente'));
create policy "invitaciones: creación para quien puede invitar"
  on invitaciones for insert with check (current_rol() in ('socio_fundador', 'socio_gerente'));

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

  update usuarios set nombre = trim(p_nombre), activo = true
  where auth_user_id = auth.uid()
  returning * into v_usuario;

  if v_usuario is null then
    insert into usuarios (auth_user_id, nombre, mail, rol)
    values (auth.uid(), trim(p_nombre), (select email from auth.users where id = auth.uid()), 'monitoreador')
    returning * into v_usuario;
  end if;

  update invitaciones
  set usado = true, usado_por_id = v_usuario.id
  where id = v_invitacion.id;

  return v_usuario;
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
