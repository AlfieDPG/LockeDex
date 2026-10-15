// ¿Es una ROM de 4.ª generación (Diamante, Perla, Platino, HeartGold, SoulSilver)? Aparte de
// ./juego-gen4.js para no cargar su tabla de versiones (grande) si no hace falta.
const CODIGOS_GEN4 = new Set(["ADA", "APA", "CPU", "IPK", "IPG"]);

export const esGen4 = (rom) => CODIGOS_GEN4.has(rom.codigo.slice(0, 3));