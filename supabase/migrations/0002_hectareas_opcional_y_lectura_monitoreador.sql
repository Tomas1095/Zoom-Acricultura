-- Migración 01: hectareas opcional al crear un lote (antes de subir el KMZ),
-- y que el Monitoreador pueda ver el cliente/establecimiento de sus lotes.
alter table lotes alter column hectareas drop not null;
alter table lotes alter column campana_actual set default '25/26';

drop policy if exists "clientes: lectura para administradores" on clientes;
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

drop policy if exists "establecimientos: lectura para administradores" on establecimientos;
create policy "establecimientos: lectura para administradores o con acceso a algún lote propio"
  on establecimientos for select
  using (
    es_administrador()
    or exists (select 1 from lotes l where l.establecimiento_id = establecimientos.id and tiene_acceso_a_lote(l.id))
  );
