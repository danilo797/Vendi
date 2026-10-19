/* ============================================================
   VENDI · App web
   Secciones: Pedidos · Inventario y compras · Asistente de voz · Clientes
   ============================================================ */

const db = window.supabase.createClient(window.VENDI.supabaseUrl, window.VENDI.supabaseKey);

const ESTADOS = ['pendiente', 'preparando', 'listo', 'entregado', 'cancelado'];
const CANALES = ['mostrador', 'llamada', 'domicilio'];
const SIGUIENTE = { pendiente: 'preparando', preparando: 'listo', listo: 'entregado' };
const FILTROS = [['todos', 'Todos'], ['activos', 'Activos'], ['listo', 'Listos'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados']];
const UNIDADES = ['unidad', 'docena', 'libra', 'kg', 'litro', 'caja'];
const SECCIONES = [
  { id: 'pedidos', ico: '🧾', txt: 'Pedidos' },
  { id: 'inventario', ico: '📦', txt: 'Inventario' },
  { id: 'asistente', ico: '🎙️', txt: 'Asistente' },
  { id: 'clientes', ico: '👥', txt: 'Clientes' },
];

const S = {
  user: null,
  seccion: 'pedidos',
  vistaStock: true,
  pedidos: [], inventario: [], compras: [], clientes: [],
  filtro: 'todos', busqueda: '', busquedaCliente: '',
  charla: [], escuchando: false, leerVoz: true, ocupado: false,
};

/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + (Number(n) || 0).toFixed(2);
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const cant = (v) => (Number(v) === Math.round(Number(v)) ? String(Math.round(Number(v))) : Number(v).toFixed(2));

function toast(msg, error = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' error' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

function fecha(v) { return v ? new Date(v) : null; }
function hace(v) {
  const d = fecha(v);
  if (!d) return '';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  if (min < 1440) return `Hace ${Math.floor(min / 60)} h`;
  return `Hace ${Math.floor(min / 1440)} d`;
}
function hora(v) {
  const d = fecha(v);
  if (!d) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const hoy = new Date();
  const mismo = d.toDateString() === hoy.toDateString();
  return mismo ? `${hh}:${mm}` : `${d.getDate()}/${d.getMonth() + 1} ${hh}:${mm}`;
}
const mismoDia = (a, b) => a && b && a.toDateString() === b.toDateString();

/* ================= modal ================= */
function abrirModal(html) {
  $('#modalCaja').innerHTML = html;
  $('#modal').classList.remove('oculto');
}
function cerrarModal() {
  $('#modal').classList.add('oculto');
  $('#modalCaja').innerHTML = '';
}
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') cerrarModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarModal(); });

/* ================= autenticación ================= */
$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btnEntrar');
  const err = $('#loginError');
  btn.disabled = true; btn.textContent = 'Entrando…'; err.classList.add('oculto');
  const { error } = await db.auth.signInWithPassword({
    email: $('#correo').value.trim(),
    password: $('#clave').value,
  });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) { err.textContent = traducirError(error.message); err.classList.remove('oculto'); }
});
$('#btnSalir').addEventListener('click', () => db.auth.signOut());

function traducirError(m = '') {
  if (/Invalid login/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'El correo no está confirmado.';
  if (/fetch|network|Failed/i.test(m)) return 'No se pudo conectar. Revisa tu internet.';
  return m;
}

async function arrancar() {
  const { data } = await db.auth.getSession();
  pintarSesion(data?.session ?? null);
  db.auth.onAuthStateChange((_e, session) => pintarSesion(session));
}

function pintarSesion(session) {
  const dentro = !!session;
  $('#login').classList.toggle('oculto', dentro);
  $('#app').classList.toggle('oculto', !dentro);
  if (dentro) {
    S.user = session.user;
    $('#usuario').textContent = session.user?.email ?? '';
    if (!S._suscrito) { suscribirRealtime(); S._suscrito = true; }
    conectarVoz();
    ir(S.seccion);
  } else {
    S.user = null;
    if (S._canal) { db.removeChannel(S._canal); S._canal = null; S._suscrito = false; }
  }
}

/* ================= navegación ================= */
function pintarNav() {
  $('#nav').innerHTML = SECCIONES.map((s) =>
    `<button class="nav-item ${S.seccion === s.id ? 'activo' : ''}" data-ir="${s.id}">
       <span class="ico">${s.ico}</span>${s.txt}</button>`).join('');
  $('#tabbar').innerHTML = SECCIONES.map((s) =>
    `<button class="tab ${S.seccion === s.id ? 'activo' : ''}" data-ir="${s.id}">
       <span class="ico">${s.ico}</span>${s.txt}</button>`).join('');
  $$('[data-ir]').forEach((b) => b.onclick = () => ir(b.dataset.ir));
}

function ir(seccion) {
  S.seccion = seccion;
  pintarNav();
  render();
}

/* ================= datos ================= */
async function conNombres(items, tabla, campo = 'nombre') {
  const ids = [...new Set(items.map((i) => i[`${campo}_id`] ?? i.producto_id).filter(Boolean))];
  const mapa = {};
  if (ids.length) {
    const { data } = await db.from(tabla).select('id, nombre').in('id', ids);
    (data ?? []).forEach((r) => { mapa[r.id] = r.nombre; });
  }
  return mapa;
}

async function cargarPedidos() {
  const { data, error } = await db.from('pedidos').select('*').order('creado_en', { ascending: false });
  if (error) throw error;
  const ids = [...new Set(data.map((p) => p.cliente_id).filter(Boolean))];
  const nombres = {};
  if (ids.length) {
    const { data: cs } = await db.from('clientes').select('id, nombre').in('id', ids);
    (cs ?? []).forEach((c) => { nombres[c.id] = c.nombre; });
  }
  S.pedidos = data.map((p) => ({ ...p, cliente: nombres[p.cliente_id] ?? `Cliente #${p.cliente_id ?? '?'}` }));
}

async function itemsDePedido(id) {
  const { data } = await db.from('pedido_items').select('*').eq('pedido_id', id);
  const faltan = (data ?? []).filter((i) => !i.nombre && i.producto_id).map((i) => i.producto_id);
  const nombres = {};
  if (faltan.length) {
    const { data: ps } = await db.from('productos').select('id, nombre').in('id', faltan);
    (ps ?? []).forEach((p) => { nombres[p.id] = p.nombre; });
  }
  return (data ?? []).map((i) => ({
    nombre: i.nombre || nombres[i.producto_id] || 'Producto',
    cantidad: Number(i.cantidad) || 0,
    precio: Number(i.precio_unitario) || 0,
  }));
}

async function cargarInventario() {
  const { data, error } = await db.from('inventario').select('*').order('nombre');
  if (error) throw error;
  S.inventario = data.map((i) => ({ ...i, cantidad: Number(i.cantidad) || 0, minimo: Number(i.minimo) || 0, costo: Number(i.costo_ultima_compra) || 0 }));
}

async function cargarCompras() {
  const { data, error } = await db.from('compras').select('*').order('creado_en', { ascending: false });
  if (error) throw error;
  const ids = data.map((c) => c.id);
  const mapa = {};
  if (ids.length) {
    const { data: its } = await db.from('compra_items').select('*').in('compra_id', ids);
    (its ?? []).forEach((i) => { (mapa[i.compra_id] ??= []).push(i); });
  }
  S.compras = data.map((c) => ({ ...c, total: Number(c.total) || 0, items: mapa[c.id] ?? [] }));
}

async function cargarClientes() {
  const { data, error } = await db.from('clientes').select('*').order('nombre');
  if (error) throw error;
  await cargarPedidos();
  S.clientes = data.map((c) => {
    const suyos = S.pedidos.filter((p) => p.cliente_id === c.id);
    const validos = suyos.filter((p) => p.estado !== 'cancelado');
    return {
      ...c,
      pedidos: suyos,
      gastado: validos.reduce((a, p) => a + (Number(p.total) || 0), 0),
      ultimo: suyos[0]?.creado_en ?? null, // ya vienen del más nuevo al más viejo
    };
  });
}

/* ================= render ================= */
let temporizador = null;
function recargar(seccion = S.seccion) {
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    try {
      if (seccion === 'pedidos') await cargarPedidos();
      if (seccion === 'inventario') { await cargarInventario(); await cargarCompras(); }
      if (seccion === 'clientes') await cargarClientes();
      if (seccion === 'asistente') { await cargarPedidos(); await cargarInventario(); }
      if (S.seccion === seccion) render();
    } catch (e) { mostrarErrorDatos(e); }
  }, 120);
}

