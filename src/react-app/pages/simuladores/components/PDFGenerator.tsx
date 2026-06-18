import { useState } from 'react';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';

import { Eye, Download } from 'lucide-react';
import { apiFetch } from '@/react-app/lib/apiFetch';
import {
  buildFichaAvaliacaoScaleHtml,
  getFichaAvaliacaoScaleCss,
} from '@/react-app/pages/simuladores/fichas/avaliacaoScale';

interface PDFData {
  ficha: any;
  cabecalho: any;
  sessao: any;
  tripulante: any;
  manobras: any[];
  avaliacao: any;
  assinaturas: any;
  validacao: any;
}

interface PDFGeneratorProps {
  fichaUuid: string;
  onPDFGenerated?: (hash: string) => void;
}

export const PDFGeneratorNativo: React.FC<PDFGeneratorProps> = ({ fichaUuid, onPDFGenerated }) => {
  const [loading, setLoading] = useState(false);
  const [pdfData, setPdfData] = useState<PDFData | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const buscarDadosPDF = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/simulador-pdf-nativo/ficha/${fichaUuid}/dados-pdf`);
      const result = await response.json();
      
      if (result.success) {
        setPdfData(result.dados);
        return result.dados;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Erro ao buscar dados PDF:', error);
      toast.warning('Erro ao carregar dados da ficha');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const gerarHTMLProfissional = (dados: PDFData, logoBase64?: string | null): string => {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ficha de Treinamento - ${dados.tripulante.nome}</title>
    <style>
        @page { 
            size: A4; 
            margin: 20mm 15mm; 
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            font-size: 10px;
            line-height: 1.2;
            color: #000;
            background: white;
        }
        
        /* CABEÇALHO PROFISSIONAL */
        .header {
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 3px solid #000;
            padding-bottom: 10px;
        }
        
        .header h1 {
            font-size: 18px;
            font-weight: bold;
            margin: 5px 0;
            text-transform: uppercase;
        }
        
        .header h2 {
            font-size: 14px;
            margin: 3px 0;
            color: #333;
            white-space: normal;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        
        .header .codigo {
            font-size: 12px;
            font-weight: bold;
            background: #f0f0f0;
            padding: 3px 8px;
            border: 1px solid #ccc;
            display: inline-block;
            margin-top: 5px;
        }
        
        /* SEÇÃO DE INFORMAÇÕES */
        .info-section {
            margin: 10px 0;
            border: 1px solid #000;
        }
        
        .info-header {
            background: #000;
            color: white;
            padding: 4px 8px;
            font-weight: bold;
            font-size: 11px;
            text-transform: uppercase;
        }
        
        .info-content {
            padding: 8px;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        
        .info-item {
            display: flex;
            margin-bottom: 4px;
        }
        
        .info-label {
            font-weight: bold;
            min-width: 80px;
            margin-right: 8px;
        }
        
        .info-value {
            flex: 1;
            border-bottom: 1px dotted #ccc;
            padding-bottom: 1px;
        }
        
        /* TABELA DE MANOBRAS PROFISSIONAL */
        .manobras-section {
            margin: 15px 0;
        }
        
        .manobras-table {
            width: 100%;
            border-collapse: collapse;
            border: 2px solid #000;
            font-size: 9px;
        }
        
        .manobras-table th {
            background: #000;
            color: white;
            padding: 6px 4px;
            text-align: center;
            font-weight: bold;
            border: 1px solid #000;
        }
        
        .manobras-table td {
            padding: 4px;
            border: 1px solid #000;
            text-align: center;
        }
        
        .manobras-table td:first-child {
            text-align: left;
            font-size: 8px;
        }
        
        .nota-aprovado {
            background: #d4f8d4 !important;
            font-weight: bold;
        }
        
        .nota-reprovado {
            background: #fdd !important;
            font-weight: bold;
        }
        
        /* RESULTADO FINAL */
        .resultado-final {
            margin: 15px 0;
            border: 2px solid #000;
            text-align: center;
            padding: 10px;
            background: #f9f9f9;
        }
        
        .resultado-final h3 {
            font-size: 14px;
            margin-bottom: 5px;
        }
        
        .resultado-nota {
            font-size: 20px;
            font-weight: bold;
            margin: 5px 0;
        }
        
        .aprovado { color: #008000; }
        .reprovado { color: #ff0000; }

        ${getFichaAvaliacaoScaleCss()}
        
        /* ASSINATURAS */
        .assinaturas {
            margin-top: 20px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        
        .assinatura-box {
            border: 1px solid #000;
            padding: 15px;
            text-align: center;
            min-height: 100px;
        }
        
        .assinatura-titulo {
            font-weight: bold;
            margin-bottom: 10px;
            font-size: 11px;
            text-transform: uppercase;
        }
        
        .assinatura-linha {
            border-top: 1px solid #000;
            margin-top: 50px;
            padding-top: 5px;
            font-size: 9px;
        }
        
        .assinatura-info {
            font-size: 8px;
            color: #666;
            margin: 5px 0;
        }
        
        /* RODAPÉ */
        .rodape {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #000;
            font-size: 8px;
            text-align: center;
            color: #666;
        }
        
        @media print {
            body { 
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <!-- CABEÇALHO PROFISSIONAL -->
    <div class="header">
        <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:8px;">
            ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-height:52px;max-width:140px;object-fit:contain;">` : ''}
            <div>
                <h1>Ficha de Avaliação de Treinamento em Simulador</h1>
                <h2>${dados.sessao?.treinamento || 'Sessão de Treinamento'}</h2>
            </div>
        </div>
        <div class="codigo">Código: ${dados.cabecalho.numero_ficha}</div>
    </div>
    
    <!-- DADOS DO TREINAMENTO -->
    <div class="info-section">
        <div class="info-header">Identificação do Treinamento</div>
        <div class="info-content">
            <div class="info-grid">
                <div>
                    <div class="info-item">
                        <span class="info-label">Tripulante:</span>
                        <span class="info-value">${dados.tripulante.nome}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Cód. ANAC:</span>
                        <span class="info-value">${dados.tripulante.codigo_anac || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">CMA Venc.:</span>
                        <span class="info-value">${dados.tripulante.vencimento_cma || 'N/A'}</span>
                    </div>
                </div>
                <div>
                    <div class="info-item">
                        <span class="info-label">Simulador:</span>
                        <span class="info-value">${dados.sessao.simulador}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Data:</span>
                        <span class="info-value">${dados.sessao.data_sessao}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Instrutor:</span>
                        <span class="info-value">${dados.tripulante.instrutor}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Treinamento:</span>
                        <span class="info-value">${dados.sessao.treinamento}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- TABELA DE MANOBRAS -->
    <div class="manobras-section">
        <table class="manobras-table">
            <thead>
                <tr>
                    <th style="width: 50%;">MANOBRA / PROCEDIMENTO</th>
                    <th style="width: 15%;">NOTA</th>
                    <th style="width: 15%;">STATUS</th>
                    <th style="width: 20%;">OBSERVAÇÕES</th>
                </tr>
            </thead>
            <tbody>
                ${dados.manobras.map(m => `
                    <tr>
                        <td style="text-align: left;">${m.nome_manobra || m.manobra_codigo}</td>
                        <td class="${m.nota_obtida >= 7 ? 'nota-aprovado' : 'nota-reprovado'}">
                            ${m.nota_obtida}
                        </td>
                        <td>${m.nota_obtida >= 7 ? 'APTO' : 'INAPTO'}</td>
                        <td style="font-size: 7px;">${m.observacoes || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    
    <!-- RESULTADO FINAL -->
    <div class="resultado-final">
        <h3>RESULTADO FINAL</h3>
        <div class="resultado-nota ${dados.avaliacao.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}">
            ${dados.avaliacao.resultado} - NOTA: ${dados.avaliacao.nota}
        </div>
    </div>
    
    ${buildFichaAvaliacaoScaleHtml()}

    <!-- ASSINATURAS -->
    <div class="assinaturas">
        <div class="assinatura-box">
            <div class="assinatura-titulo">Tripulante</div>
            ${dados.assinaturas.aluno.assinado ? `
                <div class="assinatura-info">
                    Assinado digitalmente em:<br>
                    ${new Date(dados.assinaturas.aluno.timestamp).toLocaleString('pt-BR')}
                </div>
            ` : ''}
            <div class="assinatura-linha">
                ${dados.tripulante.nome}
            </div>
        </div>
        
        <div class="assinatura-box">
            <div class="assinatura-titulo">Instrutor Responsável</div>
            ${dados.assinaturas.instrutor.assinado ? `
                <div class="assinatura-info">
                    Assinado digitalmente em:<br>
                    ${new Date(dados.assinaturas.instrutor.timestamp).toLocaleString('pt-BR')}
                </div>
            ` : ''}
            <div class="assinatura-linha">
                ${dados.tripulante.instrutor}
            </div>
        </div>
    </div>
    
    <!-- RODAPÉ -->
    <div class="rodape">
        <div>Documento gerado em ${dados.cabecalho.data_geracao} | Hash: ${dados.validacao.hash}</div>
        <div>Este documento possui validade legal e pode ser verificado através do código acima</div>
    </div>
</body>
</html>
    `;
  };

  const buscarLogoBase64 = async (): Promise<string | null> => {
    try {
      const res = await apiFetch('/api/empresas/minha/logo-base64');
      if (!res.ok) return null;
      const result = await res.json();
      return result.success && result.data ? result.data : null;
    } catch {
      return null;
    }
  };

  const gerarPDFReal = async (dados: PDFData) => {
    try {
      const logoBase64 = await buscarLogoBase64();
      const htmlContent = gerarHTMLProfissional(dados, logoBase64);
      
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const htmlUrl = URL.createObjectURL(htmlBlob);
      
      const pdfWindow = window.open(htmlUrl, '_blank', 
          'width=794,height=1123,scrollbars=no,resizable=no,status=no,location=no,toolbar=no'
      );
      
      if (pdfWindow) {
          pdfWindow.onload = () => {
              setTimeout(() => {
                  pdfWindow.focus();
                  pdfWindow.print(); // Isso abrirá dialog "Salvar como PDF"
              }, 2000);
          };
          
          setTimeout(() => {
              URL.revokeObjectURL(htmlUrl);
          }, 5000);
      }
      
      return true;
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        return false;
    }
  };

  const gerarPDF = async () => {
    const dados = pdfData || await buscarDadosPDF();
    if (!dados) return;

    try {
        setLoading(true);
        const sucesso = await gerarPDFReal(dados);
        
        if (sucesso) {
            await apiFetch(`/api/simulador-pdf-nativo/ficha/${fichaUuid}/marcar-pdf-gerado`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    hash: dados.validacao.hash,
                    url: `ficha-${fichaUuid}.pdf`
                })
            });
            
            if (onPDFGenerated) {
                onPDFGenerated(dados.validacao.hash);
            }
            
            const instrucoesModal = document.createElement('div');
            instrucoesModal.style.cssText = `
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              background: white;
              padding: 25px;
              border-radius: 12px;
              box-shadow: 0 8px 32px rgba(0,0,0,0.3);
              z-index: 10000;
              max-width: 450px;
              text-align: center;
              font-family: Arial, sans-serif;
              border: 3px solid #dc2626;
            `;
            
            instrucoesModal.innerHTML = DOMPurify.sanitize(`
              <h3 style="color: #dc2626; margin-bottom: 15px; font-size: 18px;">
                ✅ PDF Gerado com Sucesso!
              </h3>
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin-bottom: 10px; font-weight: bold;">
                  📄 Como salvar o PDF:
                </p>
                <ol style="text-align: left; line-height: 1.6; margin-left: 20px;">
                  <li>Na janela que abriu, vá em <strong>"Destino"</strong></li>
                  <li>Selecione <strong>"Salvar como PDF"</strong></li>
                  <li>Clique em <strong>"Salvar"</strong></li>
                  <li>Escolha o local e salve o arquivo</li>
                </ol>
              </div>
              <button onclick="this.parentElement.remove()" style="
                background: #dc2626;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
              ">Entendi ✓</button>
            `;
            
            document.body.appendChild(instrucoesModal);
            
            setTimeout(() => {
              if (instrucoesModal.parentElement) {
                instrucoesModal.remove();
              }
            }, 10000);
        }
    } catch (error) {
        console.error('Erro:', error);
        toast.warning('❌ Erro ao gerar PDF');
    } finally {
        setLoading(false);
    }
  };

  const visualizarPreview = async () => {
    const dados = await buscarDadosPDF();
    if (dados) {
      setShowPreview(true);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={visualizarPreview}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
        title="Visualizar como ficará o PDF antes de gerar"
      >
        <Eye className="h-4 w-4" />
        {loading ? 'Carregando...' : 'Preview'}
      </button>
      
      <div title="Gera PDF profissional da ficha para impressão">
        <button
          onClick={gerarPDF}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {loading ? 'Gerando PDF...' : 'Gerar PDF'}
        </button>
      </div>

      {showPreview && pdfData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Preview da Ficha</h3>
              <button 
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div 
              dangerouslySetInnerHTML={{ 
                __html: DOMPurify.sanitize(gerarHTMLProfissional(pdfData)) 
              }}
              style={{ transform: 'scale(0.8)', transformOrigin: 'top left' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
