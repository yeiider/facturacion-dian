# facturacion-dian

Plataforma propia de facturación electrónica ante la DIAN (Colombia), con API para terceros.

Este repositorio contiene, por ahora, el **núcleo de facturación** en Node.js y TypeScript: genera el XML UBL 2.1, calcula el CUFE/CUDE, firma con XAdES-EPES y habla con los web services SOAP de la DIAN. La API REST y el panel web se construyen encima de este núcleo.

## Qué hace

| Módulo | Archivo | Qué resuelve |
| --- | --- | --- |
| Totales | `src/totales.ts` | Neto por línea, descuentos, IVA/INC/ICA agrupados por tarifa, totales del documento |
| CUFE / CUDE | `src/cufe.ts` | SHA-384 según el anexo técnico, código de seguridad del software, URL del QR |
| UBL 2.1 | `src/ubl/` | Factura de venta (Invoice), nota crédito (CreditNote) y nota débito (DebitNote) con `sts:DianExtensions` |
| Firma | `src/firma/` | Carga del certificado `.p12`, firma XAdES-EPES con la política v2 de la DIAN |
| DIAN | `src/dian/` | ZIP + base64, nombres de archivo, sobre SOAP 1.2 con WS-Security, cliente de `WcfDianCustomerServices` |
| Emisión | `src/emision.ts` | Genera, firma y comprime en un solo paso |

Operaciones del cliente DIAN: `enviarDocumento` (SendBillSync), `enviarSetPruebas` (SendTestSetAsync), `consultarZip` (GetStatusZip), `consultarDocumento` (GetStatus) y `rangosNumeracion` (GetNumberingRange).

## Uso

```ts
import { readFileSync } from 'node:fs';
import { cargarP12, prepararFactura, ClienteDian } from 'facturacion-dian';

const cert = cargarP12(readFileSync('certificado.p12'), process.env.CLAVE_P12!);
const config = { ambiente: 'habilitacion', software: { id, pin, nitProveedor, dvProveedor } } as const;

const doc = await prepararFactura(factura, config, cert, 1);
const dian = new ClienteDian(cert, config.ambiente);
const respuesta = await dian.enviarDocumento(doc.nombreZip, doc.zipBase64);
// respuesta.valido, respuesta.codigo, respuesta.errores, respuesta.applicationResponse
```

El formato de `factura` está en `src/types.ts` y hay un ejemplo completo en `test/fixtures.ts`.

## Probar contra la DIAN (habilitación)

1. Copia `.env.example` a `.env` y llena tu certificado, SoftwareID, PIN, TestSetId y NIT. Esos datos salen del portal de habilitación de la DIAN.
2. Ejecuta `set -a; . ./.env; set +a; npx tsx scripts/enviar-prueba.ts`.
3. El script envía una factura del set de pruebas e imprime la respuesta de la DIAN.

Nunca subas el `.p12` ni el `.env`: ya están en `.gitignore`.

## Desarrollo

```bash
npm install
npm test          # pruebas (vitest)
npm run typecheck
npm run build
```

La prueba de firma se verifica con dos implementaciones distintas: `xml-crypto` y, si tienes Python con `lxml`, también libxml2 + openssl (`scripts/verificar_firma.py`). Las dos validan los tres digests y la firma RSA.

## Pendiente

- Validar contra la DIAN con el certificado y el set de pruebas reales.
- Retenciones (`WithholdingTaxTotal`), cargos y descuentos a nivel de documento, anticipos.
- AttachedDocument y representación gráfica (PDF con QR).
- API REST multi-tenant, panel web, eventos RADIAN.

Referencia normativa: Resolución DIAN 000042 de 2020 y su Anexo Técnico de Factura Electrónica de Venta (versión 1.9).