function mostrarErrorDatos(e) {
  const m = String(e?.message ?? e);
  if (/does not exist|42P01|Could not find the table/i.test(m)) {
    toast('Falta preparar la base de datos. Ejecuta los SQL de la carpeta supabase.', true);
  } else {
    toast(m, true);
  }
}

async function render() {
  const vista = $('#vista');
  $('#titulo').textContent = SECCIONES.find((s) => s.id === S.seccion).txt;
  $('#accionesCabecera').innerHTML = '';
  if (!$('#subtitulo').dataset.fijo) $('#subtitulo').textContent = '';

  try {
    if (S.seccion === 'pedidos') { await cargarPedidos(); renderPedidos(vista); }
    else if (S.seccion === 'inventario') { await cargarInventario(); await cargarCompras(); renderInventario(vista); }
    else if (S.seccion === 'asistente') renderAsistente(vista);
    else if (S.seccion === 'clientes') { await cargarClientes(); renderClientes(vista); }
  } catch (e) {
    vista.innerHTML = `<div class="vacio"><div class="emoji">🛠️</div><p>No se pudieron cargar los datos.</p>
      <p style="font-size:13px">${esc(String(e?.message ?? e))}</p>
      <p style="font-size:13px">Revisa que ejecutaste <b>00_EJECUTAR_TODO.sql</b> de la carpeta <code>supabase</code>.</p></div>`;
  }
}

/* ================= sección: Pedidos ================= */
const pedidoVisible = (p) => {
  if (S.filtro === 'activos' && !(p.estado === 'pendiente' || p.estado === 'preparando')) return false;
  if (!['todos', 'activos'].includes(S.filtro) && p.estado !== S.filtro) return false;
  const q = norm(S.busqueda);
  return !q || norm(`${p.id} ${p.cliente}`).includes(q);
};

function renderPedidos(vista) {
  const activos = S.pedidos.filter((p) => p.estado === 'pendiente' || p.estado === 'preparando');
  const hoy = S.pedidos.filter((p) => mismoDia(fecha(p.creado_en), new Date()) && p.estado !== 'cancelado');
  const ventas = hoy.reduce((a, p) => a + (Number(p.total) || 0), 0);

  $('#subtitulo').textContent = 'Todo lo que entra a tu negocio, en un solo lugar';
  $('#accionesCabecera').innerHTML = `<button class="btn primario" id="btnNuevoPedido">+ Nuevo pedido</button>`;
  $('#btnNuevoPedido').onclick = dialogoNuevoPedido;

  vista.innerHTML = `
    <div class="rejilla">
      <div class="resumen"><div class="valor">${activos.length}</div><div class="etq">Pedidos activos</div></div>
      <div class="resumen"><div class="valor">${S.pedidos.length}</div><div class="etq">Pedidos en total</div></div>
      <div class="resumen verde"><div class="valor">${money(ventas)}</div><div class="etq">Ventas de hoy (${hoy.length})</div></div>
    </div>
    <input id="buscarPedido" type="search" class="buscador" placeholder="Buscar por cliente o número de pedido" value="${esc(S.busqueda)}" />
    <div class="sugerencias" id="filtros">
      ${FILTROS.map(([id, txt]) => `<button class="sugerencia ${S.filtro === id ? 'activo' : ''}" data-filtro="${id}">${txt}</button>`).join('')}
    </div>
    <div class="lista" id="listaPedidos"></div>`;

  $('#buscarPedido').oninput = (e) => { S.busqueda = e.target.value; pintarListaPedidos(); };
  $$('[data-filtro]').forEach((b) => b.onclick = () => {
    S.filtro = b.dataset.filtro;
    $$('[data-filtro]').forEach((x) => x.classList.toggle('activo', x === b));
    pintarListaPedidos();
  });
  pintarListaPedidos();
}

function pintarListaPedidos() {
  const cont = $('#listaPedidos');
  if (!cont) return;
  const visibles = S.pedidos.filter(pedidoVisible);

  cont.innerHTML = visibles.length
    ? visibles.map((p) => {
        const sig = SIGUIENTE[p.estado];
        return `
      <div class="fila" data-pedido="${p.id}">
        <div class="crecer">
          <div class="titulo">#${p.id} · ${esc(p.cliente)}</div>
          <div class="meta">${esc(p.tipo ?? '—')} · ${hace(p.creado_en)}</div>
        </div>
        <span class="monto">${money(p.total)}</span>
        <span class="chip ${esc(p.estado)}">${esc(p.estado)}</span>
        ${sig ? `<button class="btn chico" data-avanzar="${p.id}" title="Pasar a ${sig}">→ ${sig}</button>` : ''}
      </div>`;
      }).join('')
    : S.pedidos.length
      ? `<div class="vacio"><div class="emoji">🔎</div><p>No hay pedidos con ese filtro.</p></div>`
      : `<div class="vacio"><div class="emoji">🧾</div><p>Aún no hay pedidos.</p>
         <p style="font-size:13px">Toca <b>Nuevo pedido</b> para registrar el primero.</p></div>`;

  $$('[data-pedido]', cont).forEach((f) => f.onclick = () => dialogoPedido(Number(f.dataset.pedido)));
  $$('[data-avanzar]', cont).forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    const p = S.pedidos.find((x) => x.id === +b.dataset.avanzar);
    if (!p) return;
    const { error } = await db.from('pedidos').update({ estado: SIGUIENTE[p.estado] }).eq('id', p.id);
    if (error) return toast(error.message, true);
    toast(`Pedido #${p.id} → ${SIGUIENTE[p.estado]}`);
    recargar('pedidos');
  });
}

