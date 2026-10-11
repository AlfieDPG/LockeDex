// Combates, ROM, terminar el locke y salón de la fama (sección «Versus»).
//
// Cómo se gana un locke: hay que pasarse la ROM. Si no se la pasa nadie, no gana nadie; si
// solo uno, ese, aunque fuese perdiendo los combates; si varios, el que más combates gana. Los
// combates (cuántos y cuándo: «tras la 3ª medalla», «Liga»...) los pone quien crea el locke, y
// cada uno se juega fuera (en Showdown) y aquí se apunta quién ganó y cómo (al mejor de 3: 2-0,
// 2-1). Con 3 o más jugadores, cada combate lo gana uno y le suma un punto: vale para un
// todos contra todos o para un torneo por rondas.
//
//   · En la tarjeta del locke: una casilla por combate (pulsándola se apunta el resultado).
//   · En el bloque de cada uno: si se ha pasado la ROM (el tuyo, pulsándolo).
//   · «Terminar» (solo quien lo creó): propone el ganador según lo de arriba y se puede cambiar.
//   · Con el locke cerrado, cada uno pone su equipo final y su MVP (salón de la fama).
//
// Los datos están en js/comun/lockes.js (Combates, ROM y salón de la fama).

import { icono } from "../comun/iconos.js";
import { escaparHTML } from "../comun/utilidades.js";
import { usuarioActual } from "../comun/nube.js";
import { imagenConRespaldo, urlsPMD, urlSpriteHome } from "../comun/imagenes.js";
import { leerGuardados } from "../equipos/estado.js";
import {
  lockePorId, estadoDe, combatesDe, nombreCombate, victoriasDe, seHaPasadoLaRom, ganadorPropuesto,
  apuntarResultado, cambiarRom, elegirGanador, guardarSalon, estaEliminado, alCambiarLockes
} from "../comun/lockes.js";

const MARCADORES = ["2-0", "2-1", "1-0", "3-0", "3-1", "3-2"];

let alFallar = (error) => console.error(error);

function aceptados(locke) {
  return (locke.jugadores || []).filter((uid) => estadoDe(locke, uid) === "aceptado");
}

function nombreDe(locke, uid) {
  return (locke.nombres || {})[uid] || "Jugador";
}

function fotoDe(locke, uid, clase) {
  const foto = (locke.fotos || {})[uid] || "";
  const nombre = nombreDe(locke, uid);
  return foto
    ? `<img class="${clase}" src="${escaparHTML(foto)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="${clase} sin-foto">${escaparHTML(nombre[0].toUpperCase())}</span>`;
}

// Retrato de un Pokémon de un equipo guardado (el de su forma; si no hay, su render)
function cara(p, clase = "") {
  return imagenConRespaldo(
    [...urlsPMD(p), urlSpriteHome(p), p.sprite].filter(Boolean),
    `class="${clase}" alt="${escaparHTML(p.es || "")}" title="${escaparHTML(p.mote ? `${p.mote} (${p.es})` : p.es || "")}" loading="lazy"`
  );
}

// ---------- Plantillas (las usa js/versus/index.js) ----------

// Una casilla por combate, con su ganador y el marcador
export function plantillaCombates(locke) {
  const combates = combatesDe(locke);
  if (!combates.length) return "";
  const resultados = locke.resultados || {};
  const abierto = locke.estado !== "cerrado";

  return `
    <div class="locke-combates">
      ${combates
        .map((combate) => {
          const resultado = resultados[combate.id];
          const contenido = resultado
            ? `${fotoDe(locke, resultado.ganador, "combate-foto")}
               <span class="combate-ganador">${escaparHTML(nombreDe(locke, resultado.ganador))}</span>
               ${resultado.marcador ? `<span class="combate-marcador">${escaparHTML(resultado.marcador)}</span>` : ""}`
            : `<span class="combate-pendiente">Por jugar</span>`;
          return `
            <button class="locke-combate ${resultado ? "jugado" : ""}" data-combate="${escaparHTML(combate.id)}" ${abierto ? "" : "disabled"}>
              <span class="combate-nombre">${icono("espadas")} ${escaparHTML(nombreCombate(locke, combate.id))}</span>
              <span class="combate-resultado">${contenido}</span>
            </button>`;
        })
        .join("")}
    </div>`;
}

