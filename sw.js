// Service worker de NuzTheLocke: guarda en el ordenador lo que viene de fuera para que, a partir
// de la segunda vez, salga al instante.
//
// Por qué hace falta: casi todas las imágenes (artes, retratos de Mundo Misterioso, sprites)
// vienen de raw.githubusercontent.com, que solo deja al navegador guardarlas 5 minutos.
// Pasado ese rato, cada imagen se vuelve a pedir a GitHub, y con un equipo, la lista de
// «Mis equipos» o la Pokédex son decenas de peticiones. Aquí se guardan sin caducidad.
//
// Solo se tocan las peticiones a HOSTS. Lo demás (la propia web, Firebase, el inicio de
// sesión de Google, Serebii y Showdown, que ya se guardan solos meses) pasa sin tocar.
//
// Al cambiar algo de este archivo que deba tirar lo guardado, se sube el número de CACHE.

const CACHE = "pokely-externo-v1";

const HOSTS = ["raw.githubusercontent.com", "pokeapi.co"];

// Lo guardado se da por bueno siempre, pero si tiene más de un mes se pide de nuevo por
// detrás (por si han corregido un sprite) y la vez siguiente ya sale el nuevo.
const REFRESCAR_DIAS = 30;

// Los «no existe» (404) también se guardan: los respaldos de imágenes prueban varias
// direcciones seguidas y así no se vuelve a preguntar por las que fallan. Pero solo una
// semana, por si mientras tanto alguien sube ese retrato.
const DIAS_404 = 7;

const DIA = 24 * 60 * 60 * 1000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith("pokely-") && nombre !== CACHE) await caches.delete(nombre);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  if (!HOSTS.includes(new URL(peticion.url).hostname)) return;

  evento.respondWith(responder(peticion, evento));
});

// Cuándo se guardó. Va en una cabecera propia porque la «Date» del servidor no se puede
// leer en una respuesta de otro dominio.
const CABECERA_FECHA = "x-pokely-guardado";

function edad(respuesta) {
  const fecha = Number(respuesta.headers.get(CABECERA_FECHA));
  return fecha ? Date.now() - fecha : Infinity;
}

async function guardar(cache, url, respuesta) {
  const cabeceras = new Headers(respuesta.headers);
  cabeceras.set(CABECERA_FECHA, String(Date.now()));
  const cuerpo = await respuesta.blob();
  await cache.put(url, new Response(cuerpo, { status: respuesta.status, statusText: respuesta.statusText, headers: cabeceras }));
}

// Se pide en modo CORS (los dos HOSTS lo permiten): así la respuesta se puede guardar
// entera. Si por lo que sea falla, se pide tal cual la pedía la página, sin guardarla.
// La página recibe la respuesta en cuanto llega; el guardado sigue por detrás.
async function descargar(peticion, cache, evento) {
  let respuesta;
  try {
    respuesta = await fetch(peticion.url, { mode: "cors", credentials: "omit" });
  } catch (error) {
    return fetch(peticion);
  }
  if (respuesta.ok || respuesta.status === 404) {
    evento.waitUntil(guardar(cache, peticion.url, respuesta.clone()).catch(() => {}));
  }
  return respuesta;
}

async function responder(peticion, evento) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(peticion.url);

  if (guardada && guardada.status === 404) {
    if (edad(guardada) < DIAS_404 * DIA) return guardada;
  } else if (guardada) {
    if (edad(guardada) > REFRESCAR_DIAS * DIA) {
      evento.waitUntil(descargar(peticion, cache, evento).catch(() => {}));
    }
    return guardada;
  }

  try {
    return await descargar(peticion, cache, evento);
  } catch (error) {
    if (guardada) return guardada; // sin conexión: mejor lo viejo que nada
    throw error;
  }
}
