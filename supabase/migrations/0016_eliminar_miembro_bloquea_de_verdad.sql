-- "Eliminar miembro" (ver eliminar_miembro_equipo) solo marcaba
-- usuarios.activo = false — pensado como algo reversible, sin perder el
-- historial de esa persona (sus cargas, informes, etc. siguen atribuidas a
-- su fila, nunca se borra). El problema: ninguna política de RLS miraba
-- esa columna, así que alguien "eliminado" seguía teniendo acceso
-- completo a todo como si nada — reportado por el usuario, que eliminó a
-- un Encargado y la persona seguía adentro de la app con todo su acceso
-- intacto.
--
-- Arreglo: current_comunidad_id() (y current_rol()/current_usuario_id(),
-- por consistencia) ahora exigen activo = true. Como current_comunidad_id()
-- es la base de prácticamente todas las políticas de RLS (comunidad_id =
-- current_comunidad_id(), o indirecto vía es_administrador()/es_socio(),
-- que dependen de current_rol() + comunidad_activa()), esto corta el
-- acceso de punta a punta para quien esté desactivado: deja de poder leer
-- lotes, clientes, su propia fila en "usuarios", cargar datos, todo.
--
-- No hace falta ninguna actualización de la app — esto corre en el
-- servidor y aplica al toque a cualquier sesión ya activa de la persona
-- desactivada, apenas pida cualquier dato de nuevo.
create or replace function current_usuario_id()
returns uuid
language sql stable
as $$
  select id from usuarios where auth_user_id = auth.uid() and activo
$$;

create or replace function current_rol()
returns text
language sql stable
as $$
  select rol from usuarios where auth_user_id = auth.uid() and activo
$$;

create or replace function current_comunidad_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select comunidad_id from usuarios where auth_user_id = auth.uid() and activo
$$;
