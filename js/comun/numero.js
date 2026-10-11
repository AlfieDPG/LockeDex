// Casillas de número con flechas propias: las del navegador desentonan con la web.
//
//   campoNumero('<input type="number" ...>') -> la casilla con sus dos flechas al lado
//
// Las flechas funcionan solas (un solo oyente para toda la web): suben o bajan dentro de
// min y max y avisan con «input», como si se hubiera escrito. Manteniendo pulsado se repite;
// al soltar, «change». Con el teclado siguen valiendo las flechas de arriba y abajo.

export function campoNumero(input) {
  return `<span class="numero">${input}<span class="numero-pasos" aria-hidden="true"><button type="button" class="numero-mas" tabindex="-1"></button><button type="button" class="numero-menos" tabindex="-1"></button></span></span>`;
}

// Un paso: true si ha cambiado algo
function paso(input, sube) {
  if (input.disabled || input.readOnly) return false;
  const salto = Number(input.step) || 1;
  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  let nuevo;
  if (input.value === "") nuevo = sube ? (Number.isFinite(min) ? min : 0) : Number.isFinite(max) ? max : 0;
  else nuevo = Math.min(max, Math.max(min, Number(input.value) + (sube ? salto : -salto)));
  if (String(nuevo) === input.value) return false;
  input.value = nuevo;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

let repeticion = null;
let pulsado = null; // la casilla cuya flecha se está pulsando

function soltar() {
  clearTimeout(repeticion);
  clearInterval(repeticion);
  repeticion = null;
  if (pulsado && pulsado.isConnected) pulsado.dispatchEvent(new Event("change", { bubbles: true }));
  pulsado = null;
}

document.addEventListener("pointerdown", (e) => {
  const boton = e.target.closest(".numero-mas, .numero-menos");
  if (!boton || e.button !== 0) return;
  e.preventDefault(); // que no se lleve el foco
  const input = boton.closest(".numero").querySelector("input");
  const sube = boton.classList.contains("numero-mas");
  if (!paso(input, sube)) return;
  pulsado = input;
  repeticion = setTimeout(() => {
    repeticion = setInterval(() => {
      // Si la casilla ya no está (se ha vuelto a pintar) o ha llegado al tope, se para
      if (!pulsado.isConnected || !paso(pulsado, sube)) soltar();
    }, 60);
  }, 400);
});

document.addEventListener("pointerup", soltar);
document.addEventListener("pointercancel", soltar);
