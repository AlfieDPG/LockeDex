// ---------- Archivo de guardado vinculado ----------
//
// Con la File System Access API (Chrome y Edge de ordenador) se elige el archivo una vez y la
// web lo vuelve a leer cada vez que cambia: cada vez que guardas en el emulador. Solo se lee.
//
// El permiso se guarda en este navegador (IndexedDB, que es donde se pueden guardar). Al
// volver a entrar, el navegador pide confirmarlo con un clic: hasta entonces, «Reanudar».
//
// Sin la API (Firefox, Safari, el móvil) se puede leer igual una vez, con el selector de
// archivos de siempre.

const BD = "poketeams-partidas";
const ALMACEN = "archivos";
const CADA = 2000; // ms entre vistazos al archivo

export const sePuedeVigilar = typeof window !== "undefined" && "showOpenFilePicker" in window;

// ---------- IndexedDB ----------

function abrirBD() {
  return new Promise((resolver, fallar) => {
    const peticion = indexedDB.open(BD, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => fallar(peticion.error);
  });
}

async function operar(modo, hacer) {
  const bd = await abrirBD();
  return new Promise((resolver, fallar) => {
    const transaccion = bd.transaction(ALMACEN, modo);
    const peticion = hacer(transaccion.objectStore(ALMACEN));
    transaccion.oncomplete = () => resolver(peticion && peticion.result);
    transaccion.onerror = () => fallar(transaccion.error);
  });
}

// ---------- Vínculos ----------

const vinculos = new Map(); // idLocke -> { archivo, permiso: "granted" | "prompt" | ..., ultimo }
let alLeer = () => {};
let alCambiarEstado = () => {};
let temporizador = null;

export function estadoVinculo(idLocke) {
  const vinculo = vinculos.get(idLocke);
  if (!vinculo) return "";
  return vinculo.permiso === "granted" ? "vigilando" : "pausado";
}

export function nombreArchivo(idLocke) {
  const vinculo = vinculos.get(idLocke);
  return vinculo ? vinculo.archivo.name : "";
}

// Al arrancar: los archivos que ya estaban vinculados en este navegador
export async function cargarVinculos(leer, cambiarEstado) {
  alLeer = leer;
  alCambiarEstado = cambiarEstado;
  if (!sePuedeVigilar) return;
  try {
    const claves = (await operar("readonly", (almacen) => almacen.getAllKeys())) || [];
    for (const id of claves) {
      const archivo = await operar("readonly", (almacen) => almacen.get(id));
      if (!archivo) continue;
      vinculos.set(id, { archivo, permiso: await archivo.queryPermission({ mode: "read" }), ultimo: "" });
    }
  } catch (error) {
    console.error(error); // sin IndexedDB: habrá que vincular cada vez
  }
  alCambiarEstado();
  arrancar();
}

// Elegir el archivo (tiene que ser con un clic: el navegador no deja abrirlo solo)
export async function vincular(idLocke) {
  const [archivo] = await window.showOpenFilePicker({ id: "partida", multiple: false });
  vinculos.set(idLocke, { archivo, permiso: "granted", ultimo: "" });
  await operar("readwrite", (almacen) => almacen.put(archivo, idLocke)).catch((error) => console.error(error));
  alCambiarEstado();
  await mirar(idLocke);
  arrancar();
}

// Volver a dar permiso tras recargar la página (también con un clic)
export async function reanudar(idLocke) {
  const vinculo = vinculos.get(idLocke);
  if (!vinculo) return;
  vinculo.permiso = await vinculo.archivo.requestPermission({ mode: "read" });
  alCambiarEstado();
  if (vinculo.permiso === "granted") await mirar(idLocke);
}

export async function desvincular(idLocke) {
  vinculos.delete(idLocke);
  await operar("readwrite", (almacen) => almacen.delete(idLocke)).catch((error) => console.error(error));
  alCambiarEstado();
}

// Sin la API: leer un archivo una vez (<input type="file">)
export function leerUnaVez(idLocke) {
  const campo = document.createElement("input");
  campo.type = "file";
  campo.addEventListener("change", async () => {
    const archivo = campo.files[0];
    if (archivo) alLeer(idLocke, new Uint8Array(await archivo.arrayBuffer()), archivo.name);
  });
  campo.click();
}

// ---------- Vigilar ----------

async function mirar(idLocke) {
  const vinculo = vinculos.get(idLocke);
  if (!vinculo || vinculo.permiso !== "granted") return;
  let archivo;
  try {
    archivo = await vinculo.archivo.getFile();
  } catch (error) {
    // Borrado, movido o sin permiso: se deja en pausa
    vinculo.permiso = "prompt";
    alCambiarEstado();
    return;
  }
  const firma = `${archivo.lastModified}|${archivo.size}`;
  if (firma === vinculo.ultimo) return;
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  // Si el emulador está a mitad de escribir, la lectura falla: se reintenta en el siguiente
  // vistazo (por eso la firma solo se apunta si se ha podido leer)
  if (await alLeer(idLocke, bytes, archivo.name)) vinculo.ultimo = firma;
}

let mirando = false;
async function mirarTodos() {
  if (mirando) return;
  mirando = true;
  try {
    for (const id of vinculos.keys()) await mirar(id);
  } finally {
    mirando = false;
  }
}

function arrancar() {
  if (temporizador || !vinculos.size) return;
  temporizador = setInterval(mirarTodos, CADA);
  // Al volver a la pestaña, un vistazo en el momento (en segundo plano el navegador frena
  // los temporizadores)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") mirarTodos();
  });
}
