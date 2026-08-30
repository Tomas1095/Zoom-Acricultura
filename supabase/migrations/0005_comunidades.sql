-- Migración 05: Comunidades (multi-tenant) — a pedido del usuario, para que
-- si otra empresa de monitoreo se baja la app no choque con los datos de la
-- suya. Es el mismo concepto que ya estaba boceteado en el prototipo
-- (`NOMBRE_COMUNIDAD` en reference/prototipo-app.jsx) pero ahí quedó fijo
-- en un solo valor — acá sí soporta más de una comunidad, aisladas entre sí.
--
-- Reglas de alta, tal como las pidió el usuario (no self-service libre):
--   - Un empleado se suma con un código de invitación (como ya funciona hoy)
--     — el código nace de un Socio Fundador/Gerente de SU comunidad, así
--     que automáticamente entra a esa comunidad, ninguna otra.
--   - Crear una comunidad NUEVA es un pedido, no un alta directa: alguien
--     pone un nombre y su propia cuenta, y queda "pendiente" hasta que el
--     administrador de la plataforma (ver `admin_plataforma` en usuarios,
--     hoy solo el usuario original) lo aprueba. Recién ahí esa persona
--     (que ya queda de una como Socio Fundador de esa comunidad) puede usar
--     la app — antes no puede hacer nada, ver `comunidad_activa()` abajo.

-- ─────────────────────────────────────────────────────────────────────────
-- Tabla + columnas nuevas
-- ─────────────────────────────────────────────────────────────────────────

create table comunidades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'rechazada')),
  creada_por_id uuid references usuarios (id),
  aprobada_por_id uuid references usuarios (id),
  created_at timestamptz not null default now()
);

alter table usuarios add column comunidad_id uuid references comunidades (id);
-- Aparte de `rol` (que es POR comunidad): esto marca a quien administra la
-- plataforma entera, cruzando comunidades — hoy nada más el usuario
-- original (ver el backfill más abajo). Ver `es_admin_plataforma()`.
alter table usuarios add column admin_plataforma boolean not null default false;

alter table clientes add column comunidad_id uuid references comunidades (id);
alter table establecimientos add column comunidad_id uuid references comunidades (id);
alter table lotes add column comunidad_id uuid references comunidades (id);
alter table invitaciones add column comunidad_id uuid references comunidades (id);

