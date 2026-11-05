/**
 * Modelo de entrada de la plataforma. Es JSON simple: el núcleo se encarga de
 * convertirlo a UBL 2.1 con las extensiones de la DIAN.
 */

/** Ambiente DIAN. `ProfileExecutionID` y `TipoAmbiente` del CUFE: 1 producción, 2 pruebas. */
export type Ambiente = 'produccion' | 'habilitacion';

/** Códigos de tributo que entran al CUFE: 01 IVA, 04 INC, 03 ICA. */
export type CodigoTributo = '01' | '03' | '04';

export interface Direccion {
  /** Código DANE del municipio, 5 dígitos. Ej: 11001 (Bogotá). */
  codigoMunicipio: string;
  nombreMunicipio: string;
  /** Código DANE del departamento, 2 dígitos. Ej: 11. */
  codigoDepartamento: string;
  nombreDepartamento: string;
  direccion: string;
  codigoPostal?: string;
  /** ISO 3166-1 alfa-2. Por defecto CO. */
  codigoPais?: string;
  nombrePais?: string;
}

export interface Tercero {
  /** 1 persona jurídica, 2 persona natural (AdditionalAccountID). */
  tipoPersona: '1' | '2';
  /** Tipo de documento (tabla 13.2.1 del anexo): 31 NIT, 13 cédula, 22 cédula de extranjería, 41 pasaporte... */
  tipoDocumento: string;
  numeroDocumento: string;
  /** Dígito de verificación, obligatorio cuando tipoDocumento es 31. */
  dv?: string;
  razonSocial: string;
  nombreComercial?: string;
  /** Responsabilidades fiscales (tabla 13.2.6.1). Ej: ['R-99-PN'] o ['O-13', 'O-15']. */
  responsabilidades: string[];
  /** Tributo del responsable: { id: '01', nombre: 'IVA' } o { id: 'ZZ', nombre: 'No aplica' }. */
  tributo: { id: string; nombre: string };
  direccion: Direccion;
  correo?: string;
  telefono?: string;
  /** Prefijo de la matrícula mercantil (CorporateRegistrationScheme). Solo emisor. */
  prefijoRegistro?: string;
}

export interface ImpuestoLinea {
  codigo: CodigoTributo;
  /** Porcentaje, ej. 19, 5, 0. */
  porcentaje: number;
}

export interface Linea {
  descripcion: string;
  codigo?: string;
  cantidad: number;
  /** Código de unidad UN/ECE rec 20. 94 = unidad. */
  unidad?: string;
  precioUnitario: number;
  /** Descuento en pesos aplicado a la línea. */
  descuento?: number;
  impuestos: ImpuestoLinea[];
}

export interface Resolucion {
  numero: string;
  fechaInicio: string;
  fechaFin: string;
  prefijo: string;
  desde: number;
  hasta: number;
  /** Clave técnica de la numeración, la entrega la DIAN (GetNumberingRange). */
  claveTecnica: string;
}

export interface Software {
  /** Identificador del software asignado por la DIAN. */
  id: string;
  /** PIN definido al registrar el software. */
  pin: string;
  /** NIT de quien provee el software. En software propio es el mismo emisor. */
  nitProveedor: string;
  dvProveedor: string;
}

export interface MedioPago {
  /** 1 contado, 2 crédito. */
  forma: '1' | '2';
  /** Código del medio (tabla 13.3.4.2): 10 efectivo, 42 consignación, 47 transferencia, 48 tarjeta crédito, 49 tarjeta débito, ZZZ otro. */
  medio: string;
  fechaVencimiento?: string;
}

interface DocumentoBase {
  /** Fecha AAAA-MM-DD en hora de Colombia. */
  fecha: string;
  /** Hora HH:MM:SS en hora de Colombia (se agrega -05:00). */
  hora: string;
  emisor: Tercero;
  adquiriente: Tercero;
  lineas: Linea[];
  pago: MedioPago;
  notas?: string[];
  moneda?: string;
}

export interface FacturaInput extends DocumentoBase {
  /** Consecutivo numérico dentro del rango de la resolución. */
  consecutivo: number;
  resolucion: Resolucion;
  /** 01 venta nacional, 02 exportación, 03 contingencia facturador, 04 contingencia DIAN. */
  tipoFactura?: '01' | '02' | '03' | '04';
  /** Tipo de operación (CustomizationID). 10 estándar. */
  tipoOperacion?: string;
}

export interface ReferenciaFactura {
  numero: string;
  cufe: string;
  fecha: string;
}

export interface NotaInput extends DocumentoBase {
  /** Número completo de la nota, con prefijo si lo tiene. */
  numero: string;
  facturaReferencia: ReferenciaFactura;
  /**
   * Concepto de corrección.
   * Nota crédito: 1 devolución parcial, 2 anulación, 3 rebaja o descuento, 4 ajuste de precio, 5 descuento pronto pago, 6 descuento por volumen.
   * Nota débito: 1 intereses, 2 gastos por cobrar, 3 cambio del valor, 4 otros.
   */
  concepto: string;
  descripcionConcepto: string;
}

export interface Configuracion {
  ambiente: Ambiente;
  software: Software;
}
