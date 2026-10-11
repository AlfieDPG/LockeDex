// ---------- Elegir forma (Alola, Galar, Mega...) ----------
//
// La ventana que sale al elegir un Pokémon con varias formas: al añadirlo a un equipo y al
// apuntar un muerto en un locke. Los datos de las formas salen de js/comun/formas.js.

import { pedirJSON, URL_API } from "./api.js";
import { nombreOpcionForma, etiquetaForma, formaDeTipo } from "./formas.js";
import { indicePMD } from "./formas-pmd.js";

// Devuelve el nombre de la variedad («persian-alola») o null si se cancela.
// entrada: { es } (para el título); info: lo de obtenerVariedades.
export function elegirForma(entrada, info) {
  return new Promise((resolver) => {
    const dialogo = document.getElementById("dialogo-forma");
    const contenedor = document.getElementById("forma-opciones");
    let elegido = null;

    document.getElementById("forma-titulo").textContent = `¿Qué forma de ${entrada.es}?`;
    contenedor.innerHTML = "";

    for (const slug of info.lista) {
      const b = document.createElement("button");
      b.textContent = nombreOpcionForma(slug, info.especie);
      b.addEventListener("click", () => {
        elegido = slug;
        dialogo.close();
      });
      contenedor.appendChild(b);
    }

    document.getElementById("forma-cancelar").onclick = () => dialogo.close();
    dialogo.addEventListener("close", () => resolver(elegido), { once: true });
    dialogo.showModal();
  });
}

// Lo justo para pintar el retrato de una forma (urlsRetrato de imagenes.js) y su
// nombre: { etiqueta: "Alola", idForma, formaPMD } o, en Arceus y Silvally, con imagenForma.
// La forma normal (la primera de la lista): {}.
export async function datosDeForma(info, slug) {
  const posicion = info.lista.indexOf(slug);
  if (posicion <= 0) return {};

  const deTipo = formaDeTipo(slug);
  if (deTipo) {
    return { etiqueta: etiquetaForma(slug, info.especie), formaPMD: deTipo.pmd, imagenForma: `${deTipo.dex}-${deTipo.tipo}` };
  }

  const p = await pedirJSON(`${URL_API}pokemon/${slug}`);
  return { etiqueta: etiquetaForma(slug, info.especie), idForma: p.id, formaPMD: indicePMD(p.id, posicion) };
}
