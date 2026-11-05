import forge from 'node-forge';
import type { Configuracion, FacturaInput, Tercero } from '../src/types.js';

/** Genera un .p12 autofirmado solo para pruebas. */
export function p12DePrueba(clave = 'prueba'): Buffer {
  const llaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey;
  cert.serialNumber = '0a1b2c3d';
  cert.validity.notBefore = new Date('2026-01-01');
  cert.validity.notAfter = new Date('2028-01-01');
  const attrs = [
    { name: 'commonName', value: 'EMPRESA DE PRUEBA SAS' },
    { name: 'organizationName', value: 'Pruebas' },
    { name: 'countryName', value: 'CO' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(llaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(llaves.privateKey, [cert], clave, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

export const config: Configuracion = {
  ambiente: 'habilitacion',
  software: { id: '56f2ae4e-9812-4fad-9255-08fcfcd5ccb0', pin: '12345', nitProveedor: '900373115', dvProveedor: '1' },
};

export const emisor: Tercero = {
  tipoPersona: '1',
  tipoDocumento: '31',
  numeroDocumento: '900373115',
  dv: '1',
  razonSocial: 'EMPRESA DE PRUEBA SAS',
  responsabilidades: ['O-13'],
  tributo: { id: '01', nombre: 'IVA' },
  prefijoRegistro: 'SETP',
  correo: 'facturas@ejemplo.co',
  direccion: {
    codigoMunicipio: '11001',
    nombreMunicipio: 'Bogotá, D.C.',
    codigoDepartamento: '11',
    nombreDepartamento: 'Bogotá',
    direccion: 'Calle 1 # 2-3',
    codigoPostal: '110111',
  },
};

export const adquiriente: Tercero = {
  tipoPersona: '2',
  tipoDocumento: '13',
  numeroDocumento: '1020304050',
  razonSocial: 'Cliente & Hijos "Prueba"',
  responsabilidades: ['R-99-PN'],
  tributo: { id: 'ZZ', nombre: 'No aplica' },
  correo: 'cliente@ejemplo.co',
  direccion: {
    codigoMunicipio: '05001',
    nombreMunicipio: 'Medellín',
    codigoDepartamento: '05',
    nombreDepartamento: 'Antioquia',
    direccion: 'Carrera 10 # 20-30',
  },
};

export const factura: FacturaInput = {
  consecutivo: 990000001,
  fecha: '2026-11-05',
  hora: '10:20:30',
  emisor,
  adquiriente,
  pago: { forma: '1', medio: '10' },
  notas: ['Factura de prueba'],
  resolucion: {
    numero: '18760000001',
    fechaInicio: '2019-01-19',
    fechaFin: '2030-01-19',
    prefijo: 'SETP',
    desde: 990000000,
    hasta: 995000000,
    claveTecnica: 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c',
  },
  lineas: [
    { descripcion: 'Servicio de consultoría', codigo: 'SRV-1', cantidad: 2, precioUnitario: 150000, impuestos: [{ codigo: '01', porcentaje: 19 }] },
    { descripcion: 'Producto con descuento', cantidad: 3, precioUnitario: 33333.33, descuento: 9999.99, impuestos: [{ codigo: '01', porcentaje: 19 }] },
    { descripcion: 'Bien excluido', cantidad: 1, precioUnitario: 50000, impuestos: [] },
  ],
};
