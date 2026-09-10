-- Eliminar cuenta — a pedido de Apple (App Review, Guideline 5.1.1(v)):
-- una app que permite crear una cuenta tiene que permitir también
-- eliminarla desde ADENTRO de la app, no alcanza con "cerrar sesión" ni
-- con desactivarla.
--
-- `usuarios.auth_user_id` ya tiene `on delete cascade` contra
-- `auth.users` (ver schema.sql) — así que borrar la fila de auth.users ya
-- borra en cascada la fila de `usuarios`. El problema es lo que cuelga DE
-- `usuarios`: varias tablas la referencian sin `on delete` explícito
-- (RESTRICT por default en Postgres), así que borrar a alguien que ya
-- creó una comunidad, generó una invitación o cargó un punto fallaría con
-- un error de foreign key — bloqueando justo al tipo de usuario real que
-- Apple necesita poder probar.
--
-- La solución NO es cascadear el borrado hacia esos datos (eso borraría
-- el trabajo de TODO el equipo por la cuenta de una sola persona que se
-- va) — es desvincular la autoría (queda en null, "cargado por: —") y
-- dejar el dato real intacto. Por eso estas FK pasan a `on delete set
-- null` en vez de RESTRICT.
--
-- Los nombres de las constraints originales (auto-generados por Postgres
-- al declarar `references` inline en el `create table`) no están
-- documentados en ningún lado fuera de la base — este bloque los busca
-- por tabla+columna en vez de asumir un nombre, así no depende de
-- adivinar bien.
do $$
declare
  c record;
begin
  for c in
    select tc.table_name, tc.constraint_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and (tc.table_name, kcu.column_name) in (
        ('comunidades', 'creada_por_id'),
        ('comunidades', 'aprobada_por_id'),
        ('invitaciones', 'usado_por_id'),
        ('invitaciones', 'creado_por_id'),
        ('cargas', 'cargado_por_id'),
        ('cargas_en_conflicto', 'cargado_por_id')
      )
  loop
    execute format('alter table public.%I drop constraint %I', c.table_name, c.constraint_name);
  end loop;
end $$;

-- creado_por_id era NOT NULL — para poder ponerlo en null cuando se borra
-- quien la creó, tiene que dejar de serlo.
alter table invitaciones alter column creado_por_id drop not null;

alter table comunidades add constraint comunidades_creada_por_id_fkey
  foreign key (creada_por_id) references usuarios (id) on delete set null;
alter table comunidades add constraint comunidades_aprobada_por_id_fkey
  foreign key (aprobada_por_id) references usuarios (id) on delete set null;
alter table invitaciones add constraint invitaciones_usado_por_id_fkey
  foreign key (usado_por_id) references usuarios (id) on delete set null;
alter table invitaciones add constraint invitaciones_creado_por_id_fkey
  foreign key (creado_por_id) references usuarios (id) on delete set null;
alter table cargas add constraint cargas_cargado_por_id_fkey
  foreign key (cargado_por_id) references usuarios (id) on delete set null;
alter table cargas_en_conflicto add constraint cargas_en_conflicto_cargado_por_id_fkey
  foreign key (cargado_por_id) references usuarios (id) on delete set null;

-- Función que llama la app (supabase.rpc('eliminar_mi_cuenta')) cuando la
-- persona confirma que quiere borrar SU PROPIA cuenta — `auth.uid()` es
-- siempre quien está pidiendo el borrado ahora mismo, nunca un id que se
-- le pueda pasar por parámetro (nadie puede borrar la cuenta de otro
-- llamando a esta función). `security definer` hace falta porque borrar
-- de `auth.users` requiere privilegios que un usuario común no tiene —
-- corre con los privilegios de quien creó la función (acá, vía el SQL
-- Editor), no con los del que la llama.
create or replace function eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function eliminar_mi_cuenta() to authenticated;
