// Ventana del perfil: el tuyo (desde el desplegable de tu nombre) o el de un amigo (desde tu
// lista de amigos o desde «Amigos»). En vertical, una cosa debajo de otra:
//
//   · Foto: la de Google o un Pokémon (su retrato de Mundo Misterioso). En el tuyo, pulsándola
//     se cambia.
//   · Nombre, con un lápiz para cambiarlo (es el nombre de usuario, ver perfiles.js).
//   · Título: el nombre de uno de sus logros, el que elija.
//   · Lockes ganados y, en el tuyo, amigos; en el de un amigo, los lockes jugados juntos en
//     total (los mismos que cuenta la rivalidad de «Amigos»: js/comun/cara-a-cara.js).
//   · Equipos destacados: los que cada uno elige enseñar (hasta MAX_DESTACADOS). Se ven los
//     VER_DESTACADOS primeros y el resto en otra ventana, donde el dueño los ordena. Se guarda
//     una copia en el perfil (escaparate), que es lo que pueden leer los demás: tus equipos de
//     verdad son privados.
//   · En el tuyo, tus VER_AMIGOS amigos con los que más lockes has jugado: pulsando uno se ve
//     su perfil. Todos están en «Amigos».
//   · Pestaña «Logros»: los que tiene esa persona (js/comun/logros.js).
//
// Se descarga la primera vez que se abre (ver sesion.js).

import { icono } from "./comun/iconos.js";
import { escaparHTML, fechaLarga } from "./comun/utilidades.js";
import { usuarioActual } from "./comun/nube.js";
import {
  miPerfil, alCambiarMiPerfil, cambiarMote, guardarMiPerfil, amigosAceptados, perfilesDeAmigos,
  alCambiarPerfilesAmigos
} from "./comun/perfiles.js";
import { alCambiarLockes } from "./comun/lockes.js";
import { caraACara } from "./comun/cara-a-cara.js";
import { estaConectado, alCambiarPresencia } from "./comun/presencia.js";
import { irA } from "./navegacion.js";
import { leerGuardados } from "./equipos/estado.js";
import { pasteDelEquipo, copiarAlPortapapeles } from "./equipos/exportar.js";
import {
  imagenConRespaldo, urlsPMD, urlsPMDEmocion, urlSpriteHome, urlSpritePixel, precargarImagen
} from "./comun/imagenes.js";
import { cargarDatos, datos } from "./comun/datos.js";
import { activarAutocompletado, iconoPokemon } from "./comun/autocompletado.js";
import { obtenerVariedades } from "./comun/formas.js";
import { elegirForma, datosDeForma } from "./comun/elegir-forma.js";
import { LOGROS, insignia } from "./comun/logros.js";
import {
  FONDOS_METAL, FONDOS_TIPO, fondoDe, logrosDe, desbloqueado, requisito, claseFondo, estiloFondo
} from "./comun/fondos.js";

const MAX_DESTACADOS = 12;   // los que caben en el perfil (cada uno es una copia dentro de él)
const VER_DESTACADOS = 3;    // los que se ven sin pulsar «Ver todos»
const VER_AMIGOS = 5;

const dialogo = document.querySelector("#dialogo-perfil");
const cuerpo = dialogo.querySelector(".perfil-cuerpo");
const dialogoAvatar = document.querySelector("#dialogo-avatar");
const dialogoEscaparate = document.querySelector("#dialogo-escaparate");
const dialogoDestacados = document.querySelector("#dialogo-destacados");
const dialogoTitulo = document.querySelector("#dialogo-titulo");

let viendo = null;           // uid del amigo cuyo perfil se ve, o null si es el tuyo
let desdeMiPerfil = false;   // se llegó al del amigo desde tu lista (sale «Volver»)
let pestana = "perfil";      // "perfil" o "logros"
let editandoNombre = false;
let errorNombre = "";

// ---------- Piezas ----------

function plantillaFoto(perfil, clase) {
  const nombre = perfil.nombre || "?";
  return perfil.foto
    ? `<img class="${clase}" src="${escaparHTML(perfil.foto)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="${clase} sin-foto">${escaparHTML(nombre[0].toUpperCase())}</span>`;
}

function caraDe(p) {
  const cara = p.cara && p.cara !== "Normal" ? p.cara : "";
  const titulo = p.mote ? `${p.mote} (${p.es})` : p.es;
  return imagenConRespaldo(
    [...(cara ? urlsPMDEmocion(p, cara) : []), ...urlsPMD(p), urlSpriteHome(p), p.sprite],
    `alt="${escaparHTML(p.es || "")}" title="${escaparHTML(titulo || "")}" loading="lazy"`
  );
}

