// Sección «Inicio»: lo primero que se ve al entrar y al pulsar el logo.
//
//   · Arriba, el saludo y, si hay algo sin contestar, cuántas notificaciones (abre la campana).
//   · Tus lockes en marcha, con tus vidas y victorias: pulsando uno se va a él en «Lockes».
//   · Los amigos conectados ahora mismo.
//   · Tus últimos equipos guardados.
//   · Notas / Avisos del desarrollador para todos los usuarios.
//
// Las secciones no se repiten aquí: ya están en el menú de la izquierda.
// Sin sesión, solo el saludo con «Iniciar sesión», los equipos y el cuadro de avisos.

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

// =========================================================================
// 📝 TEXTO DE AVISO / NOTAS DE LA WEB
// Escribe aquí lo que quieras anunciar a los usuarios.
// Puedes usar saltos de línea normales o etiquetas HTML como <b>texto en negrita</b> o <ul><li>puntos</li></ul>
// =========================================================================
const AVISO_INICIO = `
¡Bienvenidos a LockeDex!
Quiero avisaros de que esta web está en desarrollo y puede tener errores. Si encuentras alguno, por favor, házmelo saber mediante el recuadro de sugerencias de abajo o si se te ocurre alguna idea que consideras que le vendria bien a la pagina tambien, todo feedback respetuoso es bienvenido :)

⚠️AVISOS⚠️
- El Randomizer solo funciona con ROMS de NDS y 3DS. Estoy en proceso de incluir los juegos de Switch y GBA.
- La web se vincula con todos los juegos menos Diamante Brillante y Perla Reluciente (work in progress).
- Si teneis cualquier duda podeis consultar el boton de "?" de abajo a la izquierda y alomejor encontrais ahi la respuesta, si no, enviad un correo y se añadirá la duda a "preguntas frecuentes".
- Para el Randomizer es necesario que vosotros tengais las ROMS ya que yo no puedo darlos porque eso seria pirateria y no me apetece ir a la carcel :)
`;

function plantillaAvisos() {
  if (!AVISO_INICIO.trim()) return ""; // Si la dejas vacía, la tarjeta no se muestra

  return `
    <section class="inicio-bloque inicio-avisos-web">
      <h2>${icono("libro")} Notas y avisos</h2>
      <div class="inicio-avisos-contenido">
        ${AVISO_INICIO.trim().replace(/\n/g, "<br>")}
      </div>
    </section>`;
}

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
      : `<div class="inicio-solo">${plantillaEquipos()}</div>`}
    ${plantillaAvisos()}
    ${plantillaSugerencias()}`;
}

// Añade esta plantilla para el bloque de sugerencias
function plantillaSugerencias() {
  // SVGs directos con la clase "icono" para garantizar que se vean igual que los demás de la web
  const iconoSobre = `<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
  const iconoEnviar = `<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  return `
    <section class="inicio-bloque inicio-sugerencias">
      <h2>${iconoSobre} Enviar sugerencia</h2>
      <p class="sugerencias-subtexto">¿Tienes alguna idea, fallo que reportar o comentario sobre la web? ¡Escríbeme!</p>
      <form class="sugerencias-form">
        <textarea class="sugerencias-texto" placeholder="Escribe aquí tu comentario o sugerencia..." required></textarea>
        <div class="sugerencias-pie">
          <button type="submit" class="inicio-principal boton-sugerencias">
            ${iconoEnviar}
            <span>Enviar comentario</span>
          </button>
          <span class="sugerencias-aviso"></span>
        </div>
      </form>
    </section>`;
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

  // Dentro de la función iniciar() en js/inicio/index.js
seccion.addEventListener("submit", async (e) => {
  if (e.target.matches(".sugerencias-form")) {
    e.preventDefault();
    const form = e.target;
    const texto = form.querySelector(".sugerencias-texto").value;
    const aviso = form.querySelector(".sugerencias-aviso");
    const boton = form.querySelector("button");

    boton.disabled = true;
    aviso.textContent = "Enviando...";

    try {
      // Reemplaza TU_CORREO@GMAIL.COM por tu correo real
      const respuesta = await fetch("https://formsubmit.co/ajax/alfdelgar@gmail.com", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          message: texto,
          usuario: conSesion() ? miPerfil()?.nombre || "Usuario registrado" : "Anónimo"
        })
      });

      if (respuesta.ok) {
        aviso.style.color = "#2ecc71";
        aviso.textContent = "¡Gracias! Tu mensaje ha sido enviado.";
        form.reset();
      } else {
        throw new Error();
      }
    } catch (err) {
      aviso.style.color = "#e74c3c";
      aviso.textContent = "Error al enviar. Inténtalo de nuevo más tarde.";
    } finally {
      boton.disabled = false;
    }
  }
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