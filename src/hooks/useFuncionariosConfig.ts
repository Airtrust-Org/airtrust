import { useState, useEffect } from 'react';

export interface ColumnConfig {
  name: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface SchemaField {
  name: string;
  label: string;
  type: string;
  filterable: boolean;
}

const STORAGE_KEY = 'airtrust_funcionarios_columns_config';

export const useFuncionariosConfig = () => {
  const [schema, setSchema] = useState<SchemaField[]>([]);
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar schema do servidor
  useEffect(() => {
    const loadSchema = async () => {
      try {
        const baseUrl = (
          (import.meta as unknown as { env?: { VITE_API_URL?: string } })?.env?.VITE_API_URL ||
          'https://airtrust.airtrust.workers.dev/api'
        ).replace(/\/$/, '');

        const response = await fetch(`${baseUrl}/funcionarios/schema`);
        const data = await response.json();

        if (data.success && data.data) {
          setSchema(data.data);

          // Carregar config salva ou criar padrão
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            try {
              const config = JSON.parse(saved);
              setColumns(config);
            } catch {
              initializeDefaultColumns(data.data);
            }
          } else {
            initializeDefaultColumns(data.data);
          }
        }
      } catch (error) {
        console.error('[useFuncionariosConfig] Erro ao carregar schema:', error);
        initializeDefaultColumns([]);
      } finally {
        setLoading(false);
      }
    };

    loadSchema();
    // Dependências intencionais limitadas para evitar re-fetch infinito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeDefaultColumns = (fields: SchemaField[]) => {
    // Colunas padrão que aparecem por padrão (ordem importa)
    const defaultOrder = ['matricula', 'nome', 'cargo', 'email', 'ativo', 'created_at'];

    const config = fields.map((field, index) => ({
      name: field.name,
      label: field.label,
      visible: defaultOrder.includes(field.name),
      order: defaultOrder.indexOf(field.name) >= 0 ? defaultOrder.indexOf(field.name) : 999 + index,
    }));

    const sorted = config.sort((a, b) => a.order - b.order);
    setColumns(sorted);
    saveConfig(sorted);
  };

  const saveConfig = (config: ColumnConfig[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  };

  const toggleColumn = (name: string) => {
    const updated = columns.map((col) =>
      col.name === name ? { ...col, visible: !col.visible } : col,
    );
    setColumns(updated);
    saveConfig(updated);
  };

  const reorderColumns = (fromIndex: number, toIndex: number) => {
    const updated = [...columns];
    const [removed] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, removed);

    // Recalcular ordem
    const reordered = updated.map((col, idx) => ({
      ...col,
      order: idx,
    }));

    setColumns(reordered);
    saveConfig(reordered);
  };

  const resetToDefault = () => {
    localStorage.removeItem(STORAGE_KEY);
    initializeDefaultColumns(schema);
  };

  return {
    schema,
    columns,
    loading,
    toggleColumn,
    reorderColumns,
    resetToDefault,
    visibleColumns: columns.filter((col) => col.visible).sort((a, b) => a.order - b.order),
  };
};
