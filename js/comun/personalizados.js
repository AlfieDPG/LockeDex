// ---------- Rutas y level caps personalizados ----------
//
// Para un fan game o unos level caps distintos: en «Rutas» y en «Level caps» hay una pestaña
// «Personalizado» donde cada uno se hace los suyos, desde cero o tirando de lo que ya hay en
// la web (lugares de otros juegos, retratos de sus personajes). Son dos cosas separadas:
// unas rutas propias no llevan level caps ni al revés. Se guardan como los equipos (en el
// navegador y, con sesión, en tu cuenta).
//
//   localStorage «poketeams-rutas-propias-v1»:
//     { listas: [{ id, nombre, secciones: [{ titulo, lugares: [texto] }] }], quitados: [id] }
//   localStorage «poketeams-levelcaps-propios-v1»:
//     { listas: [{ id, nombre, combates: [{ id, etiqueta, nombre, lugar, nivel, tipo, imagen }] }],
//       quitados: [id] }
//
//   · imagen: la dirección de un retrato de la web o una imagen subida, ya reducida (data:).
//   · quitados: las que se han borrado, para que no vuelvan con la copia de lo de antes.
//
// Antes rutas y level caps iban juntos en un «juego propio» (poketeams-juegos-propios-v1).
// Los que hubiera se pasan solos a los dos nuevos, con el mismo id (así no se pierde lo marcado).

import { leer, escribir } from "./almacen.js";
import { cuandoEsteSincronizado } from "./nube.js";
import { actualizarPersonalizadoEnMisLockes } from "./lockes.js";
import { LUGARES } from "../rutas/datos.js";
import { retratoDeLaWeb } from "../levelcaps/retratos.js";
import { t, LOCALE } from "./idioma.js";

const CLAVE_RUTAS = "poketeams-rutas-propias-v1";
const CLAVE_CAPS = "poketeams-levelcaps-propios-v1";
const CLAVE_ANTIGUA = "poketeams-juegos-propios-v1";

export const PREFIJO = "propio-";

// Cada clave va entera en un documento de Firestore, que no puede pasar de 1 MiB. Con
// imágenes subidas se llega antes: se para bastante antes de eso.
const TAMANO_MAXIMO = 800 * 1024;

export const MAX_LISTAS = 30;
export const MAX_COMBATES = 80;
export const MAX_LUGARES = 300;