// ordenar: en la ventana de todos los destacados, el dueño los sube y los baja
function plantillaEquipo(equipo, indice, mio, ordenar = false, total = 0) {
  const mover = ordenar
    ? `<button class="perfil-subir-equipo" data-indice="${indice}" title="Subir" ${indice === 0 ? "disabled" : ""}>${icono("arriba")}</button>
       <button class="perfil-bajar-equipo" data-indice="${indice}" title="Bajar" ${indice === total - 1 ? "disabled" : ""}>${icono("abajo")}</button>`
    : "";
  return `
    <article class="perfil-equipo">
      <header>
        <strong>${escaparHTML(equipo.nombre)}</strong>
        <div class="perfil-equipo-botones">
          ${mover}
          <button class="perfil-copiar" data-indice="${indice}" title="Copiar como paste">${icono("copiar")}</button>
          ${mio ? `<button class="perfil-quitar-equipo" data-indice="${indice}" title="Dejar de destacar">${icono("aspa")}</button>` : ""}
        </div>
      </header>
      <div class="perfil-equipo-caras">${(equipo.pokemon || []).map(caraDe).join("")}</div>
    </article>`;
}

// El nombre y, al cambiarlo, la casilla en el mismo sitio y del mismo alto: no se mueve nada
function plantillaNombre(perfil, mio) {
  if (mio && editandoNombre) {
    return `
      <form class="perfil-nombre-fila perfil-nombre-form">
        <input class="perfil-nombre-campo" type="text" maxlength="20" autocomplete="off" value="${escaparHTML(perfil.mote || "")}">
        <button type="submit" class="perfil-nombre-ok" title="Guardar">${icono("visto")}</button>
        <button type="button" class="perfil-nombre-cancelar" title="Cancelar">${icono("aspa")}</button>
      </form>`;
  }
  return `
    <div class="perfil-nombre-fila">
      <h2 class="perfil-nombre">${escaparHTML(perfil.nombre)}</h2>
      ${mio ? `<button class="perfil-editar-nombre" title="Cambiar nombre">${icono("lapiz")}</button>` : ""}
    </div>`;
}

// El título: el nombre de uno de sus logros, el que haya elegido (perfil.titulo), debajo del
// nombre. Solo si ese logro lo tiene. En el tuyo, pulsándolo se cambia.
function tituloDe(perfil) {
  const logro = LOGROS.find((cada) => cada.id === perfil.titulo);
  return logro && (perfil.logros || {})[logro.id] ? logro : null;
}

function plantillaTitulo(perfil, mio) {
  const logro = tituloDe(perfil);
  if (mio) {
    return `<button class="perfil-titulo ${logro ? `nivel-${logro.nivel}` : "sin-titulo"}" title="Cambiar título" ${editandoNombre ? "disabled" : ""}>
              ${escaparHTML(logro ? logro.nombre : "Elegir título")}
            </button>`;
  }
  return logro ? `<span class="perfil-titulo nivel-${logro.nivel}">${escaparHTML(logro.nombre)}</span>` : "";
}

function pintarTitulos() {
  const perfil = miPerfil() || {};
  const tengo = perfil.logros || {};
  const conseguidos = LOGROS.filter((logro) => tengo[logro.id]);
  dialogoTitulo.querySelector(".titulo-lista").innerHTML = conseguidos.length
    ? conseguidos
        .map(
          (logro) => `
            <button class="titulo-opcion ${logro.id === perfil.titulo ? "elegido" : ""}" data-logro="${escaparHTML(logro.id)}"
                    title="${escaparHTML(logro.descripcion)}">
              ${insignia(logro, true)}
              <span>${escaparHTML(logro.nombre)}</span>
            </button>`
        )
        .join("")
    : `<p class="perfil-vacio">Todavía no tienes logros.</p>`;
  dialogoTitulo.querySelector(".titulo-quitar").hidden = !tituloDe(perfil);
}

async function ponerTitulo(id) {
  await guardarMiPerfil({ titulo: id });
  dialogoTitulo.close();
}

// El fondo de tu tarjeta de «Amigos» (js/comun/fondos.js). Plegado, solo unos pocos (el que
// llevas y otros que ya tienes) y un «+» para verlos todos: los de metal y los 18 de tipo, los
// que aún no tienes con un candado y lo que piden.
const VER_FONDOS = 3;
let fondosEnteros = false;

