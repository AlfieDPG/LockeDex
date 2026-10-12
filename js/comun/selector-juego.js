import { REGIONES, JUEGOS } from "./juegos.js";
import { leer, escribir } from "./almacen.js";
import { escaparHTML } from "./utilidades.js";

// Pestañas de región y, debajo, los juegos de esa región (solo salen las regiones con juegos).
// Al final, «Personalizado»: las listas propias de la sección (js/comun/personalizados.js) y
// un botón para crear otra.
//
//   propios: { almacen, alNuevo }  -> almacen es rutasPropias o capsPropios
//
// Recuerda la última elección en claveGuardado.
// Llama a alElegir(juego) al empezar y cada vez que cambia el juego (también si cambia la
// lista propia que está abierta). En «Personalizado» sin ninguna lista, alElegir(null).
//
// Devuelve { elegirPorId }: para abrir la sección ya en un juego concreto desde fuera (los
// botones de Rutas y Level caps de un locke en «Lockes»).

export const REGION_PROPIOS = "propios";

export function crearSelectorJuego(contenedor, claveGuardado, alElegir, propios) {
  const regiones = [
    ...REGIONES.filter((r) => JUEGOS.some((j) => j.region === r.id)),
    { id: REGION_PROPIOS, nombre: "Personalizado" }
  ];

  function todos() {
    return [
      ...JUEGOS,
      ...propios.almacen.listas().map((lista) => ({ ...lista, region: REGION_PROPIOS, propio: true }))
    ];
  }

  let actual = todos().find((j) => j.id === leer(claveGuardado, null)) || JUEGOS[0];
  let region = actual.region;

  function pintar() {
    const deLaRegion = todos().filter((j) => j.region === region);
    const idActual = actual ? actual.id : null;

    contenedor.innerHTML = `
      <div class="selector-regiones">
        ${regiones
          .map((r) => `<button data-region="${r.id}" class="${r.id === region ? "activa" : ""} ${r.id === REGION_PROPIOS ? "region-propios" : ""}">${r.nombre}</button>`)
          .join("")}
      </div>
      <div class="selector-juegos">
        ${deLaRegion
          .map((j) => `<button data-juego="${escaparHTML(j.id)}" class="${j.id === idActual ? "activo" : ""}">${escaparHTML(j.nombre)}</button>`)
          .join("")}
        ${region === REGION_PROPIOS ? `<button class="juego-nuevo">+ Nuevo</button>` : ""}
      </div>
    `;
  }

  function elegir(juego) {
    if (!juego) return;
    region = juego.region;
    if (actual && juego.id === actual.id) {
      pintar();
      return;
    }
    actual = juego;
    escribir(claveGuardado, juego.id);
    pintar();
    alElegir(juego);
  }

  // «Personalizado» sin ninguna lista: la pestaña sola, con el botón de crear
  function quedarseSinNada() {
    region = REGION_PROPIOS;
    actual = null;
    pintar();
    alElegir(null);
  }

  // Un solo oyente para todos los botones
  contenedor.addEventListener("click", (e) => {
    const boton = e.target.closest("button");
    if (!boton) return;
    if (boton.classList.contains("juego-nuevo")) {
      propios.alNuevo();
      return;
    }
    if (boton.dataset.region) {
      const primero = todos().find((j) => j.region === boton.dataset.region);
      if (primero) elegir(primero);
      else quedarseSinNada();
    }
    if (boton.dataset.juego) elegir(todos().find((j) => j.id === boton.dataset.juego));
  });

  // Si cambia la lista propia abierta, se vuelve a pintar; si se borra, a la primera que
  // quede (o a la pestaña vacía)
  propios.almacen.alCambiar(() => {
    if (!actual || !actual.propio) {
      pintar();
      return;
    }
    const ahora = todos().find((j) => j.id === actual.id);
    if (ahora) {
      actual = ahora;
      pintar();
      alElegir(actual);
      return;
    }
    const otra = todos().find((j) => j.region === REGION_PROPIOS);
    if (otra) elegir(otra);
    else quedarseSinNada();
  });

  pintar();
  alElegir(actual);

  return {
    elegirPorId(id) {
      elegir(todos().find((j) => j.id === id));
    }
  };
}

// Para saltar a Rutas o Level caps en un juego: se deja apuntado y la sección lo lee al
// abrirse (mostrar). Así funciona tanto si la sección ya estaba cargada como si no.
export const CLAVES_JUEGO = {
  rutas: "poketeams-rutas-juego-v1",
  levelcaps: "poketeams-levelcaps-juego-v1"
};
