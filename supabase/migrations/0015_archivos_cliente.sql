-- Archivos sueltos por cliente — a pedido del usuario, para guardar dentro
-- de la app el Excel "resumen de aplicación de cebo" que arma en su
-- computadora y entrega a cada cliente (todos los campos/lotes y los
-- productos a usar) — hoy lo tiene que mandar aparte, siempre afuera de la
-- app. Mismo criterio de acceso que informes_establecimiento (ver esa
-- migración): solo Socio Gerente/Fundador puede subir, ver y borrar, a
-- pedido explícito del usuario — acá ni siquiera hay un botón de "guardar
-- en historial" disparado por otra acción, es una subida manual directa
-- (ver el ícono de información al lado de cada cliente en arbol-lotes.tsx).
create table archivos_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  comunidad_id uuid not null references comunidades (id), -- la completa el trigger de abajo
  nombre_archivo text not null,
  storage_path text not null, -- path real dentro del bucket, con nombre único (no el nombre_archivo de arriba)
  subido_por_id uuid references usuarios (id),
  created_at timestamptz not null default now()
);

create index on archivos_cliente (cliente_id);
create index on archivos_cliente (comunidad_id);

-- Reusa la misma función trigger que ya completa comunidad_id en
-- `establecimientos` (mira el cliente_id de la fila nueva).
create trigger trg_archivos_cliente_comunidad
  before insert on archivos_cliente
  for each row execute function set_comunidad_id_desde_cliente();

alter table archivos_cliente enable row level security;

create policy "archivos_cliente: solo socios"
  on archivos_cliente for all
  using (comunidad_id = current_comunidad_id() and es_socio())
  with check (comunidad_id = current_comunidad_id() and es_socio());

-- ─────────────────────────────────────────────────────────────────────────
-- Storage: bucket privado — mismo criterio que 'fotos-monitoreo' e
-- 'informes-establecimiento' (ver esa migración): el control de acceso de
-- verdad pasa por la tabla de arriba, no por este bucket.
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('archivos-cliente', 'archivos-cliente', false)
on conflict (id) do nothing;

create policy "archivos_cliente_storage: lectura para autenticados"
  on storage.objects for select
  using (bucket_id = 'archivos-cliente' and auth.role() = 'authenticated');
create policy "archivos_cliente_storage: subida para autenticados"
  on storage.objects for insert
  with check (bucket_id = 'archivos-cliente' and auth.role() = 'authenticated');
create policy "archivos_cliente_storage: borrado para autenticados"
  on storage.objects for delete
  using (bucket_id = 'archivos-cliente' and auth.role() = 'authenticated');
