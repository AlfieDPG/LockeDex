// Sección «Versus»: el marcador compartido de un locke.
//
// Creas un locke, le pones nombre, tipo, juego y vidas, y eliges a qué amigos invitas. Hasta
// que no aceptan (desde las notificaciones) salen marcados como pendientes. A partir de ahí
// todos veis el mismo marcador: si uno pierde una vida la quita y a los demás les cambia en
// pantalla al momento.
//
// Cada locke tiene el lápiz, que abre la misma ventana que «Nuevo locke» ya rellena, y (solo
// para quien lo creó) la papelera. En la ventana quien lo creó cambia los datos del principio
// o lo borra, y cualquiera de dentro puede meter a más gente o echar a quien no ha contestado.
//
// Aquí solo está la pantalla. Los datos y las escrituras están en js/comun/lockes.js.

import { icono } from "../comun/iconos.js";
import { escaparHTML, fechaLarga } from "../comun/utilidades.js";
import { hayNube, usuarioActual } from "../comun/nube.js";
import { escribir } from "../comun/almacen.js";
import { CLAVES_JUEGO } from "../comun/selector-juego.js";
import {
  plantillaCampoJuego, activarCamposJuego, leerCampoJuego, nombreJuego, juegoConDatos
} from "../comun/campo-juego.js";
import { irA } from "../navegacion.js";
import {
  rutasPropias, capsPropios, copiaRutasParaLocke, copiaCapsParaLocke
} from "../comun/personalizados.js";
import { iniciarCementerio, abrirCementerio, abrirMuerte, totalMuertos } from "./cementerio.js";
import { iniciarActividad, abrirActividad } from "./actividad.js";
import {
  ID_GENERALES, NOMBRE_GENERALES, conjuntos, copiaParaLocke, normasDeLocke, normasCompletas
} from "../comun/normas.js";
import {
  tiposDe, miPerfilOProvisional, fallaElPerfil, amigosAceptados, perfilesDe, fallaLasAmistades
} from "../comun/perfiles.js";
import {
  alCambiarLockes, misLockes, invitacionesALockes, estadoDe, fallaLosLockes, soyCreador,
  crearLocke, editarLocke, invitarALocke, quitarDeLocke, sePuedenCambiarVidas,
  cambiarNumero, borrarLocke, lockePorId, estaEliminado, combatesDe, victoriasDe
} from "../comun/lockes.js";
import {
  iniciarCombates, plantillaCombates, plantillaRom, plantillaSalon, abrirCombate, abrirTerminar, abrirSalon,
  alternarRom
} from "./combates.js";
import { iniciarPartida, plantillaPartida, accionPartida } from "./partida.js";

let seccion = null;
let lista = null;
let aviso = null;
let dialogo = null;
let botonNuevo = null;

const VIDAS_POR_DEFECTO = 10;
const MOSTRAR_DE_ENTRADA = 5; // lockes que se ven sin pulsar «Ver todos»
let verTodos = false;

let invitables = []; // perfiles que salen para invitar, para copiar su nombre y su foto
let elegidos = [];   // los que se van a meter al guardar (perfiles)
let dialogoElegir = null;
let editando = null; // id del locke que se está editando, o null si se está creando uno

function colorSeguro(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : "#3498db";
}

// ---------- Pintar ----------
//
// Cada jugador tiene dos cifras con su etiqueta: Victorias (los combates ganados contra los
// demás) y Vidas. Los botones de +/- solo salen en TU bloque: las de los demás se ven pero
// no se tocan (y aunque alguien lo intentase a mano, las reglas de Firestore lo rechazan).

function botonesCifra(campo, editable, contenido, textoMenos, textoMas) {
  if (!editable) return `<span class="locke-valor">${contenido}</span>`;
  return `
    <button class="menos" data-campo="${campo}" aria-label="${textoMenos}" title="${textoMenos}">${icono("menos")}</button>
    <span class="locke-valor">${contenido}</span>
    <button class="mas" data-campo="${campo}" aria-label="${textoMas}" title="${textoMas}">${icono("mas")}</button>`;
}

