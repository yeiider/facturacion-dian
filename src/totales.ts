import type { CodigoTributo, Linea } from './types.js';

/** Redondeo a 2 decimales, mitad hacia arriba, trabajando en centavos para evitar errores de coma flotante. */
export function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Formato que exige la DIAN en XML y CUFE: punto decimal, 2 decimales, sin separador de miles. */
export function monto(valor: number): string {
  return redondear(valor).toFixed(2);
}

export const NOMBRE_TRIBUTO: Record<CodigoTributo, string> = {
  '01': 'IVA',
  '03': 'ICA',
  '04': 'INC',
};

export interface ImpuestoCalculado {
  codigo: CodigoTributo;
  porcentaje: number;
  base: number;
  valor: number;
}

export interface LineaCalculada {
  linea: Linea;
  bruto: number;
  descuento: number;
  /** LineExtensionAmount: cantidad x precio menos descuento. */
  neto: number;
  impuestos: ImpuestoCalculado[];
}

export interface Totales {
  lineas: LineaCalculada[];
  /** TaxTotal del documento: un grupo por tributo, con un subtotal por porcentaje. */
  impuestos: { codigo: CodigoTributo; valor: number; subtotales: ImpuestoCalculado[] }[];
  /** LineExtensionAmount: suma de netos de línea. */
  valorBruto: number;
  /** TaxExclusiveAmount: suma de bases gravables (una vez por línea). */
  baseGravable: number;
  /** TaxInclusiveAmount: valor bruto más impuestos. */
  valorConImpuestos: number;
  /** PayableAmount. */
  totalPagar: number;
  /** Valor de cada tributo que entra al CUFE (0 si no aplica). */
  porTributo: Record<CodigoTributo, number>;
}

export function calcularTotales(lineas: Linea[]): Totales {
  if (lineas.length === 0) throw new Error('El documento debe tener al menos una línea');

  const calculadas: LineaCalculada[] = lineas.map((linea) => {
    if (linea.cantidad <= 0) throw new Error(`Cantidad inválida en "${linea.descripcion}"`);
    const bruto = redondear(linea.cantidad * linea.precioUnitario);
    const descuento = redondear(linea.descuento ?? 0);
    const neto = redondear(bruto - descuento);
    const impuestos = linea.impuestos.map((imp) => ({
      codigo: imp.codigo,
      porcentaje: imp.porcentaje,
      base: neto,
      valor: redondear((neto * imp.porcentaje) / 100),
    }));
    return { linea, bruto, descuento, neto, impuestos };
  });

  const grupos = new Map<CodigoTributo, Map<number, ImpuestoCalculado>>();
  for (const l of calculadas) {
    for (const imp of l.impuestos) {
      const porTasa = grupos.get(imp.codigo) ?? new Map<number, ImpuestoCalculado>();
      const actual = porTasa.get(imp.porcentaje) ?? { ...imp, base: 0, valor: 0 };
      actual.base = redondear(actual.base + imp.base);
      actual.valor = redondear(actual.valor + imp.valor);
      porTasa.set(imp.porcentaje, actual);
      grupos.set(imp.codigo, porTasa);
    }
  }

  const impuestos = [...grupos.entries()].map(([codigo, porTasa]) => {
    const subtotales = [...porTasa.values()];
    return { codigo, valor: redondear(subtotales.reduce((s, x) => s + x.valor, 0)), subtotales };
  });

  const valorBruto = redondear(calculadas.reduce((s, l) => s + l.neto, 0));
  const baseGravable = redondear(
    calculadas.filter((l) => l.impuestos.length > 0).reduce((s, l) => s + l.neto, 0),
  );
  const totalImpuestos = redondear(impuestos.reduce((s, i) => s + i.valor, 0));
  const valorConImpuestos = redondear(valorBruto + totalImpuestos);

  const porTributo: Record<CodigoTributo, number> = { '01': 0, '03': 0, '04': 0 };
  for (const i of impuestos) porTributo[i.codigo] = i.valor;

  return {
    lineas: calculadas,
    impuestos,
    valorBruto,
    baseGravable,
    valorConImpuestos,
    totalPagar: valorConImpuestos,
    porTributo,
  };
}
