// Sección «Lockes»: el marcador compartido de un locke.
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
import { leer, escribir } from "../comun/almacen.js";
import { CLAVES_JUEGO, CLAVE_MULTIPLICADOR_CAPS, CLAVE_HIERBA_RUTAS } from "../comun/selector-juego.js";
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
  tiposDe, miPerfilOProvisional, fallaElPerfil, amigosAceptados, perfilesDe, fallaLasAmistades,
  colorDeTipo
} from "../comun/perfiles.js";
import {
  alCambiarLockes, misLockes, invitacionesALockes, estadoDe, fallaLosLockes, soyCreador,
  crearLocke, editarLocke, invitarALocke, quitarDeLocke, sePuedenCambiarVidas,
  cambiarNumero, borrarLocke, lockePorId, estaEliminado, combatesDe, victoriasDe, medallasDe, cambiarMedallas
} from "../comun/lockes.js";
import { medallasDelJuego, marcarGimnasios } from "../comun/medallas.js";
import { partidaDe } from "../partida/partidas.js";
import {
  iniciarCombates, plantillaCombates, plantillaRom, plantillaSalon, abrirCombate, abrirTerminar, abrirSalon,
  alternarRom
} from "./combates.js";
import { iniciarPartida, plantillaPartida, accionPartida } from "./partida.js";
import { completarReglas, hayAlgo, misReglas, normasGuardadas, resumenNormas, hierbaEnPueblos } from "../randomizer/reglas.js";
import { confirmar } from "../comun/ventanas.js";
import { t, LOCALE } from "../comun/idioma.js";

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
          <span class="locke-etiqueta">${icono("espadas")} ${t("Victorias")}</span>
          <div class="locke-numero marcador">${botonesCifra("marcador", false, victorias)}</div>
        </div>
        <div class="locke-cifra vidas">
          <span class="locke-etiqueta">${icono("corazon")} ${t("Vidas")}</span>
          <div class="locke-numero vidas">
            <span class="locke-valor locke-sin-vidas">${icono("calavera")}</span>
            ${editable ? `<button class="mas" data-campo="vidas" aria-label="${t("Recuperar la vida cero")}" title="${t("Recuperar la vida cero")}">${icono("mas")}</button>` : ""}
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="locke-cifras">
      <div class="locke-cifra victorias">
        <span class="locke-etiqueta">${icono("espadas")} ${t("Victorias")}</span>
        <div class="locke-numero marcador">
          ${botonesCifra("marcador", victoriasAMano, victorias, t("Quitar una victoria"), t("Sumar una victoria"))}
        </div>
      </div>
      <div class="locke-cifra vidas ${locke.vidasIlimitadas ? "ilimitadas" : ""} ${vidas === 0 ? "vida-cero" : ""}">
        <span class="locke-etiqueta">${icono("corazon")} ${t("Vidas")}</span>
        <div class="locke-numero vidas">
          ${botonesCifra("vidas", editable && !locke.vidasIlimitadas, vidas, vidas === 0 ? t("Perder la vida cero") : t("Quitar una vida"), t("Sumar una vida"))}
        </div>
      </div>
    </div>`;
}

// Las medallas del juego del locke, apagadas hasta que se consiguen. Se encienden solas con la
// partida vinculada; en tu tarjeta, además, se pueden pulsar (si no la tienes vinculada)
function versionDeMedallas(locke, uid) {
  const { version } = medallasDe(locke, uid);
  if (version || uid !== usuarioActual().uid) return version;
  return (partidaDe(locke.id) || {}).version || "";
}

function plantillaMedallas(locke, uid, editable) {
  const lista = medallasDelJuego(locke.juego, versionDeMedallas(locke, uid));
  if (!lista.length) return "";
  const tiene = new Set(medallasDe(locke, uid).tiene);
  const etiqueta = editable ? "button" : "span";
  const medallas = lista.map((m, i) => {
    const conseguida = tiene.has(i);
    const titulo = escaparHTML(conseguida ? m.nombre : t("{medalla} (sin conseguir)", { medalla: m.nombre }));
    return `
      <${etiqueta} class="locke-medalla ${conseguida ? "conseguida" : ""}" ${editable ? `type="button" data-medalla="${i}"` : ""}
        title="${titulo}" aria-label="${titulo}"><img src="${escaparHTML(m.imagen)}" alt="" loading="lazy"></${etiqueta}>`;
  });
  return `
    <div class="locke-medallas ${lista.length > 8 ? "dos-filas" : ""}">
      <span class="locke-etiqueta">${icono("escudo")} ${t("Medallas")} · ${[...tiene].filter((i) => i < lista.length).length}/${lista.length}</span>
      <div class="locke-medallas-lista">${medallas.join("")}</div>
    </div>`;
}

// Pulsar una medalla de tu tarjeta: la consigues o la quitas, y su gimnasio en «Level caps» igual
function alternarMedalla(locke, indice) {
  const usuario = usuarioActual();
  const tiene = new Set(medallasDe(locke, usuario.uid).tiene);
  const conseguida = !tiene.has(indice);
  if (conseguida) tiene.add(indice);
  else tiene.delete(indice);
  marcarGimnasios(locke.juego, [indice], conseguida);
  return cambiarMedallas(locke.id, [...tiene], versionDeMedallas(locke, usuario.uid));
}

function plantillaJugador(locke, uid) {
  const usuario = usuarioActual();
  const nombre = escaparHTML((locke.nombres || {})[uid] || t("Jugador"));
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
        <div class="locke-cara" data-perfil="${escaparHTML(uid)}" title="${t("Ver perfil")}">
          ${foto ? `<img src="${escaparHTML(foto)}" alt="" referrerpolicy="no-referrer" data-respaldo="" data-quitar-si-falla>` : ""}
          ${eliminado ? `<span class="locke-cara-fuera">${icono("calavera")}</span>` : ""}
        </div>
        <span class="locke-quien">${nombre}${esMio ? ` <small>(${t("tú")})</small>` : ""}</span>
        ${gano ? `<span class="locke-corona">${icono("corona")}</span>` : ""}
        ${pendiente ? `<span class="locke-pendiente">${t("Sin contestar")}</span>` : ""}
        ${eliminado ? `<span class="locke-eliminado">${t("Eliminado")}</span>` : ""}
        ${pendiente ? "" : plantillaRom(locke, uid, esMio && !cerrado && !eliminado)}
      </div>

      ${plantillaCifras(locke, uid, esMio && !cerrado)}
      ${pendiente ? "" : plantillaMedallas(locke, uid, esMio && !cerrado)}
      ${esMio && !pendiente ? plantillaPartida(locke) : ""}
      ${cerrado && !pendiente ? plantillaSalon(locke, uid, esMio) : ""}
    </div>`;
}

