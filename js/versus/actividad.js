// Ventana «Actividad» de un locke: lo que ha ido pasando, del más nuevo al más viejo.
// Se escucha en vivo solo mientras está abierta (cada suceso que llega es una lectura).
//
// Los datos están en js/comun/lockes.js (Actividad).

import { icono } from "../comun/iconos.js";
import { escaparHTML } from "../comun/utilidades.js";
import { lockePorId, escucharActividad } from "../comun/lockes.js";
import { retratoMuerto, nombreMuerto } from "./cementerio.js";
import { t, LOCALE } from "../comun/idioma.js";
import { nombreDeLugar } from "../rutas/datos.js";
import { textoDeCombate } from "../levelcaps/datos.js";

let dialogo = null;
let idLocke = null;
let uidFiltrado = null; // solo los sucesos de esta persona
let sucesos = [];
let dejarDeEscuchar = null;

// «hace 5 min», «hace 3 h», «ayer», o la fecha
function hace(cuando) {
  const segundos = Math.max(0, (Date.now() - cuando) / 1000);
  if (segundos < 60) return t("ahora");
  if (segundos < 3600) return t("hace {n} min", { n: Math.floor(segundos / 60) });
  if (segundos < 86400) return t("hace {n} h", { n: Math.floor(segundos / 3600) });
  if (segundos < 2 * 86400) return t("ayer");
  return new Date(cuando).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

function textoSuceso(suceso, locke) {
  const nombres = locke.nombres || {};
  const quien = `<strong>${escaparHTML(nombres[suceso.uid] || t("Alguien"))}</strong>`;
  const muerto = suceso.muerto ? `<strong>${escaparHTML(nombreMuerto(suceso.muerto))}</strong>` : "";
  // «Contra quién» ya no se pregunta; solo lo llevan los de antes
  const contra = suceso.muerto && suceso.muerto.causa ? t(" contra {causa}", { causa: escaparHTML(suceso.muerto.causa) }) : "";
  const detalle = `<strong>${escaparHTML(suceso.detalle || "")}</strong>`;
  const ganador = `<strong>${escaparHTML(nombres[suceso.ganador] || t("alguien"))}</strong>`;
  const datos = { quien, muerto, contra, detalle, ganador };

  switch (suceso.tipo) {
    case "creado":
      return t("{quien} ha creado el locke", datos);
    case "entra":
      return t("{quien} se ha unido al locke", datos);
    case "vida":
      if (suceso.delta > 0) return t("{quien} ha recuperado una vida", datos);
      return muerto ? t("{quien} ha perdido una vida: {muerto}{contra}", datos) : t("{quien} ha perdido una vida", datos);
    case "eliminado":
      if (suceso.delta > 0) return t("{quien} ha recuperado la vida cero y vuelve al locke", datos);
      return muerto
        ? t("{quien} ha perdido la vida cero con {muerto}{contra}: <strong>eliminado</strong>", datos)
        : t("{quien} ha perdido la vida cero: <strong>eliminado</strong>", datos);
    case "muerte":
      return t("{quien} ha perdido a {muerto}{contra}", datos);
    case "victoria":
      return suceso.delta > 0 ? t("{quien} ha ganado un combate", datos) : t("{quien} se ha quitado una victoria", datos);
    case "ganador":
      return suceso.ganador
        ? t("{quien} ha cerrado el locke: gana {ganador}", datos)
        : t("{quien} ha cerrado el locke: <strong>no gana nadie</strong>", datos);
    case "combate":
      return t("{detalle}: gana {ganador}", datos);
    case "rom":
      return suceso.delta > 0 ? t("{quien} se ha pasado la ROM", datos) : t("{quien} ha desmarcado la ROM", datos);
    case "ruta":
      return t("{quien} ha capturado en {detalle}", { ...datos, detalle: `<strong>${escaparHTML(nombreDeLugar(suceso.detalle || ""))}</strong>` });
    case "cap":
      return t("{quien} ha vencido a {detalle}", { ...datos, detalle: `<strong>${escaparHTML(textoDeCombate(suceso.detalle || ""))}</strong>` });
    case "edicion":
      return t("{quien} ha editado su partida: {detalle}", datos);
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
    edicion: "lapiz",
    ganador: "corona"
  }[suceso.tipo];
  return nombre ? icono(nombre) : "";
}

function pintar() {
  const locke = idLocke ? lockePorId(idLocke) : null;
  if (!locke) return;

  const de = uidFiltrado ? ` · ${escaparHTML((locke.nombres || {})[uidFiltrado] || t("Jugador"))}` : "";
  dialogo.querySelector(".actividad-titulo").innerHTML = `${icono("actividad")} ${t("Actividad")} · ${escaparHTML(locke.nombre)}${de}`;
  const lista = dialogo.querySelector(".actividad-lista");

  if (sucesos === undefined) {
    lista.innerHTML = ""; // aún no ha llegado
    return;
  }
  if (sucesos === null) {
    lista.innerHTML = `<p class="actividad-vacia">${t("No se ha podido cargar.")}</p>`;
    return;
  }
  const conTexto = sucesos.filter((suceso) => (!uidFiltrado || suceso.uid === uidFiltrado) && textoSuceso(suceso, locke));
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
    : `<p class="actividad-vacia">${t(uidFiltrado ? "Todavía no ha hecho nada." : "Todavía no ha pasado nada.")}</p>`;
}

// uid: solo lo que ha hecho esa persona (el botón de su ficha); sin uid, la de todos
export function abrirActividad(id, uid = null) {
  if (dejarDeEscuchar) dejarDeEscuchar();
  idLocke = id;
  uidFiltrado = uid;
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
    uidFiltrado = null;
  });
}
