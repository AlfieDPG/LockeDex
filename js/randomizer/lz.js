// ---------- LZ de Nintendo (0x10 y 0x11): la compresión de los dibujos ----------
//
// Un byte con el tipo (0x10 o 0x11) y el tamaño descomprimido (3 bytes; si es 0, 4 más). Luego,
// grupos de un byte de banderas (de la más alta a la más baja) y 8 trozos: con la bandera a 0,
// un byte tal cual; a 1, una copia de lo ya escrito (cuánto y desde cuán atrás).

export function descomprimirLZ(datos) {
  const tipo = datos[0];
  if (tipo !== 0x10 && tipo !== 0x11) return null;
  let largo = datos[1] | (datos[2] << 8) | (datos[3] << 16);
  let p = 4;
  if (!largo) {
    largo = (datos[4] | (datos[5] << 8) | (datos[6] << 16) | (datos[7] << 24)) >>> 0;
    p = 8;
  }
  const salida = new Uint8Array(largo);
  let s = 0;
  while (s < largo) {
    const banderas = datos[p++];
    for (let i = 0; i < 8 && s < largo; i++) {
      if (!(banderas & (0x80 >> i))) {
        salida[s++] = datos[p++];
        continue;
      }
      let cuanto;
      let atras;
      const b1 = datos[p++];
      if (tipo === 0x10) {
        cuanto = (b1 >> 4) + 3;
        atras = ((b1 & 0x0f) << 8) | datos[p++];
      } else if (b1 >> 4 === 0) {
        const b2 = datos[p++];
        cuanto = ((b1 << 4) | (b2 >> 4)) + 0x11;
        atras = ((b2 & 0x0f) << 8) | datos[p++];
      } else if (b1 >> 4 === 1) {
        const b2 = datos[p++];
        const b3 = datos[p++];
        cuanto = (((b1 & 0x0f) << 12) | (b2 << 4) | (b3 >> 4)) + 0x111;
        atras = ((b3 & 0x0f) << 8) | datos[p++];
      } else {
        cuanto = (b1 >> 4) + 1;
        atras = ((b1 & 0x0f) << 8) | datos[p++];
      }
      const desde = s - atras - 1;
      for (let k = 0; k < cuanto && s < largo; k++) salida[s++] = salida[desde + k];
    }
  }
  return salida;
}
