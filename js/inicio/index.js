// Sección «Inicio»: lo primero que se ve al entrar y al pulsar el logo.
//
//   · Arriba, el saludo y, si hay algo sin contestar, cuántas notificaciones (abre la campana).
//   · Tus lockes en marcha, con tus vidas y victorias: pulsando uno se va a él en «Lockes».
//   · Los amigos conectados ahora mismo.
//   · Tus últimos equipos guardados.
//
// Las secciones no se repiten aquí: ya están en el menú de la izquierda.
// Sin sesión, solo el saludo con «Iniciar sesión» y los equipos.

import { icono } from "../comun/iconos.js";
import { escaparHTML } from "../comun/utilidades.js";
import { hayNube, usuarioActual, alCambiarSesion, seSabeLaSesion } from "../comun/nube.js";
import { nombreJuego } from "../comun/campo-juego.js";
import { carasDeEquipo } from "../comun/elegir-equipo.js";
import { leerGuardados } from "../equipos/estado.js";
import {
  miPerfil, alCambiarMiPerfil, amigosAceptados, solicitudesRecibidas, alCambiarAmistades,
  perfilesDeAmigos, alCambiarPerfilesAmigos, colorDeTipo
} from "../comun/perfiles.js";
import { estaConectado, alCambiarPresencia } from "../comun/presencia.js";
import {
  alCambiarLockes, misLockes, invitacionesALockes, estadoDe, estaEliminado, victoriasDe
} from "../comun/lockes.js";
import { irA } from "../navegacion.js";

let seccion = null;

const MAX_LOCKES = 4;
const MAX_EQUIPOS = 3;

// ---------- Pintar ----------

function conSesion() {
  return hayNube() && Boolean(usuarioActual());
}

function lockesEnMarcha() {
  return misLockes()
    .filter((locke) => locke.estado !== "cerrado")
    .sort((uno, otro) => (otro.actualizado || 0) - (uno.actualizado || 0));
}

function amigosConectados() {
  const perfiles = perfilesDeAmigos();
  return amigosAceptados()
    .map((amistad) => perfiles.get(amistad.otro))
    .filter((perfil) => perfil && estaConectado(perfil.uid))
    .sort((uno, otro) => (uno.nombre || "").localeCompare(otro.nombre || "", "es"));
}

function cara(nombre, foto, clase = "inicio-cara") {
  const inicial = escaparHTML(((nombre || "?").trim()[0] || "?").toUpperCase());
  return foto
    ? `<span class="${clase}"><img src="${escaparHTML(foto)}" alt="" referrerpolicy="no-referrer" data-respaldo="" data-quitar-si-falla></span>`
    : `<span class="${clase} sin-foto">${inicial}</span>`;
}

function plantillaCabecera() {
  const perfil = miPerfil();
  const nombre = conSesion() ? (perfil && perfil.nombre) || "" : "";
  const pendientes = conSesion() ? invitacionesALockes().length + solicitudesRecibidas().length : 0;

  return `
    <header class="inicio-cabecera">
      <img class="inicio-logo" src="img/pokeball-180.png" alt="">
      <div class="inicio-saludo">
        <h1>${nombre ? `Hola, ${escaparHTML(nombre)}` : "LockeDex"}</h1>
      </div>
      ${pendientes
        ? `<button class="inicio-avisos">${icono("campana")} ${pendientes} sin contestar</button>`
        : ""}
      ${hayNube() && seSabeLaSesion() && !usuarioActual() ? `<button class="inicio-entrar">Iniciar sesión</button>` : ""}
    </header>`;
}

function plantillaLocke(locke) {
  const uid = usuarioActual().uid;
  const tipo = locke.tipo || { nombre: "Locke", color: "#3498db" };
  const juego = nombreJuego(locke);
  const jugadores = (locke.jugadores || []).filter((cada) => estadoDe(locke, cada) === "aceptado");
  // El tuyo, el primero
  jugadores.sort((uno, otro) => (otro === uid) - (uno === uid));

  const vidas = locke.vidasIlimitadas ? "∞" : (locke.vidas || {})[uid] || 0;
  const fuera = estaEliminado(locke, uid);

  return `
    <button class="inicio-locke" data-id="${escaparHTML(locke.id)}" style="--color-locke: ${colorDeTipo(tipo)}">
      <span class="inicio-locke-datos">
        <span class="inicio-locke-tipo">${escaparHTML(tipo.nombre)}</span>
        <strong class="inicio-locke-nombre">${escaparHTML(locke.nombre)}</strong>
        ${juego ? `<span class="inicio-locke-juego">${escaparHTML(juego)}</span>` : ""}
      </span>
      <span class="inicio-locke-caras">
        ${jugadores.map((cada) => cara((locke.nombres || {})[cada], (locke.fotos || {})[cada])).join("")}
      </span>
      <span class="inicio-locke-cifras">
        <span class="inicio-cifra victorias" title="Victorias">${icono("espadas")} ${victoriasDe(locke, uid)}</span>
        <span class="inicio-cifra vidas ${fuera ? "fuera" : ""}" title="Vidas">${icono(fuera ? "calavera" : "corazon")} ${fuera ? "" : vidas}</span>
      </span>
    </button>`;
}