// Atajos del pie: a sus Rutas y sus Level caps si es un juego de la web, a sus normas si tiene,
// a su cementerio y a su actividad
function plantillaAtajos(locke) {
  const normas = normasCompletas(normasDeLocke(locke)).length;

  const rutas = destinoDe(locke, "rutas");
  const caps = destinoDe(locke, "caps");
  const atajos = `
    ${rutas ? `<button class="locke-ir" data-ir="rutas" data-juego="${escaparHTML(rutas)}">${icono("mapa")} ${t("Rutas")}</button>` : ""}
    ${caps ? `<button class="locke-ir" data-ir="levelcaps" data-juego="${escaparHTML(caps)}">${icono("escudo")} Level caps</button>` : ""}`;

  return `
    <footer class="locke-juego">
      ${atajos}
      ${normas ? `<button class="locke-ir" data-ir="normas">${icono("libro")} ${t("Normas")} (${normas})</button>` : ""}
      ${locke.randomizer && locke.estado !== "cerrado" ? `<button class="locke-ir" data-ir="randomizer">${icono("mezclar")} ${t("Randomizar mi ROM")}</button>` : ""}
      <button class="locke-ir" data-ir="cementerio">${icono("calavera")} ${t("Cementerio")} (${totalMuertos(locke)})</button>
      <button class="locke-ir" data-ir="actividad">${icono("actividad")} ${t("Actividad")}</button>
    </footer>`;
}

