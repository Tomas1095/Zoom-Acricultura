-- Historial de informes PDF guardados por establecimiento — a pedido del
-- usuario: hasta ahora, exportar el informe de un lote solo lo compartía
-- (WhatsApp, mail, etc.) sin dejar ningún rastro dentro de la app. El botón
-- nuevo "Exportar PDF y guardar en historial" (al lado del de "Exportar
-- PDF" de siempre, ver salidas-view.tsx) hace las dos cosas: comparte
-- igual que antes Y deja una copia acá, agrupable por campaña y accesible
-- rápido desde el ícono de información al lado de cada establecimiento (ver
-- arbol-lotes.tsx). Guardar es SIEMPRE una acción explícita, nunca
-- automática en cada export — pedido explícito del usuario.
create table informes_establecimiento (
  id uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos (id) on delete cascade,
  comunidad_id uuid not null references comunidades (id), -- la completa el trigger de abajo
  campana text not null,
  nombre_archivo text not null,
  storage_path text not null, -- path real dentro del bucket, con nombre único (no el nombre_archivo de arriba, que es el que ve la persona)
  subido_por_id uuid references usuarios (id),
  created_at timestamptz not null default now()
);

create index on informes_establecimiento (establecimiento_id);
create index on informes_establecimiento (comunidad_id);

-- Reusa la misma función trigger que ya completa comunidad_id en `lotes`
-- (mira el establecimiento_id de la fila nueva) — no hace falta una función
-- aparte, el nombre de columna coincide.
create trigger trg_informes_establecimiento_comunidad
  before insert on informes_establecimiento
  for each row execute function set_comunidad_id_desde_establecimiento();

alter table informes_establecimiento enable row level security;

-- Solo Socio Gerente/Fundador — a pedido explícito del usuario, ni
-- Encargado ni Monitoreador ven ni tocan este historial (a diferencia del
-- resto del árbol de lotes, que sí usa es_administrador()/incluye
-- Encargado). Una sola policy "for all" porque acá no hay necesidad de
-- distinguir lectura/escritura/borrado por rol, como sí pasa en
-- clientes/establecimientos.
create policy "informes_establecimiento: solo socios"
  on informes_establecimiento for all
  using (comunidad_id = current_comunidad_id() and es_socio())
  with check (comunidad_id = current_comunidad_id() and es_socio());

-- ─────────────────────────────────────────────────────────────────────────
-- Storage: bucket privado para estos PDFs — mismo criterio que
-- 'fotos-monitoreo' (bucket privado, cualquier autenticado puede
-- leer/subir/borrar un objeto si conoce el path exacto, que nunca se
-- expone fuera de esta función). El control de acceso real — quién puede
-- ENTERARSE de qué informes existen para qué establecimiento — pasa por la
-- tabla de arriba (RLS "solo socios"), no por este bucket.
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('informes-establecimiento', 'informes-establecimiento', false)
on conflict (id) do nothing;

create policy "informes_establecimiento_storage: lectura para autenticados"
  on storage.objects for select
  using (bucket_id = 'informes-establecimiento' and auth.role() = 'authenticated');
create policy "informes_establecimiento_storage: subida para autenticados"
  on storage.objects for insert
  with check (bucket_id = 'informes-establecimiento' and auth.role() = 'authenticated');
create policy "informes_establecimiento_storage: borrado para autenticados"
  on storage.objects for delete
  using (bucket_id = 'informes-establecimiento' and auth.role() = 'authenticated');