// ¿Se ha pasado la ROM? En tu bloque, un botón para marcarlo
export function plantillaRom(locke, uid, editable) {
  const pasada = seHaPasadoLaRom(locke, uid);
  const texto = `${icono(pasada ? "visto" : "mando")} ${pasada ? "ROM superada" : "ROM sin pasar"}`;
  return editable
    ? `<button class="locke-rom ${pasada ? "pasada" : ""}" title="${pasada ? "Desmarcar" : "Me he pasado la ROM"}">${texto}</button>`
    : `<span class="locke-rom ${pasada ? "pasada" : ""}">${texto}</span>`;
}

// Equipo final y MVP (con el locke cerrado). El tuyo se cambia con el lápiz.
export function plantillaSalon(locke, uid, mio) {
  const salon = (locke.salon || {})[uid];
  // Sin equipo, el hueco igual (vacío): así los bloques del locke quedan alineados
  if (!salon) {
    return mio ? `<button class="locke-salon-poner">${icono("estrella")} Equipo final</button>` : `<div class="locke-salon"></div>`;
  }
  return `
    <div class="locke-salon">
      <div class="locke-salon-caras">
        ${(salon.pokemon || [])
          .map((p, i) => `<span class="salon-cara ${i === salon.mvp ? "mvp" : ""}">${cara(p)}${i === salon.mvp ? `<span class="salon-mvp">MVP</span>` : ""}</span>`)
          .join("")}
      </div>
      ${mio ? `<button class="locke-salon-cambiar" title="Cambiar equipo final">${icono("lapiz")}</button>` : ""}
    </div>`;
}

// ---------- Apuntar un combate ----------

let dialogoCombate = null;
let enCombate = null; // { id (locke), idCombate, ganador, marcador }

function pintarCombate() {
  const locke = lockePorId(enCombate.id);
  if (!locke) return;
  dialogoCombate.querySelector(".combate-titulo").innerHTML =
    `${icono("espadas")} ${escaparHTML(nombreCombate(locke, enCombate.idCombate))}`;
  dialogoCombate.querySelector(".combate-ganadores").innerHTML = aceptados(locke)
    .map(
      (uid) => `
        <button type="button" class="combate-opcion ${enCombate.ganador === uid ? "elegido" : ""}" data-ganador="${escaparHTML(uid)}">
          ${fotoDe(locke, uid, "combate-opcion-foto")}
          <span>${escaparHTML(nombreDe(locke, uid))}</span>
        </button>`
    )
    .join("");
  dialogoCombate.querySelector(".combate-marcadores").innerHTML = MARCADORES.map(
    (marcador) => `<button type="button" class="combate-marcador-opcion ${enCombate.marcador === marcador ? "elegido" : ""}" data-marcador="${marcador}">${marcador}</button>`
  ).join("");
  dialogoCombate.querySelector(".combate-ok").disabled = !enCombate.ganador;
  dialogoCombate.querySelector(".combate-borrar").hidden = !((locke.resultados || {})[enCombate.idCombate]);
}

export function abrirCombate(id, idCombate) {
  const locke = lockePorId(id);
  if (!locke || locke.estado === "cerrado") return;
  const resultado = (locke.resultados || {})[idCombate] || {};
  enCombate = { id, idCombate, ganador: resultado.ganador || "", marcador: resultado.marcador || "" };
  pintarCombate();
  dialogoCombate.showModal();
}

// ---------- Terminar el locke ----------

let dialogoTerminar = null;
let terminando = null; // { id, elegido: uid o "" (nadie) }

function textoPropuesta(locke, ganadores) {
  if (!ganadores.length) return "Nadie se ha pasado la ROM: no gana nadie.";
  if (ganadores.length === 1) return `Gana ${nombreDe(locke, ganadores[0])}.`;
  return `Empate entre ${ganadores.map((uid) => nombreDe(locke, uid)).join(" y ")}: elige tú.`;
}

