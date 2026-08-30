-- Migración 06: hotfix de la 05 — infinite recursion detected in policy for
-- relation "usuarios".
--
-- La política de lectura de `usuarios` (05) quedó así:
--   using (comunidad_id = current_comunidad_id() or es_admin_plataforma())
-- y las dos funciones hacen `select ... from usuarios where auth_user_id =
-- auth.uid()` — es decir, para decidir si SE PUEDE leer una fila de
-- `usuarios`, Postgres necesita evaluar estas funciones, que a su vez leen
-- `usuarios`, lo que dispara la MISMA política de nuevo — un círculo que
-- nunca termina (de ahí que "ingresar" se quede pensando para siempre y
-- después falle por el timeout, sin ningún otro síntoma).
--
-- El arreglo estándar de Postgres/Supabase para este problema: estas dos
-- funciones pasan a SECURITY DEFINER — corren con los permisos de quien
-- las creó (el dueño de las tablas), que por default está EXENTO de la RLS
-- de sus propias tablas (a menos que se use FORCE ROW LEVEL SECURITY, que
-- este esquema no usa) — así la consulta interna a `usuarios` no vuelve a
-- disparar la política, se resuelve directo, y el círculo se corta ahí.
--
-- Ningún otro código (ni las políticas que las usan, ni la app) cambia.

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
