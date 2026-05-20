# 📚 EXEMPLOS DE INTEGRAÇÃO - MODAL DE CERTIFICADOS

## Como Integrar o Modal em seus Componentes

### 1. Importar o Componente

```typescript
import CertificadoGestaoModal from '../CertificadoGestaoModal';
```

### 2. Adicionar State

```typescript
const [certModalOpen, setCertModalOpen] = useState(false);
const [selectedQualId, setSelectedQualId] = useState<number | null>(null);
const [selectedFuncId, setSelectedFuncId] = useState<number | null>(null);
```

### 3. Criar Handler

```typescript
const handleAbrirCertificados = (qualId: number, funcId: number) => {
  setSelectedQualId(qualId);
  setSelectedFuncId(funcId);
  setCertModalOpen(true);
};
```

### 4. Substituir Botão Download por FileText

**ANTES:**
```typescript
<button className="text-green-600 hover:text-green-700">
  <Download className="w-4 h-4" />
</button>
```

**DEPOIS:**
```typescript
<button
  onClick={() => handleAbrirCertificados(q.id, q.funcionario_id)}
  className="text-orange-600 hover:text-orange-700 font-semibold"
  title="Gerenciar certificados"
>
  <FileText className="w-4 h-4" />
</button>
```

### 5. Renderizar o Modal

Ao final do componente, adicione:

```typescript
{selectedQualId !== null && selectedFuncId !== null && (
  <CertificadoGestaoModal
    qualificacaoId={selectedQualId}
    funcionarioId={selectedFuncId}
    isOpen={certModalOpen}
    onClose={() => {
      setCertModalOpen(false);
      setSelectedQualId(null);
      setSelectedFuncId(null);
    }}
  />
)}
```

---

## Componentes Onde Integrar

### 1. **HistoricoQualificacoes.tsx** ⭐ PRINCIPAL
- Tabela com todas as qualificações
- Botão de ações em cada linha
- **Onde:** Célula de ações (TD)
- **Função:** Permitir gerenciar certificados de qualquer qualificação

### 2. **ListaQualificacoes.tsx**
- Lista filtrada de qualificações
- Similar à anterior
- **Onde:** Botões de ação

### 3. **QualificacoesFuncionario.tsx**
- Qualificações de um funcionário específico
- **Onde:** Detalhes ou ações

### 4. **Dashboard**
- Card resumido com estatísticas
- **Onde:** Botão "Ver Detalhes"
- **Função:** Abrir modal para qualificação específica

### 5. **Detalhe da Qualificação**
- Modal ou página de detalhe
- **Onde:** Botão destacado
- **Função:** Gerenciar certificados daquela qualificação

---

## Padrão com Hook Customizado

Para evitar repetir o mesmo código em múltiplos componentes:

```typescript
// Hook customizado
export function useCertificadoModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [qualificacaoId, setQualificacaoId] = useState<number | null>(null);
  const [funcionarioId, setFuncionarioId] = useState<number | null>(null);

  const openModal = (qualId: number, funcId: number) => {
    setQualificacaoId(qualId);
    setFuncionarioId(funcId);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setQualificacaoId(null);
    setFuncionarioId(null);
  };

  const modal = qualificacaoId && funcionarioId ? (
    <CertificadoGestaoModal
      qualificacaoId={qualificacaoId}
      funcionarioId={funcionarioId}
      isOpen={isOpen}
      onClose={closeModal}
    />
  ) : null;

  return { openModal, closeModal, modal };
}

// Usar o hook:
export function MeuComponente() {
  const { openModal, modal } = useCertificadoModal();

  return (
    <>
      <button
        onClick={() => openModal(123, 456)}
        className="px-4 py-2 bg-orange-600 text-white rounded-lg"
      >
        <FileText className="inline mr-2" size={20} />
        Certificados
      </button>
      {modal}
    </>
  );
}
```

---

## Props do Modal

| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| `qualificacaoId` | number | ✅ | ID da qualificação |
| `funcionarioId` | number | ✅ | ID do funcionário |
| `isOpen` | boolean | ✅ | Controla visibilidade |
| `onClose` | function | ✅ | Callback para fechar |

---

## Fluxo de Uso

```
Usuário clica em FileText
  ↓
openModal(qualificacaoId, funcionarioId)
  ↓
CertificadoGestaoModal abre
  ↓
Usuário escolhe Gerar ou Upload
  ↓
API POST /certificados/{id}/gerar ou upload
  ↓
Modal recarrega histórico
  ↓
Usuário vê nova versão
  ↓
Usuário clica Fechar
  ↓
Modal fecha, state limpo
```

---

## Checklist de Integração

Para cada componente onde integrar:

- [ ] Importar CertificadoGestaoModal
- [ ] Adicionar state (3 variables)
- [ ] Criar handler openCertificados
- [ ] Modificar botão Download → FileText
- [ ] Adicionar onClick ao botão
- [ ] Renderizar modal ao final
- [ ] Testar abrir/fechar
- [ ] Testar gerar certificado
- [ ] Testar upload PDF
- [ ] Testar histórico
- [ ] Testar permissões

---

## Testando Localmente

```bash
# 1. Iniciar dev server
npm run dev

# 2. Navegar até qualificações
# http://localhost:5173/qualificacoes

# 3. Clicar em FileText icon
# (se ainda implementado, pode estar como Download)

# 4. Modal deve abrir

# 5. Testar abas Gerar e Upload

# 6. Verificar console para erros
```

---

## Troubleshooting

### Modal não abre
- Verificar se `isOpen={certModalOpen}`
- Verificar se `onClose` limpa state corretamente
- Verificar se useState importado de React

### Erros 403 Forbidden
- Usar funcionário do usuário logado
- ADMIN pode acessar qualquer um
- Non-admin só acessa seus certificados

### Upload falha
- Verificar se arquivo é PDF
- Verificar se < 5MB
- Verificar se token válido

### Histórico não recarrega
- Verificar console para erros
- GET endpoint pode estar retornando 404
- Verificar qualificacao_id

---

## Próximas Melhorias

- [ ] Preview de PDF antes de gerar
- [ ] Compartilhar certificado por email
- [ ] Assinar certificado digitalmente
- [ ] Expirar certificado automaticamente
- [ ] Notificação de vencimento