-- ─────────────────────────────────────────────────────────────────────────
-- Auto-completar comunidad_id en cascada al crear — así el código de la app
-- (crearCliente/crearEstablecimiento/crearLote/generarInvitacion en
-- lib/db/*.ts) no tiene que cambiar NADA: sigue insertando exactamente
-- igual que antes, y cada fila nueva hereda la comunidad de su padre (o,
-- para clientes, de quien está logueado) sola. Como corre ANTES del INSERT,
-- también blindea contra que alguien intente mandar un comunidad_id propio
-- a mano en el insert: este trigger lo pisa siempre.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function current_comunidad_id()
returns uuid
language sql stable
as $$
  select comunidad_id from usuarios where auth_user_id = auth.uid()
$$;

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
-- Backfill: todo lo que ya existe hoy pasa a ser una comunidad "Zoom
-- Agricultura" activa, y su Socio Fundador actual queda como administrador
-- de la plataforma (quien aprueba comunidades nuevas de acá en más).
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  v_comunidad_id uuid;
begin
  insert into comunidades (nombre, estado)
  values ('Zoom Agricultura', 'activa')
  returning id into v_comunidad_id;

  update usuarios set comunidad_id = v_comunidad_id where comunidad_id is null;
  update clientes set comunidad_id = v_comunidad_id where comunidad_id is null;
  update establecimientos set comunidad_id = v_comunidad_id where comunidad_id is null;
  update lotes set comunidad_id = v_comunidad_id where comunidad_id is null;
  update invitaciones set comunidad_id = v_comunidad_id where comunidad_id is null;

  update comunidades
  set creada_por_id = (select id from usuarios where rol = 'socio_fundador' limit 1)
  where id = v_comunidad_id;

  update usuarios set admin_plataforma = true where rol = 'socio_fundador';
end $$;

alter table usuarios alter column comunidad_id set not null;
alter table clientes alter column comunidad_id set not null;
alter table establecimientos alter column comunidad_id set not null;
alter table lotes alter column comunidad_id set not null;
alter table invitaciones alter column comunidad_id set not null;

create index on clientes (comunidad_id);
create index on establecimientos (comunidad_id);
create index on lotes (comunidad_id);
create index on usuarios (comunidad_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers para las políticas
-- ─────────────────────────────────────────────────────────────────────────

create or replace function es_admin_plataforma()
returns boolean
language sql stable
as $$
  select coalesce((select admin_plataforma from usuarios where auth_user_id = auth.uid()), false)
$$;

-- Mientras una comunidad está "pendiente" (o quedó "rechazada"), nadie de
-- ahí adentro puede hacer nada más que ver el estado de su propia
-- solicitud — ver comunidad-pendiente.tsx. Se aplica automáticamente a
-- todo lo demás porque `es_administrador()`/`es_socio()` lo exigen ahora.
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

-- (creada en la migración 04) — ahora también exige comunidad activa, con
-- el mismo criterio de arriba.
create or replace function es_socio()
returns boolean
language sql stable
as $$
  select current_rol() in ('socio_fundador', 'socio_gerente') and comunidad_activa()
$$;

-- Ahora exige, además del acceso de siempre, que el lote sea de la MISMA
-- comunidad que quien pregunta — antes un administrador (rol nomás, sin
-- ningún chequeo de comunidad) veía el árbol de CUALQUIER comunidad. Este
-- es el punto central de todo el aislamiento: lotes/puntos/cargas/accesos
-- pasan todos por acá.
create or replace function tiene_acceso_a_lote(p_lote_id uuid)
returns boolean
language sql stable
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
-- RLS: comunidades
-- ─────────────────────────────────────────────────────────────────────────

alter table comunidades enable row level security;

-- Sin política de insert/update/delete a propósito: comunidades nace y
-- cambia de estado únicamente vía `solicitar_comunidad`/`revisar_comunidad`
-- (SECURITY DEFINER, más abajo), nunca por INSERT/UPDATE directo.
create policy "comunidades: lectura de la propia, o todas para admin de plataforma"
  on comunidades for select
  using (id = current_comunidad_id() or es_admin_plataforma());

-- ─────────────────────────────────────────────────────────────────────────
-- RLS: aislar cada comunidad de las demás en las tablas existentes
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists "usuarios: lectura para cualquier miembro autenticado" on usuarios;
create policy "usuarios: lectura para cualquier miembro autenticado"
  on usuarios for select
  using (comunidad_id = current_comunidad_id() or es_admin_plataforma());

-- La política original de auto-edición ("no tu rol") solo pineaba `rol` —
-- dejaba `comunidad_id` y `admin_plataforma` libres, así que cualquiera
-- podía, con un UPDATE directo a su propia fila, cambiarse de comunidad o
-- auto-nombrarse administrador de la plataforma. Ahora pinea los tres.
drop policy if exists "usuarios: cada uno edita su propio perfil (no su rol)" on usuarios;
create policy "usuarios: cada uno edita su propio perfil (no su rol, comunidad ni admin_plataforma)"
  on usuarios for update
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and rol = (select rol from usuarios where auth_user_id = auth.uid())
    and comunidad_id = (select comunidad_id from usuarios where auth_user_id = auth.uid())
    and admin_plataforma = (select admin_plataforma from usuarios where auth_user_id = auth.uid())
  );

-- clientes/establecimientos/lotes: las políticas de lectura ya andan bien
-- solas (pasan por tiene_acceso_a_lote, recién actualizada arriba); solo
-- hace falta agregar el chequeo de comunidad en actualización/borrado —
-- inserción no lo necesita, el trigger de arriba ya lo garantiza siempre.
drop policy if exists "clientes: actualización para administradores" on clientes;
create policy "clientes: actualización para administradores"
  on clientes for update using (comunidad_id = current_comunidad_id() and es_administrador());
drop policy if exists "clientes: borrado solo socio_fundador/socio_gerente" on clientes;
create policy "clientes: borrado solo socio_fundador/socio_gerente"
  on clientes for delete using (comunidad_id = current_comunidad_id() and current_rol() in ('socio_fundador', 'socio_gerente'));

drop policy if exists "establecimientos: actualización para administradores" on establecimientos;
create policy "establecimientos: actualización para administradores"
  on establecimientos for update using (comunidad_id = current_comunidad_id() and es_administrador());
drop policy if exists "establecimientos: borrado solo socio_fundador/socio_gerente" on establecimientos;
create policy "establecimientos: borrado solo socio_fundador/socio_gerente"
  on establecimientos for delete using (comunidad_id = current_comunidad_id() and current_rol() in ('socio_fundador', 'socio_gerente'));

drop policy if exists "lotes: actualización para administradores" on lotes;
create policy "lotes: actualización para administradores"
  on lotes for update using (comunidad_id = current_comunidad_id() and es_administrador());
drop policy if exists "lotes: borrado solo socio_fundador/socio_gerente" on lotes;
create policy "lotes: borrado solo socio_fundador/socio_gerente"
  on lotes for delete using (comunidad_id = current_comunidad_id() and current_rol() in ('socio_fundador', 'socio_gerente'));

-- puntos: a diferencia de clientes/establecimientos/lotes, `lote_id` no lo
-- pone ningún trigger — lo elige quien inserta, así que sí hace falta el
-- chequeo explícito acá.
drop policy if exists "puntos: escritura para administradores" on puntos;
create policy "puntos: escritura para administradores"
  on puntos for all
  using (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()))
  with check (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()));

drop policy if exists "accesos: lectura de lo propio o administrador" on accesos;
create policy "accesos: lectura de lo propio o administrador"
  on accesos for select
  using (
    usuario_id = current_usuario_id()
    or (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()))
  );
drop policy if exists "accesos: gestión solo administradores" on accesos;
create policy "accesos: gestión solo administradores"
  on accesos for all
  using (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()))
  with check (es_administrador() and exists (select 1 from lotes l where l.id = lote_id and l.comunidad_id = current_comunidad_id()));

-- invitaciones: mismo criterio "quien puede invitar" que antes, pero ahora
-- vía es_socio() (ya exige comunidad activa) en vez del chequeo de rol
-- directo — así una comunidad todavía pendiente no puede generar códigos
-- ni, por lectura, ver códigos de otra comunidad.
drop policy if exists "invitaciones: lectura para quien puede invitar" on invitaciones;
create policy "invitaciones: lectura para quien puede invitar"
  on invitaciones for select using (comunidad_id = current_comunidad_id() and es_socio());
drop policy if exists "invitaciones: creación para quien puede invitar" on invitaciones;
create policy "invitaciones: creación para quien puede invitar"
  on invitaciones for insert with check (es_socio());

-- cargas_en_conflicto (migración 04): la lectura por rol nomás dejaba ver
-- conflictos de CUALQUIER comunidad a cualquier socio — acá se agrega el
-- mismo chequeo de comunidad que ya usa la política de inserción.
drop policy if exists "cargas_en_conflicto: lectura para socios" on cargas_en_conflicto;
create policy "cargas_en_conflicto: lectura para socios"
  on cargas_en_conflicto for select
  using (
    es_socio()
    and exists (select 1 from puntos p where p.id = punto_id and tiene_acceso_a_lote(p.lote_id))
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Canje de invitación: ahora hereda comunidad_id del código usado, y
-- rechaza códigos de una comunidad que ya no está activa (no debería poder
-- pasar — ver comunidad_activa() en la creación del código — pero es
-- barato blindarlo también acá).
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
  for update;

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
-- Pedir una comunidad nueva (queda "pendiente") y revisarla (admin_plataforma)
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
-- Resolver conflictos de carga (migración 04): agrega el mismo chequeo de
-- "es de mi comunidad" que ya tiene la política de lectura, para que un
-- socio no pueda resolver por id un conflicto de otra comunidad.
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