async function dialogoPedido(id) {
  const p = S.pedidos.find((x) => x.id === id);
  if (!p) return;
  const items = await itemsDePedido(id);
  const detalle = items.length
    ? items.map((i) => `<div class="fila"><div class="crecer">${esc(i.nombre)}</div><div class="meta">${cant(i.cantidad)} × ${money(i.precio)}</div><div class="monto">${money(i.cantidad * i.precio)}</div></div>`).join('')
    : '<p class="meta">Sin detalle de productos.</p>';

  abrirModal(`
    <h3>Pedido #${p.id} · ${esc(p.cliente)}</h3>
    <p class="meta">${esc(p.tipo ?? '—')} · ${hace(p.creado_en)}${p.notas ? ' · ' + esc(p.notas) : ''}</p>
    <div class="lista" style="margin:14px 0">${detalle}</div>
    <div class="fila" style="justify-content:space-between"><b>Total</b><span class="monto">${money(p.total)}</span></div>
    <p class="meta" style="margin-top:14px">Cambiar estado:</p>
    <div class="sugerencias">
      ${ESTADOS.map((e) => `<button class="sugerencia" data-estado="${e}">${e}</button>`).join('')}
    </div>
    <div class="acciones"><button class="btn" onclick="cerrarModal()">Cerrar</button></div>`);

  $$('[data-estado]').forEach((b) => b.onclick = async () => {
    const { error } = await db.from('pedidos').update({ estado: b.dataset.estado }).eq('id', p.id);
    if (error) return toast(error.message, true);
    toast(`Pedido #${p.id} → ${b.dataset.estado}`);
    cerrarModal(); recargar('pedidos');
  });
}

let lineasPedido = [];
function dialogoNuevoPedido() {
  camposTemp = { cliente: '', telefono: '', canal: 'mostrador' };
  lineasPedido = [{ nombre: '', cantidad: 1, precio: '' }];
  pintarNuevoPedido();
}

