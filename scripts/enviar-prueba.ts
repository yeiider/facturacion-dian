/**
 * Envía UNA factura de prueba al ambiente de habilitación de la DIAN, dentro de tu set de pruebas.
 *
 * Variables de entorno (ver .env.example):
 *   DIAN_P12, DIAN_P12_CLAVE, DIAN_SOFTWARE_ID, DIAN_SOFTWARE_PIN, DIAN_TEST_SET_ID,
 *   DIAN_NIT, DIAN_DV, DIAN_RAZON_SOCIAL, DIAN_CONSECUTIVO
 *
 * Uso: npx tsx scripts/enviar-prueba.ts
 */
import { readFileSync } from 'node:fs';
import { ClienteDian, cargarP12, prepararFactura, type Configuracion, type FacturaInput } from '../src/index.js';

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta la variable de entorno ${k}`);
  return v;
};

const nit = env('DIAN_NIT');
const dv = env('DIAN_DV');
const cert = cargarP12(readFileSync(env('DIAN_P12')), env('DIAN_P12_CLAVE'));
const config: Configuracion = {
  ambiente: 'habilitacion',
  software: { id: env('DIAN_SOFTWARE_ID'), pin: env('DIAN_SOFTWARE_PIN'), nitProveedor: nit, dvProveedor: dv },
};
const cliente = new ClienteDian(cert, 'habilitacion');

// En habilitación la DIAN asigna la resolución de pruebas 18760000001, prefijo SETP, rango 990000000-995000000.
// Su clave técnica se consulta con GetNumberingRange; si falla, se usa la publicada en el anexo para el set de pruebas.
const rangos = await cliente.rangosNumeracion(nit, nit, config.software.id).catch(() => []);
const rango = rangos.find((r) => r.prefijo === 'SETP');
const claveTecnica = rango?.claveTecnica ?? 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c';

const ahora = new Date(Date.now() - 5 * 3600_000).toISOString();
const consecutivo = Number(process.env.DIAN_CONSECUTIVO ?? 990000001);
const direccion = {
  codigoMunicipio: '11001',
  nombreMunicipio: 'Bogotá, D.C.',
  codigoDepartamento: '11',
  nombreDepartamento: 'Bogotá',
  direccion: 'Calle 1 # 2-3',
};
const factura: FacturaInput = {
  consecutivo,
  fecha: ahora.slice(0, 10),
  hora: ahora.slice(11, 19),
  resolucion: {
    numero: rango?.resolucion ?? '18760000001',
    fechaInicio: rango?.vigenteDesde ?? '2019-01-19',
    fechaFin: rango?.vigenteHasta ?? '2030-01-19',
    prefijo: 'SETP',
    desde: rango?.desde ?? 990000000,
    hasta: rango?.hasta ?? 995000000,
    claveTecnica,
  },
  emisor: {
    tipoPersona: env('DIAN_TIPO_PERSONA') === '2' ? '2' : '1',
    tipoDocumento: '31',
    numeroDocumento: nit,
    dv,
    razonSocial: env('DIAN_RAZON_SOCIAL'),
    responsabilidades: ['R-99-PN'],
    tributo: { id: 'ZZ', nombre: 'No aplica' },
    direccion,
  },
  adquiriente: {
    tipoPersona: '2',
    tipoDocumento: '13',
    numeroDocumento: '222222222222',
    razonSocial: 'Consumidor final',
    responsabilidades: ['R-99-PN'],
    tributo: { id: 'ZZ', nombre: 'No aplica' },
    direccion,
  },
  pago: { forma: '1', medio: '10' },
  lineas: [{ descripcion: 'Producto de prueba', cantidad: 1, precioUnitario: 100000, impuestos: [{ codigo: '01', porcentaje: 19 }] }],
};

const doc = await prepararFactura(factura, config, cert, consecutivo - 990000000);
console.log(`Factura ${doc.numero}  CUFE ${doc.cufe}`);
const { zipKey, errores } = await cliente.enviarSetPruebas(doc.nombreZip, doc.zipBase64, env('DIAN_TEST_SET_ID'));
console.log('ZipKey:', zipKey, errores.length ? errores : '');

for (let intento = 1; intento <= 6; intento++) {
  await new Promise((r) => setTimeout(r, 5000));
  const [estado] = await cliente.consultarZip(zipKey);
  if (estado && estado.codigo !== '') {
    console.log(JSON.stringify({ ...estado, applicationResponse: undefined }, null, 2));
    if (estado.codigo !== '98') break; // 98 = en proceso
  }
}
