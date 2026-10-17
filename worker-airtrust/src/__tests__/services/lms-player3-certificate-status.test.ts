import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Env} from '../../types';
import {
  readPlayer3CertificateStatus,Player3CertificateReadError,
} from '../../services/lms-player3-certificate-status';

const r2key='certificados/empresa-6/funcionario-51/historico-333/doc.pdf';
const row={
  matricula_status:'CONCLUIDO',ciclo_id:1001,ciclo_status:'CONCLUIDO',
  ciclo_historico_id:333,curso_gera_qualificacao:1,historico_id:333,
  historico_validado_id:333,historico_status:'CONCLUIDA',
  historico_data_conclusao:'2026-10-14',
  documento_id:44,documento_r2_key:r2key,
};
const mocks=vi.hoisted(()=>({first:vi.fn(),get:vi.fn(),bind:vi.fn(),prepare:vi.fn()}));
function env():Env{
  mocks.bind.mockImplementation(()=>({first:mocks.first}));
  mocks.prepare.mockImplementation(()=>({bind:mocks.bind}));
  return {
    DB:{prepare:mocks.prepare,batch:vi.fn()} as unknown as D1Database,
    BUCKET:{get:mocks.get,put:vi.fn(),delete:vi.fn()} as unknown as R2Bucket,
  } as Env;
}
const read=(environment:Env,employee=51)=>
  readPlayer3CertificateStatus({
    env:environment,empresaId:6,matriculaId:101,funcionarioId:employee,
  });
describe('Player3 readonly certificate archive verification',()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    mocks.first.mockResolvedValue({...row});
    mocks.get.mockResolvedValue({
      size:123, arrayBuffer:async()=>
        new TextEncoder().encode('%PDF-').buffer,
    });
  });
  it('verifies only the linked tenant-scoped PDF header and exposes authenticated stream path',async()=>{
    const e=env(),result=await read(e);
    expect(result).toMatchObject({
      matricula_id:101,ciclo_id:1001,matricula_status:'CONCLUIDO',
      historico_id:333,certificate_state:'PDF_HEADER_VERIFIED',
      documento_id:44,stream_path:'/api/pasta-virtual/stream/44',
      stream_verified:false,
    });
    expect(mocks.bind).toHaveBeenCalledWith(101,6,51);
    expect(mocks.prepare.mock.calls[0][0]).toContain('m.funcionario_id=?');
    expect(mocks.get).toHaveBeenCalledWith(r2key,{
      range:{offset:0,length:5},
    });
    expect((e.DB.batch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((e.BUCKET.put as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
  it('never returns a certificate for incomplete enrollment or missing qualification',async()=>{
    const e=env();
    for(const change of [
      {matricula_status:'EM_ANDAMENTO'},
      {ciclo_status:'EM_ANDAMENTO'},
      {ciclo_id:null},
    ]){
      mocks.first.mockResolvedValueOnce({...row,...change});
      expect((await read(e)).certificate_state).toBe('ENROLLMENT_NOT_COMPLETED');
    }
    mocks.first.mockResolvedValueOnce({...row,curso_gera_qualificacao:0});
    expect((await read(e)).certificate_state).toBe('NOT_APPLICABLE');
    for(const change of [
      {historico_id:null},
      {ciclo_historico_id:332},
      {curso_gera_qualificacao:2},
    ]){
      mocks.first.mockResolvedValueOnce({...row,...change});
      expect((await read(e)).certificate_state).toBe('HISTORY_NOT_LINKED');
    }
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('does not accept invalid history or a record without an archived document',async()=>{
    const e=env();
    for(const change of [
      {historico_validado_id:null},
      {historico_status:'PLANEJADA'},
      {historico_data_conclusao:null},
    ]){
      mocks.first.mockResolvedValueOnce({...row,...change});
      expect((await read(e)).certificate_state).toBe('HISTORY_INVALID');
    }
    mocks.first.mockResolvedValueOnce({...row,documento_id:null});
    expect((await read(e)).certificate_state).toBe('CERTIFICATE_NOT_ARCHIVED');
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('denies foreign/unscoped R2 keys, corrupt objects and missing bytes',async()=>{
    const e=env();
    for(const key of [
      'certificados/empresa-7/funcionario-51/historico-333/doc.pdf',
      'certificados/empresa-6/funcionario-52/historico-333/doc.pdf',
      'certificados/empresa-6/funcionario-51/historico-334/doc.pdf',
      'https://evil.invalid/file.pdf',
    ]){
      mocks.first.mockResolvedValueOnce({...row,documento_r2_key:key});
      expect((await read(e)).certificate_state).toBe('CERTIFICATE_PDF_INVALID');
    }
    mocks.get.mockResolvedValueOnce(null);
    expect((await read(e)).certificate_state).toBe('CERTIFICATE_OBJECT_MISSING');
    mocks.get.mockResolvedValueOnce({
      size:2,arrayBuffer:async()=>new TextEncoder().encode('%PDF-').buffer,
    });
    expect((await read(e)).certificate_state).toBe('CERTIFICATE_PDF_INVALID');
    mocks.get.mockResolvedValueOnce({
      size:123,arrayBuffer:async()=>new TextEncoder().encode('EMPTY').buffer,
    });
    expect((await read(e)).certificate_state).toBe('CERTIFICATE_PDF_INVALID');
  });
  it('rejects missing scope without storage calls and fails closed for R2 exceptions',async()=>{
    const e=env();
    await expect(readPlayer3CertificateStatus({
      env:e,empresaId:7,matriculaId:0,funcionarioId:51,
    })).rejects.toThrow(Player3CertificateReadError);
    expect(mocks.prepare).not.toHaveBeenCalled();
    mocks.first.mockResolvedValueOnce(null);
    await expect(read(e)).rejects.toThrow('PLAYER3_CERTIFICATE_ENROLLMENT_NOT_FOUND');
    mocks.get.mockRejectedValueOnce(new Error('private'));
    await expect(read(e)).rejects.toThrow('PLAYER3_CERTIFICATE_STORAGE_UNAVAILABLE');
  });
});