function pintarNuevoPedido(error = '') {
  const filas = lineasPedido.map((l, i) => `
    <div class="linea-form">
      <label class="campo" style="flex:4;margin:0"><span>Producto</span>
        <input data-i="${i}" data-campo="nombre" value="${esc(l.nombre)}" placeholder="Ej. Pupusa de queso" /></label>
      <label class="campo" style="flex:1.4;margin:0"><span>Cant.</span>
        <input data-i="${i}" data-campo="cantidad" type="number" min="1" value="${esc(l.cantidad)}" /></label>
      <label class="campo" style="flex:1.6;margin:0"><span>Precio</span>
        <input data-i="${i}" data-campo="precio" type="number" step="0.01" value="${esc(l.precio)}" /></label>
      <button class="btn chico x" data-quitar="${i}" title="Quitar">✕</button>
    </div>`).join('');

  abrirModal(`
    <h3>Registrar pedido</h3>
    <label class="campo"><span>Cliente</span><input id="npCliente" value="${esc(camposTemp.cliente)}" placeholder="Nombre del cliente" /></label>
    <label class="campo"><span>Teléfono (opcional)</span><input id="npTelefono" value="${esc(camposTemp.telefono)}" placeholder="7777-7777" /></label>
    <label class="campo"><span>Canal</span><select id="npCanal">${CANALES.map((c) => `<option ${c === camposTemp.canal ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <p class="meta" style="margin:14px 0 6px"><b>Productos</b></p>
    <div id="npFilas">${filas}</div>
    <button class="btn chico" id="npAdd">+ Agregar producto</button>
    ${error ? `<p style="color:var(--rojo);font-size:13px;margin-top:10px">${esc(error)}</p>` : ''}
    <div class="acciones">
      <button class="btn" onclick="cerrarModal()">Cancelar</button>
      <button class="btn primario" id="npGuardar">Guardar</button>
    </div>`);

  $$('#npFilas input').forEach((inp) => inp.oninput = () => { lineasPedido[+inp.dataset.i][inp.dataset.campo] = inp.value; });
  $$('[data-quitar]').forEach((b) => b.onclick = () => { guardarTemporal(); lineasPedido.splice(+b.dataset.quitar, 1); if (!lineasPedido.length) lineasPedido.push({ nombre: '', cantidad: 1, precio: '' }); pintarNuevoPedido(); });
  $('#npAdd').onclick = () => { guardarTemporal(); lineasPedido.push({ nombre: '', cantidad: 1, precio: '' }); pintarNuevoPedido(); };
  $('#npGuardar').onclick = guardarNuevoPedido;
}

let camposTemp = { cliente: '', telefono: '', canal: 'mostrador' };
function guardarTemporal() {
  camposTemp = { cliente: $('#npCliente')?.value ?? camposTemp.cliente, telefono: $('#npTelefono')?.value ?? camposTemp.telefono, canal: $('#npCanal')?.value ?? camposTemp.canal };
}

async function guardarNuevoPedido() {
  guardarTemporal();
  const lineas = lineasPedido
    .map((l) => ({ nombre: (l.nombre || '').trim(), cantidad: Math.round(num(l.cantidad) || 0), precio: num(l.precio) }))
    .filter((l) => l.nombre);
  if (!camposTemp.cliente.trim()) return pintarNuevoPedido('Escribe el nombre del cliente.');
  if (!lineas.length) return pintarNuevoPedido('Agrega al menos un producto.');
  if (lineas.some((l) => !l.cantidad || l.cantidad <= 0 || l.precio == null || l.precio < 0)) return pintarNuevoPedido('Revisa cantidad y precio de los productos.');
  const { error } = await db.rpc('crear_pedido', {
    p_cliente: camposTemp.cliente.trim(),
    p_canal: camposTemp.canal,
    p_telefono: camposTemp.telefono.trim() || null,
    p_notas: null,
    p_items: lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio: l.precio })),
  });
  if (error) return pintarNuevoPedido(error.message);
  toast('Pedido guardado.'); cerrarModal(); camposTemp = { cliente: '', telefono: '', canal: 'mostrador' }; recargar('pedidos');
}

/* ================= sección: Inventario y compras ================= */
function renderInventario(vista) {
  $('#subtitulo').textContent = S.vistaStock ? 'Qué tienes, qué se acaba y qué hay que pedir' : 'Órdenes de compra al proveedor';
  $('#accionesCabecera').innerHTML = `
    <div class="sugerencias" style="padding:0">
      <button class="sugerencia ${S.vistaStock ? 'activo' : ''}" id="tabStock" style="${S.vistaStock ? 'border-color:var(--brand);color:var(--brand)' : ''}">📦 Stock</button>
      <button class="sugerencia ${!S.vistaStock ? 'activo' : ''}" id="tabCompras" style="${!S.vistaStock ? 'border-color:var(--brand);color:var(--brand)' : ''}">🧾 Compras</button>
    </div>`;
  $('#tabStock').onclick = () => { S.vistaStock = true; render(); };
  $('#tabCompras').onclick = () => { S.vistaStock = false; render(); };

  if (S.vistaStock) {
    const bajos = S.inventario.filter((i) => i.cantidad <= i.minimo);
    const valor = S.inventario.reduce((a, i) => a + i.cantidad * i.costo, 0);
    const items = S.inventario.length ? S.inventario.map((i) => {
      const bajo = i.cantidad <= i.minimo;
      const meta = i.minimo * 2 || 1;
      const avance = Math.max(0, Math.min(1, i.cantidad / meta)) * 100;
      return `<div class="fila" data-inv="${i.id}">
        <div class="crecer">
          <div style="display:flex;justify-content:space-between;gap:10px">
            <b>${esc(i.nombre)}</b><b style="color:${bajo ? 'var(--rojo)' : 'var(--brand)'}">${cant(i.cantidad)} ${esc(i.unidad)}</b>
          </div>
          <div class="barra-nivel ${bajo ? 'bajo' : ''}"><i style="width:${avance}%"></i></div>
          <div class="meta">Mínimo ${cant(i.minimo)} ${esc(i.unidad)}${i.proveedor ? ' · ' + esc(i.proveedor) : ''}${bajo ? ' · <b style="color:var(--rojo)">hay que comprar</b>' : ''}</div>
        </div>
        <button class="btn chico" data-inv-ajustar="${i.id}">Ajustar</button>
      </div>`;
    }).join('') : `<div class="vacio"><div class="emoji">📦</div><p>El inventario está vacío.</p><p style="font-size:13px">Toca <b>+ Producto</b> para agregar el primero.</p></div>`;

    vista.innerHTML = `
      <div class="rejilla">
        <div class="resumen"><div class="valor">${S.inventario.length}</div><div class="etq">Productos</div></div>
        <div class="resumen ${bajos.length ? 'rojo' : 'verde'}"><div class="valor">${bajos.length}</div><div class="etq">Bajo mínimo</div></div>
        <div class="resumen"><div class="valor">${money(valor)}</div><div class="etq">Valor del stock</div></div>
      </div>
      ${bajos.length ? `<div class="aviso-bajo"><div class="titulo">⚠️ Se está acabando: ${bajos.map((b) => esc(b.nombre)).join(', ')}</div>
        <button class="btn primario chico" id="btnComprarBajos">🧾 Armar pedido al proveedor</button></div>` : ''}
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn primario" id="btnNuevaCompra">🧾 Nueva compra</button>
        <button class="btn" id="btnNuevoProducto">+ Producto</button>
      </div>
      <div class="lista">${items}</div>`;

    $('#btnNuevoProducto').onclick = dialogoNuevoProducto;
    $('#btnNuevaCompra').onclick = () => dialogoNuevaCompra(S.inventario);
    if ($('#btnComprarBajos')) $('#btnComprarBajos').onclick = () => dialogoNuevaCompra(S.inventario);
    $$('[data-inv-ajustar]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); dialogoAjuste(+b.dataset.invAjustar); });
    $$('[data-inv]').forEach((f) => f.onclick = () => dialogoAjuste(+f.dataset.inv));
  } else {
    const compras = S.compras.length ? S.compras.map((c) => `
      <div class="fila" style="align-items:flex-start;flex-direction:column">
        <div style="display:flex;width:100%;gap:10px;align-items:center">
          <div class="crecer"><div class="titulo">#${c.id} · ${esc(c.proveedor)}</div>
            <div class="meta">${c.items.length} producto(s) · ${hace(c.creado_en)}</div></div>
          <span class="monto">${money(c.total)}</span>
          <span class="chip ${esc(c.estado)}">${esc(c.estado)}</span>
        </div>
        <div style="width:100%">
          ${c.items.map((i) => `<div style="display:flex;justify-content:space-between;font-size:13px;color:#43554f"><span>${cant(i.cantidad)} × ${esc(i.nombre)}</span><span>${money(Number(i.cantidad) * Number(i.costo_unitario))}</span></div>`).join('')}
          ${c.estado !== 'recibida' ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <button class="btn primario chico" data-recibir="${c.id}">Marcar recibida (suma al stock)</button>
            <button class="btn chico" data-lista="${c.id}">📋 Copiar lista de compra</button></div>` : ''}
        </div>
      </div>`).join('') : `<div class="vacio"><div class="emoji">🧾</div><p>No hay órdenes de compra.</p><p style="font-size:13px">Toca <b>Nueva compra</b> para armar una.</p></div>`;

    vista.innerHTML = `<button class="btn primario" id="btnNuevaCompra2" style="margin-bottom:12px">🧾 Nueva compra</button><div class="lista">${compras}</div>`;
    $('#btnNuevaCompra2').onclick = () => dialogoNuevaCompra(S.inventario);
    $$('[data-recibir]').forEach((b) => b.onclick = async () => {
      const { error } = await db.rpc('compra_recibir', { p_compra_id: +b.dataset.recibir });
      if (error) return toast(error.message, true);
      toast('Compra recibida. Stock actualizado.'); recargar('inventario');
    });
    $$('[data-lista]').forEach((b) => b.onclick = () => copiarListaCompra(+b.dataset.lista));
  }
}

function textoLineasCompra(c) {
  return c.items.map((i) => `• ${cant(i.cantidad)} × ${i.nombre}`).join('\n');
}

// Copiamos la lista para pegarla donde la necesites (notas, carrito del súper, etc.).
async function copiarListaCompra(id) {
  const c = S.compras.find((x) => x.id === id);
  if (!c) return;
  try {
    await navigator.clipboard.writeText(`Lista de compra #${c.id} · ${c.proveedor}\n${textoLineasCompra(c)}`);
    toast('Lista copiada. Ya puedes pegarla donde quieras.');
  } catch { toast('No se pudo copiar. Usa localhost o https.', true); }
}

function dialogoAjuste(id) {
  const i = S.inventario.find((x) => x.id === id);
  if (!i) return;
  abrirModal(`
    <h3>${esc(i.nombre)}</h3>
    <p class="meta">Hay ${cant(i.cantidad)} ${esc(i.unidad)} · mínimo ${cant(i.minimo)}${i.costo ? ' · costo ' + money(i.costo) : ''}</p>
    <label class="campo" style="margin-top:14px"><span>Movimiento</span>
      <select id="ajTipo"><option value="entrada">Llegó mercadería (entrada)</option><option value="salida">Salió / se usó (salida)</option></select></label>
    <label class="campo"><span>Cantidad (${esc(i.unidad)})</span><input id="ajCantidad" type="number" step="0.01" placeholder="Ej. 50" /></label>
    <label class="campo"><span>Motivo (opcional)</span><input id="ajMotivo" placeholder="Ej. compra, venta, merma" /></label>
    <hr style="border:none;border-top:1px solid var(--linea);margin:14px 0" />
    <p class="meta" style="margin:0 0 8px"><b>Editar producto</b></p>
    <div class="linea-form">
      <label class="campo" style="flex:1;margin:0"><span>Mínimo</span><input id="ajMinimo" type="number" step="0.01" value="${i.minimo}" /></label>
      <label class="campo" style="flex:1;margin:0"><span>Costo</span><input id="ajCosto" type="number" step="0.01" value="${i.costo || ''}" /></label>
    </div>
    <label class="campo"><span>Proveedor</span><input id="ajProveedor" value="${esc(i.proveedor ?? '')}" /></label>
    <div class="acciones">
      <button class="btn rojo" id="ajEliminar" style="margin-right:auto">Eliminar</button>
      <button class="btn" onclick="cerrarModal()">Cerrar</button>
      <button class="btn" id="ajGuardarEdit">Guardar datos</button>
      <button class="btn primario" id="ajRegistrar">Registrar movimiento</button>
    </div>`);

  $('#ajRegistrar').onclick = async () => {
    const c = num($('#ajCantidad').value);
    if (!c || c <= 0) return toast('Escribe una cantidad mayor que cero.', true);
    const { error } = await db.rpc('inventario_registrar', {
      p_inventario_id: i.id, p_tipo: $('#ajTipo').value, p_cantidad: c, p_motivo: $('#ajMotivo').value.trim() || null,
    });
    if (error) return toast(error.message, true);
    toast('Movimiento registrado.'); cerrarModal(); recargar('inventario');
  };
  $('#ajEliminar').onclick = async () => {
    if (!confirm(`¿Eliminar "${i.nombre}" del inventario? Se borra también su historial de movimientos.`)) return;
    const { error } = await db.from('inventario').delete().eq('id', i.id);
    if (error) return toast(error.message, true);
    toast('Producto eliminado.'); cerrarModal(); recargar('inventario');
  };
  $('#ajGuardarEdit').onclick = async () => {
    const { error } = await db.from('inventario').update({
      minimo: num($('#ajMinimo').value) ?? i.minimo,
      costo_ultima_compra: num($('#ajCosto').value),
      proveedor: $('#ajProveedor').value.trim(),
      actualizado_en: new Date().toISOString(),
    }).eq('id', i.id);
    if (error) return toast(error.message, true);
    toast('Producto actualizado.'); cerrarModal(); recargar('inventario');
  };
}

function dialogoNuevoProducto() {
  abrirModal(`
    <h3>Nuevo producto de inventario</h3>
    <label class="campo"><span>Producto</span><input id="npNombre" placeholder="Ej. Tortillas" /></label>
    <div class="linea-form">
      <label class="campo" style="flex:1;margin:0"><span>Cantidad inicial</span><input id="npCant" type="number" step="0.01" value="0" /></label>
      <label class="campo" style="flex:1;margin:0"><span>Mínimo</span><input id="npMin" type="number" step="0.01" value="5" /></label>
    </div>
    <label class="campo"><span>Unidad</span><select id="npUnidad">${UNIDADES.map((u) => `<option>${u}</option>`).join('')}</select></label>
    <label class="campo"><span>Proveedor (opcional)</span><input id="npProv" /></label>
    <label class="campo"><span>Costo por unidad (opcional)</span><input id="npCosto" type="number" step="0.01" /></label>
    <div class="acciones">
      <button class="btn" onclick="cerrarModal()">Cancelar</button>
      <button class="btn primario" id="npProdGuardar">Agregar</button>
    </div>`);
  $('#npProdGuardar').onclick = async () => {
    const nombre = $('#npNombre').value.trim();
    if (!nombre) return toast('Escribe el nombre del producto.', true);
    const { error } = await db.from('inventario').insert({
      nombre, cantidad: num($('#npCant').value) || 0, minimo: num($('#npMin').value) || 0,
      unidad: $('#npUnidad').value, proveedor: $('#npProv').value.trim() || null, costo_ultima_compra: num($('#npCosto').value),
    });
    if (error) return toast(error.message, true);
    toast('Producto agregado.'); cerrarModal(); recargar('inventario');
  };
}

let lineasCompra = [];
function dialogoNuevaCompra(inventario) {
  if (!inventario.length) return toast('Primero agrega productos al inventario.', true);
  const bajos = inventario.filter((i) => i.cantidad <= i.minimo);
  const base = bajos.length ? bajos : [inventario[0]];
  lineasCompra = base.map((i) => ({ inventario_id: i.id, nombre: i.nombre, cantidad: Math.max(1, Math.ceil(Math.max(i.minimo * 2 - i.cantidad, i.minimo))), costo: i.costo || 0 }));
  const provs = [...new Set(bajos.map((i) => i.proveedor).filter(Boolean))];
  const proveedorSug = provs.length === 1 ? provs[0] : '';
  pintarCompra(proveedorSug);
}

function pintarCompra(proveedor = '') {
  const items = S.inventario;
  const filas = lineasCompra.map((l, i) => `
    <div class="linea-form">
      <label class="campo" style="flex:3.4;margin:0"><span>Producto</span>
        <select data-ci="${i}" data-campo="inventario_id">
          ${items.map((it) => `<option value="${it.id}" ${it.id === l.inventario_id ? 'selected' : ''}>${esc(it.nombre)}</option>`).join('')}
        </select></label>
      <label class="campo" style="flex:1.3;margin:0"><span>Cant.</span>
        <input data-ci="${i}" data-campo="cantidad" type="number" step="0.01" value="${l.cantidad}" /></label>
      <label class="campo" style="flex:1.4;margin:0"><span>Costo</span>
        <input data-ci="${i}" data-campo="costo" type="number" step="0.01" value="${l.costo}" /></label>
      <button class="btn chico x" data-cquitar="${i}">✕</button>
    </div>`).join('');

  const total = lineasCompra.reduce((a, l) => a + (num(l.cantidad) || 0) * (num(l.costo) || 0), 0);

  abrirModal(`
    <h3>Nueva orden de compra</h3>
    <label class="campo"><span>Proveedor</span><input id="cProv" value="${esc(proveedor)}" placeholder="Nombre del proveedor" /></label>
    <div id="cFilas">${filas}</div>
    <button class="btn chico" id="cAdd">+ Agregar producto</button>
    <div class="fila" style="margin-top:14px;justify-content:space-between"><b>Total estimado</b><span class="monto" id="cTotal">${money(total)}</span></div>
    <div class="acciones">
      <button class="btn" onclick="cerrarModal()">Cancelar</button>
      <button class="btn primario" id="cGuardar">Crear orden</button>
    </div>`);

  $$('#cFilas [data-ci]').forEach((inp) => inp.oninput = () => {
    const l = lineasCompra[+inp.dataset.ci];
    if (inp.dataset.campo === 'inventario_id') {
      const it = items.find((x) => x.id === +inp.value);
      l.inventario_id = it.id; l.nombre = it.nombre; l.costo = num(l.costo) || it.costo || 0;
    } else l[inp.dataset.campo] = inp.value;
    $('#cTotal').textContent = money(lineasCompra.reduce((a, x) => a + (num(x.cantidad) || 0) * (num(x.costo) || 0), 0));
  });
  $$('[data-cquitar]').forEach((b) => b.onclick = () => { lineasCompra.splice(+b.dataset.cquitar, 1); pintarCompra($('#cProv')?.value ?? ''); });
  $('#cAdd').onclick = () => { const it = items[0]; lineasCompra.push({ inventario_id: it.id, nombre: it.nombre, cantidad: 1, costo: it.costo || 0 }); pintarCompra($('#cProv').value); };
  $('#cGuardar').onclick = async () => {
    const lineas = lineasCompra.map((l) => ({ nombre: l.nombre, inventario_id: l.inventario_id, cantidad: num(l.cantidad) || 0, costo: num(l.costo) || 0 })).filter((l) => l.cantidad > 0);
    if (!lineas.length) return toast('Agrega al menos un producto con cantidad.', true);
    const { error } = await db.rpc('compra_crear', { p_proveedor: $('#cProv').value.trim() || null, p_items: lineas });
    if (error) return toast(error.message, true);
    toast('Orden de compra creada.'); cerrarModal(); S.vistaStock = false; recargar('inventario');
  };
}

/* ================= asistente (datos) ================= */
async function crearCompraSugerida() {
  const bajos = S.inventario.filter((i) => i.cantidad <= i.minimo);
  if (!bajos.length) return 'Nada está por debajo del mínimo, no hace falta pedir nada todavía.';
  const items = bajos.map((i) => ({ nombre: i.nombre, inventario_id: i.id, cantidad: Math.max(1, Math.ceil(Math.max(i.minimo * 2 - i.cantidad, i.minimo))), costo: i.costo || 0 }));
  const { data, error } = await db.rpc('compra_crear', { p_proveedor: bajos[0].proveedor ?? null, p_items: items });
  if (error) return 'No pude crear la compra: ' + error.message;
  const total = items.reduce((a, l) => a + l.cantidad * l.costo, 0);
  return `Listo, armé la orden de compra #${data} con ${items.length} producto(s)${bajos[0].proveedor ? ' para ' + bajos[0].proveedor : ''}, por unos ${money(total)}. Ya está en Inventario y compras.`;
}

/* ================= sección: Asistente ================= */
function renderAsistente(vista) {
  $('#subtitulo').textContent = 'Habla o escribe; te respondo al instante';
  $('#accionesCabecera').innerHTML = `<button class="btn chico" id="btnLeer">${S.leerVoz ? '🔊 Voz activada' : '🔇 Voz silenciada'}</button>`;
  $('#btnLeer').onclick = () => { S.leerVoz = !S.leerVoz; renderAsistente(vista); };

  const sugerencias = ['¿Cuántos pedidos tengo?', '¿Cuánto vendí hoy?', '¿Qué se está acabando?', 'Anota que llegaron 50 tortillas', 'Hay que comprar, haz el pedido'];

  vista.innerHTML = `
    <div class="asistente">
      <div class="charla" id="charla"></div>
      ${S.charla.length ? '' : `<div class="sugerencias" id="sug">${sugerencias.map((s) => `<button class="sugerencia">${esc(s)}</button>`).join('')}</div>`}
      <div class="estado-voz" id="estadoVoz">${S.escuchando ? 'Te escucho…' : 'Toca el micrófono y habla, o escribe abajo.'}</div>
      <div class="barra-voz">
        <input id="vozTexto" placeholder="Ej. anota que llegaron 50 tortillas" />
        <button class="btn primario" id="vozEnviar">Enviar</button>
        <button class="mic ${S.escuchando ? 'escuchando' : ''}" id="vozMic" title="Hablar">${S.escuchando ? '⏹' : '🎤'}</button>
      </div>
    </div>`;

  pintarCharla();
  if ($('#sug')) $$('#sug .sugerencia').forEach((b) => b.onclick = () => enviarAsistente(b.textContent));
  $('#vozEnviar').onclick = enviarDesdeInput;
  $('#vozTexto').addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarDesdeInput(); });
  $('#vozMic').onclick = alternarMicro;
}

