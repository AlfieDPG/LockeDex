// ---------- Hierba en los pueblos (X / Y, Rubí Omega / Zafiro Alfa) ----------
//
// Lo mismo que ./hierba-gen5.js con los archivos de 6.ª generación (comprobado con Y y Rubí Omega):
//   zonas      (a/0/1/2 en X/Y, a/0/1/3 en ROZA; comprimidos en LZ11) un archivo «ZO» por zona: u16 secciones y
//              desde 4 dónde empieza cada una: la cabecera, las entidades, los scripts y los encuentros (en ROZA,
//              detrás, otra más). En los pueblos sin Pokémon, la de los encuentros está vacía. La cabecera de
//              cada zona, también en una tabla (el último archivo; en ROZA el penúltimo), 56 bytes: la matriz
//              en el u16 de 4
//   matrices   (a/0/4/2 en X/Y, a/0/4/0 en ROZA) «MM»; en la sección 0: u16 con zonas, u16, ancho, alto, los
//              mapas de cada celda (u16) y, si lleva zonas, la zona de cada cuarto de celda (u16, 4 × 4 por celda)
//   mapas      (a/0/4/1 en X/Y, a/0/3/9 en ROZA; LZ11) «GR»; en la sección 0: u16 40, u16 40 y un u32 por
//              casilla: suelo 0x20 (el bit 0 a 1, no se pasa), hierba 0x20002004 en X/Y y 0x20004004 en ROZA
//   encuentros 0x10 bytes (0x0E en ROZA) y los huecos ([especie | forma << 11 u16, nivel, nivel máx.]): la hierba
//              en los 12 primeros (la casilla de hierba normal tira de esos), la alta y las flores detrás, y las
//              hordas al final (en ROZA, también los 3 del DexNav)
// Las coordenadas son las del mundo de la matriz del pueblo (celda × 40 + casilla). Solo pueblos donde no se
// puede capturar nada; fuera los del principio (Boceto y Acuarela, Villa Raíz: se llega a ellos sin Pokémon) y
// Luminalia (sus calles no van por casillas).

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
function poner32(b, i, v) {
  b[i] = v & 0xff;
  b[i + 1] = (v >>> 8) & 0xff;
  b[i + 2] = (v >>> 16) & 0xff;
  b[i + 3] = (v >>> 24) & 0xff;
}

const SUELO = 0x20;
const JUEGOS = {
  xy: {
    zonas: "a/0/1/2", tablaZonas: 1, matrices: "a/0/4/2", mapas: "a/0/4/1", hierba: 0x20002004,
    // La hierba: la normal de la ruta o, si no tiene, la alta o la de las flores; y además las hordas
    cabecera: 0x10, datos: 0x178, hierbas: [0, 192, 48, 96, 144], copiar: [[316, 376]], detras: false,
    // [zona, zona de la ruta de la que salen los Pokémon, sitios [x0, x1, y0, y1]]
    pueblos: [
      [12, 260, [[652, 660, 506, 510]]], // Vánitas (Ruta 3)
      [21, 268, []], // Crómlech: ya tiene hierba (Ruta 10)
      [29, 276, [[63, 71, 66, 70]]], // Fresco (Ruta 16)
      [53, 262, [[454, 461, 576, 581]]], // Novarte (Ruta 5)
      [188, 273, [[40, 45, 84, 91]]], // Témpera (Ruta 14)
      [211, 276, [[80, 87, 62, 67]]], // Fluxus (Ruta 16: la 17 solo tiene nieve)
      [222, 282, [[21, 29, 90, 94]]], // Fractal (Ruta 20)
      [233, 279, [[15, 24, 89, 91]]] // Batik (Ruta 18)
    ]
  },
  oras: {
    zonas: "a/0/1/3", tablaZonas: 2, matrices: "a/0/4/0", mapas: "a/0/3/9", hierba: 0x20004004,
    cabecera: 0x0e, datos: 0xf6, hierbas: [0, 48], copiar: [[96, 108], [184, 244]], detras: true,
    pueblos: [
      [7, 23, [[85, 90, 92, 99]]], // Escaso (Ruta 101)
      [9, 38, [[90, 99, 154, 156]]], // Lavacalda (Ruta 112)
      [10, 40, [[161, 168, 99, 104]]], // Pardal (Ruta 113)
      [11, 44, [[104, 107, 104, 109]]], // Verdegal (Ruta 117)
      [15, 33, [[3, 12, 9, 10], [23, 26, 14, 18]]], // Malvalona (Ruta 110)
      [16, 26, [[143, 150, 185, 190]]], // Férrica (Ruta 104)
      [17, 46, [[3, 11, 14, 18]]] // Arborada (Ruta 119)
    ]
  }
};

// Dónde están los encuentros de un archivo de zona ya descomprimido: [inicio, fin)
function seccionEncuentros(d, j) {
  return [u32(d, 0x10), j.detras ? u32(d, 0x14) : d.length];
}

