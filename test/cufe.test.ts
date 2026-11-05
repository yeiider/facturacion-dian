import { describe, expect, it } from 'vitest';
import { calcularCude, calcularCufe, codigoSeguridadSoftware, sha384 } from '../src/cufe.js';

describe('CUFE', () => {
  it('coincide con el ejemplo del anexo técnico de la DIAN', () => {
    const cufe = calcularCufe(
      {
        numero: '323200000129',
        fecha: '2019-01-16',
        hora: '10:53:10-05:00',
        valorBruto: 1500000,
        porTributo: { '01': 285000, '04': 0, '03': 0 },
        total: 1785000,
        nitEmisor: '700085371',
        documentoAdquiriente: '800199436',
        ambiente: 'produccion',
      },
      '693ff6f2a553c3646a063436fd4dd9ded0311471',
    );
    expect(cufe).toBe(
      '8bb918b19ba22a694f1da11c643b5e9de39adf60311cf179179e9b33381030bcd4c3c3f156c506ed5908f9276f5bd9b4',
    );
  });

  it('el CUDE usa el PIN del software en lugar de la clave técnica', () => {
    const datos = {
      numero: 'NC1',
      fecha: '2026-11-05',
      hora: '10:00:00-05:00',
      valorBruto: 100,
      porTributo: { '01': 19, '04': 0, '03': 0 },
      total: 119,
      nitEmisor: '900373115',
      documentoAdquiriente: '1020304050',
      ambiente: 'habilitacion' as const,
    };
    expect(calcularCude(datos, '12345')).toBe(
      sha384('NC12026-11-0510:00:00-05:00100.000119.00040.00030.00119.009003731151020304050123452'),
    );
  });

  it('código de seguridad del software', () => {
    expect(codigoSeguridadSoftware('abc', '12345', 'SETP990000001')).toBe(sha384('abc12345SETP990000001'));
  });
});