function pintarCharla(parcial = '') {
  const c = $('#charla');
  if (!c) return;
  c.innerHTML = S.charla.map((m) => `<div class="burbuja ${m.yo ? 'yo' : 'bot'}">${esc(m.texto)}</div>`).join('')
    + (parcial ? `<div class="burbuja yo parcial">${esc(parcial)}</div>` : '');
  c.scrollTop = c.scrollHeight;
}

function enviarDesdeInput() {
  const inp = $('#vozTexto');
  const t = inp.value.trim();
  if (!t) return;
  inp.value = '';
  enviarAsistente(t);
}

async function enviarAsistente(texto) {
  if (S.ocupado) return;
  S.ocupado = true;
  if ($('#sug')) $('#sug').remove();
  S.charla.push({ yo: true, texto });
  pintarCharla();
  const resp = await asistenteResponder(texto);
  S.charla.push({ yo: false, texto: resp });
  pintarCharla();
  S.ocupado = false;
  if (S.leerVoz) hablar(resp);
}

/* ---------- voz ---------- */
let reconocimiento = null;
function conectarVoz() {
  if (reconocimiento) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return; // sin micrófono: se usa el campo de texto
  reconocimiento = new SR();
  reconocimiento.lang = 'es-419';
  reconocimiento.interimResults = true;
  reconocimiento.continuous = false;
  reconocimiento.onresult = (e) => {
    let parcial = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript; else parcial += r[0].transcript;
    }
    if (parcial) pintarCharla(parcial);
    if (final.trim()) { pintarCharla(); enviarAsistente(final.trim()); }
  };
  reconocimiento.onerror = (e) => { S.escuchando = false; actualizarBotonMic(); toast('Micrófono: ' + e.error, true); };
  reconocimiento.onend = () => { S.escuchando = false; actualizarBotonMic(); };
}