function plantillaLocke(locke) {
  const cerrado = locke.estado === "cerrado";
  const tipo = locke.tipo || { nombre: "Locke", color: "#3498db" };
  const juego = nombreJuego(locke);

  // Cerrado sin ganador: nadie se pasó la ROM
  const resultado = !cerrado ? "" : locke.ganador
    ? `${icono("corona")} ${t("Ganó {nombre}", { nombre: escaparHTML((locke.nombres || {})[locke.ganador] || t("alguien")) })}`
    : `${icono("aspa")} ${t("Nadie ganó")}`;
  const fecha = cerrado && locke.fechaFin ? ` · ${escaparHTML(fechaLarga(locke.fechaFin))}` : "";

  // Un locke cerrado ya no se toca, salvo para que quien lo creó pueda borrarlo. Terminado,
  // cualquiera lo puede quitar de su lista (los demás lo siguen viendo).
  const puedeEditar = !cerrado || soyCreador(locke);
  const quitado = quitados().includes(locke.id);

  return `
    <article class="locke ${cerrado ? "cerrado" : "abierto"}" data-id="${escaparHTML(locke.id)}"
             style="--color-locke: ${colorDeTipo(tipo)}">
      <header class="locke-cabecera">
        <div class="locke-titular">
          <span class="locke-tipo">${escaparHTML(tipo.nombre)}</span>
          <h2 class="locke-titulo">${escaparHTML(locke.nombre)}</h2>
          ${juego || cerrado
            ? `<div class="locke-meta">
                ${juego ? `<span class="locke-juego-nombre">${icono("mando")} ${escaparHTML(juego)}</span>` : ""}
                ${cerrado ? `<span class="locke-resultado ${locke.ganador ? "" : "sin-ganador"}">${resultado}${fecha}</span>` : ""}
              </div>`
            : ""}
        </div>
        <div class="locke-acciones">
          ${!cerrado && soyCreador(locke) ? `<button class="locke-terminar" title="${t("Terminar el locke")}">${icono("corona")} ${t("Terminar")}</button>` : ""}
          ${puedeEditar ? `<button class="locke-editar" title="${t("Editar locke")}">${icono("lapiz")}</button>` : ""}
          ${cerrado
            ? `<button class="locke-quitar-lista" title="${quitado ? t("Volver a ponerlo en tu lista") : t("Quitar de tu lista")}">${icono(quitado ? "deshacer" : "aspa")}</button>`
            : ""}
          ${soyCreador(locke) ? `<button class="locke-borrar" title="${t("Borrar locke")}">${icono("papelera")}</button>` : ""}
        </div>
      </header>

      ${locke.descripcion ? `<p class="locke-descripcion">${escaparHTML(locke.descripcion)}</p>` : ""}
      ${plantillaCombates(locke)}

      <div class="locke-jugadores">
        ${locke.jugadores.map((uid) => plantillaJugador(locke, uid)).join("")}
      </div>

      ${plantillaAtajos(locke)}
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
    aviso.textContent = t(pendientes === 1 ? "Tienes {n} invitación sin contestar en las notificaciones (la campana de abajo)." : "Tienes {n} invitaciones sin contestar en las notificaciones (la campana de abajo).", { n: pendientes });
  } else if (!mios.length) {
    aviso.textContent = t("Todavía no tienes ningún locke. Crea uno con «Nuevo locke».");
  } else {
    aviso.textContent = "";
  }

  // Del más nuevo al más antiguo. Solo los MOSTRAR_DE_ENTRADA últimos; el resto detrás de
  // un botón que los despliega todos. Los terminados que has quitado, aparte, al final.
  const fuera = new Set(quitados());
  const deLaLista = mios.filter((locke) => !(locke.estado === "cerrado" && fuera.has(locke.id)));
  const apartados = mios.filter((locke) => !deLaLista.includes(locke));
  if (!apartados.length) verQuitados = false;
  const ordenados = [...deLaLista].sort((uno, otro) => (otro.creado || 0) - (uno.creado || 0));
  const quedan = ordenados.length - MOSTRAR_DE_ENTRADA;
  const visibles = verTodos || quedan <= 0 ? ordenados : ordenados.slice(0, MOSTRAR_DE_ENTRADA);

  lista.innerHTML =
    visibles.map(plantillaLocke).join("") +
    (quedan > 0
      ? `<button class="versus-ver-mas">${icono(verTodos ? "menos" : "mas")} ${
          verTodos ? t("Ver solo los últimos") : t("Ver todos ({n} más)", { n: quedan })
        }</button>`
      : "") +
    (apartados.length
      ? `<button class="versus-ver-quitados">${icono(verQuitados ? "menos" : "mas")} ${
          verQuitados ? t("Esconder los quitados") : t("Quitados de tu lista ({n})", { n: apartados.length })
        }</button>`
      : "") +
    (verQuitados ? apartados.map(plantillaLocke).join("") : "");
}

// ---------- Lockes quitados de tu lista ----------

const CLAVE_QUITADOS = "poketeams-lockes-quitados-v1";
let verQuitados = false;

function quitados() {
  return leer(CLAVE_QUITADOS, []) || [];
}

function alternarQuitado(id) {
  const ids = quitados();
  escribir(CLAVE_QUITADOS, ids.includes(id) ? ids.filter((otro) => otro !== id) : [...ids, id]);
  pintar();
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

// Cada integrante, como una tarjetita: su foto (o su inicial), su nombre y qué es en el locke
function tarjetaIntegrante(nombre, foto, estado, clase, quitar = "") {
  const inicial = escaparHTML((nombre || "?").trim()[0] || "?").toUpperCase();
  return `
    <span class="locke-dentro-uno ${clase}">
      <span class="locke-dentro-cara" data-inicial="${inicial}">${foto ? `<img src="${escaparHTML(foto)}" alt="" referrerpolicy="no-referrer" data-respaldo="" data-quitar-si-falla>` : ""}</span>
      <span class="locke-dentro-datos">
        <b>${escaparHTML(nombre)}</b>
        <small>${estado}</small>
      </span>
      ${quitar}
    </span>`;
}

function plantillaIntegrantes(locke) {
  const cerrado = Boolean(locke && locke.estado === "cerrado");
  const yo = usuarioActual().uid;
  let html = "";

  if (locke) {
    const creador = soyCreador(locke);
    html += locke.jugadores
      .map((uid) => {
        const nombre = (locke.nombres || {})[uid] || t("Jugador");
        const pendiente = estadoDe(locke, uid) === "pendiente";
        const sePuedeQuitar = !cerrado && uid !== locke.creador && (creador || pendiente);
        const quitar = sePuedeQuitar
          ? botonQuitar("locke-quitar", uid, pendiente ? t("Quitar del locke") : t("Expulsar del locke"))
          : "";
        const estado = pendiente
          ? t("sin contestar")
          : uid === locke.creador ? (uid === yo ? `${t("tú")} · ${t("creador")}` : t("creador"))
          : uid === yo ? t("tú") : t("jugador");
        return tarjetaIntegrante(nombre, (locke.fotos || {})[uid], estado, pendiente ? "pendiente" : "", quitar);
      })
      .join("");
  } else {
    const mio = miPerfilOProvisional();
    html += tarjetaIntegrante((mio && mio.nombre) || t("Tú"), mio && mio.foto, `${t("tú")} · ${t("creador")}`, "");
  }

  html += elegidos
    .map((perfil) =>
      tarjetaIntegrante(perfil.nombre, perfil.foto, t("por añadir"), "pendiente", botonQuitar("locke-desmarcar", perfil.uid, t("No añadir")))
    )
    .join("");

  if (!cerrado) {
    html += `<button class="locke-dentro-uno pendiente locke-anadir" title="${t("Añadir gente")}">${icono("mas")} ${t("Añadir gente")}</button>`;
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
    const nombre = (locke.nombres || {})[uid] || t("este jugador");
    if (!(await confirmar(`${t("¿Expulsar a {nombre} de «{locke}»?", { nombre, locke: locke.nombre })}\n\n${t("Perderá sus vidas y victorias en este locke.")}`))) return;
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
      ${delLocke && !loTengo ? opcion(LAS_DEL_LOCKE, `${delLocke.nombre} (${t("la del locke")})`) : ""}
      ${opcion(SIN_NORMAS, t("Sin normas"))}
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
      ${opcion(DEL_JUEGO, t("Las del juego"))}
      ${mios.map((lista) => opcion(lista.id, lista.nombre)).join("")}
      ${delLocke && !loTengo ? opcion(LAS_DEL_LOCKE, `${delLocke.nombre} (${t("la del locke")})`) : ""}
    </select>`;
}

