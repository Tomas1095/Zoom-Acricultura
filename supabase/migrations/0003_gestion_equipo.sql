-- Migración 03: reemplaza el UPDATE directo sobre usuarios.rol (demasiado
-- permisivo: dejaba a cualquier socio_gerente tocar a otro socio_gerente)
-- por tres funciones con la regla exacta de permisos del equipo.

drop policy if exists "usuarios: socio_fundador asciende/degrada y admins gestionan bajas" on usuarios;

create or replace function cambiar_rol_usuario(p_usuario_id uuid, p_nuevo_rol text)
returns usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_rol text := current_rol();
  v_target usuarios;
begin
  if p_nuevo_rol not in ('socio_gerente', 'encargado', 'monitoreador') then
    raise exception 'rol_invalido';
  end if;

  select * into v_target from usuarios where id = p_usuario_id;
  if v_target is null then
    raise exception 'usuario_no_encontrado';
  end if;
  if v_target.rol = 'socio_fundador' then
    raise exception 'no_se_puede_cambiar_el_rol_del_fundador_por_esta_via';
  end if;

  if v_caller_rol = 'socio_fundador' then
    null;
  elsif v_caller_rol = 'socio_gerente' then
    if p_nuevo_rol = 'socio_gerente' or v_target.rol = 'socio_gerente' then
      raise exception 'solo_el_fundador_puede_tocar_socios_gerentes';
    end if;
  else
    raise exception 'sin_permiso';
  end if;

  update usuarios set rol = p_nuevo_rol where id = p_usuario_id returning * into v_target;
  return v_target;
end;
$$;

create or replace function transferir_fundador(p_nuevo_fundador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := current_usuario_id();
begin
  if current_rol() <> 'socio_fundador' then
    raise exception 'solo_el_fundador_puede_transferir';
  end if;
  update usuarios set rol = 'socio_fundador' where id = p_nuevo_fundador_id;
  update usuarios set rol = 'socio_gerente' where id = v_caller_id;
end;
$$;

create or replace function eliminar_miembro_equipo(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_rol() not in ('socio_fundador', 'socio_gerente') then
    raise exception 'sin_permiso';
  end if;
  if (select rol from usuarios where id = p_usuario_id) = 'socio_fundador' then
    raise exception 'no_se_puede_eliminar_al_fundador';
  end if;
  update usuarios set activo = false where id = p_usuario_id;
end;
$$;
