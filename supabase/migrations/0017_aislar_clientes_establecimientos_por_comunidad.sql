-- Bug de multi-tenancy real: las políticas de lectura de `clientes` y
-- `establecimientos` dejaban pasar a CUALQUIER administrador (socio_
-- fundador/gerente/encargado) sin chequear que la fila fuera de SU
-- comunidad — a diferencia de `lotes` ("lotes: lectura según acceso"),
-- que sí envuelve todo el using() con `comunidad_id = current_comunidad_id()
-- and (...)`. Encontrado al armar una cuenta de prueba aislada (su propia
-- comunidad nueva, vacía) para el revisor de Google Play: esa cuenta veía
-- los clientes y establecimientos reales de otra comunidad.
--
-- Alcance real del agujero: solo nombres de clientes/establecimientos (esas
-- dos tablas no tienen más columnas con datos reales, ver schema.sql) —
-- lotes, puntos, cargas, archivos, etc. ya estaban bien aislados por
-- comunidad en sus propias políticas.
drop policy if exists "clientes: lectura para administradores o con acceso a algún lote propio" on clientes;
create policy "clientes: lectura para administradores o con acceso a algún lote propio"
  on clientes for select
  using (
    (comunidad_id = current_comunidad_id() and es_administrador())
    or exists (
      select 1 from establecimientos e
      join lotes l on l.establecimiento_id = e.id
      where e.cliente_id = clientes.id and tiene_acceso_a_lote(l.id)
    )
  );

drop policy if exists "establecimientos: lectura para administradores o con acceso a algún lote propio" on establecimientos;
create policy "establecimientos: lectura para administradores o con acceso a algún lote propio"
  on establecimientos for select
  using (
    (comunidad_id = current_comunidad_id() and es_administrador())
    or exists (select 1 from lotes l where l.establecimiento_id = establecimientos.id and tiene_acceso_a_lote(l.id))
  );
