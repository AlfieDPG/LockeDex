// ---------- Buzón de invitaciones ----------
//
// La campana va a la derecha de tu nombre, abajo del panel lateral, con un número cuando hay
// algo pendiente. Está ahí y no dentro de «Amigos» a propósito: una invitación a un locke
// puede llegar mientras estás montando un equipo, y así la ves desde cualquier sección.
// Como vive dentro de .sesion-usuario, se esconde sola cuando no hay sesión.
//
// Dentro caben dos cosas:
//   · solicitudes de amistad que te han mandado
//   · invitaciones a un locke de «Lockes»
//
// Las dos listas están escuchadas en vivo, así que el número sube y baja solo.

import { icono } from "./comun/iconos.js";
import { escaparHTML } from "./comun/utilidades.js";
import { t } from "./comun/idioma.js";
import { hayNube, usuarioActual } from "./comun/nube.js";
import {
  alCambiarAmistades, solicitudesRecibidas, aceptarAmistad, borrarAmistad, perfilesDe, colorDeTipo
} from "./comun/perfiles.js";
import {
  alCambiarLockes, invitacionesALockes, aceptarLocke, rechazarLocke
} from "./comun/lockes.js";

let boton = null;
let cuenta = null;
let dialogo = null;
let listaDialogo = null;

// uid -> nombre, para las solicitudes de amistad (las de locke ya traen el nombre dentro)
let nombres = new Map();

// ---------- Pintar ----------

function plantillaAmistad(amistad) {
  const nombre = escaparHTML(nombres.get(amistad.otro) || t("Alguien"));
  return `
    <div class="aviso" data-tipo="amistad" data-id="${escaparHTML(amistad.id)}">
      <span class="aviso-icono amistad">${icono("personaMas")}</span>
      <span class="aviso-texto">${t("{nombre} quiere ser tu amigo", { nombre: `<b>${nombre}</b>` })}</span>
      <button class="aviso-si" title="${t("Aceptar")}">${icono("visto")}</button>
      <button class="aviso-no" title="${t("Rechazar")}">${icono("aspa")}</button>
    </div>`;
}

function plantillaLocke(locke) {
  const tipo = locke.tipo || { nombre: "Locke", color: "#3498db" };
  const quien = escaparHTML((locke.nombres || {})[locke.creador] || t("Alguien"));

  return `
    <div class="aviso" data-tipo="locke" data-id="${escaparHTML(locke.id)}">
      <span class="aviso-icono de-locke" style="--color-locke: ${colorDeTipo(tipo)}">${icono("espadas")}</span>
      <span class="aviso-texto">
        ${t("{quien} te mete en {locke}", { quien: `<b>${quien}</b>`, locke: `<b>${escaparHTML(locke.nombre)}</b>` })}
        <small>${escaparHTML(tipo.nombre)} · ${t("{n} vidas", { n: locke.vidasIniciales })}</small>
      </span>
      <button class="aviso-si" title="${t("Entrar")}">${icono("visto")}</button>
      <button class="aviso-no" title="${t("No entrar")}">${icono("aspa")}</button>
    </div>`;
}

function pendientes() {
  if (!hayNube() || !usuarioActual()) return { amistades: [], lockes: [] };
  return { amistades: solicitudesRecibidas(), lockes: invitacionesALockes() };
}

function pintar() {
  const { amistades, lockes } = pendientes();
  const total = amistades.length + lockes.length;

  cuenta.textContent = total;
  cuenta.hidden = total === 0;
  boton.classList.toggle("con-avisos", total > 0);
  boton.title = total === 0 ? t("Notificaciones") : t(total === 1 ? "Tienes {n} notificación" : "Tienes {n} notificaciones", { n: total });

  listaDialogo.innerHTML = total
    ? [...amistades.map(plantillaAmistad), ...lockes.map(plantillaLocke)].join("")
    : `<p class="aviso-vacio">${t("No tienes nada pendiente.")}</p>`;
}

// Los nombres de quien te manda una solicitud hay que ir a buscarlos a su perfil
async function traerNombres(amistades) {
  const faltan = amistades.map((amistad) => amistad.otro).filter((uid) => !nombres.has(uid));
  if (!faltan.length) return;

  const perfiles = await perfilesDe(faltan);
  for (const [uid, perfil] of perfiles) nombres.set(uid, perfil.nombre);
  pintar();
}

// ---------- Contestar ----------

async function contestar(aviso, acepta) {
  const { tipo, id } = aviso.dataset;

  for (const cada of aviso.querySelectorAll("button")) cada.disabled = true;

  try {
    if (tipo === "amistad") {
      if (acepta) await aceptarAmistad(id);
      else await borrarAmistad(id);
    } else {
      if (acepta) await aceptarLocke(id);
      else await rechazarLocke(id);
    }
  } catch (error) {
    console.error(error);
    for (const cada of aviso.querySelectorAll("button")) cada.disabled = false;
  }
}

// ---------- Arranque ----------

export function iniciarAvisos() {
  boton = document.querySelector(".avisos-boton");
  dialogo = document.querySelector("#dialogo-avisos");
  listaDialogo = dialogo.querySelector(".avisos-lista");

  boton.innerHTML = `${icono("campana")}<span class="avisos-cuenta" hidden></span>`;
  cuenta = boton.querySelector(".avisos-cuenta");

  boton.addEventListener("click", () => dialogo.showModal());
  dialogo.querySelector("#avisos-cerrar").addEventListener("click", () => dialogo.close());

  listaDialogo.addEventListener("click", (e) => {
    const aviso = e.target.closest(".aviso");
    const si = e.target.closest(".aviso-si");
    const no = e.target.closest(".aviso-no");
    if (!aviso || (!si && !no)) return;
    contestar(aviso, Boolean(si));
  });

  alCambiarAmistades((amistades) => {
    pintar();
    traerNombres(amistades.filter((amistad) => amistad.estado === "pendiente")).catch((error) =>
      console.error(error)
    );
  });

  alCambiarLockes(pintar);
}
