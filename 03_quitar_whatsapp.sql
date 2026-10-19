-- VENDI · OPCIONAL · Limpieza de WhatsApp
-- Solo si ya habías ejecutado la versión anterior con WhatsApp y quieres
-- borrar esas tablas. ATENCIÓN: esto elimina los mensajes guardados.
-- Los pedidos, clientes e inventario NO se tocan.

drop table if exists public.whatsapp_mensajes;
drop table if exists public.whatsapp_sesiones;
drop table if exists public.negocio;