function plantillaFondos(perfil) {
  const puesto = fondoDe(perfil);
  const tengo = logrosDe(perfil);
  const muestra = (fondo) => {
    const libre = !fondo.id || desbloqueado(fondo, perfil);
    const pide = fondo.logro ? requisito(fondo) : `Se desbloquea con ${fondo.logros} logros (tienes ${tengo})`;
    return `
      <button class="perfil-fondo ${claseFondo(fondo.id)} ${fondo.id === puesto ? "elegido" : ""}"
              style="${estiloFondo(fondo.id)}" data-fondo="${fondo.id}" ${libre ? "" : "disabled"}
              title="${escaparHTML(libre ? fondo.nombre : pide)}">
        <span class="perfil-fondo-nombre">${libre ? "" : icono("candado")} ${fondo.nombre}</span>
        ${libre || fondo.logro ? "" : `<small>${fondo.logros} logros</small>`}
      </button>`;
  };
  const normal = { id: "", nombre: "Sin fondo" };
  const todos = [normal, ...FONDOS_METAL, ...FONDOS_TIPO];

  if (!fondosEnteros) {
    // El puesto primero; luego «Normal» y los que ya tienes (los más nuevos de metal antes)
    const libres = [...FONDOS_METAL].reverse().concat(FONDOS_TIPO).filter((fondo) => desbloqueado(fondo, perfil));
    const pocos = [todos.find((fondo) => fondo.id === puesto) || normal, normal, ...libres]
      .filter((fondo, i, lista) => lista.indexOf(fondo) === i)
      .slice(0, VER_FONDOS);
    const quedan = todos.length - pocos.length;
    return `
      <section class="perfil-apartado">
        <h3>Fondo de tu tarjeta</h3>
        <div class="perfil-fondos">
          ${pocos.map(muestra).join("")}
          <button class="perfil-fondo perfil-fondos-mas" title="Ver todos los fondos">${icono("mas")}<small>${quedan} más</small></button>
        </div>
      </section>`;
  }

  return `
    <section class="perfil-apartado">
      <h3>Fondo de tu tarjeta <button class="perfil-fondos-mas perfil-fondos-menos">Ver menos</button></h3>
      <div class="perfil-fondos">${[normal, ...FONDOS_METAL].map(muestra).join("")}</div>
      <div class="perfil-fondos perfil-fondos-tipo">${FONDOS_TIPO.map(muestra).join("")}</div>
    </section>`;
}

// Lockes jugados juntos en total (los de Versus, en marcha o terminados, y los apuntados a
// mano): lo mismo que la rivalidad de «Amigos»
function lockesJuntos(amigo) {
  const mio = miPerfil();
  return mio && amigo ? caraACara(mio, amigo).juntos : 0;
}

function textoLockes(cuantos) {
  return `${cuantos} ${cuantos === 1 ? "locke" : "lockes"}`;
}

// Los VER_AMIGOS con los que más has jugado (a igualdad, los conectados y por nombre)
function plantillaAmigos() {
  const juntos = new Map(
    amigosAceptados()
      .map((amistad) => perfilesDeAmigos().get(amistad.otro))
      .filter(Boolean)
      .map((amigo) => [amigo.uid, lockesJuntos(amigo)])
  );
  const todos = amigosAceptados()
    .map((amistad) => perfilesDeAmigos().get(amistad.otro))
    .filter(Boolean)
    .sort(
      (uno, otro) =>
        (juntos.get(otro.uid) || 0) - (juntos.get(uno.uid) || 0) ||
        Number(estaConectado(otro.uid)) - Number(estaConectado(uno.uid)) ||
        uno.nombre.localeCompare(otro.nombre, "es")
    );

  return `
    <section class="perfil-apartado">
      <h3>
        Amigos
        ${todos.length > VER_AMIGOS ? `<button class="perfil-ver-amigos">Ver todos (${todos.length})</button>` : ""}
      </h3>
      ${todos.length
        ? `<div class="perfil-amigos">${todos
            .slice(0, VER_AMIGOS)
            .map(
              (amigo) => `
                <button class="perfil-amigo ${estaConectado(amigo.uid) ? "conectado" : ""}" data-uid="${escaparHTML(amigo.uid)}"
                        title="${escaparHTML(amigo.nombre)}">
                  ${plantillaFoto(amigo, "perfil-amigo-foto")}
                  <span class="perfil-amigo-nombre">${escaparHTML(amigo.nombre)}</span>
                  <small>${textoLockes(juntos.get(amigo.uid) || 0)}</small>
                </button>`
            )
            .join("")}</div>`
        : `<p class="perfil-vacio">Todavía ninguno.</p>`}
    </section>`;
}

