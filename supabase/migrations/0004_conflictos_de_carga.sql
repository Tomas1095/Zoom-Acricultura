-- Migración 04: resolución real de conflictos — antes, si dos personas
-- cargaban el mismo punto sin señal y después las dos sincronizaban, ganaba
-- en silencio quien sincronizaba último (el upsert de `cargas` con
-- onConflict punto_id+campana pisaba lo que hubiera). Ahora, cuando el
-- cambio que está por subirse pisaría una carga ya CONFIRMADA por otra
-- persona, queda acá en vez de pisarla — un Socio Gerente/Fundador decide
-- después cuál de las dos versiones se queda (ver resolver_conflicto_carga).

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

create index on cargas_en_conflicto (carga_activa_id);
create index on cargas_en_conflicto (punto_id, campana);

alter table cargas_en_conflicto enable row level security;

-- Resolver conflictos es cosa de los socios, no de Encargado — mismo
-- criterio que "Cerrar campaña" (ver puedeCerrarCampana en roles.ts /
-- CONTEXTO.md: ni el selector de campaña ni cerrarla son cosa de
-- Encargado). Ver el pedido explícito del usuario para esta función.
create or replace function es_socio()
returns boolean
language sql stable
as $$
  select current_rol() in ('socio_fundador', 'socio_gerente')
$$;

create policy "cargas_en_conflicto: lectura para socios"
  on cargas_en_conflicto for select
  using (es_socio());

-- La inserción la hace el dispositivo de CUALQUIERA con acceso al lote —
-- es quien sincroniza su cola offline y se encuentra con que su cambio
-- pisaría algo ya confirmado por otra persona.
create policy "cargas_en_conflicto: insertar con acceso al lote del punto"
  on cargas_en_conflicto for insert
  with check (
    exists (select 1 from puntos p where p.id = punto_id and tiene_acceso_a_lote(p.lote_id))
  );

-- Resuelve un conflicto en una sola operación atómica: si p_quedarse_con_nueva
-- es true, la versión en conflicto reemplaza a la que estaba activa en
-- `cargas`; si es false, se descarta y queda la que ya estaba. En los dos
-- casos el conflicto desaparece de la lista.
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
