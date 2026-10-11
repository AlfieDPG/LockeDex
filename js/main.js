import { activarRespaldoImagenes } from "./comun/imagenes.js";
import { iniciarNavegacion, irA, vistaInicial } from "./navegacion.js";
import { iniciarSesionUI } from "./sesion.js";
import { sumarContador } from "./comun/contadores.js";
import "./comun/numero.js"; // las flechas de las casillas de número (en toda la web)

activarRespaldoImagenes();
iniciarNavegacion();
irA(vistaInicial()); // la que hubiera al recargar, o Versus si se entra de nuevas

// Preguntas frecuentes: el «?» al lado de «Créditos y privacidad»
const dialogoAyuda = document.querySelector("#dialogo-ayuda");
document.querySelector(".boton-ayuda").addEventListener("click", () => {
  dialogoAyuda.showModal();
  sumarContador("ayuda"); // para los logros
});
dialogoAyuda.querySelector(".ayuda-cerrar").addEventListener("click", () => dialogoAyuda.close());

// La sesión se monta aparte: si falla, la web sigue funcionando con el navegador
iniciarSesionUI().catch((error) => console.error(error));

// Guarda en el ordenador las imágenes y datos de fuera (ver sw.js). Si el navegador no
// lo admite o falla, la web va igual, solo que sin ese ahorro.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((error) => console.error(error));
}
