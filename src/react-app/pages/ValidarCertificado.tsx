import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config/api';

interface CertificadoValidacao {
  valido: boolean;
  certificado?: {
    numero: string;
    funcionario_nome: string;
    funcionario_cpf: string;
    codigo_anac: string;
    qualificacao_tipo: string;
    qualificacao_nome: string;
    data_emissao: string;
    data_conclusao?: string | null;
    data_validade: string | null;
    tipo_treinamento?: string | null;
    instrutor_nome: string;
    instrutor_codigo_anac: string;
  };
  mensagem?: string;
}

function formatarDataBrasil(value: string | null | undefined): string {
  if (!value) return 'Nao informada';

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [ano, mes, dia] = value.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Nao informada';
  return parsed.toLocaleDateString('pt-BR');
}

export default function ValidarCertificado() {
  const { hash } = useParams<{ hash: string }>();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [resultado, setResultado] = useState<CertificadoValidacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function validar() {
      if (!hash) {
        setErro('Hash de validação não fornecido');
        setLoading(false);
        return;
      }

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`${API_BASE_URL}/certificados/validar/${hash}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setResultado(data);
        } else {
          setErro('Erro ao validar certificado');
        }
      } catch {
        setErro('Erro ao conectar com o servidor');
      } finally {
        setLoading(false);
      }
    }

    validar();
  }, [hash, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-2xl w-full text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-6"></div>
          <p className="text-slate-600 text-lg">Validando certificado...</p>
        </div>
      </div>
    );
  }

  if (erro || !resultado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-2xl w-full">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mx-auto mb-6">
            <svg
              className="w-10 h-10 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 text-center mb-4">Erro na Validação</h1>
          <p className="text-slate-600 text-center text-lg">
            {erro || 'Não foi possível validar o certificado'}
          </p>
        </div>
      </div>
    );
  }

  if (!resultado.valido) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-2xl w-full">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-yellow-100 mx-auto mb-6">
            <svg
              className="w-10 h-10 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 text-center mb-4">
            Certificado Inválido
          </h1>
          <p className="text-slate-600 text-center text-lg">
            {resultado.mensagem || 'Este certificado não foi encontrado ou foi revogado'}
          </p>
        </div>
      </div>
    );
  }

  const cert = resultado.certificado!;
  const dataConclusao = formatarDataBrasil(cert.data_conclusao || cert.data_emissao);
  const dataValidade = formatarDataBrasil(cert.data_validade);
  const tipoTreinamento =
    cert.tipo_treinamento === 'INICIAL'
      ? 'Inicial'
      : cert.tipo_treinamento === 'SEMESTRAL'
        ? 'Semestral'
        : cert.tipo_treinamento === 'RECORRENTE'
          ? 'Periódico'
          : 'Periódico';

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-3xl w-full">
        {/* Header de Sucesso */}
        <div className="flex items-center justify-center w-24 h-24 rounded-full bg-emerald-100 mx-auto mb-8">
          <svg
            className="w-12 h-12 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 text-center mb-3">Certificado Válido</h1>
        <p className="text-emerald-600 text-center text-lg font-medium mb-10">
          Este certificado é autêntico e foi emitido pela AirTrust
        </p>

        {/* Dados do Certificado */}
        <div className="space-y-4">
          {/* Número do Certificado */}
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
            <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
              Número do Certificado
            </label>
            <p className="text-lg font-mono text-slate-900 break-all">{cert.numero}</p>
          </div>

          {/* Funcionário */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                Funcionário
              </label>
              <p className="text-lg font-semibold text-slate-900">{cert.funcionario_nome}</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                CPF
              </label>
              <p className="text-lg font-mono text-slate-900">{cert.funcionario_cpf}</p>
            </div>
          </div>

          {/* Código ANAC */}
          <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200">
            <label className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-2 block">
              Código ANAC
            </label>
            <p className="text-2xl font-bold text-blue-900">{cert.codigo_anac}</p>
          </div>

          {/* Qualificação */}
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
            <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
              Qualificação
            </label>
            <p className="text-lg font-semibold text-slate-900 mb-1">{cert.qualificacao_nome}</p>
            <p className="text-sm text-slate-600">
              Categoria: {cert.qualificacao_tipo} | Modalidade: {tipoTreinamento}
            </p>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                Data de Realização
              </label>
              <p className="text-lg font-semibold text-slate-900">{dataConclusao}</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                Validade
              </label>
              <p className="text-lg font-semibold text-slate-900">{dataValidade}</p>
            </div>
          </div>

          {/* Instrutor */}
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
            <label className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
              Instrutor Responsável
            </label>
            <p className="text-lg font-semibold text-slate-900 mb-1">{cert.instrutor_nome}</p>
            <p className="text-sm text-slate-600">Código ANAC: {cert.instrutor_codigo_anac}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-8 border-t border-slate-200 text-center">
          <p className="text-sm text-slate-500">
            Documento verificado em {new Date().toLocaleDateString('pt-BR')} às{' '}
            {new Date().toLocaleTimeString('pt-BR')}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Este é um documento digital válido e autenticado pela AirTrust
          </p>
        </div>
      </div>
    </div>
  );
}
