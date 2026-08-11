# Schema V2 — Contrato canônico de categorias de qualificação (0457)

## Escopo

Adicionar `qualificacoes_categorias.lms_integrada` para representar explicitamente a categoria que integra modelos de qualificação ao LMS. A identidade funcional é `qualificacoes_categorias.id` no tenant; `codigo` é chave de negócio estável; `nome` e os campos textuais legados são apresentação/snapshot.

A mudança também instala guards transacionais para que modelos, históricos e cursos vinculados não criem novas divergências enquanto os registros antigos são reconciliados separadamente.

## Pré-condições

- aplicar somente pelo workflow oficial Schema V2;
- confirmar banco, binding, environment e SHA exatos;
- criar backup/ponto de recuperação;
- executar `scripts/validation/qualification-category-integrity-readonly.sql` no alvo autorizado;
- não existir categoria ativa duplicada por nome ou código normalizado dentro do tenant;
- não existir mais de uma categoria ativa candidata a EAD por tenant;
- revisar tipos/históricos text-only, referências inativas, divergências de domínio e resíduos de `formato`;
- publicar runtime compatível com `lms_integrada` no mesmo ciclo governado;
- validar importadores em staging: novas linhas sem `qualificacao_id`/`categoria_id` canônicos passam a falhar fechado.

## Backfill controlado

O backfill marca somente a categoria ativa única já identificável por código estável `EAD` ou, exclusivamente durante a transição, pelo nome histórico `EAD`. Depois que a coluna existe, o runtime consulta apenas `lms_integrada`; renomear a categoria não altera sua função.

A migration não inventa FK para registros históricos ambíguos. O reparo de dados permanece separado e deve partir do diagnóstico read-only e de uma decisão allowlisted.

## Guards instalados

- código da categoria imutável;
- nomes e códigos ativos únicos por tenant;
- desativação/remoção bloqueada enquanto houver modelo ativo referenciado;
- `qualificacoes_tipos` exige categoria ativa do mesmo tenant e deriva o snapshot textual;
- `qualificacoes_historico` exige tipo canônico e deriva `categoria_id`, nome e código na mesma transação;
- `lms_cursos` vinculados exigem tipo/categoria válidos, herdam o domínio efetivo e neutralizam `formato_id`;
- uma única categoria ativa integrada ao LMS por tenant.

## Pós-condições

```sql
SELECT empresa_id, COUNT(*) AS total
FROM qualificacoes_categorias
WHERE lms_integrada = 1 AND ativo = 1 AND deleted_at IS NULL
GROUP BY empresa_id
HAVING COUNT(*) > 1;
```

Deve retornar zero linhas.

```sql
SELECT qt.id, qt.empresa_id, qt.categoria_id, qt.categoria
FROM qualificacoes_tipos qt
LEFT JOIN qualificacoes_categorias qc
  ON qc.id = qt.categoria_id AND qc.empresa_id = qt.empresa_id
WHERE qt.deleted_at IS NULL
  AND (qt.categoria_id IS NULL OR qc.id IS NULL);
```

As linhas retornadas são legado a reconciliar antes da aplicação. Após a migration, novas linhas equivalentes são rejeitadas.

```sql
SELECT qh.id, qh.empresa_id, qh.qualificacao_id, qh.categoria_id,
       qh.categoria, qh.categoria_codigo
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt
  ON qt.id = qh.qualificacao_id AND qt.empresa_id = qh.empresa_id
WHERE qh.deleted_at IS NULL
  AND (qt.id IS NULL OR qh.categoria_id IS NULL);
```

Após reconciliação e aplicação, deve retornar zero linhas para novos registros e nenhuma divergência residual autorizada.

## Formato legado

A aplicação deixa de usar ou expor `formato` funcionalmente. Novos cursos vinculados têm `formato_id` neutralizado pelo banco. As colunas e a tabela físicas permanecem temporariamente para evidência e rollback até o diagnóstico provar zero referências. A remoção física será uma mudança Schema V2 separada.

## Rollback

`scripts/rollback/0457_qualification_category_lms_contract.sql` remove triggers e índices e neutraliza a flag. Remoção física da coluna exige rebuild revisado e não faz parte do rollback automático.

## Esta PR

Nenhuma migration local, de staging ou produção é aplicada por esta PR.