function actualizarBotonMic() {
  const b = $('#vozMic');
  if (b) { b.classList.toggle('escuchando', S.escuchando); b.textContent = S.escuchando ? '⏹' : '🎤'; }
  const e = $('#estadoVoz');
  if (e) e.textContent = S.escuchando ? 'Te escucho…' : 'Toca el micrófono y habla, o escribe abajo.';
}

function alternarMicro() {
  if (!reconocimiento) { toast('Este navegador no permite micrófono. Escribe la orden.', true); return; }
  if (S.escuchando) { reconocimiento.stop(); S.escuchando = false; actualizarBotonMic(); return; }
  try { reconocimiento.start(); S.escuchando = true; actualizarBotonMic(); }
  catch { S.escuchando = false; actualizarBotonMic(); }
}

function hablar(texto) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-419';
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch { /* sin voz, no pasa nada */ }
}

/* ---------- cerebro del asistente ---------- */

function numeroEn(f) {
  const m = f.match(/(\d+(?:[.,]\d+)?)/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  const palabras = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100 };
  for (const [p, v] of Object.entries(palabras)) if (new RegExp(`(^|\\s)${p}(\\s|$)`).test(f)) return v;
  return null;
}

function buscarItem(items, f) {
  const palabras = f.split(' ').filter((p) => p.length >= 4);
  let mejor = null, mejorPuntos = 0;
  for (const i of items) {
    const n = norm(i.nombre);
    if (!n) continue;
    const raiz = n.endsWith('s') && n.length > 4 ? n.slice(0, -1) : n;
    let puntos = 0;
    if (f.includes(n)) puntos = 100;
    else if (f.includes(raiz)) puntos = 80;
    else for (const p of palabras) {
      const pr = p.endsWith('s') && p.length > 4 ? p.slice(0, -1) : p;
      if (raiz.startsWith(pr) || pr.startsWith(raiz)) puntos += 10;
    }
    if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = i; }
  }
  return mejorPuntos >= 10 ? mejor : null;
}

