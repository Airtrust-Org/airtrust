import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Edit2, Trash2, Plus, Search } from 'lucide-react';
import Button from '@/react-app/components/Button';
import styles from './ConfiguracoesFuncoes.module.css';
import PageHeader from '@/react-app/components/PageHeader';
import ContentCard from '@/react-app/components/ContentCard';

interface Funcao {
  id: number;
  nome: string;
  categoria?: string;
  descricao?: string;
}

export default function ConfiguracoesFuncoes() {
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarFuncoes();
  }, []);

  const carregarFuncoes = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/funcoes`);
      const data = await res.json();
      setFuncoes(data.data || []);
    } catch (err) {
      console.error('Erro ao carregar funções:', err);
    } finally {
      setLoading(false);
    }
  };

  const funcoesFiltradas = funcoes.filter((f) =>
    f.nome.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Gestão de Funções"
        subtitle="Gerencie os cargos e funções da organização"
      />

      <div className={styles.container}>
        {/* Action Bar */}
        <div className={styles.actionBar}>
          <div className={styles.searchBox}>
            <Search size={18} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="🔍 Pesquisar funções..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <Button variant="primary">
            <Plus size={18} className="mr-2" />
            Nova Função
          </Button>
        </div>

        {/* Lista em Cards */}
        {loading ? (
          <div className={styles.loading}>Carregando...</div>
        ) : funcoesFiltradas.length === 0 ? (
          <div className={styles.empty}>
            <p>Nenhuma função encontrada</p>
          </div>
        ) : (
          <div className={styles.cardGrid}>
            {funcoesFiltradas.map((funcao) => (
              <div key={funcao.id} className={styles.card}>
                {/* Card Header */}
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>{funcao.nome}</h3>
                    {funcao.categoria && <span className={styles.badge}>{funcao.categoria}</span>}
                  </div>
                </div>

                {/* Card Body */}
                {funcao.descricao && funcao.descricao !== 'N/A' && (
                  <p className={styles.cardDescription}>{funcao.descricao}</p>
                )}

                {/* Card Footer */}
                <div className={styles.cardActions}>
                  <Button variant="secondary" size="sm" title="Editar">
                    <Edit2 size={16} className="mr-1" />
                    Editar
                  </Button>
                  <Button variant="danger" size="sm" title="Deletar">
                    <Trash2 size={16} className="mr-1" />
                    Deletar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total */}
        <div className={styles.footer}>
          <p>
            Total: <strong>{funcoesFiltradas.length}</strong> funções
          </p>
        </div>
      </div>
    </div>
  );
}
