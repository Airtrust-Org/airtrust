import { Printer, QrCode } from 'lucide-react';
import { apiFetch } from '@/react-app/lib/apiFetch';

interface PDFSystemProps {
  fichaData: any;
  onPrint?: () => void;
}

export default function PDFSystem({ fichaData, onPrint }: PDFSystemProps) {

  const generateQRCode = (text: string) => {
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`;
    return qrApiUrl;
  };

  const fetchLogoBase64 = async (): Promise<string | null> => {
    try {
      const res = await apiFetch('/api/empresas/minha/logo-base64');
      if (!res.ok) return null;
      const result = await res.json();
      return result.success && result.data ? result.data : null;
    } catch {
      return null;
    }
  };

  const handlePrint = async () => {
    const logoBase64 = await fetchLogoBase64();
    const htmlContent = generatePrintHTML(logoBase64);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0';
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) { document.body.removeChild(iframe); return; }
    iframeDoc.open(); iframeDoc.write(htmlContent); iframeDoc.close();
    const trigger = () => {
      iframe.contentWindow?.focus(); iframe.contentWindow?.print();
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 2000);
    };
    if (iframeDoc.readyState === 'complete') setTimeout(trigger, 250);
    else iframe.addEventListener('load', trigger, { once: true });

    onPrint?.();
  };

  const generatePrintHTML = (logoBase64?: string | null) => {
    const qrCodeUrl = generateQRCode(`FICHA-${fichaData.uuid || 'DEMO'}`);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Ficha de Avaliação - ${fichaData.aluno?.nome || 'Participante'}</title>
    <style>
        @page {
            size: A4;
            margin: 20mm;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 12pt;
            line-height: 1.4;
            color: #333;
            margin: 0;
            padding: 0;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 15px;
            margin-bottom: 25px;
        }
        
        .logo-section {
            flex: 1;
        }
        
        .qr-section {
            text-align: center;
        }
        
        .title {
            font-size: 24pt;
            font-weight: bold;
            color: #2563eb;
            margin: 0;
        }
        
        .subtitle {
            font-size: 14pt;
            color: #6b7280;
            margin: 5px 0 0 0;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 25px;
        }
        
        .info-box {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 15px;
            background-color: #f9fafb;
        }
        
        .info-label {
            font-weight: bold;
            color: #374151;
            font-size: 10pt;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
        }
        
        .info-value {
            font-size: 12pt;
            color: #111827;
        }
        
        .manobras-section {
            margin-top: 30px;
        }
        
        .section-title {
            font-size: 18pt;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 15px;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 5px;
        }
        
        .manobras-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
        }
        
        .manobras-table th,
        .manobras-table td {
            border: 1px solid #d1d5db;
            padding: 10px;
            text-align: left;
            vertical-align: top;
        }
        
        .manobras-table th {
            background-color: #f3f4f6;
            font-weight: bold;
            color: #374151;
            font-size: 11pt;
        }
        
        .manobras-table td {
            font-size: 11pt;
        }
        
        .nota-column {
            text-align: center;
            width: 80px;
        }
        
        .status-aprovado {
            color: #059669;
            font-weight: bold;
        }
        
        .status-reprovado {
            color: #dc2626;
            font-weight: bold;
        }
        
        .footer {
            margin-top: 40px;
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
            display: flex;
            justify-content: space-between;
        }
        
        .signature-box {
            width: 200px;
            text-align: center;
        }
        
        .signature-line {
            border-top: 1px solid #6b7280;
            margin-top: 50px;
            padding-top: 5px;
            font-size: 10pt;
            color: #6b7280;
        }
        
        .timestamp {
            font-size: 9pt;
            color: #9ca3af;
            text-align: center;
            margin-top: 20px;
        }
        
        .qr-code {
            max-width: 80px;
            height: auto;
        }
        
        @media print {
            body { -webkit-print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-section">
            ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-height:56px;max-width:160px;object-fit:contain;display:block;margin-bottom:6px;">` : ''}
            <p class="subtitle">Ficha de Avaliação de Simulador</p>
        </div>
        <div class="qr-section">
            <img src="${qrCodeUrl}" alt="QR Code" class="qr-code" />
            <div style="font-size: 8pt; margin-top: 5px;">${fichaData.uuid || 'DEMO'}</div>
        </div>
    </div>
    
    <div class="info-grid">
        <div class="info-box">
            <div class="info-label">Participante</div>
            <div class="info-value">${fichaData.aluno?.nome || 'Nome do Participante'}</div>
        </div>
        <div class="info-box">
            <div class="info-label">Matrícula</div>
            <div class="info-value">${fichaData.aluno?.matricula || 'T0001'}</div>
        </div>
        <div class="info-box">
            <div class="info-label">Instrutor</div>
            <div class="info-value">${fichaData.instrutor?.nome || 'Nome do Instrutor'}</div>
        </div>
        <div class="info-box">
            <div class="info-label">Simulador</div>
            <div class="info-value">${fichaData.agendamento?.simulador?.nome || 'Simulador A320-001'}</div>
        </div>
        <div class="info-box">
            <div class="info-label">Data da Sessão</div>
            <div class="info-value">${new Date(fichaData.agendamento?.data_inicio || Date.now()).toLocaleDateString('pt-BR')}</div>
        </div>
        <div class="info-box">
            <div class="info-label">Status</div>
            <div class="info-value ${fichaData.resultado_final === 'APROVADO' ? 'status-aprovado' : (fichaData.resultado_final === 'REPROVADO' ? 'status-reprovado' : '')}">${fichaData.resultado_final || 'EM AVALIAÇÃO'}</div>
        </div>
    </div>
    
    <div class="manobras-section">
        <h2 class="section-title">Manobras Executadas</h2>
        <table class="manobras-table">
            <thead>
                <tr>
                    <th>Manobra</th>
                    <th>Categoria</th>
                    <th class="nota-column">Nota</th>
                    <th>Observações</th>
                </tr>
            </thead>
            <tbody>
                ${(fichaData.template?.manobras || [
                    {nome: 'Decolagem Normal', categoria: 'DECOLAGEM', nota: null, observacoes: ''},
                    {nome: 'Aproximação ILS', categoria: 'APROXIMACAO', nota: null, observacoes: ''},
                    {nome: 'Pane de Motor', categoria: 'EMERGENCIA', nota: null, observacoes: ''}
                ]).map((manobra: any) => `
                    <tr>
                        <td>${manobra.nome}</td>
                        <td>${manobra.categoria}</td>
                        <td class="nota-column">${manobra.nota || '-'}</td>
                        <td>${manobra.observacoes || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    
    <div class="footer">
        <div class="signature-box">
            <div class="signature-line">Assinatura do Participante</div>
        </div>
        <div class="signature-box">
            <div class="signature-line">Assinatura do Instrutor</div>
        </div>
    </div>
    
    <div class="timestamp">
        Documento gerado em ${new Date().toLocaleString('pt-BR')} | Sistema AirTrust v2.0
    </div>
</body>
</html>`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Printer className="w-5 h-5 text-primary" />
          <span className="font-medium text-gray-900">Sistema PDF Leve</span>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Imprimir A4
          </button>
          
          <button
            onClick={() => window.open(generateQRCode(`FICHA-${fichaData.uuid || 'DEMO'}`), '_blank')}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
          >
            <QrCode className="w-4 h-4 mr-1.5" />
            QR Code
          </button>
        </div>
      </div>
      
      <div className="mt-3 text-sm text-gray-600">
        <div className="flex items-center space-x-4">
          <span>✅ Formato A4 nativo</span>
          <span>✅ QR Code integrado</span>
          <span>✅ Zero dependências pesadas</span>
        </div>
      </div>
    </div>
  );
}
