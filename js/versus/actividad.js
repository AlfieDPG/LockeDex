// Ventana «Actividad» de un locke: lo que ha ido pasando, del más nuevo al más viejo.
// Se escucha en vivo solo mientras está abierta (cada suceso que llega es una lectura).
//
// Los datos están en js/comun/lockes.js (Actividad).

import { icono } from "../comun/iconos.js";
import { escaparHTML } from "../comun/utilidades.js";
import { lockePorId, escucharActividad } from "../comun/lockes.js";
import { retratoMuerto, nombreMuerto } from "./cementerio.js";

let dialogo = null;
let idLocke = null;
let sucesos = [];
let dejarDeEscuchar = null;

// «hace 5 min», «hace 3 h», «ayer», o la fecha
function hace(cuando) {
  const segundos = Math.max(0, (Date.now() - cuando) / 1000);
  if (segundos < 60) return "ahora";
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  if (segundos < 2 * 86400) return "ayer";
  return new Date(cuando).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function textoSuceso(suceso, locke) {
  const nombres = locke.nombres || {};
  const quien = `<strong>${escaparHTML(nombres[suceso.uid] || "Alguien")}</strong>`;
  const muerto = suceso.muerto ? `<strong>${escaparHTML(nombreMuerto(suceso.muerto))}</strong>` : "";
  // «Contra quién» ya no se pregunta; solo lo llevan los de antes
  const contra = suceso.muerto && suceso.muerto.causa ? ` contra ${escaparHTML(suceso.muerto.causa)}` : "";
  const detalle = `<strong>${escaparHTML(suceso.detalle || "")}</strong>`;

  switch (suceso.tipo) {
    case "creado":
      return `${quien} ha creado el locke`;
    case "entra":
      return `${quien} se ha unido al locke`;
    case "vida":
      if (suceso.delta > 0) return `${quien} ha recuperado una vida`;
      return muerto ? `${quien} ha perdido una vida: ${muerto}${contra}` : `${quien} ha perdido una vida`;
    case "eliminado":
      if (suceso.delta > 0) return `${quien} ha recuperado la vida cero y vuelve al locke`;
      return muerto
        ? `${quien} ha perdido la vida cero con ${muerto}${contra}: <strong>eliminado</strong>`
        : `${quien} ha perdido la vida cero: <strong>eliminado</strong>`;
    case "muerte":
      return `${quien} ha perdido a ${muerto}${contra}`;
    case "victoria":
      return suceso.delta > 0 ? `${quien} ha ganado un combate` : `${quien} se ha quitado una victoria`;
    case "ganador":
      return suceso.ganador
        ? `${quien} ha cerrado el locke: gana <strong>${escaparHTML(nombres[suceso.ganador] || "alguien")}</strong>`
        : `${quien} ha cerrado el locke: <strong>no gana nadie</strong>`;
    case "combate":
      return `${detalle}: gana <strong>${escaparHTML(nombres[suceso.ganador] || "alguien")}</strong>`;
    case "rom":
      return suceso.delta > 0 ? `${quien} se ha pasado la ROM` : `${quien} ha desmarcado la ROM`;
    case "ruta":
      return `${quien} ha capturado en ${detalle}`;
    case "cap":
      return `${quien} ha vencido a ${detalle}`;
    default:
      return "";
  }
}

// Icono de cada tipo de suceso (y su color, por la clase)
function iconoSuceso(suceso) {
  if (suceso.muerto) return retratoMuerto(suceso.muerto, "suceso-cara");
  const nombre = {
    creado: "mas",
    entra: "personaMas",
    vida: "corazon",
    eliminado: "calavera",
    victoria: "espadas",
    combate: "espadas",
    rom: "visto",
    ruta: "mapa",
    cap: "escudo",
    ganador: "corona"
  }[suceso.tipo];
  return nombre ? icono(nombre) : "";
}

function pintar() {
  const locke = idLocke ? lockePorId(idLocke) : null;
  if (!locke) return;

  dialogo.querySelector(".actividad-titulo").innerHTML = `${icono("actividad")} Actividad · ${escaparHTML(locke.nombre)}`;
  const lista = dialogo.querySelector(".actividad-lista");

  if (sucesos === undefined) {
    lista.innerHTML = ""; // aún no ha llegado
    return;
  }
  if (sucesos === null) {
    lista.innerHTML = `<p class="actividad-vacia">No se ha podido cargar.</p>`;
    return;
  }
  const conTexto = sucesos.filter((suceso) => textoSuceso(suceso, locke));
  lista.innerHTML = conTexto.length
    ? conTexto
        .map(
          (suceso) => `
            <div class="suceso suceso-${escaparHTML(suceso.tipo)} ${suceso.delta < 0 ? "resta" : ""}">
              <span class="suceso-icono">${iconoSuceso(suceso)}</span>
              <span class="suceso-texto">${textoSuceso(suceso, locke)}</span>
              <time class="suceso-cuando">${hace(suceso.cuando)}</time>
            </div>`
        )
        .join("")
    : `<p class="actividad-vacia">Todavía no ha pasado nada.</p>`;
}

export function abrirActividad(id) {
  if (dejarDeEscuchar) dejarDeEscuchar();
  idLocke = id;
  sucesos = undefined;
  pintar();
  dialogo.showModal();
  dejarDeEscuchar = escucharActividad(id, (llegados) => {
    sucesos = llegados;
    pintar();
  });
}

export function iniciarActividad() {
  dialogo = document.querySelector("#dialogo-actividad");
  dialogo.querySelector(".actividad-cerrar").addEventListener("click", () => dialogo.close());
  dialogo.addEventListener("close", () => {
    if (dejarDeEscuchar) dejarDeEscuchar();
    dejarDeEscuchar = null;
    idLocke = null;
  });
}