function nuevoId(prefijo) {
  return `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const texto = (valor, largo) => String(valor || "").trim().slice(0, largo);

// ---------- Limpieza (lo que se guarda) ----------

// El tipo de combate (para el color y los tramos de Alto Mando y Campeón) sale del título
export function tipoDeCombate(etiqueta) {
  const minusculas = String(etiqueta || "").toLowerCase();
  if (minusculas.includes("alto mando") || minusculas.includes("elite four")) return "alto-mando";
  if (minusculas.includes("campe") || minusculas.includes("champion")) return "campeon";
  if (["gimnasio", "líder", "lider", "gym", "leader"].some((palabra) => minusculas.includes(palabra))) return "gimnasio";
  return "historia";
}

function limpiarCombate(combate) {
  const etiqueta = texto(combate.etiqueta, 40);
  return {
    id: combate.id || nuevoId("c"),
    etiqueta,
    nombre: texto(combate.nombre, 40),
    lugar: texto(combate.lugar, 40),
    nivel: Math.max(1, Math.min(100, Math.round(Number(combate.nivel) || 1))),
    tipo: tipoDeCombate(etiqueta),
    imagen: String(combate.imagen || "")
  };
}

// actualizado: cuándo se cambió (para saber si la copia de un locke es más nueva).
// recibido: llegó de un locke de otro; en cuanto la cambias, pasa a ser tuya.
function datosComunes(lista) {
  return {
    id: lista.id,
    nombre: texto(lista.nombre, 40) || t("Sin nombre"),
    actualizado: lista.actualizado || Date.now(),
    ...(lista.recibido ? { recibido: true } : {})
  };
}

function limpiarCaps(lista) {
  return {
    ...datosComunes(lista),
    combates: (lista.combates || []).slice(0, MAX_COMBATES).map(limpiarCombate)
  };
}

function limpiarRutas(lista) {
  return {
    ...datosComunes(lista),
    secciones: (lista.secciones || []).map((seccion) => ({
      titulo: texto(seccion.titulo, 40),
      lugares: [...new Set((seccion.lugares || []).map((lugar) => texto(lugar, 80)).filter(Boolean))]
    }))
  };
}

// ---------- Lockes que las usan ----------
//
// Un locke puede llevar unas rutas y unos level caps personalizados, como lleva sus normas:
// una COPIA dentro del locke (locke.rutasPropias, locke.capsPropios), que los demás abren con
// los botones del locke. Cuando quien lo creó cambia la suya, sus lockes se ponen al día solos, unos
// segundos después de dejar de tocarla (no a cada tecla: cada vez es una escritura).

const ESPERA_LOCKES = 3000;
const LIMITE_COPIA = 200 * 1024; // pasando de esto, la copia del locke va sin las imágenes subidas
const porActualizar = new Map(); // "campo|id" -> { campo, id }
let temporizadorLockes = null;

function copiaSin(lista) {
  if (!lista) return null;
  const { recibido, ...copia } = lista;
  return copia;
}

export function copiaRutasParaLocke(id) {
  return copiaSin(rutasPropias.lista(id));
}

export function copiaCapsParaLocke(id) {
  const copia = copiaSin(capsPropios.lista(id));
  if (copia && JSON.stringify(copia).length > LIMITE_COPIA) {
    copia.combates = copia.combates.map((c) => (c.imagen.startsWith("data:") ? { ...c, imagen: "" } : c));
  }
  return copia;
}

const COPIAS = { rutasPropias: copiaRutasParaLocke, capsPropios: copiaCapsParaLocke };

async function actualizarLockes() {
  clearTimeout(temporizadorLockes);
  const pendientes = [...porActualizar.values()];
  porActualizar.clear();
  for (const { campo, id } of pendientes) {
    const copia = COPIAS[campo](id);
    if (copia) await actualizarPersonalizadoEnMisLockes(campo, copia);
  }
}

function programarLockes(campo, id) {
  porActualizar.set(`${campo}|${id}`, { campo, id });
  clearTimeout(temporizadorLockes);
  temporizadorLockes = setTimeout(() => actualizarLockes().catch((error) => console.error(error)), ESPERA_LOCKES);
}

// Si se cierra la pestaña antes de tiempo, se manda ya
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && porActualizar.size) {
    actualizarLockes().catch((error) => console.error(error));
  }
});

// ---------- Almacén (uno para rutas y otro para level caps) ----------

// campoLocke: dónde va su copia en un locke (rutasPropias o capsPropios)
function crearAlmacen(clave, limpiar, campoLocke) {
  const oyentes = new Set();

  function guardado() {
    const valor = leer(clave, null);
    return {
      listas: (valor && Array.isArray(valor.listas) && valor.listas) || [],
      quitados: (valor && Array.isArray(valor.quitados) && valor.quitados) || []
    };
  }

  // false si no cabe (ver TAMANO_MAXIMO) o si el navegador no deja guardar
  function guardarEstado(estado) {
    if (JSON.stringify(estado).length > TAMANO_MAXIMO) return false;
    const ok = escribir(clave, estado);
    if (ok) for (const funcion of oyentes) funcion();
    return ok;
  }

  return {
    listas: () => guardado().listas,
    lista: (id) => guardado().listas.find((lista) => lista.id === id) || null,

    alCambiar(funcion) {
      oyentes.add(funcion);
      return () => oyentes.delete(funcion);
    },

    // Una en blanco, con un nombre que no tenga ninguna otra
    crear(base) {
      const estado = guardado();
      if (estado.listas.length >= MAX_LISTAS) return null;
      const nombres = new Set(estado.listas.map((lista) => lista.nombre.toLowerCase()));
      let nombre = base;
      for (let n = 2; nombres.has(nombre.toLowerCase()); n++) nombre = `${base} ${n}`;
      const nueva = limpiar({ id: nuevoId(PREFIJO), nombre });
      estado.listas.push(nueva);
      return guardarEstado(estado) ? nueva : null;
    },

    // Al cambiarla pasa a ser tuya, aunque te llegara de un locke
    guardar(lista) {
      const estado = guardado();
      const posicion = estado.listas.findIndex((cada) => cada.id === lista.id);
      if (posicion < 0) return false;
      estado.listas[posicion] = limpiar({ ...lista, actualizado: Date.now(), recibido: false });
      const ok = guardarEstado(estado);
      if (ok) programarLockes(campoLocke, lista.id);
      return ok;
    },

    // La copia que trae un locke: si la tienes porque te llegó de un locke y esta es más nueva,
    // se pone al día. Las tuyas no se tocan. Solo se apunta en las tuyas con forzar: al pulsar
    // su botón en el locke (cada uno tiene lo suyo; no se llena la lista de todos sin pedirlo).
    recibirDeLocke(copia, forzar = false) {
      if (!copia || !copia.id) return;
      const estado = guardado();
      const posicion = estado.listas.findIndex((lista) => lista.id === copia.id);
      const recibida = limpiar({ ...copia, recibido: true });

      if (posicion >= 0) {
        const actual = estado.listas[posicion];
        if (!actual.recibido || (actual.actualizado || 0) >= (copia.actualizado || 0)) return;
        estado.listas[posicion] = recibida;
      } else {
        if (!forzar) return;
        estado.quitados = estado.quitados.filter((id) => id !== copia.id);
        estado.listas.push(recibida);
      }
      guardarEstado(estado);
    },

    borrar(id) {
      const estado = guardado();
      estado.listas = estado.listas.filter((lista) => lista.id !== id);
      if (!estado.quitados.includes(id)) estado.quitados.push(id);
      guardarEstado(estado);
    },

    // Las que llegan de fuera (lo de antes): solo las que no están ya ni se borraron
    recibir(nuevas) {
      const estado = guardado();
      const faltan = nuevas.filter(
        (nueva) => !estado.quitados.includes(nueva.id) && !estado.listas.some((lista) => lista.id === nueva.id)
      );
      if (!faltan.length) return;
      estado.listas.push(...faltan.map(limpiar));
      guardarEstado(estado);
    }
  };
}

export const rutasPropias = crearAlmacen(CLAVE_RUTAS, limpiarRutas, "rutasPropias");
export const capsPropios = crearAlmacen(CLAVE_CAPS, limpiarCaps, "capsPropios");

// ---------- Para pintar las rutas ----------

// Con la forma de js/rutas/datos.js: { apartados: [{ clave, titulo }], s0: [...], s1: [...] }
export function lugaresDe(lista) {
  const lugares = { apartados: [] };
  (lista.secciones || []).forEach((seccion, indice) => {
    const clave = `s${indice}`;
    lugares.apartados.push({ clave, titulo: seccion.titulo || "Lugares" });
    lugares[clave] = seccion.lugares || [];
  });
  return lugares;
}

// ---------- Lo que se puede aprovechar de la web ----------

const TITULOS = { rutas: "Rutas", ciudades: "Ciudades y pueblos", postgame: "Postgame", eventos: "Pokémon de evento" };

// Los apartados de un juego de la web, como secciones de una lista propia
export function seccionesDeLaWeb(idJuego) {
  const lugares = LUGARES[idJuego];
  if (!lugares) return [];
  const apartados = lugares.apartados || Object.keys(TITULOS).map((clave) => ({ clave, titulo: TITULOS[clave] }));
  return apartados
    .filter((apartado) => (lugares[apartado.clave] || []).length)
    .map((apartado) => ({ titulo: apartado.titulo, lugares: [...lugares[apartado.clave]] }));
}

// Todos los lugares de la web, sin repetir y sin los de evento (para sugerirlos al escribir)
let todosLosLugares = null;

export function lugaresDeLaWeb() {
  if (!todosLosLugares) {
    const vistos = new Set();
    for (const lugares of Object.values(LUGARES)) {
      const apartados = lugares.apartados || Object.keys(TITULOS).map((clave) => ({ clave }));
      for (const { clave } of apartados) {
        if (clave === "eventos") continue;
        for (const lugar of lugares[clave] || []) vistos.add(lugar);
      }
    }
    todosLosLugares = [...vistos].sort((uno, otro) => uno.localeCompare(otro, LOCALE, { numeric: true }));
  }
  return todosLosLugares;
}

// ---------- Imágenes subidas ----------
//
// Se reducen a LADO_IMAGEN píxeles como mucho (lo que ocupa un retrato en la lista) y se
// guardan como texto (data:), dentro de la propia lista. Firebase Storage pediría el plan
// de pago; así no hace falta y unas decenas de retratos caben de sobra.

const LADO_IMAGEN = 96;

export async function imagenReducida(archivo) {
  if (!archivo || !archivo.type.startsWith("image/")) throw new Error("no-es-imagen");
  const url = URL.createObjectURL(archivo);
  try {
    const imagen = await new Promise((cumplir, fallar) => {
      const elemento = new Image();
      elemento.onload = () => cumplir(elemento);
      elemento.onerror = fallar;
      elemento.src = url;
    });
    const escala = Math.min(1, LADO_IMAGEN / Math.max(imagen.naturalWidth, imagen.naturalHeight));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(imagen.naturalWidth * escala));
    lienzo.height = Math.max(1, Math.round(imagen.naturalHeight * escala));
    const contexto = lienzo.getContext("2d");
    contexto.imageSmoothingEnabled = escala < 1; // un sprite pequeño se queda pixelado, tal cual
    contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    // WebP ocupa mucho menos; los navegadores que no saben hacerlo devuelven PNG
    const webp = lienzo.toDataURL("image/webp", 0.85);
    return webp.startsWith("data:image/webp") ? webp : lienzo.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Los «juegos propios» de antes ----------
//
// Después de juntar con la nube (si no, lo de este navegador, más viejo, podría pisar lo de
// la cuenta). Los combates copiados de un juego de la web se quedan con los retratos de aquel.

async function pasarLosDeAntes() {
  await cuandoEsteSincronizado();
  const antiguos = leer(CLAVE_ANTIGUA, null);
  const juegos = (antiguos && Array.isArray(antiguos.juegos) && antiguos.juegos) || [];
  if (!juegos.length) return;

  rutasPropias.recibir(
    juegos
      .filter((juego) => (juego.secciones || []).length)
      .map((juego) => ({ id: juego.id, nombre: juego.nombre, secciones: juego.secciones }))
  );
  capsPropios.recibir(
    juegos
      .filter((juego) => (juego.combates || []).length)
      .map((juego) => ({
        id: juego.id,
        nombre: juego.nombre,
        combates: juego.combates.map((combate) => ({
          ...combate,
          imagen: juego.base ? retratoDeLaWeb(juego.base, combate.nombre) : ""
        }))
      }))
  );
}

pasarLosDeAntes().catch((error) => console.error("No se han podido pasar los juegos propios de antes", error));
