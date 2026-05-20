/**
 * TabelaVirtualizada.tsx
 *
 * Tabela com virtualização usando @tanstack/react-virtual.
 * Apenas os itens visíveis na tela são renderizados no DOM.
 */

import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Habilitacao } from '@/react-app/hooks/useHabilitacoes';
import { Edit2, Trash2, Download, FileUp, AlertCircle } from 'lucide-react';

interface TabelaVirtualizadaProps {
  dados: Habilitacao[];
  colunas: {
    chave: keyof Habilitacao | string;
    titulo: string;
    renderer?: (
      valor: string | number | boolean | null | undefined,
      row: Habilitacao,
    ) => React.ReactNode;
  }[];
  altura?: number;
  alturaLinha?: number;
  onEditar?: (hab: Habilitacao) => void;
  onDeletar?: (hab: Habilitacao) => void;
  onDownload?: (hab: Habilitacao) => void;
  onUpload?: (hab: Habilitacao) => void;
  carregando?: boolean;
}

export function TabelaVirtualizada({
  dados,
  colunas,
  altura = 600,
  alturaLinha = 50,
  onEditar,
  onDeletar,
  onDownload,
  onUpload,
  carregando = false,
}: TabelaVirtualizadaProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: dados.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => alturaLinha,
    overscan: 5,
  });

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-gray-600">Carregando tabela virtualizada...</p>
        </div>
      </div>
    );
  }

  if (dados.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Nenhuma habilitação encontrada</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="flex border-b-2 border-gray-300 bg-gray-50 sticky top-0 z-10">
        <div className="w-32 flex-shrink-0 px-4 py-3 font-semibold text-gray-700 border-r border-gray-200">
          Ações
        </div>
        <div className="flex-1 flex divide-x divide-gray-200">
          {colunas.map((col, idx) => (
            <div
              key={idx}
              className="px-6 py-3 font-semibold text-gray-700 text-left"
              style={{ flex: 1, minWidth: 150 }}
            >
              {col.titulo}
            </div>
          ))}
        </div>
      </div>

      {/* Virtualised rows */}
      <div ref={parentRef} style={{ height: altura, overflow: 'auto' }}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const hab = dados[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex border-b border-gray-200 bg-white hover:bg-gray-50 transition"
              >
                <div className="w-32 flex-shrink-0 px-4 py-3 flex items-center gap-2 border-r border-gray-200">
                  <button
                    onClick={() => onEditar?.(hab)}
                    className="p-2 hover:bg-primary/20 rounded text-primary"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onUpload?.(hab)}
                    className="p-2 hover:bg-orange-100 rounded text-orange-600"
                    title="Upload certificado"
                  >
                    <FileUp className="w-4 h-4" />
                  </button>
                  {hab.certificado_url && (
                    <button
                      onClick={() => onDownload?.(hab)}
                      className="p-2 hover:bg-green-100 rounded text-green-600"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => onDeletar?.(hab)}
                    className="p-2 hover:bg-red-100 rounded text-red-600"
                    title="Deletar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 flex divide-x divide-gray-200">
                  {colunas.map((col, idx) => (
                    <div
                      key={idx}
                      className="px-6 py-3 flex items-center text-sm text-gray-700"
                      style={{ flex: 1, minWidth: 150 }}
                    >
                      {col.renderer
                        ? col.renderer(hab[col.chave as keyof Habilitacao], hab)
                        : String(hab[col.chave as keyof Habilitacao] || '-')}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-2 bg-green-50 border-t border-green-200 text-xs text-green-700">
        ✅ {dados.length} registros carregados • Tabela virtualizada • Renderização otimizada
      </div>
    </div>
  );
}