function pintarTerminar() {
  const locke = lockePorId(terminando.id);
  if (!locke) return;
  const { ganadores } = ganadorPropuesto(locke);
  const conCombates = combatesDe(locke).length > 0;

  const fila = (uid) => {
    const eliminado = estaEliminado(locke, uid);
    const rom = seHaPasadoLaRom(locke, uid);
    return `
      <button type="button" class="terminar-opcion ${terminando.elegido === uid ? "elegido" : ""}" data-ganador="${escaparHTML(uid)}">
        ${fotoDe(locke, uid, "combate-opcion-foto")}
        <span class="terminar-nombre">${escaparHTML(nombreDe(locke, uid))}</span>
        <span class="terminar-dato ${rom && !eliminado ? "bien" : ""}">${eliminado ? `${icono("calavera")} Eliminado` : `${icono(rom ? "visto" : "aspa")} ROM`}</span>
        <span class="terminar-dato">${icono("espadas")} ${victoriasDe(locke, uid)}${conCombates ? ` / ${combatesDe(locke).length}` : ""}</span>
      </button>`;
  };

  dialogoTerminar.querySelector(".terminar-propuesta").textContent = textoPropuesta(locke, ganadores);
  dialogoTerminar.querySelector(".terminar-lista").innerHTML =
    aceptados(locke).map(fila).join("") +
    `<button type="button" class="terminar-opcion nadie ${terminando.elegido === "" ? "elegido" : ""}" data-ganador="">
       <span class="terminar-nombre">${icono("aspa")} Nadie gana</span>
     </button>`;
}

export function abrirTerminar(id) {
  const locke = lockePorId(id);
  if (!locke || locke.estado === "cerrado") return;
  const { ganadores } = ganadorPropuesto(locke);
  terminando = { id, elegido: ganadores.length === 1 ? ganadores[0] : ganadores.length ? null : "" };
  pintarTerminar();
  dialogoTerminar.showModal();
}

// ---------- Equipo final y MVP ----------

let dialogoSalon = null;
let enSalon = null; // { id, equipo (copia), mvp }

// Lo justo de cada Pokémon para pintarlo (y nada de «undefined», que Firestore no acepta)
function copiaDeEquipo(equipo) {
  return JSON.parse(
    JSON.stringify({
      nombre: equipo.nombre || "Equipo",
      pokemon: (equipo.pokemon || []).map((p) => ({
        id: p.id, idForma: p.idForma, formaPMD: p.formaPMD, imagenForma: p.imagenForma,
        shiny: Boolean(p.shiny), es: p.es, mote: p.mote || "", sprite: p.sprite || ""
      }))
    })
  );
}

function pintarSalon() {
  const guardados = leerGuardados().filter((equipo) => (equipo.pokemon || []).length);
  dialogoSalon.querySelector(".salon-equipos").innerHTML = guardados.length
    ? guardados
        .map(
          (equipo) => `
            <button type="button" class="escaparate-equipo ${enSalon.idEquipo === equipo.id ? "destacado" : ""}" data-id="${escaparHTML(equipo.id)}">
              <strong>${escaparHTML(equipo.nombre || "Equipo")}</strong>
              <span class="perfil-equipo-caras">${equipo.pokemon.map((p) => cara(p)).join("")}</span>
            </button>`
        )
        .join("")
    : `<p class="perfil-vacio">No tienes equipos guardados.</p>`;

  const mvp = dialogoSalon.querySelector(".salon-mvp-elegir");
  mvp.hidden = !enSalon.equipo;
  mvp.querySelector(".salon-mvp-caras").innerHTML = enSalon.equipo
    ? enSalon.equipo.pokemon
        .map((p, i) => `<button type="button" class="salon-cara ${i === enSalon.mvp ? "mvp" : ""}" data-mvp="${i}">${cara(p)}${i === enSalon.mvp ? `<span class="salon-mvp">MVP</span>` : ""}</button>`)
        .join("")
    : "";
  dialogoSalon.querySelector(".salon-ok").disabled = !enSalon.equipo;
  const locke = lockePorId(enSalon.id);
  dialogoSalon.querySelector(".salon-quitar").hidden = !((locke && locke.salon) || {})[usuarioActual().uid];
}

export function abrirSalon(id) {
  const locke = lockePorId(id);
  if (!locke) return;
  const actual = (locke.salon || {})[usuarioActual().uid];
  enSalon = { id, idEquipo: null, equipo: actual ? { nombre: actual.nombre, pokemon: actual.pokemon } : null, mvp: actual ? actual.mvp : -1 };
  pintarSalon();
  dialogoSalon.showModal();
}

// ---------- Arranque ----------

