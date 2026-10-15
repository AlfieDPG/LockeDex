// ---------- Hierba en los pueblos (Negro / Blanco y Negro 2 / Blanco 2) ----------
//
// Un trozo de hierba alta en cada pueblo y ciudad donde no se puede capturar nada (ni en el agua
// ni pescando): las casillas cambian de comportamiento (no se ve, solo al pisarla) y el pueblo
// recibe los Pokémon de hierba de la ruta por la que se llega. Si luego se randomizan los
// salvajes, estos también.
//
// Dónde está cada cosa (comprobado con las ROM españolas de los cuatro):
//   a/0/1/2    cabeceras de zona (archivo 0, 48 bytes cada una): matriz u16 en 4, tabla de
//              salvajes en 20 (u8 en Negro 2 y Blanco 2, 255 = ninguna; u16 en Negro y Blanco,
//              0xFFFF)
//   a/0/0/9    matrices: u32 con zonas, u16 ancho, u16 alto, mapas u32[], zonas u32[]; la 0 es el
//              mundo
//   a/0/0/8    mapas: «WB», u16 secciones, desde 4 dónde empieza cada una; la 1, los permisos:
//              u16 32, u16 32 y 8 bytes por casilla (comportamiento en 4, colisión en 6). Suelo
//              00/80, arena de la playa 03/80, hierba 04/24 (el bit 0x04 de la colisión es el que
//              hace que salgan Pokémon)
// Las coordenadas son las del mundo (celda × 32 + casilla). Los sitios están elegidos a mano,
// fuera de los caminos entre puertas y salidas. Cada pueblo dice qué mapas tiene: si la ROM tiene
// otros, ese pueblo se deja como está. Negro y Negro 2 tienen los mismos que Blanco y Blanco 2.

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
function poner16(b, i, v) {
  b[i] = v & 0xff;
  b[i + 1] = (v >> 8) & 0xff;
}

// Zonas de las rutas de las que salen los Pokémon (iguales en los cuatro juegos)
const RUTA = { 1: 317, 2: 319, 3: 321, 4: 326, 5: 329, 6: 331, 7: 337, 9: 348, 11: 365, 12: 368, 13: 370, 19: 437 };

// Pueblos: zona, sus mapas, de dónde salen los Pokémon y dónde va la hierba ([x0, x1, y0, y1],
// las casillas de suelo de dentro). Los que tienen agua con Pokémon no están (Engobe, Hormigón,
// Arenisca, Marga, Gres y, en Negro y Blanco, Fayenza)
const PUEBLOS_BW2 = [
  { zona: 439, mapas: [283, 284], origen: RUTA[19], hierba: [[115, 124, 684, 687]] }, // Ocre
  { zona: 62, mapas: [38, 39, 40, 41], origen: RUTA[4], hierba: [[413, 420, 463, 467]] }, // Mayólica
  { zona: 96, mapas: [46, 47, 48, 49, 50], origen: RUTA[5], hierba: [[180, 187, 438, 442]] }, // Fayenza
  { zona: 107, mapas: [56, 57, 58, 59], origen: RUTA[6], hierba: [[83, 87, 310, 317]] }, // Loza
  { zona: 458, mapas: [297], origen: RUTA[7], hierba: [[610, 617, 309, 314]] }, // Chamota
  { zona: 406, mapas: [83], origen: RUTA[13], hierba: [[643, 663, 161, 161]] }, // Ladrillo
  { zona: 120, mapas: [74, 75, 76, 77], origen: RUTA[11], hierba: [[403, 412, 177, 179]] }, // Caolín
  { zona: 397, mapas: [5], origen: RUTA[2], hierba: [[774, 785, 667, 668]] }, // Terracota
  { zona: 16, mapas: [17, 18], origen: RUTA[3], hierba: [[661, 665, 587, 591]] }, // Esmalte
  { zona: 389, mapas: [0], origen: RUTA[1], hierba: [[782, 788, 759, 761]] } // Arcilla
];

const PUEBLOS_BW1 = [
  { zona: 389, mapas: [0], origen: RUTA[1], hierba: [[772, 774, 753, 761]] }, // Arcilla
  { zona: 397, mapas: [5], origen: RUTA[2], hierba: [[774, 785, 667, 668]] }, // Terracota
  { zona: 16, mapas: [17, 18], origen: RUTA[3], hierba: [[661, 665, 587, 591]] }, // Esmalte
  { zona: 62, mapas: [38, 39, 40, 41], origen: RUTA[4], hierba: [[403, 405, 457, 460], [407, 409, 457, 460]] }, // Mayólica
  { zona: 107, mapas: [56, 57, 58, 59], origen: RUTA[6], hierba: [[83, 87, 310, 317]] }, // Loza
  { zona: 120, mapas: [74, 75, 76, 77], origen: RUTA[9], hierba: [[407, 416, 178, 180]] }, // Caolín
  { zona: 406, mapas: [83], origen: RUTA[12], hierba: [[643, 663, 161, 161]] } // Ladrillo
];

const POR_ESTACION = 232;
const HUECO = 4;
// Las 7 zonas de una tabla (hierba, oscura, que se mueve, surf, surf especial, pesca, pesca
// especial) y sus huecos
const HUECOS_ZONA = [12, 12, 12, 5, 5, 5, 5];
// Hierba (zona 0, 12 huecos desde el 0) y hierba que se mueve (zona 2, 12 desde el 24)
const ZONAS_HIERBA = [[0, 0], [2, 24]];