function personalizadoElegido(tipo, locke) {
  const { campo: clave, copia } = PERSONALIZADOS[tipo];
  const valor = campo(`.locke-${tipo}-elegir`).value;
  if (valor === DEL_JUEGO) return null;
  if (valor === LAS_DEL_LOCKE) return (locke && locke[clave]) || null;
  return copia(valor);
}

// ---------- Randomizer ----------
//
// Sin randomizer, unas normas guardadas con nombre, las sueltas de la sección «Randomizer» (y, al
// editar, las que ya lleve el locke). El locke se lleva una copia: { nombre, reglas }. Solo quien
// lo creó lo cambia; los demás las usan en «Randomizar mi ROM» (cada uno con su propio azar).

const SIN_RANDOMIZER = "";
const LAS_MIAS = "mias";
const GUARDADA = "guardada:";

function pintarRandomizer(locke, creador) {
  const delLocke = locke && locke.randomizer;
  const mias = misReglas();
  const elegido = delLocke ? LAS_DEL_LOCKE : SIN_RANDOMIZER;
  const opcion = (valor, texto) =>
    `<option value="${escaparHTML(valor)}" ${valor === elegido ? "selected" : ""}>${escaparHTML(texto)}</option>`;
  const guardadas = normasGuardadas();
  campo(".locke-randomizer").innerHTML = `
    <div class="locke-randomizer-fila">
      <select class="locke-normas-elegir locke-randomizer-elegir" ${creador ? "" : "disabled"}>
        ${opcion(SIN_RANDOMIZER, t("Sin randomizer"))}
        ${delLocke ? opcion(LAS_DEL_LOCKE, `${t("Las del locke")}${delLocke.nombre ? ` (${delLocke.nombre})` : ""}`) : ""}
        ${guardadas.map((n) => opcion(`${GUARDADA}${n.id}`, n.nombre)).join("")}
        ${mias && hayAlgo(mias) ? opcion(LAS_MIAS, t("Las sueltas de mi sección Randomizer")) : ""}
      </select>
      ${creador ? `<button type="button" class="locke-randomizer-editar">${icono("lapiz")} ${t("Preparar normas")}</button>` : ""}
    </div>
    <p class="locke-randomizer-resumen"></p>`;
  resumenRandomizer(locke);
}

