import { describe, expect, it } from 'vitest';
import { calcularTotales, monto } from '../src/totales.js';
import { factura } from './fixtures.js';

describe('totales', () => {
  it('calcula bases, impuestos y total', () => {
    const t = calcularTotales(factura.lineas);
    expect(t.valorBruto).toBe(440000);
    expect(t.baseGravable).toBe(390000);
    expect(t.porTributo['01']).toBe(74100);
    expect(t.totalPagar).toBe(514100);
    expect(t.impuestos).toHaveLength(1);
  });

  it('agrupa por tributo y porcentaje', () => {
    const t = calcularTotales([
      { descripcion: 'a', cantidad: 1, precioUnitario: 100, impuestos: [{ codigo: '01', porcentaje: 19 }] },
      { descripcion: 'b', cantidad: 1, precioUnitario: 100, impuestos: [{ codigo: '01', porcentaje: 5 }] },
      { descripcion: 'c', cantidad: 1, precioUnitario: 100, impuestos: [{ codigo: '04', porcentaje: 8 }] },
    ]);
    expect(t.impuestos.map((i) => [i.codigo, i.valor, i.subtotales.length])).toEqual([
      ['01', 24, 2],
      ['04', 8, 1],
    ]);
  });

  it('formatea montos con dos decimales y punto', () => {
    expect(monto(1234.5)).toBe('1234.50');
    expect(monto(0.005)).toBe('0.01');
  });

  it('rechaza documentos vacíos', () => {
    expect(() => calcularTotales([])).toThrow();
  });
});
