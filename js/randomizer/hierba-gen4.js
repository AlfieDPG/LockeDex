// ---------- Hierba en los pueblos (Diamante / Perla / Platino / HeartGold / SoulSilver) ----------
//
// Lo mismo que ./hierba-gen5.js con los archivos de 4.ª generación (comprobado con las ROM
// españolas, y con la Perla americana):
//   cabeceras de zona  en el programa principal (MapTableARM9Offset), 24 bytes cada una; tantas
//              como entradas de 16 bytes tiene fielddata/maptable/mapname.bin. Tabla de salvajes:
//              u16 en 14 en Diamante, Perla y Platino (0xFFFF = ninguna); u8 en 0 en HG/SS (0xFF)
//   matrices   (fielddata/mapmatrix/map_matrix.narc; a/0/4/1 en HG/SS) u8 ancho, u8 alto, u8 con
//              zonas, u8 con alturas, u8 largo del nombre y el nombre; zonas u16[], alturas u8[],
//              mapas u16[]. La 0 es el mundo
//   mapas      (fielddata/land_data/land_data_release.narc en Diamante y Perla, land_data.narc en
//              Platino, a/0/6/5 en HG/SS) los permisos van en 0x10 (en HG/SS, en 0x14 más lo que
//              diga el u16 de 0x12): 32 × 32 casillas de u16, comportamiento en el byte bajo y 0x80
//              en el alto si no se pasa. Suelo 0x00, arena 0x21, nieve 0xA8, hierba 0x02
//   salvajes   en Diamante, Perla y Platino, la hierba son los bytes 0-203 (probabilidad u32, los
//              12 huecos y los que los sustituyen); en HG/SS, la probabilidad en el byte 0 y los
//              niveles, las especies de las tres horas y las de la radio en 8-99
//   golpe cabeza (HG/SS, a/2/5/2) un archivo por zona; si tiene más de 4 bytes, hay árboles
// Coordenadas del mundo (celda × 32 + casilla). Solo pueblos donde no se puede capturar nada: los
// que tienen agua con Pokémon o árboles de golpe cabeza se quedan como están (y con ellos los del
// principio, Hojaverde y Primavera, a los que se llega sin Pokémon).

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
function poner16(b, i, v) {
  b[i] = v & 0xff;
  b[i + 1] = (v >> 8) & 0xff;
}
function poner32(b, i, v) {
  poner16(b, i, v & 0xffff);
  poner16(b, i + 2, (v >>> 16) & 0xffff);
}

// Zonas de las rutas de Sinnoh
const R = { 201: 342, 202: 343, 203: 344, 204: 346, 208: 354, 209: 356, 215: 382, 217: 385, 225: 400, 226: 469 };
// Y las de Johto y Kanto
const K = { 5: 13, 8: 16, 29: 33, 34: 38, 42: 44 };

// [zona, ruta de la que salen los Pokémon, sitios [x0, x1, y0, y1]]
const SINNOH = [
  [418, R[201], [[171, 173, 848, 853]]], // Arena
  [3, R[202], [[156, 159, 744, 751]]], // Jubileo
  [45, R[203], [[309, 316, 773, 777]]], // Pirita
  [426, R[204], [[184, 188, 647, 650]]], // Aromaflor
  [86, R[208], [[478, 484, 712, 715]]], // Corazón
  [433, R[209], [[578, 581, 660, 667]]], // Sosiego
  [132, R[215], [[723, 728, 601, 608]]], // Rocavelo
  [165, R[217], [[357, 363, 242, 244]]], // Puntaneva (en la nieve)
  [450, R[226], [[653, 659, 328, 329], [644, 649, 340, 341]]] // Zona Sobrevivir
];
// La Zona de Combate cambia de Diamante y Perla a Platino
const COMBATE_DP = [188, R[225], [[648, 650, 442, 445], [656, 661, 444, 445]]];
const COMBATE_PT = [188, R[225], [[625, 634, 444, 445]]];
const JOHTO_KANTO = [
  [76, K[34], [[309, 312, 350, 357]]], // Trigal
  [87, K[42], [[515, 518, 182, 186]]], // Caoba
  [53, K[8], [[1430, 1436, 238, 242]]], // Lavanda
  [59, K[5], [[1319, 1328, 222, 225]]] // Azafrán
];

const SUELOS = [0x00, 0x21, 0xa8];

// ¿Se puede capturar algo con esta tabla? (algún grupo con probabilidad y algún Pokémon)
function hayPokemon(t, hgss) {
  const algo = (n, f) => Array.from({ length: n }, (_, i) => f(i)).some(Boolean);
  if (hgss) {
    // Hierba (especies desde 20), surf, golpe roca y las tres cañas ([nivel, especie] desde 100)
    if (t[0] && algo(36, (i) => u16(t, 20 + i * 2))) return true;
    const grupos = [[1, 100, 5], [2, 120, 2], [3, 128, 5], [4, 148, 5], [5, 168, 5]];
    return grupos.some(([r, base, n]) => t[r] && algo(n, (i) => u16(t, base + i * 4 + 2)));
  }
  if (u32(t, 0) && algo(12, (i) => u32(t, 8 + i * 8))) return true;
  return [0, 2, 3, 4].some((g) => u32(t, 204 + g * 44) && algo(5, (i) => u32(t, 204 + g * 44 + 8 + i * 8)));
}
const HIERBA = 0x02;
// La probabilidad de la hierba normal: la de la primera ruta
const RUTA_NORMAL = { dp: R[201], pt: R[201], hgss: K[29] };