// Lo que cambian las normas elegidas, en pocas palabras (para que quien crea el locke sepa qué
// está eligiendo)
function resumenRandomizer(locke) {
  const elegidas = randomizerElegido(locke);
  const texto = campo(".locke-randomizer-resumen");
  if (!texto) return;
  texto.textContent = elegidas ? t("Cambian: {cambios}.", { cambios: resumenNormas(elegidas.reglas) || t("nada") }) : "";
  texto.hidden = !elegidas;
}

function randomizerElegido(locke) {
  const valor = campo(".locke-randomizer-elegir").value;
  if (valor === SIN_RANDOMIZER) return null;
  if (valor === LAS_DEL_LOCKE) return (locke && locke.randomizer) || null;
  if (valor === LAS_MIAS) return { nombre: t("Personalizadas"), reglas: misReglas() };
  if (valor.startsWith(GUARDADA)) {
    const n = normasGuardadas().find((x) => x.id === valor.slice(GUARDADA.length));
    return n ? { nombre: n.nombre, reglas: n.reglas } : null;
  }
  return null;
}
// «Randomizar mi ROM»: la sección con las normas del locke
async function irARandomizer(id) {
  const modulo = await import("../randomizer/index.js");
  modulo.usarLocke(id);
  irA("randomizer");
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
        .sort((uno, otro) => uno.nombre.localeCompare(otro.nombre, LOCALE))
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
          ? t("Ya están todos tus amigos.")
          : t("Todavía no tienes amigos. Agrégalos en «Amigos» y espera a que te acepten.")
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
        `<input class="locke-combate-nombre" type="text" maxlength="30" autocomplete="off" placeholder="${t("Combate {n}", { n: i + 1 })}"
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

  campo(".locke-dialogo-titulo").textContent = locke ? t("Editar locke") : t("Nuevo locke");
  campo("#locke-crear").textContent = locke ? t("Guardar") : t("Crear locke");
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

  // Reglas y extras: plegadas al crear (son opcionales); al editar, abiertas
  campo(".locke-extras").open = Boolean(locke);

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
  campo(".campo-vidas").title = vidasLibres ? "" : t("Ya hay gente jugando: sus vidas solo las cambia cada uno.");

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
  pintarRandomizer(locke, creador);
  if (!locke) campo("#locke-nombre").focus();
  if (!cerrado) await cargarInvitables(locke);
}

// «Retar a un locke» desde el perfil de un amigo: la ventana de «Nuevo locke» con él ya
// puesto para invitarlo
export async function retarA(uid) {
  await abrirDialogo(null);
  const perfil = invitables.find((cada) => cada.uid === uid);
  if (perfil && !elegidos.some((cada) => cada.uid === uid)) {
    elegidos.push(perfil);
    pintarIntegrantes(null);
  }
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
  const randomizer = randomizerElegido(locke);
  const combates = nombresCombatesDelDialogo();

  // Lo único imprescindible es el nombre: un locke para ti solo también vale
  if (!nombre) {
    error.textContent = t("Ponle un nombre.");
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
      nombre, descripcion, tipo, juego, juegoOtro, vidas, vidasIlimitadas, normas, rutasPropias, capsPropios, randomizer,
      combates, invitados: nuevos.map((perfil) => perfil.uid), nombres, fotos
    });
  } else {
    // Si se acaban de cambiar las vidas de partida, los invitados entran ya con las nuevas
    const vidasNuevas = soyCreador(locke) && sePuedenCambiarVidas(locke) ? (vidasIlimitadas ? 0 : vidas) : undefined;

    if (soyCreador(locke)) {
      await editarLocke(locke.id, {
        nombre, descripcion, tipo, juego, juegoOtro, vidas, vidasIlimitadas, normas, rutasPropias, capsPropios, randomizer,
        combates
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
  if (!(await confirmar(`${t("¿Borrar «{nombre}»?", { nombre: locke.nombre })}\n\n${t("Lo pierden todos los que juegan.")}`))) return;

  await borrarLocke(locke.id);
  dialogo.close();
}

// Atajos del locke a Rutas o Level caps: se deja apuntado el juego y se abre la sección,
// que al mostrarse lo lee (ver mostrar() en js/rutas y js/levelcaps).
function irAlJuego(seccionDestino, idJuego, locke) {
  escribir(CLAVES_JUEGO[seccionDestino], idJuego);
  // Level caps de un locke con randomizer: el multiplicador de niveles de sus normas, el mismo
  // para todos (sale de las normas del locke, no de la ROM de cada uno)
  if (seccionDestino === "levelcaps" && locke && locke.randomizer) {
    const subida = Number(completarReglas(locke.randomizer.reglas).entrenadores.nivel) || 0;
    const multiplicadores = leer(CLAVE_MULTIPLICADOR_CAPS, {}) || {};
    if (subida) multiplicadores[idJuego] = 1 + subida / 100;
    else delete multiplicadores[idJuego];
    escribir(CLAVE_MULTIPLICADOR_CAPS, multiplicadores);
  }
  // Rutas de un locke: con «Hierba en los pueblos» en sus normas, esos pueblos salen también
  if (seccionDestino === "rutas" && locke) {
    const conHierba = hierbaEnPueblos(locke);
    const juegos = leer(CLAVE_HIERBA_RUTAS, {}) || {};
    if (conHierba) juegos[idJuego] = true;
    else delete juegos[idJuego];
    escribir(CLAVE_HIERBA_RUTAS, juegos);
  }
  irA(seccionDestino);
}

function textoDeError(error, que) {
  return error && error.code === "permission-denied"
    ? t("Firebase no deja {que}. Falta publicar las reglas de Firestore.", { que: t(que) })
    : t("No se ha podido {que}. Inténtalo otra vez.", { que: t(que) });
}

// ---------- Arranque ----------

export function iniciar() {
  seccion = document.querySelector("#vista-lockes");
  lista = seccion.querySelector(".versus-lista");
  aviso = seccion.querySelector(".versus-aviso");
  botonNuevo = seccion.querySelector("#nuevo-locke");
  dialogo = document.querySelector("#dialogo-nuevo-locke");
  dialogoElegir = document.querySelector("#dialogo-elegir-amigos");

  const alFallar = (error) => {
    console.error(error);
    aviso.textContent = t("No se ha podido guardar el cambio.");
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
      const texto = error && error.message ? error.message : t("No se ha podido abrir.");
      const hueco = dialogo.querySelector(".locke-error");
      if (hueco) hueco.textContent = texto;
      aviso.textContent = texto;
    });
  };

  botonNuevo.addEventListener("click", () => abrir(null));

  dialogo.querySelector("#locke-cancelar").addEventListener("click", () => dialogo.close());
  activarCamposJuego(dialogo);

  // Randomizer: el resumen sigue a lo elegido; «Preparar normas» lleva a la sección para
  // montarlas y guardarlas con nombre (luego salen aquí)
  dialogo.querySelector(".locke-randomizer").addEventListener("change", (e) => {
    if (e.target.matches(".locke-randomizer-elegir")) resumenRandomizer(editando ? lockePorId(editando) : null);
  });
  dialogo.querySelector(".locke-randomizer").addEventListener("click", async (e) => {
    if (!e.target.closest(".locke-randomizer-editar")) return;
    dialogo.close();
    const modulo = await import("../randomizer/index.js");
    modulo.usarLocke(null);
    irA("randomizer");
  });

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

  lista.addEventListener("click", async (e) => {
    if (e.target.closest(".versus-ver-mas")) {
      verTodos = !verTodos;
      pintar();
      return;
    }
    if (e.target.closest(".versus-ver-quitados")) {
      verQuitados = !verQuitados;
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
    } else if (boton.classList.contains("locke-ir") && boton.dataset.ir === "randomizer") {
      tarea = irARandomizer(id);
    } else if (boton.classList.contains("locke-ir") && boton.dataset.ir === "actividad") {
      abrirActividad(id);
    } else if (boton.classList.contains("locke-ir")) {
      // Unos personalizados que no tienes (o borraste): se apuntan antes de abrirlos
      const personalizado = PERSONALIZADOS[boton.dataset.ir === "rutas" ? "rutas" : "caps"];
      if (locke[personalizado.campo]) personalizado.almacen.recibirDeLocke(locke[personalizado.campo], true);
      irAlJuego(boton.dataset.ir, boton.dataset.juego, locke);
    } else if (boton.classList.contains("locke-editar")) {
      abrir(locke);
    } else if (boton.classList.contains("locke-quitar-lista")) {
      alternarQuitado(id);
    } else if (boton.classList.contains("locke-borrar")) {
      if (await confirmar(`${t("¿Borrar «{nombre}»?", { nombre: locke.nombre })}\n\n${t("Lo pierden todos los que juegan.")}`)) tarea = borrarLocke(id);
    } else if (boton.classList.contains("locke-terminar")) {
      abrirTerminar(id);
    } else if (boton.classList.contains("locke-combate")) {
      abrirCombate(id, boton.dataset.combate);
    } else if (boton.classList.contains("locke-medalla")) {
      tarea = alternarMedalla(locke, Number(boton.dataset.medalla));
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
        aviso.textContent = t("No se ha podido guardar el cambio.");
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