// ---------- Salón de la fama ----------
//
// El equipo final y el MVP de cada locke terminado (perfil.salon, lo apunta cada uno desde
// el locke: js/versus/combates.js). Los VER_SALON últimos y el resto, al pulsar «Ver todos».

const VER_SALON = 3;
let salonEntero = false;

function plantillaSalon(perfil) {
  const salon = perfil.salon || [];
  if (!salon.length) return "";
  const visibles = salonEntero ? salon : salon.slice(0, VER_SALON);

  return `
    <section class="perfil-apartado">
      <h3>
        Salón de la fama
        ${salon.length > VER_SALON ? `<button class="perfil-ver-salon">${salonEntero ? "Ver menos" : `Ver todos (${salon.length})`}</button>` : ""}
      </h3>
      <div class="perfil-equipos">
        ${visibles
          .map(
            (entrada) => `
              <article class="perfil-equipo perfil-salon ${entrada.gano ? "gano" : ""}">
                <header>
                  <strong>${entrada.gano ? icono("corona") : ""}${escaparHTML(entrada.locke || "Locke")}</strong>
                  ${entrada.fechaFin ? `<small>${escaparHTML(fechaLarga(entrada.fechaFin))}</small>` : ""}
                </header>
                <div class="perfil-equipo-caras">
                  ${(entrada.pokemon || [])
                    .map((p, i) => `<span class="salon-cara ${i === entrada.mvp ? "mvp" : ""}">${caraDe(p)}${i === entrada.mvp ? `<span class="salon-mvp">MVP</span>` : ""}</span>`)
                    .join("")}
                </div>
              </article>`
          )
          .join("")}
      </div>
    </section>`;
}

// ---------- Pestaña de logros ----------
//
// Los suyos (perfil.logros: { id: fecha }, ver js/comun/logros.js), del último al primero, y
// detrás, apagados, los que le faltan. Lo que pide cada uno, al pasar el ratón.

function plantillaLogrosDe(perfil) {
  const tengo = perfil.logros || {};
  const conseguidos = LOGROS.filter((logro) => tengo[logro.id]).sort((uno, otro) => tengo[otro.id] - tengo[uno.id]);
  const faltan = LOGROS.filter((logro) => !tengo[logro.id]);

  const ficha = (logro, hecho) => {
    const cuando = hecho
      ? ` · ${new Date(tengo[logro.id]).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`
      : "";
    return `
      <div class="perfil-logro ${hecho ? "conseguido" : ""}" title="${escaparHTML(logro.descripcion + cuando)}">
        ${insignia(logro, hecho)}
        <span>${escaparHTML(logro.nombre)}</span>
      </div>`;
  };

  return `
    <section class="perfil-apartado">
      ${conseguidos.length
        ? `<div class="perfil-logros">${conseguidos.map((logro) => ficha(logro, true)).join("")}</div>`
        : `<p class="perfil-vacio">Todavía ninguno.</p>`}
      ${faltan.length
        ? `<h3 class="perfil-logros-faltan">Por conseguir <small>${faltan.length}</small></h3>
           <div class="perfil-logros">${faltan.map((logro) => ficha(logro, false)).join("")}</div>`
        : ""}
    </section>`;
}

// ---------- Pintar ----------

function perfilQueSeVe() {
  return viendo ? perfilesDeAmigos().get(viendo) : miPerfil();
}