// Pone la hierba. perfil: el de ./juego-gen4.js
export function ponerHierbaEnPueblos(rom, perfil, { leerNarc, crearNarc }) {
  const tipo = perfil.id;
  const hgss = tipo === "hgss";
  const pueblos = hgss ? JOHTO_KANTO : [...SINNOH, tipo === "pt" ? COMBATE_PT : COMBATE_DP];
  const cabezas = hgss ? leerNarc(rom.archivo(perfil.archivos.HeadbuttPokemon)).archivos : [];
  const rutaMapas = hgss ? "a/0/6/5" : tipo === "pt" ? "fielddata/land_data/land_data.narc" : "fielddata/land_data/land_data_release.narc";
  const rutaMatrices = hgss ? "a/0/4/1" : "fielddata/mapmatrix/map_matrix.narc";
  const rutaSalvajes = perfil.archivos.WildPokemon;
  const arm9 = rom.leerArm9();
  const tablaZonas = perfil.num.MapTableARM9Offset;
  const tablaDe = (zona) => {
    const o = tablaZonas + zona * 24;
    if (hgss) return arm9[o] === 0xff ? -1 : arm9[o];
    return u16(arm9, o + 14) === 0xffff ? -1 : u16(arm9, o + 14);
  };
  const ponerTabla = (zona, id) => (hgss ? (arm9[tablaZonas + zona * 24] = id) : poner16(arm9, tablaZonas + zona * 24 + 14, id));

  const matriz = leerNarc(rom.archivo(rutaMatrices)).archivos[0];
  const ancho = matriz[0], alto = matriz[1];
  let p = 5 + matriz[4];
  const zonas = matriz[2] ? Array.from({ length: ancho * alto }, (_, i) => u16(matriz, p + i * 2)) : [];
  if (matriz[2]) p += ancho * alto * 2;
  if (matriz[3]) p += ancho * alto;
  const celdasDe = (zona) => {
    const celdas = [];
    for (let i = 0; i < ancho * alto; i++) {
      const mapa = u16(matriz, p + i * 2);
      if (zonas[i] === zona && mapa !== 0xffff) celdas.push({ x: (i % ancho) * 32, y: Math.floor(i / ancho) * 32, mapa });
    }
    return celdas;
  };

  const salvajes = leerNarc(rom.archivo(rutaSalvajes));
  const normal = tablaDe(RUTA_NORMAL[tipo]);
  if (normal < 0) return [];
  const probabilidad = hgss ? salvajes.archivos[normal][0] : u32(salvajes.archivos[normal], 0);
  // Los mapas se cambian dentro del NARC (es grande y se queda igual de largo)
  const mapas = rom.archivo(rutaMapas);
  const inicioMapa = sitiosNarc(mapas);

  let cabecerasCambiadas = false;
  const hechos = [];
  for (const [zona, origen, sitios] of pueblos) {
    const celdas = celdasDe(zona);
    const fuenteId = tablaDe(origen);
    const tabla = tablaDe(zona);
    if (!celdas.length || fuenteId < 0) continue;
    // Si ya se puede capturar algo (en el agua, pescando, con golpe cabeza), se queda como está
    if (tabla >= 0 && hayPokemon(salvajes.archivos[tabla], hgss)) continue;
    if (cabezas[zona] && cabezas[zona].length > 4) continue;
    if (tabla < 0 && hgss && salvajes.archivos.length >= 0xff) continue;

    let cuantas = 0;
    for (const [x0, x1, y0, y1] of sitios) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const celda = celdas.find((c) => x >= c.x && x < c.x + 32 && y >= c.y && y < c.y + 32);
        if (!celda) continue;
        const ini = inicioMapa[celda.mapa];
        const permisos = ini + (hgss ? 0x14 + u16(mapas, ini + 0x12) : 0x10);
        const t = permisos + ((y - celda.y) * 32 + (x - celda.x)) * 2;
        if (SUELOS.includes(mapas[t]) && !(mapas[t + 1] & 0x80)) {
          mapas[t] = HIERBA;
          cuantas++;
        }
      }
    }
    if (!cuantas) continue;

    // Los Pokémon de hierba de la ruta (en una tabla nueva, o en la que tenía vacía)
    const fuente = salvajes.archivos[fuenteId];
    let destino;
    if (tabla >= 0) destino = salvajes.archivos[tabla];
    else {
      destino = new Uint8Array(fuente.length);
      ponerTabla(zona, salvajes.archivos.length);
      salvajes.archivos.push(destino);
      cabecerasCambiadas = true;
    }
    if (hgss) {
      destino.set(fuente.subarray(8, 100), 8);
      destino[0] = probabilidad;
    } else {
      destino.set(fuente.subarray(0, 204), 0);
      poner32(destino, 0, probabilidad);
    }
    hechos.push(zona);
  }
  if (!hechos.length) return hechos;
  rom.cambiar(rutaMapas, mapas);
  rom.cambiar(rutaSalvajes, crearNarc(salvajes));
  if (cabecerasCambiadas) rom.escribirArm9(arm9);
  return hechos;
}

// Dónde empieza cada archivo dentro de los bytes de un NARC
function sitiosNarc(n) {
  const fat = u16(n, 0x0c);
  const largoFat = u32(n, fat + 4);
  const datos = fat + largoFat + u32(n, fat + largoFat + 4) + 8;
  return Array.from({ length: u16(n, fat + 8) }, (_, i) => datos + u32(n, fat + 12 + i * 8));
}
