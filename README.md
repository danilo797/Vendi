# Vendi · App web

Asistente para pequeños negocios que se abre en el navegador (Chrome o Edge) y
funciona en celular, tablet y computadora. No necesitas instalar nada.

Secciones: **Pedidos · Inventario y compras · Asistente de voz · Clientes**.

---

## Paso 1 · Preparar la base de datos (una sola vez)

1. Abre Supabase → **SQL Editor**.
2. Pega todo el contenido de `supabase/00_EJECUTAR_TODO.sql`.
3. Pulsa **Run**.

> Es seguro repetirlo: no borra ni duplica datos.

Luego, en Supabase → **Authentication → Users**, crea el usuario (correo y
contraseña) con el que vas a entrar.

> ¿Ya usabas la versión con WhatsApp? Esas tablas ya no se usan. Si quieres
> borrarlas, ejecuta además `supabase/03_quitar_whatsapp.sql` (opcional; elimina
> los mensajes guardados, no toca pedidos, clientes ni inventario).

## Paso 2 · Abrir la app

**Opción A (la más fácil):** doble clic en `index.html`.

**Opción B (recomendada, necesaria para el micrófono):**

```bash
node servidor.js
```

y abre <http://localhost:5500>.

> El navegador solo da permiso de micrófono en `localhost` o `https`. Sin
> micrófono la app sigue funcionando escribiendo las órdenes en el recuadro.

## Paso 3 · Entrar

Usa el correo y la contraseña que creaste en Supabase.

---

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | Pantalla de entrada y estructura. |
| `styles.css` | Diseño (colores, tarjetas, responsive). |
| `app.js` | Toda la lógica: pedidos, inventario, voz y clientes. |
| `config.js` | Tu URL de Supabase y la clave pública. |
| `servidor.js` | Servidor local opcional (`node servidor.js`). |
| `supabase/00_EJECUTAR_TODO.sql` | **El SQL que tienes que ejecutar.** |

## Qué hace cada módulo

- **Pedidos**: resumen del día, búsqueda por cliente o número, filtros por
  estado, botón rápido para avanzar un pedido (pendiente → preparando → listo →
  entregado) y detalle de productos. Se actualiza solo en tiempo real. Las
  ventas de hoy no cuentan los pedidos cancelados.
- **Inventario y compras**: nivel de stock con barra, avisos de "se está
  acabando", entradas y salidas, y órdenes de compra que al marcar "recibida"
  suman el stock. Cada orden se puede copiar como lista para pegarla donde
  quieras. Los productos se pueden editar o eliminar.
- **Asistente de voz**: habla o escribe → “¿cuántos pedidos tengo?”, “¿cuánto
  vendí hoy?”, “¿qué se está acabando?”, “anota que llegaron 50 tortillas”,
  “hay que comprar, haz el pedido”. Responde hablando.
- **Clientes**: directorio con cuántos pedidos ha hecho cada uno, cuánto ha
  comprado, tu mejor cliente y cuántos repiten. Desde su ficha puedes llamarle
  o crearle un pedido nuevo.

## Frases que entiende el asistente

- “¿Cuántos pedidos tengo?”
- “¿Cuánto vendí hoy?”
- “¿Qué se está acabando?”
- “¿Cuántas tortillas tengo?”
- “Anota que llegaron 50 tortillas”
- “Anota que se usaron 10 libras de frijol”
- “Hay que comprar, haz el pedido”