function pintar() {
  const perfil = perfilQueSeVe();
  const mio = !viendo;
  if (!perfil) {
    cuerpo.innerHTML = "";
    return;
  }

  const escaparate = perfil.escaparate || [];
  const ganados = (perfil.ganados || []).length;
  const amigos = amigosAceptados().length;
  const juntos = mio ? 0 : lockesJuntos(perfil);

  // Con un error al cambiar el nombre, sale en el hueco de las cifras (así no se mueve nada)
  const cifras = mio && editandoNombre && errorNombre
    ? `<span class="perfil-error">${escaparHTML(errorNombre)}</span>`
    : `<span><strong>${ganados}</strong> ${ganados === 1 ? "locke ganado" : "lockes ganados"}</span>
       ${mio
         ? `<span><strong>${amigos}</strong> ${amigos === 1 ? "amigo" : "amigos"}</span>`
         : `<span><strong>${juntos}</strong> ${juntos === 1 ? "locke" : "lockes"} juntos</span>`}`;

  const quedan = escaparate.length - VER_DESTACADOS;
  const logros = Object.keys(perfil.logros || {}).filter((id) => LOGROS.some((logro) => logro.id === id)).length;

  const cabeza = `
    <header class="perfil-cabeza">
      ${mio
        ? `<button class="perfil-avatar" title="Cambiar foto">${plantillaFoto(perfil, "perfil-foto")}<span class="perfil-avatar-lapiz">${icono("lapiz")}</span></button>`
        : `<div class="perfil-avatar">${plantillaFoto(perfil, "perfil-foto")}</div>`}
      ${plantillaNombre(perfil, mio)}
      ${plantillaTitulo(perfil, mio)}
      <div class="perfil-cifras">${cifras}</div>
    </header>

    <div class="perfil-pestanas">
      <button data-pestana="perfil" class="${pestana === "perfil" ? "activa" : ""}">${icono("persona")} Perfil</button>
      <button data-pestana="logros" class="${pestana === "logros" ? "activa" : ""}">${icono("trofeo")} Logros <small>${logros}/${LOGROS.length}</small></button>
    </div>`;

  cuerpo.innerHTML = pestana === "logros" ? cabeza + plantillaLogrosDe(perfil) : `
    ${cabeza}

    <section class="perfil-apartado">
      <h3>
        Equipos destacados
        ${mio && escaparate.length < MAX_DESTACADOS ? `<button class="perfil-destacar">${icono("mas")} Destacar</button>` : ""}
      </h3>
      ${escaparate.length
        ? `<div class="perfil-equipos">${escaparate
            .slice(0, VER_DESTACADOS)
            .map((equipo, indice) => plantillaEquipo(equipo, indice, mio))
            .join("")}</div>`
        : `<p class="perfil-vacio">Ninguno todavía.</p>`}
      ${quedan > 0 || (mio && escaparate.length > 1)
        ? `<button class="perfil-ver-equipos">${quedan > 0 ? `Ver todos (${escaparate.length})` : "Ordenar"}</button>`
        : ""}
    </section>

    ${plantillaSalon(perfil)}

    ${mio ? plantillaFondos(perfil) : ""}

    ${mio ? plantillaAmigos() : ""}`;

  dialogo.querySelector(".perfil-borrar").hidden = !mio;
  dialogo.querySelector(".perfil-volver").hidden = mio || !desdeMiPerfil;

  if (mio && editandoNombre) {
    const campo = cuerpo.querySelector(".perfil-nombre-campo");
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
  }
}

// ---------- Todos los destacados ----------

function pintarDestacados() {
  const perfil = perfilQueSeVe();
  const mio = !viendo;
  const escaparate = (perfil && perfil.escaparate) || [];

  dialogoDestacados.querySelector(".destacados-lista").innerHTML = escaparate.length
    ? escaparate.map((equipo, indice) => plantillaEquipo(equipo, indice, mio, mio, escaparate.length)).join("")
    : `<p class="perfil-vacio">Ninguno todavía.</p>`;
  dialogoDestacados.querySelector(".destacados-anadir").hidden = !mio || escaparate.length >= MAX_DESTACADOS;
}

function abrirDestacados() {
  pintarDestacados();
  dialogoDestacados.showModal();
}

// ---------- Abrir ----------

export function abrirMiPerfil() {
  if (!usuarioActual()) return;
  viendo = null;
  desdeMiPerfil = false;
  editandoNombre = false;
  pestana = "perfil";
  salonEntero = false;
  fondosEnteros = false;
  pintar();
  if (!dialogo.open) dialogo.showModal();
}

export function abrirPerfilDe(uid, desdeElMio = false) {
  viendo = uid;
  desdeMiPerfil = desdeElMio;
  editandoNombre = false;
  pestana = "perfil";
  salonEntero = false;
  pintar();
  if (!dialogo.open) dialogo.showModal();
}

// ---------- Nombre ----------

async function guardarNombre() {
  const campo = cuerpo.querySelector(".perfil-nombre-campo");
  const nuevo = campo.value.trim();
  for (const boton of cuerpo.querySelectorAll(".perfil-nombre-form button")) boton.disabled = true;
  errorNombre = await cambiarMote(nuevo);
  if (!errorNombre) editandoNombre = false;
  pintar();
}

