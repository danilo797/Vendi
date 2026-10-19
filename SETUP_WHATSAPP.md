# Conectar WhatsApp (Meta Cloud API) a Vendi

Guía corregida. Cambios importantes respecto a la anterior:

- **`npm install -g supabase` NO funciona** (Supabase no permite instalar su CLI como paquete global). Se usa `npx supabase ...`, sin instalar nada.
- Hay un **diagnóstico** que te dice exactamente qué falla (paso 6).
- El bot ya no duplica pedidos si Meta reenvía un mensaje, y la app te avisa con **⚠ No se envió** cuando Meta rechaza una respuesta.

---

## Parte A · Backend en Supabase

### 0. Actualiza la base de datos
En Supabase → **SQL Editor**, ejecuta de nuevo `supabase/00_EJECUTAR_TODO.sql` (es seguro repetirlo). Agrega dos columnas nuevas a `whatsapp_mensajes`.

### 1. Enlaza tu proyecto
Abre una terminal **dentro de la carpeta `vendi-web`** (la que contiene `supabase/`):

```bash
npx supabase login
npx supabase link --project-ref bnfdvmbowfkueoacbxlp
```

(El *project ref* es el texto de la URL del panel: `supabase.com/dashboard/project/<ref>`.)

### 2. Publica las funciones

```bash
npx supabase functions deploy whatsapp-webhook --no-verify-jwt
npx supabase functions deploy whatsapp-enviar
```

> `--no-verify-jwt` es obligatorio en el webhook: Meta no manda un token de Supabase. Si lo olvidas, Meta recibe **401** y nunca llegan los mensajes.

### 3. Guarda los secretos

```bash
npx supabase secrets set WHATSAPP_VERIFY_TOKEN=vendi
npx supabase secrets set WHATSAPP_TOKEN=EAAG...tu-token
npx supabase secrets set WHATSAPP_PHONE_ID=123456789012345
```

Reglas para no fallar:
- Pega el token **sin comillas, sin espacios y en una sola línea**.
- `WHATSAPP_PHONE_ID` es el **"Identificador del número de teléfono"** (solo números), **no** el "Identificador de la cuenta de WhatsApp Business". Son dos números distintos y confundirlos es el error más común.
- Opcional pero recomendado: `npx supabase secrets set WHATSAPP_APP_SECRET=...` (Meta → Configuración de la app → Básica → *Clave secreta de la app*). Con esto el webhook rechaza mensajes que no vengan de Meta.
- **Cada vez que cambies un secreto, no hace falta volver a desplegar**, pero si algo no se actualiza, vuelve a publicar la función.

URL de tu webhook:

```
https://bnfdvmbowfkueoacbxlp.supabase.co/functions/v1/whatsapp-webhook
```

---

## Parte B · App en Meta for Developers

1. <https://developers.facebook.com/apps> → crea una app tipo **Business** y agrega el producto **WhatsApp**.
2. En *WhatsApp → Introducción a la API* copia el **Phone number ID** y el **token temporal** (dura 24 h).
3. En el campo **"Para"** agrega **tu número** como destinatario de prueba y confirma el código que te llega por WhatsApp. **Sin esto Meta rechaza todo (error 131030).**
4. En *WhatsApp → Configuración*:
   - **URL de devolución de llamada**: la URL del webhook de arriba.
   - **Token de verificación**: `vendi` (igual que `WHATSAPP_VERIFY_TOKEN`).
   - **Verificar y guardar**.
   - En **Campos del webhook**, pulsa *Administrar* y **suscríbete a `messages`** (si no, Meta nunca avisa de mensajes nuevos).

---

## 6. Diagnóstico (haz esto antes de probar con el celular)

Abre en el navegador:

```
https://bnfdvmbowfkueoacbxlp.supabase.co/functions/v1/whatsapp-webhook?diagnostico=vendi
```

Te muestra qué secretos faltan, si el token de Meta sirve (llama a Meta de verdad), si las tablas existen y una lista de **consejos** en español. Arregla lo que diga y recarga hasta que todo salga bien.

## 7. Prueba

1. En la app: **Clientes → Probar el bot**. Escribe `hola` y `menú`. Si responde, la base de datos y la lógica están bien; lo que falle después es solo Meta.
2. Desde tu WhatsApp, escribe al número de prueba: `hola`, `menú`, `2 pupusas de queso y 1 horchata`.
3. Si no contesta, mira los registros: Supabase → **Edge Functions → whatsapp-webhook → Logs**.

---

## Tabla de síntomas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| Meta: "No se pudo validar la URL" | Función sin publicar, o el token de verificación no coincide | Publica con `--no-verify-jwt`; revisa que sea idéntico (`vendi`) |
| En Logs no aparece ninguna petición al escribir | No estás suscrito a `messages`, o tu número no es destinatario de prueba | Parte B, pasos 3 y 4 |
| En Logs aparece la petición pero no llega respuesta | Token vencido, Phone ID incorrecto o número no autorizado | Mira el diagnóstico y el mensaje **⚠ No se envió** en la app |
| Error **190** | Token vencido (el temporal dura 24 h) | Genera otro y `secrets set WHATSAPP_TOKEN=...` |
| Error **131030** | Tu número no está en "Para" | Agrégalo y verifícalo |
| Error **131047** | Pasaron más de 24 h sin que el cliente escribiera | Meta exige una plantilla aprobada |
| Error **100** | Phone ID equivocado | Usa el ID del número, no el de la cuenta |
| Pedidos duplicados | Meta reintentaba por tardanza | Ya corregido (columna `wa_msg_id`); ejecuta el SQL nuevo |
| 401 en Logs de Meta | Falta `--no-verify-jwt` o `WHATSAPP_APP_SECRET` incorrecto | Vuelve a publicar / revisa la clave |

## Producción

- **Token permanente**: Business Settings → Usuarios del sistema → crea uno con acceso a la app de WhatsApp y genera el token.
- **Número real y clientes reales**: verifica el negocio (Business Verification) y pasa la app a modo **Live**. En modo Desarrollo solo funcionan los números de prueba (hasta 5).
