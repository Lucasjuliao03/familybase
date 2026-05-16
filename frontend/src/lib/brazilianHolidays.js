/** Feriados fixos/móveis (BR) por ano civil — timezone local apenas para etiqueta de data. */

export default function getHolidays(year) {
  const calcEaster = (y) => {
    const a = y % 19,
      b = Math.floor(y / 100),
      c = y % 100;
    const d = Math.floor(b / 4),
      e = b % 4,
      f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4),
      k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return { month, day };
  };
  const fmt = (m, d) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const easter = calcEaster(year);
  const shift = (n) => {
    const d = new Date(year, easter.month - 1, easter.day + n);
    return fmt(d.getMonth() + 1, d.getDate());
  };
  const h = {};
  h[fmt(easter.month, easter.day)] = 'Páscoa';
  h[shift(-48)] = 'Carnaval';
  h[shift(-47)] = 'Carnaval';
  h[shift(-46)] = 'Quarta-Feira de Cinzas';
  h[shift(-2)] = 'Paixão de Cristo';
  h[shift(60)] = 'Corpus Christi';
  const fixed = [
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia Mundial do Trabalho'],
    ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['10-28', 'Dia do Servidor Público'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['11-20', 'Dia da Consciência Negra'],
    ['12-25', 'Natal'],
  ];
  fixed.forEach(([md, name]) => {
    h[`${year}-${md}`] = name;
  });
  return h;
}
