// «Partida» de un locke: el archivo de guardado del emulador vinculado a tu bloque.
//
//   · En tu bloque (solo en tu pantalla): tu equipo de la partida y el botón para vincularla.
//     Mientras se vigila el archivo, cada vez que guardas en el emulador se vuelve a leer.
//   · La ventana «Partida»: equipo y cajas, qué caja es la de los muertos y «Copiar a Mis
//     equipos».
//   · Los que entran nuevos en la caja de los muertos se proponen para el cementerio.
//   · Las capturas se marcan solas en «Rutas» (js/partida/rutas.js).
//
// Los demás no ven nada de esto: solo lo que ya veían (el cementerio, las vidas, la actividad).

import { icono } from "../comun/iconos.js";
import { escaparHTML } from "../comun/utilidades.js";
import { usuarioActual } from "../comun/nube.js";
import { caraDePokemon, carasDeEquipo } from "../comun/elegir-equipo.js";
import { cargarDatos } from "../comun/datos.js";
import { lockePorId, muertosDe, apuntarMuerto, estaEliminado } from "../comun/lockes.js";
import {
  sePuedeVigilar, cargarVinculos, vincular, reanudar, desvincular, leerUnaVez, estadoVinculo, nombreArchivo
} from "../partida/vinculo.js";
import {
  sePuedeLeer, partidaDe, procesarArchivo, olvidarPartida, elegirCajaMuertos, muertosSinApuntar, marcarMuertosVistos
} from "../partida/partidas.js";

let repintar = () => {};
let avisar = () => {};
let dialogo = null;
let dialogoMuertos = null;
let idAbierto = null; // locke de la ventana «Partida»
let idMuertos = null; // locke de la ventana de los muertos
let propuestos = [];

function misMuertos(locke) {
  return muertosDe(locke, usuarioActual().uid);
}

function nombreDe(p) {
  return p.mote && p.mote !== p.es ? `${p.mote} (${p.nombre})` : p.nombre;
}

// ---------- En tu bloque ----------

export function plantillaPartida(locke) {
  if (!sePuedeLeer(locke) || locke.estado === "cerrado") return "";
  const partida = partidaDe(locke.id);
  const estado = estadoVinculo(locke.id);
  const pendientes = partida ? muertosSinApuntar(locke.id, misMuertos(locke)).length : 0;

  let accion = "";
  if (estado === "vigilando") {
    accion = `<span class="locke-partida-viva" title="${escaparHTML(`Leyendo ${nombreArchivo(locke.id)} cada vez que guardas`)}"></span>`;
  } else if (estado === "pausado") {
    accion = `<button class="locke-partida-reanudar" title="Volver a leer la partida">${icono("reanudar")} Reanudar</button>`;
  } else if (sePuedeVigilar) {
    accion = `<button class="locke-partida-vincular">${icono("enlace")} ${partida ? "Volver a vincular" : "Vincular partida"}</button>`;
  } else {
    accion = `<button class="locke-partida-vincular">${icono("subir")} ${partida ? "Actualizar partida" : "Leer partida"}</button>`;
  }

  return `
    <div class="locke-partida">
      ${partida ? `<button class="locke-partida-abrir" title="Ver partida">${carasDeEquipo({ nombre: "Equipo de la partida", pokemon: partida.equipo })}</button>` : ""}
      ${pendientes ? `<button class="locke-partida-muertos" title="Muertos por apuntar">${icono("calavera")} ${pendientes}</button>` : ""}
      ${accion}
    </div>`;
}

// Los botones de la partida en tu bloque. true si era uno de ellos.
export function accionPartida(boton, id) {
  const fallo = (error) => {
    if (error && error.name === "AbortError") return; // ha cerrado el selector sin elegir
    console.error(error);
    avisar("No se ha podido abrir la partida.");
  };
  if (boton.classList.contains("locke-partida-vincular")) {
    if (sePuedeVigilar) vincular(id).catch(fallo);
    else leerUnaVez(id);
  } else if (boton.classList.contains("locke-partida-reanudar")) {
    reanudar(id).catch(fallo);
  } else if (boton.classList.contains("locke-partida-abrir")) {
    abrirPartida(id);
  } else if (boton.classList.contains("locke-partida-muertos")) {
    proponerMuertos(id, false);
  } else {
    return false;
  }
  return true;
}