// ¿Se puede capturar algo con esta tabla? (alguna zona con probabilidad y algún Pokémon)
function hayPokemon(t) {
  for (let e = 0; e * POR_ESTACION < t.length; e++) {
    let pos = e * POR_ESTACION + 8;
    for (let z = 0; z < HUECOS_ZONA.length; z++) {
      const huecos = Array.from({ length: HUECOS_ZONA[z] }, (_, i) => u16(t, pos + i * HUECO) & 0x7ff);
      if (t[e * POR_ESTACION + z] && huecos.some(Boolean)) return true;
      pos += HUECOS_ZONA[z] * HUECO;
    }
  }
  return false;
}

// Pone la hierba en la ROM. perfil: el de ./perfiles-gen5.js; narc: { leer, crear } de rom-nds.js
export function ponerHierbaEnPueblos(rom, perfil, { leerNarc, crearNarc }) {
  const segundos = perfil.id === "bw2";
  const pueblos = segundos ? PUEBLOS_BW2 : PUEBLOS_BW1;
  const narcCabeceras = leerNarc(rom.archivo("a/0/1/2"));
  const cab = narcCabeceras.archivos[0];
  const matriz = leerNarc(rom.archivo("a/0/0/9")).archivos[0];
  const salvajes = leerNarc(rom.archivo(perfil.rutas.salvajes));
  // Los mapas se cambian dentro del NARC, sin rehacerlo (es muy grande y se queda igual de largo)
  const mapas = rom.archivo("a/0/0/8");
  const inicioMapa = sitiosNarc(mapas);

  const tablaDe = (zona) => {
    const v = segundos ? cab[zona * 48 + 20] : u16(cab, zona * 48 + 20);
    return v === (segundos ? 0xff : 0xffff) ? -1 : v;
  };
  const ponerTabla = (zona, id) => (segundos ? (cab[zona * 48 + 20] = id) : poner16(cab, zona * 48 + 20, id));
  const ancho = u16(matriz, 4), alto = u16(matriz, 6);
  const celdasDe = (zona) => {
    const celdas = [];
    for (let i = 0; i < ancho * alto; i++) {
      if (u32(matriz, 8 + ancho * alto * 4 + i * 4) === zona) celdas.push({ x: (i % ancho) * 32, y: Math.floor(i / ancho) * 32, mapa: u32(matriz, 8 + i * 4) });
    }
    return celdas;
  };
  const ruta1 = tablaDe(RUTA[1]);
  if (ruta1 < 0) return [];
  const normal = salvajes.archivos[ruta1];

  const hechos = [];
  for (const p of pueblos) {
    const celdas = celdasDe(p.zona);
    const suyos = celdas.map((c) => c.mapa).sort((a, b) => a - b).join();
    if (suyos !== p.mapas.slice().sort((a, b) => a - b).join()) continue;
    const origen = tablaDe(p.origen);
    const tabla = tablaDe(p.zona);
    if (origen < 0) continue;
    // Si ya se puede capturar algo (en el agua, pescando), se queda como está
    if (tabla >= 0 && hayPokemon(salvajes.archivos[tabla])) continue;
    if (tabla < 0 && segundos && salvajes.archivos.length >= 0xff) continue;

    // Las casillas
    let cuantas = 0;
    for (const [x0, x1, y0, y1] of p.hierba) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const celda = celdas.find((c) => x >= c.x && x < c.x + 32 && y >= c.y && y < c.y + 32);
        if (!celda) continue;
        const ini = inicioMapa[celda.mapa];
        const permisos = ini + u32(mapas, ini + 8);
        const t = permisos + 4 + ((y - celda.y) * 32 + (x - celda.x)) * 8;
        if ((mapas[t + 4] === 0x00 || mapas[t + 4] === 0x03) && mapas[t + 6] === 0x80) {
          mapas[t + 4] = 0x04;
          mapas[t + 6] = 0x24;
          cuantas++;
        }
      }
    }
    if (!cuantas) continue;

    // Los Pokémon: los de hierba de la ruta, en cada estación (una tabla nueva, o la que tenía
    // vacía)
    const fuente = salvajes.archivos[origen];
    const estacionesFuente = Math.max(1, Math.floor(fuente.length / POR_ESTACION));
    let destino;
    if (tabla >= 0) destino = salvajes.archivos[tabla];
    else {
      destino = new Uint8Array(estacionesFuente * POR_ESTACION);
      ponerTabla(p.zona, salvajes.archivos.length);
      salvajes.archivos.push(destino);
    }
    for (let e = 0; e * POR_ESTACION < destino.length; e++) {
      const de = Math.min(e, estacionesFuente - 1) * POR_ESTACION;
      const a = e * POR_ESTACION;
      for (const [zona, primero] of ZONAS_HIERBA) {
        // Cada cuánto salen: lo de la hierba normal (la Ruta 4 es arena y la 7, hierba muy alta)
        destino[a + zona] = fuente[de + zona] ? normal[zona] : 0;
        const desde = 8 + primero * HUECO;
        destino.set(fuente.subarray(de + desde, de + desde + 12 * HUECO), a + desde);
      }
    }
    hechos.push(p.zona);
  }
  if (!hechos.length) return hechos;
  rom.cambiar("a/0/0/8", mapas);
  rom.cambiar("a/0/1/2", crearNarc(narcCabeceras));
  rom.cambiar(perfil.rutas.salvajes, crearNarc(salvajes));
  return hechos;
}

// Dónde empieza cada archivo dentro de los bytes de un NARC
function sitiosNarc(n) {
  const fat = u16(n, 0x0c);
  const largoFat = u32(n, fat + 4);
  const datos = fat + largoFat + u32(n, fat + largoFat + 4) + 8;
  return Array.from({ length: u16(n, fat + 8) }, (_, i) => datos + u32(n, fat + 12 + i * 8));
}
