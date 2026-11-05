import { describe, expect, it } from 'vitest';
import { ClienteDian, ErrorDian } from '../src/dian/cliente.js';
import { comprimir, descomprimir, nombreArchivo } from '../src/dian/archivos.js';
import { cargarP12 } from '../src/firma/certificado.js';
import { p12DePrueba } from './fixtures.js';

const cert = cargarP12(p12DePrueba(), 'prueba');

const respuesta = (cuerpo: string) =>
  `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>${cuerpo}</s:Body></s:Envelope>`;

function falsoFetch(xml: string, capturar?: (init: RequestInit) => void): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    capturar?.(init!);
    return new Response(xml, { status: 200 });
  }) as typeof fetch;
}

describe('cliente DIAN', () => {
  it('interpreta la respuesta de SendBillSync', async () => {
    let enviado: RequestInit | undefined;
    const cliente = new ClienteDian(cert, 'habilitacion', {
      fetch: falsoFetch(
        respuesta(`<SendBillSyncResponse xmlns="http://wcf.dian.colombia"><SendBillSyncResult xmlns:b="http://schemas.datacontract.org/2004/07/DianResponse" xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
          <b:ErrorMessage><c:string>Regla: FAJ44b, Notificación: aviso</c:string></b:ErrorMessage>
          <b:IsValid>true</b:IsValid><b:StatusCode>00</b:StatusCode><b:StatusDescription>Procesado Correctamente.</b:StatusDescription>
          <b:StatusMessage>La Factura electrónica SETP990000001, ha sido autorizada.</b:StatusMessage>
          <b:XmlBase64Bytes>PD94bWw=</b:XmlBase64Bytes><b:XmlDocumentKey>abc123</b:XmlDocumentKey><b:XmlFileName>fv1</b:XmlFileName>
        </SendBillSyncResult></SendBillSyncResponse>`),
        (i) => (enviado = i),
      ),
    });
    const r = await cliente.enviarDocumento('z.zip', 'UEsDBA==');
    expect(r).toMatchObject({ valido: true, codigo: '00', cufe: 'abc123', applicationResponse: 'PD94bWw=' });
    expect(r.errores).toEqual(['Regla: FAJ44b, Notificación: aviso']);
    expect(String((enviado!.headers as Record<string, string>)['Content-Type'])).toContain('SendBillSync');
    expect(String(enviado!.body)).toContain('<wcf:fileName>z.zip</wcf:fileName>');
  });

  it('lanza ErrorDian ante un SOAP Fault', async () => {
    const cliente = new ClienteDian(cert, 'habilitacion', {
      fetch: falsoFetch(respuesta('<s:Fault><s:Reason><s:Text xml:lang="es">Firma inválida</s:Text></s:Reason></s:Fault>')),
    });
    await expect(cliente.consultarDocumento('x')).rejects.toThrow(ErrorDian);
  });

  it('lee los rangos de numeración', async () => {
    const cliente = new ClienteDian(cert, 'produccion', {
      fetch: falsoFetch(
        respuesta(`<GetNumberingRangeResponse xmlns="http://wcf.dian.colombia"><GetNumberingRangeResult xmlns:b="http://schemas.datacontract.org/2004/07/NumberRangeResponseList" xmlns:c="http://schemas.datacontract.org/2004/07/NumberRangeResponse">
          <b:OperationCode>100</b:OperationCode><b:OperationDescription>Acción completada OK.</b:OperationDescription>
          <b:ResponseList><c:NumberRangeResponse><c:ResolutionNumber>18760000001</c:ResolutionNumber><c:ResolutionDate>2019-01-19</c:ResolutionDate>
          <c:Prefix>SETP</c:Prefix><c:FromNumber>990000000</c:FromNumber><c:ToNumber>995000000</c:ToNumber>
          <c:ValidDateFrom>2019-01-19</c:ValidDateFrom><c:ValidDateTo>2030-01-19</c:ValidDateTo><c:TechnicalKey>fc8eac</c:TechnicalKey></c:NumberRangeResponse></b:ResponseList>
        </GetNumberingRangeResult></GetNumberingRangeResponse>`),
      ),
    });
    expect(cliente.url).toBe('https://vpfe.dian.gov.co/WcfDianCustomerServices.svc');
    const [r] = await cliente.rangosNumeracion('900373115', '900373115', 'sw');
    expect(r).toMatchObject({ prefijo: 'SETP', desde: 990000000, hasta: 995000000, claveTecnica: 'fc8eac' });
  });
});

describe('archivos', () => {
  it('nombra archivos según el anexo', () => {
    expect(nombreArchivo('fv', '900373115', 1, 2026)).toBe('fv09003731150002600000001');
    expect(nombreArchivo('z', '900373115', 255, 2026)).toBe('z090037311500026000000ff');
  });

  it('comprime y descomprime', async () => {
    const zip = await comprimir('a.xml', '<a>ñ</a>');
    expect(await descomprimir(zip)).toEqual({ 'a.xml': '<a>ñ</a>' });
  });
});