// ---------- Equipos destacados ----------

// Lo justo para pintarlo y para copiarlo como paste. JSON de ida y vuelta para quitar los
// «undefined», que Firestore no acepta.
function copiaDeEquipo(equipo) {
  return JSON.parse(
    JSON.stringify({
      id: equipo.id,
      nombre: equipo.nombre || "Equipo",
      pokemon: equipo.pokemon.map((p) => ({
        id: p.id,
        idForma: p.idForma,
        formaPMD: p.formaPMD,
        imagenForma: p.imagenForma,
        shiny: Boolean(p.shiny),
        es: p.es,
        mote: p.mote || "",
        cara: p.cara || "",
        sprite: p.sprite || ""
      })),
      paste: pasteDelEquipo(equipo.pokemon)
    })
  );
}

function pintarEscaparate() {
  const destacados = new Set(((miPerfil() || {}).escaparate || []).map((equipo) => equipo.id));
  const guardados = leerGuardados();
  dialogoEscaparate.querySelector(".escaparate-lista").innerHTML = guardados.length
    ? guardados
        .map(
          (equipo) => `
            <button class="escaparate-equipo ${destacados.has(equipo.id) ? "destacado" : ""}" data-id="${escaparHTML(equipo.id)}">
              <strong>${escaparHTML(equipo.nombre || "Equipo")}</strong>
              <span class="perfil-equipo-caras">${equipo.pokemon.map(caraDe).join("")}</span>
              ${destacados.has(equipo.id) ? icono("visto") : ""}
            </button>`
        )
        .join("")
    : `<p class="perfil-vacio">No tienes equipos guardados.</p>`;
}

// Pulsar un equipo lo destaca; si ya lo estaba, lo quita
async function alternarDestacado(id) {
  const escaparate = [...((miPerfil() || {}).escaparate || [])];
  const posicion = escaparate.findIndex((equipo) => equipo.id === id);
  if (posicion >= 0) {
    escaparate.splice(posicion, 1);
  } else {
    if (escaparate.length >= MAX_DESTACADOS) return;
    const equipo = leerGuardados().find((cada) => cada.id === id);
    if (!equipo) return;
    escaparate.push(copiaDeEquipo(equipo));
  }
  await guardarMiPerfil({ escaparate });
  if (escaparate.length >= MAX_DESTACADOS) dialogoEscaparate.close();
}

async function quitarDestacado(indice) {
  const escaparate = [...((miPerfil() || {}).escaparate || [])];
  escaparate.splice(indice, 1);
  await guardarMiPerfil({ escaparate });
}

// paso: -1 sube, +1 baja
async function moverDestacado(indice, paso) {
  const escaparate = [...((miPerfil() || {}).escaparate || [])];
  const otro = indice + paso;
  if (otro < 0 || otro >= escaparate.length) return;
  [escaparate[indice], escaparate[otro]] = [escaparate[otro], escaparate[indice]];
  await guardarMiPerfil({ escaparate });
}

// Los botones de un equipo destacado, en el perfil o en la ventana de todos
function alPulsarEquipo(boton) {
  const indice = Number(boton.dataset.indice);
  if (boton.classList.contains("perfil-quitar-equipo")) quitarDestacado(indice).catch(siFalla);
  else if (boton.classList.contains("perfil-subir-equipo")) moverDestacado(indice, -1).catch(siFalla);
  else if (boton.classList.contains("perfil-bajar-equipo")) moverDestacado(indice, 1).catch(siFalla);
  else if (boton.classList.contains("perfil-copiar")) copiarEquipo(boton).catch((error) => console.error(error));
  else return false;
  return true;
}

async function copiarEquipo(boton) {
  const perfil = perfilQueSeVe();
  const equipo = ((perfil && perfil.escaparate) || [])[Number(boton.dataset.indice)];
  if (!equipo) return;
  const copiado = await copiarAlPortapapeles(equipo.paste || "");
  boton.innerHTML = icono(copiado ? "visto" : "aspa");
  setTimeout(() => (boton.innerHTML = icono("copiar")), 1500);
}

// ---------- Foto (un Pokémon) ----------