// ---------- Al leer el archivo ----------

// true si ya está (bien o con un error que no se arregla reintentando)
async function alLeer(id, bytes, archivo) {
  const locke = lockePorId(id);
  if (!locke) return false; // los lockes todavía no han llegado: en el siguiente vistazo

  const resultado = await procesarArchivo(locke, bytes, archivo);
  if (resultado.error) {
    if (resultado.reintentar) return false;
    avisar(resultado.error);
    // Recién vinculado con el archivo equivocado: fuera, para poder elegir otro
    if (!partidaDe(id)) await desvincular(id);
    return true;
  }

  repintar();
  if (dialogo.open && idAbierto === id) pintarPartida();
  // La ventana de los muertos sale sola si estás mirando «Versus»; si no, queda el aviso
  const enVersus = document.visibilityState === "visible" && document.querySelector("#vista-versus").offsetParent;
  if (enVersus) proponerMuertos(id, resultado.primera);
  return true;
}

// ---------- Ventana «Partida» ----------

function ficha(p) {
  const titulo = [nombreDe(p), p.lugar].filter(Boolean).join(" · ");
  return `
    <span class="partida-ficha" title="${escaparHTML(titulo)}">
      ${caraDePokemon(p, "partida-cara")}
      <span class="partida-ficha-nombre">${escaparHTML(p.mote || p.es)}</span>
      <small>${p.huevo ? "Huevo" : `Nv. ${p.nivel}`}</small>
    </span>`;
}

