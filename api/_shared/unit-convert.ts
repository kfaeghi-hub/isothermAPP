// unitConvert — the alternates a field may switch to, and what switching costs.
//
// THE POINT OF THIS MODULE IS THE COUNT, NOT THE ARITHMETIC. Changing a field's
// unit without converting is a silent relabel: "225" entered as GPM becomes
// "225 L/s" and every later computation is off by 15.85× with nothing to show
// for it. So a unit change is never applied blind — the caller asks how many
// values exist, offers the conversion with that number, and the human decides.

export interface Conversion {
  to: string
  /** Applied to an entered value. Affine, because temperature is. */
  factor: number
  offset: number
  /** How to describe it to a human about to commit to it. */
  label: string
}

/**
 * Alternates per unit. Deliberately NOT a general dimensional-analysis engine:
 * these are the five quantities the firm's def sets actually use in two systems,
 * and a table you can read is worth more here than a model you have to trust.
 *
 * CFM, MBH, NPS, V, A, Hz, %, RPM, kA, Ø have no entry — they are the same in
 * both systems on Ontario drawings, which is why they never swapped in the seed.
 */
export const ALTERNATES: Record<string, Conversion[]> = {
  'L/s':  [{ to: 'GPM',  factor: 15.8503, offset: 0, label: '× 15.85' }],
  'GPM':  [{ to: 'L/s',  factor: 0.063090, offset: 0, label: '÷ 15.85' }],

  // kPa -> ft of head is the hydronic case, which is every kPa currently in the
  // def sets. PSI is offered too, for a gas or vessel pressure where it is the
  // right counterpart — the field, not a global rule, decides which.
  'kPa':  [{ to: 'ft',   factor: 0.334553, offset: 0, label: '× 0.3346 (head)' },
           { to: 'PSI',  factor: 0.145038, offset: 0, label: '× 0.1450' }],
  'ft':   [{ to: 'kPa',  factor: 2.98907,  offset: 0, label: '× 2.989' }],
  'PSI':  [{ to: 'kPa',  factor: 6.89476,  offset: 0, label: '× 6.895' }],

  // AFFINE, NOT A FACTOR. °C -> °F is ×9/5 + 32, and treating it as a
  // multiplier would turn 20 °C into 36 °F instead of 68 °F — a plausible
  // number, wrong by 32, which is the worst kind.
  '°C':   [{ to: '°F',   factor: 1.8, offset: 32,  label: '× 1.8 then + 32' }],
  '°F':   [{ to: '°C',   factor: 0.555556, offset: -17.7778, label: '− 32 then ÷ 1.8' }],

  'mm':   [{ to: 'in',   factor: 0.0393701, offset: 0, label: '÷ 25.4' }],
  'in':   [{ to: 'mm',   factor: 25.4, offset: 0, label: '× 25.4' }],

  'kg/h': [{ to: 'lb/h', factor: 2.20462, offset: 0, label: '× 2.2046' }],
  'lb/h': [{ to: 'kg/h', factor: 0.453592, offset: 0, label: '÷ 2.2046' }],

  'kW':   [{ to: 'HP',   factor: 1.34102, offset: 0, label: '× 1.341' },
           { to: 'MBH',  factor: 3.41214, offset: 0, label: '× 3.412' }],
  'HP':   [{ to: 'kW',   factor: 0.745700, offset: 0, label: '÷ 1.341' }],

  // MBH ADDED 2026-08-11. The note above says MBH "is the same in both systems on
  // Ontario drawings" — true of the UNIT, and it was never the point. The firm's
  // boiler def set declares `Input Rating (kW)` and `Output Rating (kW)`, while
  // every North American boiler schedule states them in MBH: Avondale's B-1 reads
  // MAX INPUT 800 MBH against a field expecting kW. Without this pair the value
  // matches its field and still cannot be written, because writing 800 under a kW
  // label is the relabelling defect wearing an import's clothes.
  'MBH':  [{ to: 'kW',   factor: 0.293071, offset: 0, label: '÷ 3.412' }],
}

export const alternatesFor = (unit: string | null): Conversion[] =>
  unit ? (ALTERNATES[unit] ?? []) : []

/**
 * Convert one recorded value. Returns null when the text is not a number —
 * nameplate fields hold things like "1 1/2" or "N/A", and a converter that
 * turned those into NaN would destroy them.
 *
 * THE NON-NUMERIC CASE IS NOT AN EDGE CASE. It is why the caller must report
 * how many values it could NOT convert, rather than silently leaving them at
 * their old magnitude under a new label.
 */
export function convertValue(raw: string, c: Conversion): string | null {
  const t = raw.trim()
  if (!t) return null
  // Tolerate a leading unit or stray spacing, reject anything with real text.
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  const out = n * c.factor + c.offset
  // Keep the precision an engineer would write, not float noise.
  const rounded = Math.abs(out) >= 100 ? Math.round(out)
                : Math.abs(out) >= 10  ? Math.round(out * 10) / 10
                : Math.round(out * 100) / 100
  return String(rounded)
}