const AYUDA = 'Puedo ayudarte así: “¿cuántos pedidos tengo?”, “¿cuánto vendí hoy?”, “¿qué se está acabando?”, “¿cuántas tortillas tengo?”, “anota que llegaron 50 tortillas” o “hay que comprar, haz el pedido”.';

async function asistenteResponder(frase) {
  const f = norm(frase);
  if (!f) return AYUDA;
  try {
    await cargarInventario();
    await cargarPedidos();
    const items = S.inventario;

    const esEntrada = /llegaron|llego|entraron|entrada|recibi|compramos|compre/.test(f);
    const esSalida = /usaron|se uso|gastaron|salieron|salida|ocuparon|se vendieron|acabaron|consumieron/.test(f);
    if (esEntrada || esSalida) return await registrarPorVoz(f, esEntrada ? 'entrada' : 'salida');

    if (/pedido|orden/.test(f)) {
      if (/cuant|pendiente|tengo/.test(f)) return resumenPedidos();
      if (/hoy|ultim|muestra|lista/.test(f)) return ultimosPedidos();
    }
    if (/vendi|venta|plata|ingreso/.test(f)) return ventasHoy();

    if (/(compra|comprar|pedido)/.test(f) && /(hay que|haz|hacer|suger|proveedor|acabando)/.test(f)) return await crearCompraSugerida();
    if (/acabando|agotando|bajo|falta/.test(f)) return bajos();
    if (/cuant|tengo|hay|existencia/.test(f)) {
      const it = buscarItem(items, f);
      if (it) return `Tienes ${cant(it.cantidad)} ${it.unidad} de ${it.nombre}.${it.cantidad <= it.minimo ? ` Está por debajo del mínimo de ${cant(it.minimo)}.` : ''}`;
    }
    if (/inventario|existencia/.test(f)) return items.length ? 'En tu inventario tienes: ' + items.slice(0, 6).map((i) => `${i.nombre} ${cant(i.cantidad)} ${i.unidad}`).join(', ') + '.' : 'Tu inventario está vacío.';
    return 'No entendí bien. ' + AYUDA;
  } catch (e) {
    return 'No pude completar eso: ' + (e?.message ?? e);
  }
}

async function registrarPorVoz(f, tipo) {
  const items = S.inventario;
  if (!items.length) return 'Tu inventario está vacío. Agrega productos primero.';
  const it = buscarItem(items, f);
  const c = numeroEn(f);
  if (!it) return 'No encontré ese producto. Los que tienes son: ' + items.slice(0, 6).map((i) => i.nombre).join(', ') + '.';
  if (!c || c <= 0) return `¿Cuánto${tipo === 'entrada' ? ' llegó' : ' salió'} de ${it.nombre}? Dime por ejemplo “anota que llegaron 50 ${it.nombre}”.`;
  const { error } = await db.rpc('inventario_registrar', { p_inventario_id: it.id, p_tipo: tipo, p_cantidad: c, p_motivo: 'Dictado por voz' });
  if (error) return 'No pude registrarlo: ' + error.message;
  const nuevo = tipo === 'entrada' ? it.cantidad + c : Math.max(0, it.cantidad - c);
  await cargarInventario();
  return `${tipo === 'entrada' ? 'Anoté la entrada de' : 'Anoté la salida de'} ${cant(c)} ${it.unidad} de ${it.nombre}. Ahora tienes ${cant(nuevo)} ${it.unidad}.${nuevo <= it.minimo ? ' Ojo, quedó en el mínimo: conviene comprar.' : ''}`;
}