// { id, es, forma } · forma: {} la normal, o { etiqueta, idForma, formaPMD, imagenForma? }
// (Mega, Alola...: se pregunta como en el creador de equipos, ver js/comun/elegir-forma.js)
let avatarElegido = null;
let eligiendoAvatar = null; // la elección en curso (mientras sale la ventana de la forma)
const listaPokemon = [];

// Su retrato de Mundo Misterioso y, si no tiene, su sprite pequeño (el de la forma)
function urlsAvatar(elegido) {
  const { idForma, formaPMD, imagenForma } = elegido.forma || {};
  return [
    ...urlsPMD({ id: elegido.id, idForma, formaPMD }),
    urlSpritePixel(imagenForma || idForma || elegido.id)
  ];
}

function pintarMuestra() {
  dialogoAvatar.querySelector(".avatar-muestra").innerHTML = avatarElegido
    ? imagenConRespaldo(urlsAvatar(avatarElegido), `alt=""`)
    : plantillaFoto(miPerfil() || {}, "perfil-foto");
}

// Elegida la especie: si tiene varias formas, se pregunta cuál (cancelar = la normal)
async function elegirAvatar(pokemon) {
  avatarElegido = { id: pokemon.id, es: pokemon.es, forma: {} };
  campoAvatar.value = pokemon.es;
  pintarMuestra();

  let info = { especie: "", lista: [] };
  try {
    info = await obtenerVariedades(pokemon.id);
  } catch (error) {
    // sin información de formas: la normal
  }
  if (info.lista.length < 2) return;

  const slug = await elegirForma(pokemon, info);
  try {
    const forma = slug ? await datosDeForma(info, slug) : {};
    if (forma.etiqueta) {
      avatarElegido = { ...avatarElegido, forma };
      campoAvatar.value = `${pokemon.es} (${forma.etiqueta})`;
      pintarMuestra();
    }
  } catch (error) {
    console.error(error); // sin conexión: se queda la normal
  }
}

function abrirAvatar() {
  avatarElegido = null;
  dialogoAvatar.querySelector(".avatar-pokemon").value = "";
  dialogoAvatar.querySelector(".avatar-error").textContent = "";
  dialogoAvatar.querySelector(".avatar-quitar").hidden = !(miPerfil() || {}).avatar;
  pintarMuestra();
  dialogoAvatar.showModal();
  dialogoAvatar.querySelector(".avatar-pokemon").focus();
  cargarDatos()
    .then(() => listaPokemon.splice(0, listaPokemon.length, ...datos.pokemon))
    .catch((error) => console.error(error));
}

// La foto es la dirección de su retrato (si no tiene, la del sprite pequeño): así sale igual
// en todas partes donde ya se pinta la foto de alguien (Amigos, Versus...)
async function guardarAvatar() {
  if (eligiendoAvatar) await eligiendoAvatar;
  if (!avatarElegido) {
    dialogoAvatar.querySelector(".avatar-error").textContent = "Elige un Pokémon de la lista.";
    return;
  }
  const opciones = urlsAvatar(avatarElegido);
  let foto = opciones[opciones.length - 1];
  for (const url of opciones) {
    if (await precargarImagen(url)) {
      foto = url;
      break;
    }
  }
  await guardarMiPerfil({ avatar: avatarElegido.id, foto });
  dialogoAvatar.close();
}

// Vuelve la de Google (o ninguna, en las cuentas de usuario)
async function quitarAvatar() {
  const usuario = usuarioActual();
  await guardarMiPerfil({ avatar: null, foto: (usuario && usuario.photoURL) || "" });
  dialogoAvatar.close();
}

// ---------- Arranque (al cargar el módulo) ----------

function siFalla(error) {
  console.error(error);
  errorNombre = "No se ha podido guardar. Inténtalo otra vez.";
  pintar();
}

