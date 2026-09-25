-- Subgrupo personal dentro de "Mi equipo" — a pedido del usuario: con socio
-- Gerente y Socio Fundador viendo la MISMA lista completa de personal, cada
-- uno quería poder marcar cuáles son "los suyos" (con quiénes trabaja de
-- verdad) para no tener que scrollear entre la gente de su socio al buscar
-- a alguien. Es una marca PERSONAL de quien la pone — cada Socio arma su
-- propio subgrupo, sin pisar el del otro ni cambiar lo que ve nadie más.
create table favoritos_equipo (
  -- Quien marcó (el Socio Gerente/Fundador viendo la lista), no la persona
  -- marcada.
  usuario_id uuid not null references usuarios (id) on delete cascade,
  -- La persona marcada como "mía".
  miembro_id uuid not null references usuarios (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, miembro_id)
);

alter table favoritos_equipo enable row level security;

-- Cada quien lee/escribe únicamente SU PROPIA lista — ni siquiera un
-- administrador de la plataforma entera necesita ver el subgrupo ajeno acá,
-- es solo una comodidad de navegación personal, no un dato operativo del
-- equipo.
create policy "favoritos_equipo: solo lo propio"
  on favoritos_equipo for all
  using (usuario_id = current_usuario_id())
  with check (usuario_id = current_usuario_id());