// sesion: la de ./rom-3ds.js; perfil: el de ./juego-3ds.js; util: { leerGarc, crearGarc, descomprimirLZ11, comprimirLZ11 }
export async function ponerHierbaEnPueblos(sesion, perfil, util) {
  const j = JUEGOS[perfil.id];
  if (!j) return [];
  const { leerGarc, crearGarc, descomprimirLZ11, comprimirLZ11 } = util;
  const abrir = (b) => (b[0] === 0x11 ? descomprimirLZ11(b) : b);
  const zonas = leerGarc(sesion.archivo(j.zonas));
  const tabla = zonas.archivos[zonas.archivos.length - j.tablaZonas];
  await sesion.cargar([j.matrices]);
  const matrices = leerGarc(sesion.archivo(j.matrices));

  // Cada pueblo: sus casillas (celda, mapa y posición) dentro de su zona
  const planes = [];
  const necesarios = new Set();
  for (const [zona, origen, sitios] of j.pueblos) {
    const d = abrir(zonas.archivos[zona]);
    const [a, b] = seccionEncuentros(d, j);
    if (b > a) continue; // ya se puede capturar algo
    const m = matrices.archivos[u16(tabla, zona * 56 + 4)];
    const s0 = u32(m, 4);
    const conZonas = u16(m, s0) === 1;
    const w = u16(m, s0 + 4), h = u16(m, s0 + 6);
    const mapaDe = (cx, cy) => u16(m, s0 + 8 + (cy * w + cx) * 2);
    const zonaDe = (x, y) => (conZonas ? u16(m, s0 + 8 + w * h * 2 + (Math.floor(y / 10) * w * 4 + Math.floor(x / 10)) * 2) : zona);
    const celdas = new Map(); // mapa -> casillas [x, y] de dentro
    for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
      const mapa = mapaDe(cx, cy);
      if (mapa === 0xffff) continue;
      for (let y = cy * 40; y < cy * 40 + 40; y++) for (let x = cx * 40; x < cx * 40 + 40; x++) {
        if (zonaDe(x, y) !== zona) continue;
        if (!celdas.has(mapa)) celdas.set(mapa, []);
        celdas.get(mapa).push([x, y, x - cx * 40, y - cy * 40]);
      }
    }
    for (const mapa of celdas.keys()) necesarios.add(mapa);
    planes.push({ zona, origen, sitios, d, celdas });
  }
  if (!planes.length) return [];
  await sesion.cargarParcial(j.mapas, (i) => necesarios.has(i));
  const mapas = sesion.parcial(j.mapas);
  const abiertos = new Map(); // mapa -> bytes descomprimidos (cambiados)
  const dentro = (x, y, sitios) => sitios.some(([x0, x1, y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

  const nuevasZonas = {};
  const hechos = [];
  for (const { zona, origen, sitios, d, celdas } of planes) {
    // Las casillas: el suelo de los sitios pasa a hierba; la hierba que ya hubiera también cuenta
    let hierba = 0;
    for (const [mapa, casillas] of celdas) {
      if (!abiertos.has(mapa)) abiertos.set(mapa, abrir(mapas.archivos[mapa]).slice());
      const b = abiertos.get(mapa);
      const p = u32(b, 4) + 4;
      for (const [x, y, tx, ty] of casillas) {
        const pos = p + (ty * 40 + tx) * 4;
        if (u32(b, pos) === SUELO && dentro(x, y, sitios)) poner32(b, pos, j.hierba);
        if (u32(b, pos) === j.hierba) hierba++;
      }
    }
    if (!hierba) continue;

    // Los encuentros: los de hierba (y hordas) de la ruta
    const r = abrir(zonas.archivos[origen]);
    const [ra, rb] = seccionEncuentros(r, j);
    if (rb - ra < j.cabecera + j.datos) continue;
    const enc = new Uint8Array(j.cabecera + j.datos);
    enc.set(r.subarray(ra, ra + j.cabecera));
    const datos = ra + j.cabecera;
    const conPokemon = (desde) => Array.from({ length: 12 }, (_, k) => u16(r, datos + desde + k * 4) & 0x7ff).some(Boolean);
    const grupo = j.hierbas.find(conPokemon);
    if (grupo === undefined) continue;
    enc.set(r.subarray(datos + grupo, datos + grupo + 48), j.cabecera);
    for (const [desde, hasta] of j.copiar) enc.set(r.subarray(datos + desde, datos + hasta), j.cabecera + desde);
    const [a] = seccionEncuentros(d, j);
    const nueva = new Uint8Array(d.length + enc.length);
    nueva.set(d.subarray(0, a));
    nueva.set(enc, a);
    nueva.set(d.subarray(a), a + enc.length);
    // Los encuentros son la sección 3: su final y lo de detrás se corren
    for (let k = 4; k <= u16(d, 2); k++) poner32(nueva, 4 + k * 4, u32(d, 4 + k * 4) + enc.length);
    nuevasZonas[zona] = comprimirLZ11(nueva);
    hechos.push(zona);
  }
  if (!hechos.length) return [];
  sesion.cambiar(j.zonas, crearGarc(sesion.archivo(j.zonas), nuevasZonas));
  const nuevosMapas = {};
  for (const [mapa, b] of abiertos) nuevosMapas[mapa] = comprimirLZ11(b);
  sesion.cambiarParcial(j.mapas, nuevosMapas);
  return hechos;
}