cuerpo.addEventListener("click", (e) => {
  const boton = e.target.closest("button");
  if (!boton) return;

  if (boton.dataset.pestana) {
    pestana = boton.dataset.pestana;
    pintar();
  } else if (boton.classList.contains("perfil-avatar")) abrirAvatar();
  else if (boton.classList.contains("perfil-titulo")) {
    pintarTitulos();
    dialogoTitulo.showModal();
  }
  else if (boton.classList.contains("perfil-editar-nombre")) {
    editandoNombre = true;
    errorNombre = "";
    pintar();
  } else if (boton.classList.contains("perfil-nombre-cancelar")) {
    editandoNombre = false;
    pintar();
  } else if (boton.classList.contains("perfil-destacar")) {
    pintarEscaparate();
    dialogoEscaparate.showModal();
  } else if (boton.classList.contains("perfil-ver-equipos")) {
    abrirDestacados();
  } else if (boton.classList.contains("perfil-fondos-mas")) {
    fondosEnteros = !fondosEnteros;
    pintar();
  } else if (boton.classList.contains("perfil-fondo")) {
    // Se ve ya, mientras se guarda (cuando llega el perfil se vuelve a pintar igual)
    cuerpo.querySelectorAll(".perfil-fondo").forEach((cada) => cada.classList.toggle("elegido", cada === boton));
    guardarMiPerfil({ fondo: boton.dataset.fondo || null }).catch(siFalla);
  } else if (boton.classList.contains("perfil-ver-salon")) {
    salonEntero = !salonEntero;
    pintar();
  } else if (boton.classList.contains("perfil-ver-amigos")) {
    dialogo.close();
    irA("amigos");
  } else if (boton.classList.contains("perfil-amigo")) {
    abrirPerfilDe(boton.dataset.uid, true);
  } else {
    alPulsarEquipo(boton);
  }
});

dialogoDestacados.querySelector(".destacados-lista").addEventListener("click", (e) => {
  const boton = e.target.closest("button");
  if (boton) alPulsarEquipo(boton);
});
dialogoDestacados.querySelector(".destacados-anadir").addEventListener("click", () => {
  pintarEscaparate();
  dialogoEscaparate.showModal();
});
dialogoDestacados.querySelector(".destacados-cerrar").addEventListener("click", () => dialogoDestacados.close());

cuerpo.addEventListener("submit", (e) => {
  e.preventDefault();
  guardarNombre().catch(siFalla);
});

dialogo.querySelector(".perfil-cerrar").addEventListener("click", () => dialogo.close());
dialogo.querySelector(".perfil-volver").addEventListener("click", abrirMiPerfil);
dialogo.addEventListener("close", () => (editandoNombre = false));

dialogoTitulo.querySelector(".titulo-lista").addEventListener("click", (e) => {
  const opcion = e.target.closest(".titulo-opcion");
  if (opcion) ponerTitulo(opcion.dataset.logro).catch(siFalla);
});
dialogoTitulo.querySelector(".titulo-quitar").addEventListener("click", () => ponerTitulo(null).catch(siFalla));
dialogoTitulo.querySelector(".titulo-cerrar").addEventListener("click", () => dialogoTitulo.close());

dialogoEscaparate.querySelector(".escaparate-cerrar").addEventListener("click", () => dialogoEscaparate.close());
dialogoEscaparate.querySelector(".escaparate-lista").addEventListener("click", (e) => {
  const equipo = e.target.closest(".escaparate-equipo");
  if (equipo) alternarDestacado(equipo.dataset.id).catch(siFalla);
});

const campoAvatar = dialogoAvatar.querySelector(".avatar-pokemon");
campoAvatar.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && campoAvatar.parentElement.querySelector(".sugerencias .opcion")) e.preventDefault();
});
const autocompletadoAvatar = activarAutocompletado(campoAvatar, listaPokemon, (pokemon) => {
  eligiendoAvatar = elegirAvatar(pokemon).finally(() => (eligiendoAvatar = null));
}, { icono: iconoPokemon });
campoAvatar.addEventListener("input", () => (avatarElegido = null));
dialogoAvatar.querySelector(".avatar-formulario").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!avatarElegido && campoAvatar.value.trim()) autocompletadoAvatar.elegirPrimera();
  guardarAvatar().catch((error) => {
    console.error(error);
    dialogoAvatar.querySelector(".avatar-error").textContent = "No se ha podido guardar.";
  });
});
dialogoAvatar.querySelector(".avatar-cancelar").addEventListener("click", () => dialogoAvatar.close());
dialogoAvatar.querySelector(".avatar-quitar").addEventListener("click", () => {
  quitarAvatar().catch((error) => console.error(error));
});

// Al día mientras está abierto: tu perfil, el del amigo, quién está conectado
const repintar = () => {
  if (dialogo.open && !editandoNombre) pintar();
  if (dialogoEscaparate.open) pintarEscaparate();
  if (dialogoDestacados.open) pintarDestacados();
  if (dialogoTitulo.open) pintarTitulos();
};
alCambiarMiPerfil(repintar);
alCambiarPerfilesAmigos(repintar);
alCambiarPresencia(repintar);
alCambiarLockes(repintar);