function resumenPedidos() {
  const activos = S.pedidos.filter((p) => p.estado === 'pendiente' || p.estado === 'preparando');
  if (!S.pedidos.length) return 'Todavía no hay pedidos registrados.';
  if (!activos.length) return `No tienes pedidos activos. En total hay ${S.pedidos.length} pedidos.`;
  const pend = activos.filter((p) => p.estado === 'pendiente').length;
  return `Tienes ${activos.length} pedido(s) activos: ${pend} pendientes y ${activos.length - pend} en preparación.`;
}
function ultimosPedidos() {
  const hoy = S.pedidos.filter((p) => mismoDia(fecha(p.creado_en), new Date()));
  const lista = (hoy.length ? hoy : S.pedidos).slice(0, 5);
  if (!lista.length) return 'No hay pedidos para mostrar.';
  return 'Estos son los últimos pedidos: ' + lista.map((p) => `#${p.id} ${p.cliente} (${p.estado}, ${money(p.total)})`).join('; ') + '.';
}
function ventasHoy() {
  const hoy = S.pedidos.filter((p) => mismoDia(fecha(p.creado_en), new Date()) && p.estado !== 'cancelado');
  const total = hoy.reduce((a, p) => a + (Number(p.total) || 0), 0);
  if (!hoy.length) return 'Hoy todavía no registras ventas.';
  return `Hoy llevas ${hoy.length} pedido(s) por ${money(total)}.`;
}
function bajos() {
  const b = S.inventario.filter((i) => i.cantidad <= i.minimo);
  if (!b.length) return 'Por ahora nada está por debajo del mínimo. Todo en orden.';
  return 'Se está acabando: ' + b.slice(0, 6).map((i) => `${i.nombre} (quedan ${cant(i.cantidad)} ${i.unidad})`).join(', ') + (b.length > 6 ? ` y ${b.length - 6} más` : '') + '.';
}

/* ================= sección: Clientes ================= */
function renderClientes(vista) {
  const conPedidos = S.clientes.filter((c) => c.pedidos.length);
  const mejor = [...conPedidos].sort((a, b) => b.gastado - a.gastado)[0];
  const recurrentes = S.clientes.filter((c) => c.pedidos.length >= 2).length;

  $('#subtitulo').textContent = 'Quiénes te compran y cuánto';
  $('#accionesCabecera').innerHTML = '';

  if (!S.clientes.length) {
    vista.innerHTML = `<div class="vacio"><div class="emoji">👥</div>
      <p><b>Todavía no hay clientes.</b></p>
      <p style="font-size:13px">Se agregan solos cuando registras un pedido con el nombre del cliente.</p></div>`;
    return;
  }

  vista.innerHTML = `
    <div class="rejilla">
      <div class="resumen"><div class="valor">${S.clientes.length}</div><div class="etq">Clientes</div></div>
      <div class="resumen verde"><div class="valor">${recurrentes}</div><div class="etq">Clientes que repiten</div></div>
      <div class="resumen"><div class="valor" style="font-size:20px">${mejor ? esc(mejor.nombre) : '—'}</div><div class="etq">Mejor cliente${mejor ? ' · ' + money(mejor.gastado) : ''}</div></div>
    </div>
    <input id="buscarCliente" type="search" class="buscador" placeholder="Buscar por nombre o teléfono" value="${esc(S.busquedaCliente)}" />
    <div class="lista" id="listaClientes"></div>`;

  $('#buscarCliente').oninput = (e) => { S.busquedaCliente = e.target.value; pintarListaClientes(); };
  pintarListaClientes();
}

function pintarListaClientes() {
  const cont = $('#listaClientes');
  if (!cont) return;
  const q = norm(S.busquedaCliente);
  const lista = S.clientes
    .filter((c) => !q || norm(`${c.nombre} ${c.telefono ?? ''}`).includes(q))
    .sort((a, b) => (b.gastado - a.gastado) || String(a.nombre).localeCompare(b.nombre));

  cont.innerHTML = lista.length ? lista.map((c) => `
    <div class="fila" data-cliente="${c.id}">
      <div class="avatar">${esc((c.nombre || '?').trim().charAt(0).toUpperCase())}</div>
      <div class="crecer">
        <div class="titulo">${esc(c.nombre)}</div>
        <div class="meta">${c.telefono ? esc(c.telefono) + ' · ' : ''}${c.pedidos.length} pedido(s)${c.ultimo ? ' · último ' + hace(c.ultimo).toLowerCase() : ''}</div>
      </div>
      <span class="monto">${money(c.gastado)}</span>
    </div>`).join('') : `<div class="vacio"><div class="emoji">🔎</div><p>No encontré a nadie con ese nombre.</p></div>`;

  $$('[data-cliente]', cont).forEach((f) => f.onclick = () => dialogoCliente(+f.dataset.cliente));
}

function dialogoCliente(id) {
  const c = S.clientes.find((x) => x.id === id);
  if (!c) return;
  const tel = (c.telefono || '').replace(/[^\d+]/g, '');
  const historial = c.pedidos.length
    ? c.pedidos.slice(0, 8).map((p) => `<div class="fila"><div class="crecer"><div class="titulo">#${p.id}</div><div class="meta">${hace(p.creado_en)} · ${esc(p.tipo ?? '—')}</div></div><span class="monto">${money(p.total)}</span><span class="chip ${esc(p.estado)}">${esc(p.estado)}</span></div>`).join('')
    : '<p class="meta">Este cliente todavía no tiene pedidos.</p>';

  abrirModal(`
    <h3>${esc(c.nombre)}</h3>
    <p class="meta">${c.telefono ? esc(c.telefono) + ' · ' : ''}${c.pedidos.length} pedido(s) · ${money(c.gastado)} en compras</p>
    <p class="meta" style="margin:14px 0 6px"><b>Últimos pedidos</b></p>
    <div class="lista">${historial}</div>
    <div class="acciones">
      ${tel ? `<a class="btn" href="tel:${esc(tel)}" style="text-decoration:none">📞 Llamar</a>` : ''}
      <button class="btn" onclick="cerrarModal()">Cerrar</button>
      <button class="btn primario" id="clNuevoPedido">+ Nuevo pedido</button>
    </div>`);

  $('#clNuevoPedido').onclick = () => {
    camposTemp = { cliente: c.nombre, telefono: c.telefono ?? '', canal: 'mostrador' };
    lineasPedido = [{ nombre: '', cantidad: 1, precio: '' }];
    pintarNuevoPedido();
  };
}

/* ================= realtime ================= */
function suscribirRealtime() {
  const seccionDePedidos = () => (S.seccion === 'asistente' || S.seccion === 'clientes' ? S.seccion : 'pedidos');
  S._canal = db.channel('vendi-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => { if (S.seccion !== 'inventario') recargar(seccionDePedidos()); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, () => { if (S.seccion === 'inventario') recargar('inventario'); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'compras' }, () => { if (S.seccion === 'inventario') recargar('inventario'); })
    .subscribe();
}

/* ================= arranque ================= */
window.cerrarModal = cerrarModal;
arrancar();
