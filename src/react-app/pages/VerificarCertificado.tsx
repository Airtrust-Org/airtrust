import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, CheckCircle, XCircle, Search, ArrowLeft } from 'lucide-react';
import { showAlertDialog } from '@/react-app/utils/confirmDialog';

export default function VerificarCertificado() {
  const { hash: hashParam } = useParams<{ hash?: string }>();
  const navigate = useNavigate();
  const [hash, setHash] = useState(hashParam || '');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  // Auto-verificar se hash vem da URL
  useEffect(() => {
    if (hashParam && hashParam.length === 16) {
      verificar(hashParam);
    }
  }, [hashParam]);

  const verificar = async (hashToVerify?: string) => {
    const hashFinal = hashToVerify || hash;

    if (!hashFinal || hashFinal.length !== 16) {
      showAlertDialog('Por favor, digite um código de 16 caracteres');
      return;
    }

    setLoading(true);
    setResultado(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/certificados/validar/${hashFinal}`,
      );
      const data = await response.json();
      setResultado(data);
    } catch (error) {
      setResultado({
        success: false,
        valido: false,
        mensagem: 'Erro ao conectar ao servidor',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      verificar();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Botão Voltar */}
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-blue-600 hover:text-blue-800 transition"
        >
          <ArrowLeft className="w-5 h-5" />
          Voltar
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Shield className="w-20 h-20 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Verificação de Certificado</h1>
          <p className="text-lg text-gray-600">
            Digite o código de verificação para validar a autenticidade
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-white rounded-xl shadow-xl p-5 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Código de Verificação (16 caracteres)
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={hash}
              onChange={(e) => setHash(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              maxLength={16}
              placeholder="Ex: A7F3E9D2C1B8F4A6"
              className="flex-1 px-5 py-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-blue-500 font-mono text-lg uppercase transition"
              disabled={loading}
            />
            <button
              onClick={() => verificar()}
              disabled={loading || hash.length !== 16}
              className="px-8 py-4 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 font-semibold transition transform hover:scale-105 active:scale-95"
            >
              <Search className="w-5 h-5" />
              Verificar
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-3">
            💡 O código está impresso no certificado no campo "VERIFICAÇÃO → HASH"
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl shadow-xl p-12 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-lg text-gray-600 font-medium">Verificando autenticidade...</p>
          </div>
        )}

        {/* Resultado */}
        {!loading && resultado && (
          <div
            className={`bg-white rounded-xl shadow-xl p-5 border-l-8 transition-all ${
              resultado.valido ? 'border-green-500 animate-fade-in' : 'border-red-500 animate-shake'
            }`}
          >
            {resultado.valido ? (
              <>
                {/* Certificado Válido */}
                <div className="flex items-center gap-4 mb-8 pb-6 border-b-2 border-green-100">
                  <CheckCircle className="w-12 h-12 text-green-600 flex-shrink-0" />
                  <div>
                    <h2 className="text-2xl font-bold text-green-700">Certificado Autêntico</h2>
                    <p className="text-green-600 mt-1">
                      Este certificado é válido e foi emitido oficialmente
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Coluna 1: Funcionário */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      FUNCIONÁRIO
                    </h3>
                    <InfoRow label="Nome" value={resultado.certificado.funcionario_nome} />
                    <InfoRow label="CPF" value={resultado.certificado.funcionario_cpf} />
                    <InfoRow label="Código ANAC" value={resultado.certificado.codigo_anac} />
                  </div>

                  {/* Coluna 2: Qualificação */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      QUALIFICAÇÃO
                    </h3>
                    <InfoRow label="Nome" value={resultado.certificado.qualificacao_nome} />
                    <InfoRow label="Código" value={resultado.certificado.qualificacao_codigo} />
                    <InfoRow label="Categoria" value={resultado.certificado.categoria} />
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t-2 border-gray-100 grid md:grid-cols-3 gap-4">
                  <InfoRow label="Carga Horária" value={resultado.certificado.carga_horaria} />
                  <InfoRow label="Validade" value={resultado.certificado.validade} highlight />
                  <InfoRow label="Realização" value={resultado.certificado.data_conclusao} />
                  <InfoRow label="Vencimento" value={resultado.certificado.data_vencimento} />
                  <InfoRow label="Empresa" value={resultado.certificado.empresa_nome} />
                </div>

                <div className="mt-6 pt-6 border-t-2 border-gray-100">
                  <InfoRow label="Hash de Verificação" value={resultado.certificado.hash} mono />
                </div>
              </>
            ) : (
              <>
                {/* Certificado Inválido */}
                <div className="flex items-center gap-4 mb-6">
                  <XCircle className="w-12 h-12 text-red-600 flex-shrink-0" />
                  <div>
                    <h2 className="text-2xl font-bold text-red-700">Certificado Não Encontrado</h2>
                    <p className="text-red-600 mt-1">
                      Este código não corresponde a nenhum certificado válido
                    </p>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <p className="text-gray-800 mb-4">{resultado.mensagem}</p>
                  <div className="text-sm text-gray-600">
                    <p className="font-semibold mb-2">Possíveis causas:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Código digitado incorretamente</li>
                      <li>Certificado falsificado ou adulterado</li>
                      <li>Certificado cancelado ou revogado</li>
                      <li>QR Code danificado ou ilegível</li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
        .animate-shake {
          animation: shake 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`py-3 ${highlight ? 'bg-yellow-50 -mx-2 px-2 rounded' : ''}`}>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div
        className={`text-base font-medium text-gray-900 ${mono ? 'font-mono text-sm' : ''} ${
          highlight ? 'text-yellow-800 font-bold' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}