// Con combates, las victorias son los combates ganados: no se suman a mano
function plantillaCifras(locke, uid, editable) {
  const victorias = victoriasDe(locke, uid);
  const victoriasAMano = editable && !combatesDe(locke).length;
  const vidas = locke.vidasIlimitadas ? "∞" : (locke.vidas || {})[uid] || 0;

  // Fuera del locke (perdió la vida cero): las victorias se quedan como estaban y en las vidas,
  // una calavera. Solo le queda el «+», por si fue sin querer.
  if (estaEliminado(locke, uid)) {
    return `
      <div class="locke-cifras">
        <div class="locke-cifra victorias">
          <span class="locke-etiqueta">${icono("espadas")} Victorias</span>
          <div class="locke-numero marcador">${botonesCifra("marcador", false, victorias)}</div>
        </div>
        <div class="locke-cifra vidas">
          <span class="locke-etiqueta">${icono("corazon")} Vidas</span>
          <div class="locke-numero vidas">
            <span class="locke-valor locke-sin-vidas">${icono("calavera")}</span>
            ${editable ? `<button class="mas" data-campo="vidas" aria-label="Recuperar la vida cero" title="Recuperar la vida cero">${icono("mas")}</button>` : ""}
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="locke-cifras">
      <div class="locke-cifra victorias">
        <span class="locke-etiqueta">${icono("espadas")} Victorias</span>
        <div class="locke-numero marcador">
          ${botonesCifra("marcador", victoriasAMano, victorias, "Quitar una victoria", "Sumar una victoria")}
        </div>
      </div>
      <div class="locke-cifra vidas ${locke.vidasIlimitadas ? "ilimitadas" : ""} ${vidas === 0 ? "vida-cero" : ""}">
        <span class="locke-etiqueta">${icono("corazon")} Vidas</span>
        <div class="locke-numero vidas">
          ${botonesCifra("vidas", editable && !locke.vidasIlimitadas, vidas, vidas === 0 ? "Perder la vida cero" : "Quitar una vida", "Sumar una vida")}
        </div>
      </div>
    </div>`;
}

function plantillaJugador(locke, uid) {
  const usuario = usuarioActual();
  const nombre = escaparHTML((locke.nombres || {})[uid] || "Jugador");
  const foto = (locke.fotos || {})[uid] || "";
  const cerrado = locke.estado === "cerrado";
  const gano = locke.ganador === uid;
  const pendiente = estadoDe(locke, uid) === "pendiente";
  const esMio = uid === usuario.uid;
  const eliminado = !gano && estaEliminado(locke, uid);

  return `
    <div class="locke-jugador ${gano ? "ganador" : ""} ${pendiente ? "pendiente" : ""} ${esMio ? "mio" : ""} ${eliminado ? "eliminado" : ""}"
         data-uid="${escaparHTML(uid)}">
      <div class="locke-persona">
        <div class="locke-cara" data-perfil="${escaparHTML(uid)}" title="Ver perfil">
          ${foto ? `<img src="${escaparHTML(foto)}" alt="" referrerpolicy="no-referrer" data-respaldo="" data-quitar-si-falla>` : ""}
          ${eliminado ? `<span class="locke-cara-fuera">${icono("calavera")}</span>` : ""}
        </div>
        <span class="locke-quien">${nombre}${esMio ? ` <small>(tú)</small>` : ""}</span>
        ${gano ? `<span class="locke-corona">${icono("corona")}</span>` : ""}
        ${pendiente ? `<span class="locke-pendiente">Sin contestar</span>` : ""}
        ${eliminado ? `<span class="locke-eliminado">Eliminado</span>` : ""}
      </div>

      ${plantillaCifras(locke, uid, esMio && !cerrado)}
      ${esMio && !pendiente ? plantillaPartida(locke) : ""}
      ${pendiente ? "" : plantillaRom(locke, uid, esMio && !cerrado && !eliminado)}
      ${cerrado && !pendiente ? plantillaSalon(locke, uid, esMio) : ""}
    </div>`;
}

// Juego del locke y atajos: a sus Rutas y sus Level caps si es un juego de la web, a sus
// normas si tiene, a su cementerio y a su actividad
function plantillaJuego(locke) {
  const nombre = nombreJuego(locke);
  const normas = normasCompletas(normasDeLocke(locke)).length;

  const rutas = destinoDe(locke, "rutas");
  const caps = destinoDe(locke, "caps");
  const atajos = `
    ${rutas ? `<button class="locke-ir" data-ir="rutas" data-juego="${escaparHTML(rutas)}">${icono("mapa")} Rutas</button>` : ""}
    ${caps ? `<button class="locke-ir" data-ir="levelcaps" data-juego="${escaparHTML(caps)}">${icono("escudo")} Level caps</button>` : ""}`;

  return `
    <div class="locke-juego">
      ${nombre ? `<span class="locke-juego-nombre">${icono("mando")} ${escaparHTML(nombre)}</span>` : ""}
      ${atajos}
      ${normas ? `<button class="locke-ir" data-ir="normas">${icono("libro")} Normas (${normas})</button>` : ""}
      <button class="locke-ir" data-ir="cementerio">${icono("calavera")} Cementerio (${totalMuertos(locke)})</button>
      <button class="locke-ir" data-ir="actividad">${icono("actividad")} Actividad</button>
    </div>`;
}

function plantillaLocke(locke) {
  const cerrado = locke.estado === "cerrado";
  const tipo = locke.tipo || { nombre: "Locke", color: "#3498db" };

  // Cerrado sin ganador: nadie se pasó la ROM
  const resultado = !cerrado ? "" : locke.ganador
    ? `${icono("corona")} Ganó ${escaparHTML((locke.nombres || {})[locke.ganador] || "alguien")}`
    : `${icono("aspa")} Nadie ganó`;
  const fecha = cerrado && locke.fechaFin ? ` · ${escaparHTML(fechaLarga(locke.fechaFin))}` : "";

  // Un locke cerrado ya no se toca, salvo para que quien lo creó pueda borrarlo
  const puedeEditar = !cerrado || soyCreador(locke);

  return `
    <article class="locke ${cerrado ? "cerrado" : "abierto"}" data-id="${escaparHTML(locke.id)}"
             style="--color-locke: ${colorSeguro(tipo.color)}">
      <header class="locke-cabecera">
        <span class="locke-tipo">${escaparHTML(tipo.nombre)}</span>
        <h2 class="locke-titulo">${escaparHTML(locke.nombre)}</h2>
        ${cerrado ? `<span class="locke-resultado ${locke.ganador ? "" : "sin-ganador"}">${resultado}${fecha}</span>` : ""}
        <div class="locke-acciones">
          ${!cerrado && soyCreador(locke) ? `<button class="locke-terminar" title="Terminar el locke">${icono("corona")} Terminar</button>` : ""}
          ${puedeEditar ? `<button class="locke-editar" title="Editar locke">${icono("lapiz")}</button>` : ""}
          ${soyCreador(locke) ? `<button class="locke-borrar" title="Borrar locke">${icono("papelera")}</button>` : ""}
        </div>
      </header>

      ${plantillaJuego(locke)}
      ${locke.descripcion ? `<p class="locke-descripcion">${escaparHTML(locke.descripcion)}</p>` : ""}
      ${plantillaCombates(locke)}

      <div class="locke-jugadores">
        ${locke.jugadores.map((uid) => plantillaJugador(locke, uid)).join("")}
      </div>
    </article>`;
}

function pintar() {
  if (!hayNube() || !usuarioActual()) {
    lista.innerHTML = "";
    botonNuevo.hidden = true;
    aviso.textContent = "";
    return;
  }

  botonNuevo.hidden = false;

  const fallo = fallaLosLockes();
  const pendientes = invitacionesALockes().length;
  const mios = misLockes();

  if (fallo) aviso.textContent = fallo;
  else if (pendientes) {
    aviso.textContent = `Tienes ${pendientes} invitación${pendientes === 1 ? "" : "es"} sin contestar en las notificaciones (la campana de abajo).`;
  } else if (!mios.length) {
    aviso.textContent = "Todavía no tienes ningún locke. Crea uno con «Nuevo locke».";
  } else {
    aviso.textContent = "";
  }

  // Del más nuevo al más antiguo. Solo los MOSTRAR_DE_ENTRADA últimos; el resto detrás de
  // un botón que los despliega todos.
  const ordenados = [...mios].sort((uno, otro) => (otro.creado || 0) - (uno.creado || 0));
  const quedan = ordenados.length - MOSTRAR_DE_ENTRADA;
  const visibles = verTodos || quedan <= 0 ? ordenados : ordenados.slice(0, MOSTRAR_DE_ENTRADA);

  lista.innerHTML =
    visibles.map(plantillaLocke).join("") +
    (quedan > 0
      ? `<button class="versus-ver-mas">${icono(verTodos ? "menos" : "mas")} ${
          verTodos ? "Ver solo los últimos" : `Ver todos (${quedan} más)`
        }</button>`
      : "");
}

// ---------- Ventana de crear / editar ----------

// Si una de las casillas del diálogo no está (un index.html viejo en la caché del navegador
// junto a un JavaScript nuevo), se avisa en vez de reventar en silencio.
function campo(selector) {
  const elemento = dialogo.querySelector(selector);
  if (!elemento) throw new Error(`Falta ${selector} en index.html. Recarga con Ctrl+F5.`);
  return elemento;
}

// ---------- Integrantes ----------
//
// Todos como etiquetas en una fila: los que ya están, los que vas a meter (con el estilo de
// «sin contestar») y al final una etiqueta «+» que abre la lista de tus amigos.
//
// Con la X: quien creó el locke puede echar a cualquiera; los demás, solo a quien todavía
// no ha contestado (y con eso le desaparece la notificación).

function botonQuitar(clase, uid, titulo) {
  return `<button class="${clase}" data-uid="${escaparHTML(uid)}" title="${titulo}">${icono("aspa")}</button>`;
}

function plantillaIntegrantes(locke) {
  const cerrado = Boolean(locke && locke.estado === "cerrado");
  let html = "";

  if (locke) {
    const creador = soyCreador(locke);
    html += locke.jugadores
      .map((uid) => {
        const nombre = escaparHTML((locke.nombres || {})[uid] || "Jugador");
        const pendiente = estadoDe(locke, uid) === "pendiente";
        const sePuedeQuitar = !cerrado && uid !== locke.creador && (creador || pendiente);
        const quitar = sePuedeQuitar
          ? botonQuitar("locke-quitar", uid, pendiente ? "Quitar del locke" : "Expulsar del locke")
          : "";
        return `<span class="locke-dentro-uno ${pendiente ? "pendiente" : ""}">${nombre}${pendiente ? " <small>(sin contestar)</small>" : ""}${quitar}</span>`;
      })
      .join("");
  } else {
    const mio = miPerfilOProvisional();
    html += `<span class="locke-dentro-uno">${escaparHTML((mio && mio.nombre) || "Tú")} <small>(tú)</small></span>`;
  }

  html += elegidos
    .map(
      (perfil) =>
        `<span class="locke-dentro-uno pendiente">${escaparHTML(perfil.nombre)} <small>(por añadir)</small>${botonQuitar("locke-desmarcar", perfil.uid, "No añadir")}</span>`
    )
    .join("");

  if (!cerrado) {
    html += `<button class="locke-dentro-uno pendiente locke-anadir" title="Añadir gente">${icono("mas")}</button>`;
  }
  return html;
}

function pintarIntegrantes(locke) {
  campo(".locke-dentro").innerHTML = plantillaIntegrantes(locke);
}

// Amigos que se pueden meter: los que no están ya dentro. Se piden al abrir la ventana.
async function cargarInvitables(locke) {
  const yaDentro = new Set(locke ? locke.jugadores : []);
  const fuera = amigosAceptados().filter((amistad) => !yaDentro.has(amistad.otro));
  invitables = fuera.length ? [...(await perfilesDe(fuera.map((amistad) => amistad.otro))).values()] : [];
}

async function quitarDesdeElDialogo(uid) {
  const locke = editando ? lockePorId(editando) : null;
  if (!locke) return;

  // A quien ya juega se le pregunta: pierde sus vidas y victorias en este locke
  if (estadoDe(locke, uid) !== "pendiente") {
    const nombre = (locke.nombres || {})[uid] || "este jugador";
    if (!confirm(`¿Expulsar a ${nombre} de «${locke.nombre}»? Perderá sus vidas y victorias en este locke.`)) return;
  }

  await quitarDeLocke(locke.id, uid);
  const actualizado = lockePorId(locke.id);
  pintarIntegrantes(actualizado);
  await cargarInvitables(actualizado); // el expulsado vuelve a poder invitarse
}

// ---------- Normas ----------
//
// Un desplegable: las generales, tus conjuntos y, al editar, el del locke si tú no lo tienes
// (para no perderlo al guardar). Solo quien lo creó lo cambia.

const SIN_NORMAS = "";
const LAS_DEL_LOCKE = "__locke";

function pintarNormas(locke, creador) {
  const delLocke = normasDeLocke(locke);
  const mios = conjuntos();
  const loTengo = delLocke && (delLocke.id === ID_GENERALES || mios.some((conjunto) => conjunto.id === delLocke.id));

  let elegido = ID_GENERALES;
  if (delLocke) elegido = loTengo ? delLocke.id : LAS_DEL_LOCKE;
  // Un locke de antes de que hubiera normas: a quien lo creó se le proponen las generales
  else if (locke && !creador) elegido = SIN_NORMAS;

  const opcion = (valor, texto) =>
    `<option value="${escaparHTML(valor)}" ${valor === elegido ? "selected" : ""}>${escaparHTML(texto)}</option>`;

  campo(".locke-normas").innerHTML = `
    <select class="locke-normas-elegir" ${creador ? "" : "disabled"}>
      ${opcion(ID_GENERALES, NOMBRE_GENERALES)}
      ${mios.map((conjunto) => opcion(conjunto.id, conjunto.nombre)).join("")}
      ${delLocke && !loTengo ? opcion(LAS_DEL_LOCKE, `${delLocke.nombre} (la del locke)`) : ""}
      ${opcion(SIN_NORMAS, "Sin normas")}
    </select>`;
}

// Lo que se guarda en el locke: la copia del conjunto elegido (o null)
function normasElegidas(locke) {
  const valor = campo(".locke-normas-elegir").value;
  if (valor === SIN_NORMAS) return null;
  if (valor === LAS_DEL_LOCKE) return normasDeLocke(locke);
  return copiaParaLocke(valor);
}

// ---------- Rutas y level caps ----------
//
// Igual que las normas: las del juego (las de la web, si es uno de la web) o unas
// personalizadas tuyas, de las que el locke se lleva una copia. Al editar, también la que ya
// tenga el locke si tú no la tienes. Solo quien lo creó lo cambia.

const DEL_JUEGO = "";
const PERSONALIZADOS = {
  rutas: { campo: "rutasPropias", almacen: rutasPropias, copia: copiaRutasParaLocke, hueco: ".locke-rutas" },
  caps: { campo: "capsPropios", almacen: capsPropios, copia: copiaCapsParaLocke, hueco: ".locke-caps" }
};

function pintarPersonalizado(tipo, locke, creador) {
  const { campo: clave, almacen, hueco } = PERSONALIZADOS[tipo];
  const delLocke = locke && locke[clave];
  const mios = almacen.listas().filter((lista) => !lista.recibido || (delLocke && lista.id === delLocke.id));
  const loTengo = delLocke && mios.some((lista) => lista.id === delLocke.id);
  const elegido = delLocke ? (loTengo ? delLocke.id : LAS_DEL_LOCKE) : DEL_JUEGO;

  const opcion = (valor, texto) =>
    `<option value="${escaparHTML(valor)}" ${valor === elegido ? "selected" : ""}>${escaparHTML(texto)}</option>`;

  campo(hueco).innerHTML = `
    <select class="locke-normas-elegir locke-${tipo}-elegir" ${creador ? "" : "disabled"}>
      ${opcion(DEL_JUEGO, "Las del juego")}
      ${mios.map((lista) => opcion(lista.id, lista.nombre)).join("")}
      ${delLocke && !loTengo ? opcion(LAS_DEL_LOCKE, `${delLocke.nombre} (la del locke)`) : ""}
    </select>`;
}

function personalizadoElegido(tipo, locke) {
  const { campo: clave, copia } = PERSONALIZADOS[tipo];
  const valor = campo(`.locke-${tipo}-elegir`).value;
  if (valor === DEL_JUEGO) return null;
  if (valor === LAS_DEL_LOCKE) return (locke && locke[clave]) || null;
  return copia(valor);
}

// Lo que abren los botones «Rutas» y «Level caps» de un locke: sus personalizados o, si no
// tiene, los de su juego (si es uno de la web). "" si nada.
function destinoDe(locke, tipo) {
  const propio = locke[PERSONALIZADOS[tipo].campo];
  if (propio) return propio.id;
  return juegoConDatos(locke) ? locke.juego : "";
}

// Botón «Normas» de un locke: se abre la sección con las suyas arriba
async function irANormas(id) {
  const modulo = await import("../normas/index.js");
  modulo.verNormasDeLocke(id);
  irA("normas");
}

// ---------- Ventana para elegir amigos ----------

function abrirElegirAmigos() {
  const yaElegidos = new Set(elegidos.map((perfil) => perfil.uid));
  const libres = invitables.filter((perfil) => !yaElegidos.has(perfil.uid));
  const cuerpo = dialogoElegir.querySelector(".elegir-lista");

  cuerpo.innerHTML = libres.length
    ? libres
        .sort((uno, otro) => uno.nombre.localeCompare(otro.nombre, "es"))
        .map(
          (perfil) => `
            <label class="locke-amigo">
              <input type="checkbox" value="${escaparHTML(perfil.uid)}">
              <span>${escaparHTML(perfil.nombre)}</span>
            </label>`
        )
        .join("")
    : `<p class="locke-sin-amigos">${
        amigosAceptados().length
          ? "Ya están todos tus amigos."
          : "Todavía no tienes amigos. Agrégalos en «Amigos» y espera a que te acepten."
      }</p>`;

  dialogoElegir.querySelector(".elegir-ok").disabled = !libres.length;
  dialogoElegir.showModal();
}

function anadirElegidos() {
  const marcados = new Set([...dialogoElegir.querySelectorAll("input:checked")].map((casilla) => casilla.value));
  elegidos.push(...invitables.filter((perfil) => marcados.has(perfil.uid)));
  dialogoElegir.close();
  pintarIntegrantes(editando ? lockePorId(editando) : null);
}

// ---------- Combates (en la ventana) ----------
//
// Cuántos tendrá el locke y, debajo, una casilla por combate para ponerle nombre («Tras la 3ª
// medalla», «Liga»...). Sin nombre sale «Combate 1», «Combate 2»...

const MAX_COMBATES = 12;

function pintarNombresCombates(nombres, editable) {
  campo(".locke-combates-nombres").innerHTML = nombres
    .map(
      (nombre, i) =>
        `<input class="locke-combate-nombre" type="text" maxlength="30" autocomplete="off" placeholder="Combate ${i + 1}"
                value="${escaparHTML(nombre)}" ${editable ? "" : "disabled"}>`
    )
    .join("");
}

function nombresCombatesDelDialogo() {
  return [...dialogo.querySelectorAll(".locke-combate-nombre")].map((casilla) => casilla.value.trim());
}

// locke: el que se edita; sin él, uno nuevo
async function abrirDialogo(locke = null) {
  // Lo primero, abrir. Pase lo que pase después, el botón nunca puede quedarse sin
  // hacer nada: si algo falla, se ve el motivo dentro del diálogo.
  if (!dialogo.open) dialogo.showModal();

  editando = locke ? locke.id : null;
  const creador = !locke || soyCreador(locke);
  const cerrado = Boolean(locke && locke.estado === "cerrado");
  invitables = [];

  const error = campo(".locke-error");
  // Si el perfil no ha cargado se tira del nombre y la foto de Google y de los tipos de
  // siempre: así al menos se puede rellenar el formulario y ver qué pasa al crear.
  const mio = miPerfilOProvisional();
  error.textContent = fallaElPerfil() || fallaLasAmistades();

  campo(".locke-dialogo-titulo").textContent = locke ? "Editar locke" : "Nuevo locke";
  campo("#locke-crear").textContent = locke ? "Guardar" : "Crear locke";
  campo("#locke-crear").hidden = cerrado && !creador;
  campo("#locke-borrar").hidden = !locke || !creador;

  // Los tipos: los míos, más el del locke si ya no lo tengo (para no perderlo al guardar)
  const tipos = tiposDe(mio).slice();
  if (locke && locke.tipo && !tipos.some((t) => t.id === locke.tipo.id)) tipos.push(locke.tipo);
  const tipoElegido = locke && locke.tipo ? locke.tipo.id : tipos[0].id;
  campo("#locke-tipo").innerHTML = tipos
    .map(
      (tipo) =>
        `<option value="${escaparHTML(tipo.id)}" ${tipo.id === tipoElegido ? "selected" : ""}>${escaparHTML(tipo.nombre)}</option>`
    )
    .join("");

  campo("#locke-nombre").value = locke ? locke.nombre : "";
  campo("#locke-descripcion").value = locke ? locke.descripcion || "" : "";
  campo(".locke-campo-juego").innerHTML = plantillaCampoJuego(locke || {});
  campo("#locke-infinitas").checked = Boolean(locke && locke.vidasIlimitadas);
  campo("#locke-vidas").value = locke && !locke.vidasIlimitadas ? locke.vidasIniciales : VIDAS_POR_DEFECTO;

  // Lo que no es del creador, apagado. Las vidas, además, solo antes de que empiece nadie.
  const vidasLibres = !locke || (creador && sePuedenCambiarVidas(locke));
  for (const selector of ["#locke-nombre", "#locke-descripcion", "#locke-tipo", ".juego-select", ".juego-otro"]) {
    campo(selector).disabled = !creador;
  }
  campo("#locke-infinitas").disabled = !vidasLibres;
  campo("#locke-vidas").disabled = !vidasLibres || campo("#locke-infinitas").checked;
  campo(".campo-vidas").title = vidasLibres ? "" : "Ya hay gente jugando: sus vidas solo las cambia cada uno.";

  const combates = locke ? combatesDe(locke) : [];
  const combatesLibres = creador && !cerrado;
  campo("#locke-combates").value = combates.length;
  campo("#locke-combates").disabled = !combatesLibres;
  pintarNombresCombates(combates.map((combate) => combate.nombre || ""), combatesLibres);

  // Ventana recién abierta: nadie elegido todavía
  elegidos = [];
  pintarIntegrantes(locke);
  pintarNormas(locke, creador);
  pintarPersonalizado("rutas", locke, creador);
  pintarPersonalizado("caps", locke, creador);
  if (!locke) campo("#locke-nombre").focus();
  if (!cerrado) await cargarInvitables(locke);
}

async function guardar() {
  const mio = miPerfilOProvisional();
  const usuario = usuarioActual();
  const error = dialogo.querySelector(".locke-error");
  const locke = editando ? lockePorId(editando) : null;

  const nombre = dialogo.querySelector("#locke-nombre").value.trim();
  const descripcion = dialogo.querySelector("#locke-descripcion").value.trim();
  const vidasIlimitadas = dialogo.querySelector("#locke-infinitas").checked;
  const vidas = Math.max(0, Math.min(999, Number(dialogo.querySelector("#locke-vidas").value) || 0));
  const idTipo = dialogo.querySelector("#locke-tipo").value;
  const tipos = tiposDe(mio).concat(locke && locke.tipo ? [locke.tipo] : []);
  const tipo = tipos.find((cada) => cada.id === idTipo) || tipos[0];
  const { juego, juegoOtro } = leerCampoJuego(dialogo.querySelector(".campo-juego"));
  const normas = normasElegidas(locke);
  const rutasPropias = personalizadoElegido("rutas", locke);
  const capsPropios = personalizadoElegido("caps", locke);
  const combates = nombresCombatesDelDialogo();

  // Lo único imprescindible es el nombre: un locke para ti solo también vale
  if (!nombre) {
    error.textContent = "Ponle un nombre.";
    dialogo.querySelector("#locke-nombre").focus();
    return;
  }

  const nuevos = elegidos.slice();

  if (!locke) {
    const nombres = { [usuario.uid]: mio.nombre };
    const fotos = { [usuario.uid]: mio.foto || "" };
    for (const perfil of nuevos) {
      nombres[perfil.uid] = perfil.nombre;
      fotos[perfil.uid] = perfil.foto || "";
    }

    await crearLocke({
      nombre, descripcion, tipo, juego, juegoOtro, vidas, vidasIlimitadas, normas, rutasPropias, capsPropios,
      combates, invitados: nuevos.map((perfil) => perfil.uid), nombres, fotos
    });
  } else {
    // Si se acaban de cambiar las vidas de partida, los invitados entran ya con las nuevas
    const vidasNuevas = soyCreador(locke) && sePuedenCambiarVidas(locke) ? (vidasIlimitadas ? 0 : vidas) : undefined;

    if (soyCreador(locke)) {
      await editarLocke(locke.id, {
        nombre, descripcion, tipo, juego, juegoOtro, vidas, vidasIlimitadas, normas, rutasPropias, capsPropios, combates
      });
    }
    // Invitar va aparte: lo puede hacer cualquiera de dentro, no solo el creador
    if (nuevos.length) await invitarALocke(locke.id, nuevos, vidasNuevas);
  }

  dialogo.close();
}

async function borrarDesdeElDialogo() {
  const locke = editando ? lockePorId(editando) : null;
  if (!locke) return;
  if (!confirm(`¿Borrar «${locke.nombre}»? Lo pierden todos los que juegan.`)) return;

  await borrarLocke(locke.id);
  dialogo.close();
}

// Atajos del locke a Rutas o Level caps: se deja apuntado el juego y se abre la sección,
// que al mostrarse lo lee (ver mostrar() en js/rutas y js/levelcaps).
function irAlJuego(seccionDestino, idJuego) {
  escribir(CLAVES_JUEGO[seccionDestino], idJuego);
  irA(seccionDestino);
}

function textoDeError(error, que) {
  return error && error.code === "permission-denied"
    ? `Firebase no deja ${que}. Falta publicar las reglas de Firestore.`
    : `No se ha podido ${que}. Inténtalo otra vez.`;
}

// ---------- Arranque ----------

export function iniciar() {
  seccion = document.querySelector("#vista-versus");
  lista = seccion.querySelector(".versus-lista");
  aviso = seccion.querySelector(".versus-aviso");
  botonNuevo = seccion.querySelector("#nuevo-locke");
  dialogo = document.querySelector("#dialogo-nuevo-locke");
  dialogoElegir = document.querySelector("#dialogo-elegir-amigos");

  const alFallar = (error) => {
    console.error(error);
    aviso.textContent = "No se ha podido guardar el cambio.";
  };
  iniciarCementerio(alFallar);
  iniciarActividad();
  iniciarCombates(alFallar);
  iniciarPartida(pintar, (texto) => (aviso.textContent = texto));

  dialogoElegir.querySelector(".elegir-ok").addEventListener("click", anadirElegidos);
  dialogoElegir.querySelector(".elegir-cancelar").addEventListener("click", () => dialogoElegir.close());

  const abrir = (locke) => {
    abrirDialogo(locke).catch((error) => {
      console.error(error);
      // Se dice en los dos sitios: dentro del diálogo si llegó a abrirse, y debajo del
      // botón por si no.
      const texto = error && error.message ? error.message : "No se ha podido abrir.";
      const hueco = dialogo.querySelector(".locke-error");
      if (hueco) hueco.textContent = texto;
      aviso.textContent = texto;
    });
  };

  botonNuevo.addEventListener("click", () => abrir(null));

  dialogo.querySelector("#locke-cancelar").addEventListener("click", () => dialogo.close());
  activarCamposJuego(dialogo);

  // Con vidas ilimitadas el número no pinta nada
  dialogo.querySelector("#locke-infinitas").addEventListener("change", (e) => {
    dialogo.querySelector("#locke-vidas").disabled = e.target.checked;
  });

  // Al cambiar cuántos combates, salen o se van sus casillas (lo escrito se conserva)
  dialogo.querySelector("#locke-combates").addEventListener("input", (e) => {
    const cuantos = Math.max(0, Math.min(MAX_COMBATES, Math.floor(Number(e.target.value) || 0)));
    const nombres = nombresCombatesDelDialogo();
    pintarNombresCombates(Array.from({ length: cuantos }, (_, i) => nombres[i] || ""), true);
  });

  // Enter en el nombre guarda, como en el resto de la web
  dialogo.querySelector("#locke-nombre").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      dialogo.querySelector("#locke-crear").click();
    }
  });

  dialogo.querySelector("#locke-crear").addEventListener("click", () => {
    dialogo.querySelector(".locke-error").textContent = "";
    guardar().catch((error) => {
      console.error(error);
      dialogo.querySelector(".locke-error").textContent = textoDeError(error, editando ? "guardar los cambios" : "crear el locke");
    });
  });

  dialogo.querySelector("#locke-borrar").addEventListener("click", () => {
    borrarDesdeElDialogo().catch((error) => {
      console.error(error);
      dialogo.querySelector(".locke-error").textContent = textoDeError(error, "borrar el locke");
    });
  });

  dialogo.querySelector(".locke-dentro").addEventListener("click", (e) => {
    // «+»: la lista de amigos para elegir
    if (e.target.closest(".locke-anadir")) {
      e.preventDefault();
      abrirElegirAmigos();
      return;
    }

    // X de alguien que aún no se ha guardado: solo se quita de la lista
    const desmarcar = e.target.closest(".locke-desmarcar");
    if (desmarcar) {
      e.preventDefault();
      elegidos = elegidos.filter((perfil) => perfil.uid !== desmarcar.dataset.uid);
      pintarIntegrantes(editando ? lockePorId(editando) : null);
      return;
    }

    const boton = e.target.closest(".locke-quitar");
    if (!boton) return;
    e.preventDefault();
    boton.disabled = true;
    quitarDesdeElDialogo(boton.dataset.uid).catch((error) => {
      console.error(error);
      boton.disabled = false;
      dialogo.querySelector(".locke-error").textContent = textoDeError(error, "quitar a esa persona");
    });
  });

  lista.addEventListener("click", (e) => {
    if (e.target.closest(".versus-ver-mas")) {
      verTodos = !verTodos;
      pintar();
      return;
    }

    const tarjeta = e.target.closest(".locke");
    const boton = e.target.closest("button");
    if (!tarjeta || !boton) return;

    const id = tarjeta.dataset.id;
    const jugador = e.target.closest(".locke-jugador");
    const locke = lockePorId(id);
    if (!locke) return;

    let tarea = null;

    if (accionPartida(boton, id)) return;
    if (boton.classList.contains("locke-ir") && boton.dataset.ir === "normas") {
      tarea = irANormas(id);
    } else if (boton.classList.contains("locke-ir") && boton.dataset.ir === "cementerio") {
      abrirCementerio(id);
    } else if (boton.classList.contains("locke-ir") && boton.dataset.ir === "actividad") {
      abrirActividad(id);
    } else if (boton.classList.contains("locke-ir")) {
      // Unos personalizados que no tienes (o borraste): se apuntan antes de abrirlos
      const personalizado = PERSONALIZADOS[boton.dataset.ir === "rutas" ? "rutas" : "caps"];
      if (locke[personalizado.campo]) personalizado.almacen.recibirDeLocke(locke[personalizado.campo], true);
      irAlJuego(boton.dataset.ir, boton.dataset.juego);
    } else if (boton.classList.contains("locke-editar")) {
      abrir(locke);
    } else if (boton.classList.contains("locke-borrar")) {
      if (confirm(`¿Borrar «${locke.nombre}»? Lo pierden todos los que juegan.`)) tarea = borrarLocke(id);
    } else if (boton.classList.contains("locke-terminar")) {
      abrirTerminar(id);
    } else if (boton.classList.contains("locke-combate")) {
      abrirCombate(id, boton.dataset.combate);
    } else if (boton.classList.contains("locke-rom")) {
      alternarRom(id);
    } else if (boton.classList.contains("locke-salon-poner") || boton.classList.contains("locke-salon-cambiar")) {
      abrirSalon(id);
    } else if (boton.classList.contains("mas")) {
      tarea = cambiarNumero(id, jugador.dataset.uid, boton.dataset.campo, 1);
    } else if (boton.classList.contains("menos") && boton.dataset.campo === "vidas") {
      abrirMuerte(id, true); // quién ha muerto (opcional) y quita la vida
    } else if (boton.classList.contains("menos")) {
      tarea = cambiarNumero(id, jugador.dataset.uid, boton.dataset.campo, -1);
    }

    if (tarea) {
      tarea.catch((error) => {
        console.error(error);
        aviso.textContent = "No se ha podido guardar el cambio.";
      });
    }
  });

  alCambiarLockes(() => {
    pintar();
    // Con la ventana de editar abierta, los integrantes también al día (alguien acepta,
    // alguien sale...)
    const locke = dialogo.open && editando ? lockePorId(editando) : null;
    if (locke) {
      pintarIntegrantes(locke);
      cargarInvitables(locke).catch((error) => console.error(error));
    }
  });
}

export function mostrar() {
  pintar();
}