function pintarPartida() {
  const partida = partidaDe(idAbierto);
  const locke = lockePorId(idAbierto);
  if (!partida || !locke) {
    dialogo.close();
    return;
  }

  const cuando = new Date(partida.actualizada).toLocaleString("es-ES", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
  dialogo.querySelector(".partida-titulo").innerHTML =
    `${icono("mando")} ${escaparHTML(partida.entrenador || "Partida")} <small>${escaparHTML(partida.version || "")} · ${escaparHTML(cuando)}</small>`;

  const opciones = [
    `<option value="-1">Ninguna</option>`,
    ...partida.cajas.map(
      (caja, i) => `<option value="${i}" ${i === partida.cajaMuertos ? "selected" : ""}>${escaparHTML(caja.nombre)}</option>`
    )
  ].join("");
  const cajas = partida.cajas
    .filter((caja) => caja.pokemon.length)
    .map(
      (caja) => `
        <section class="partida-caja">
          <h3>${escaparHTML(caja.nombre)} <small>${caja.pokemon.length}</small></h3>
          <div class="partida-pokemon">${caja.pokemon.map(ficha).join("")}</div>
        </section>`
    )
    .join("");

  dialogo.querySelector(".partida-cuerpo").innerHTML = `
    <section class="partida-caja partida-equipo">
      <h3>Equipo</h3>
      <div class="partida-pokemon">${partida.equipo.map(ficha).join("")}</div>
      <button class="partida-copiar">${icono("copiar")} Copiar a Mis equipos</button>
    </section>
    <label class="partida-cementerio">${icono("calavera")} Caja de muertos <select class="partida-caja-muertos">${opciones}</select></label>
    ${cajas}`;
}

export function abrirPartida(id) {
  idAbierto = id;
  pintarPartida();
  if (partidaDe(id) && !dialogo.open) dialogo.showModal();
}

async function copiarEquipo() {
  const partida = partidaDe(idAbierto);
  const locke = lockePorId(idAbierto);
  if (!partida || !locke) return;
  const boton = dialogo.querySelector(".partida-copiar");
  boton.disabled = true;
  try {
    const [{ pasteDeEquipo, prepararConversion }, { anadirEquipoDesdePaste }] = await Promise.all([
      import("../partida/convertir.js"),
      import("../equipos/importar.js"),
      cargarDatos()
    ]);
    await prepararConversion();
    const { problemas } = await anadirEquipoDesdePaste(pasteDeEquipo(partida.equipo), locke.nombre);
    alert(problemas.length
      ? `Copiado a «Mis equipos», pero algunas cosas no se han podido reconocer:\n\n• ${problemas.join("\n• ")}`
      : "Copiado a «Mis equipos» ✔");
  } catch (error) {
    console.error(error);
    alert("No se ha podido copiar el equipo.");
  } finally {
    boton.disabled = false;
  }
}

// ---------- Muertos nuevos ----------

// primera: es la primera lectura de la partida (lo de la caja suele estar ya contado en las
// vidas, así que por defecto no se quitan)
function proponerMuertos(id, primera) {
  const locke = lockePorId(id);
  const usuario = usuarioActual();
  if (!locke || !usuario || locke.estado === "cerrado" || estaEliminado(locke, usuario.uid)) return;
  if (dialogoMuertos.open) return;
  propuestos = muertosSinApuntar(id, misMuertos(locke));
  if (!propuestos.length) return;
  idMuertos = id;

  dialogoMuertos.querySelector(".partida-muertos-lista").innerHTML = propuestos
    .map(
      (p, i) => `
        <label class="casilla-sesion partida-muerto">
          <input type="checkbox" value="${i}" checked>
          ${caraDePokemon(p, "partida-cara")}
          <span>${escaparHTML(nombreDe(p))}</span>
        </label>`
    )
    .join("");
  dialogoMuertos.querySelector(".partida-muertos-vida-campo").hidden = Boolean(locke.vidasIlimitadas);
  dialogoMuertos.querySelector(".partida-muertos-vida").checked = !primera && !locke.vidasIlimitadas;
  dialogoMuertos.showModal();
}

async function apuntarPropuestos() {
  const id = idMuertos;
  const lista = propuestos;
  const marcados = [...dialogoMuertos.querySelectorAll(".partida-muerto input:checked")].map((casilla) => lista[Number(casilla.value)]);
  const quitarVida = dialogoMuertos.querySelector(".partida-muertos-vida").checked;
  dialogoMuertos.close();
  marcarMuertosVistos(id, lista.map((p) => p.llave));
  // De uno en uno: cada uno lee el cementerio que dejó el anterior
  for (const p of marcados) {
    await apuntarMuerto(
      id,
      { especie: p.id, nombre: p.nombre, mote: p.mote, idForma: p.idForma, formaPMD: p.formaPMD, imagenForma: p.imagenForma },
      quitarVida
    );
  }
  repintar();
}

// ---------- Arranque ----------

// alRepintar: volver a pintar los lockes. alAvisar(texto): decirlo en la sección.
export function iniciarPartida(alRepintar, alAvisar) {
  repintar = alRepintar;
  avisar = alAvisar;
  dialogo = document.querySelector("#dialogo-partida");
  dialogoMuertos = document.querySelector("#dialogo-partida-muertos");

  dialogo.querySelector(".partida-cerrar").addEventListener("click", () => dialogo.close());
  dialogo.addEventListener("close", () => (idAbierto = null));
  dialogo.querySelector(".partida-desvincular").addEventListener("click", () => {
    if (!confirm("¿Desvincular la partida de este locke?\n\nLo apuntado en el cementerio y en «Rutas» se queda.")) return;
    const id = idAbierto;
    dialogo.close();
    olvidarPartida(id);
    desvincular(id).finally(repintar);
  });
  dialogo.querySelector(".partida-cuerpo").addEventListener("change", (e) => {
    if (!e.target.classList.contains("partida-caja-muertos")) return;
    elegirCajaMuertos(idAbierto, Number(e.target.value));
    repintar();
  });
  dialogo.querySelector(".partida-cuerpo").addEventListener("click", (e) => {
    if (e.target.closest(".partida-copiar")) copiarEquipo();
  });

  dialogoMuertos.querySelector(".partida-muertos-formulario").addEventListener("submit", (e) => {
    e.preventDefault();
    apuntarPropuestos().catch((error) => {
      console.error(error);
      avisar("No se ha podido apuntar en el cementerio.");
    });
  });
  dialogoMuertos.querySelector(".partida-muertos-descartar").addEventListener("click", () => {
    marcarMuertosVistos(idMuertos, propuestos.map((p) => p.llave));
    dialogoMuertos.close();
    repintar();
  });

  cargarVinculos(alLeer, repintar).catch((error) => console.error(error));
}
