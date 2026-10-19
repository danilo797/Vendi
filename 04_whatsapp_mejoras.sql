-- VENDI · Mejoras de WhatsApp
-- Ejecutar en Supabase > SQL Editor. Es seguro repetirlo.
--  - wa_msg_id: id del mensaje de Meta. Con el índice único, si Meta reenvía un
--    mensaje (reintento) el bot NO lo procesa dos veces ni duplica el pedido.
--  - error: si Meta rechazó el envío de una respuesta, aquí queda el motivo.

alter table public.whatsapp_mensajes add column if not exists wa_msg_id text;
alter table public.whatsapp_mensajes add column if not exists error text;

create unique index if not exists wa_mensajes_msgid_uq
  on public.whatsapp_mensajes (wa_msg_id)
  where wa_msg_id is not null;