// fallo(error): para que la sección diga que no se ha podido guardar
export function iniciarCombates(fallo) {
  alFallar = fallo;
  dialogoCombate = document.querySelector("#dialogo-combate");
  dialogoTerminar = document.querySelector("#dialogo-terminar");
  dialogoSalon = document.querySelector("#dialogo-salon");

  // Combate
  dialogoCombate.addEventListener("click", (e) => {
    const ganador = e.target.closest(".combate-opcion");
    const marcador = e.target.closest(".combate-marcador-opcion");
    if (ganador) enCombate.ganador = ganador.dataset.ganador;
    else if (marcador) enCombate.marcador = enCombate.marcador === marcador.dataset.marcador ? "" : marcador.dataset.marcador;
    else return;
    pintarCombate();
  });
  dialogoCombate.querySelector(".combate-cancelar").addEventListener("click", () => dialogoCombate.close());
  dialogoCombate.querySelector(".combate-borrar").addEventListener("click", () => {
    const { id, idCombate } = enCombate;
    dialogoCombate.close();
    apuntarResultado(id, idCombate, "", "").catch(alFallar);
  });
  dialogoCombate.querySelector(".combate-ok").addEventListener("click", () => {
    const { id, idCombate, ganador, marcador } = enCombate;
    if (!ganador) return;
    dialogoCombate.close();
    apuntarResultado(id, idCombate, ganador, marcador).catch(alFallar);
  });

  // Terminar
  dialogoTerminar.querySelector(".terminar-lista").addEventListener("click", (e) => {
    const opcion = e.target.closest(".terminar-opcion");
    if (!opcion) return;
    terminando.elegido = opcion.dataset.ganador;
    pintarTerminar();
  });
  dialogoTerminar.querySelector(".terminar-cancelar").addEventListener("click", () => dialogoTerminar.close());
  dialogoTerminar.querySelector(".terminar-ok").addEventListener("click", () => {
    const { id, elegido } = terminando;
    const locke = lockePorId(id);
    if (!locke || elegido === null) return;
    const texto = elegido ? `con ${nombreDe(locke, elegido)} como ganador` : "sin ganador";
    if (!confirm(`¿Cerrar «${locke.nombre}» ${texto}?\n\nEl locke dejará de poder editarse.`)) return;
    dialogoTerminar.close();
    elegirGanador(id, elegido).catch(alFallar);
  });

  // Salón de la fama
  dialogoSalon.querySelector(".salon-equipos").addEventListener("click", (e) => {
    const boton = e.target.closest(".escaparate-equipo");
    if (!boton) return;
    const equipo = leerGuardados().find((cada) => cada.id === boton.dataset.id);
    if (!equipo) return;
    enSalon.idEquipo = equipo.id;
    enSalon.equipo = copiaDeEquipo(equipo);
    enSalon.mvp = -1;
    pintarSalon();
  });
  dialogoSalon.querySelector(".salon-mvp-caras").addEventListener("click", (e) => {
    const boton = e.target.closest("[data-mvp]");
    if (!boton) return;
    const i = Number(boton.dataset.mvp);
    enSalon.mvp = enSalon.mvp === i ? -1 : i;
    pintarSalon();
  });
  dialogoSalon.querySelector(".salon-cancelar").addEventListener("click", () => dialogoSalon.close());
  dialogoSalon.querySelector(".salon-quitar").addEventListener("click", () => {
    dialogoSalon.close();
    guardarSalon(enSalon.id, null).catch(alFallar);
  });
  dialogoSalon.querySelector(".salon-ok").addEventListener("click", () => {
    if (!enSalon.equipo) return;
    dialogoSalon.close();
    guardarSalon(enSalon.id, enSalon.equipo, enSalon.mvp).catch(alFallar);
  });

  // Si cambia el locke con una ventana abierta (otro apunta algo), al día; si se cierra, fuera
  alCambiarLockes(() => {
    if (dialogoCombate.open) {
      const locke = lockePorId(enCombate.id);
      if (!locke || locke.estado === "cerrado") dialogoCombate.close();
    }
    if (dialogoTerminar.open) {
      const locke = lockePorId(terminando.id);
      if (!locke || locke.estado === "cerrado") dialogoTerminar.close();
      else pintarTerminar();
    }
  });
}

// El botón de la ROM de tu bloque
export function alternarRom(id) {
  const locke = lockePorId(id);
  const usuario = usuarioActual();
  if (!locke || !usuario) return;
  cambiarRom(id, !seHaPasadoLaRom(locke, usuario.uid)).catch(alFallar);
}