function plantillaLockes() {
  const enMarcha = lockesEnMarcha();
  const quedan = enMarcha.length - MAX_LOCKES;

  return `
    <section class="inicio-bloque inicio-lockes">
      <h2>${icono("espadas")} Lockes en marcha</h2>
      ${enMarcha.length
        ? enMarcha.slice(0, MAX_LOCKES).map(plantillaLocke).join("")
        : `<p class="inicio-vacio">Ninguno ahora mismo.</p>`}
      <div class="inicio-pie">
        ${quedan > 0 ? `<button data-vista="lockes">Ver todos (${quedan} más)</button>` : ""}
        <button class="inicio-principal inicio-nuevo">${icono("mas")} Nuevo locke</button>
      </div>
    </section>`;
}

function plantillaAmigos() {
  const conectados = amigosConectados();

  return `
    <section class="inicio-bloque inicio-amigos">
      <h2>${icono("amigos")} Conectados</h2>
      ${conectados.length
        ? `<div class="inicio-amigos-lista">${conectados
            .map(
              (perfil) => `
                <button class="inicio-amigo" data-perfil="${escaparHTML(perfil.uid)}" title="Ver perfil">
                  ${cara(perfil.nombre, perfil.foto, "inicio-cara grande")}
                  <span>${escaparHTML(perfil.nombre || "Amigo")}</span>
                </button>`
            )
            .join("")}</div>`
        : `<p class="inicio-vacio">${amigosAceptados().length ? "Nadie ahora mismo." : "Aún no tienes amigos."}</p>`}
    </section>`;
}

// Los últimos que has guardado o cambiado; pulsando uno se va a «Mis equipos»
function plantillaEquipos() {
  const equipos = (leerGuardados() || [])
    .filter((equipo) => equipo && (equipo.pokemon || []).length)
    .sort((uno, otro) => (otro.actualizado || 0) - (uno.actualizado || 0));

  return `
    <section class="inicio-bloque inicio-equipos">
      <h2>${icono("pokeball")} Últimos equipos</h2>
      ${equipos.length
        ? equipos
            .slice(0, MAX_EQUIPOS)
            .map(
              (equipo) => `
                <button class="inicio-equipo" data-vista="equipos">
                  <strong>${escaparHTML(equipo.nombre || "Equipo")}</strong>
                  ${carasDeEquipo(equipo)}
                </button>`
            )
            .join("")
        : `<p class="inicio-vacio">Ninguno guardado.</p>`}
      <div class="inicio-pie">
        ${equipos.length > MAX_EQUIPOS ? `<button data-vista="equipos">Ver todos (${equipos.length})</button>` : ""}
        <button class="inicio-principal" data-vista="crear">${icono("mas")} Crear equipo</button>
      </div>
    </section>`;
}

function pintar() {
  if (seccion.hidden) return;
  seccion.innerHTML = `
    ${plantillaCabecera()}
    ${conSesion()
      ? `<div class="inicio-columnas">
           ${plantillaLockes()}
           <div class="inicio-lado">${plantillaAmigos()}${plantillaEquipos()}</div>
         </div>`
      : `<div class="inicio-solo">${plantillaEquipos()}</div>`}`;
}

// ---------- Ir a un sitio ----------

// A «Lockes» y, si está en la lista, hasta ese locke (se ilumina un momento)
async function irAlLocke(id) {
  await irA("lockes");
  const tarjeta = document.querySelector(`#vista-lockes .locke[data-id="${CSS.escape(id)}"]`);
  if (!tarjeta) return;
  tarjeta.scrollIntoView({ behavior: "smooth", block: "center" });
  tarjeta.classList.remove("resaltado");
  void tarjeta.offsetWidth; // para que la animación vuelva a empezar
  tarjeta.classList.add("resaltado");
}

async function nuevoLocke() {
  await irA("lockes");
  const boton = document.querySelector("#nuevo-locke");
  if (boton && !boton.hidden) boton.click();
}

// ---------- Arranque ----------

export function iniciar() {
  seccion = document.querySelector("#vista-inicio");

  seccion.addEventListener("click", (e) => {
    const locke = e.target.closest(".inicio-locke");
    if (locke) return irAlLocke(locke.dataset.id);
    const destino = e.target.closest("[data-vista]");
    if (destino) return irA(destino.dataset.vista);
    if (e.target.closest(".inicio-nuevo")) return nuevoLocke();
    if (e.target.closest(".inicio-avisos")) return document.querySelector(".avisos-boton").click();
    if (e.target.closest(".inicio-entrar")) return document.querySelector(".sesion-boton").click();
  });

  // Todo en vivo: se repinta solo mientras se ve
  alCambiarSesion(pintar);
  alCambiarMiPerfil(pintar);
  alCambiarLockes(pintar);
  alCambiarAmistades(pintar);
  alCambiarPerfilesAmigos(pintar);
  alCambiarPresencia(pintar);
}

export function mostrar() {
  pintar();
}
