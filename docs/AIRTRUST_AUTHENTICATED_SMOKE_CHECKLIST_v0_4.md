# AIRTRUST Authenticated Smoke Checklist v0.4

## 1. Objetivo
Validar rapidamente fluxos críticos após deploy em produção com sessão autenticada, confirmando estabilidade funcional e visual sem alterar dados estruturais.

## 2. Quando usar
- Após deploy em produção de frontend e/ou worker.
- Após hotfix em módulos operacionais.
- Antes de liberar comunicação interna de conclusão do deploy.

## 3. Pré-condições
- Deploy concluído com sucesso (Pages + Worker).
- Versão esperada confirmada em `/api/version` (via `https://api.airtrust.online/api/version`).
- Sessão autenticada disponível com perfil compatível.
- Sem migration pendente para a release.

## 4. Checklist Dashboard
- Abre sem tela branca.
- Skeleton/loading inicial aparece quando necessário.
- Cards principais carregam.
- Cards secundários carregam sem travar página.
- Donut FRMS renderiza.
- Tabela/lista de alertas renderiza.
- Botão de refresh funciona sem loop de refetch.
- Dark mode sem perda de contraste crítico.

## 5. Checklist EVD/Escala
- Página abre sem erro visual.
- Dados principais do dia carregam.
- Status FRMS secundário carrega depois (ou exibe estado de carregamento esperado).
- Troca de data/aba funciona sem estado inconsistente.
- Sem erro visual de layout em desktop e mobile.

## 6. Checklist Simuladores/Sessões
- Lista inicial de sessões carrega.
- Filtro/busca/data funciona.
- Criar/editar sessão (se seguro no ambiente) funciona.
- Horários válidos (`HH:mm`, 00:00-23:59) aceitos.
- Horários inválidos (ex.: `24:00`, `12:60`, `99:99`) bloqueados com mensagem.
- Janela operacional de 90 dias atende uso esperado.

## 7. Checklist Fadiga Diária
- Tela abre e mantém contexto de `Fadiga Diária`.
- Pergunta subjetiva exibe linguagem de `nível de alerta`.
- Campo de sono 48h (se habilitado) renderiza e persiste conforme fluxo atual.
- Envio do check-in funciona.
- Histórico carrega sem quebrar registros anteriores.

## 8. Checklist LMS/EAD
- Cards e métricas principais carregam.
- Listagens e estados vazios renderizam corretamente.
- Navegação para detalhes/player funcional.
- Dark mode sem regressão visual crítica.

## 9. Checklist HomePerfil
- Página abre sem erro.
- Dados principais carregam.
- Estados de loading/skeleton renderizam sem loop infinito.

## 10. Critérios de bloqueio
- Tela branca em página crítica.
- Erro JavaScript crítico de runtime.
- Endpoint essencial retornando 500 de forma consistente.
- Perda de ação operacional crítica (publicar escala, registrar check-in, agendar sessão).

## 11. Critérios de aprovação
- Fluxos críticos acessíveis e utilizáveis.
- Sem erro crítico visual ou funcional.
- Versão publicada confere com o commit esperado.
- Sem evidência de regressão operacional.

## 12. Observação
Smoke test autenticado não substitui testes automatizados (unitários, integração e e2e). Ele reduz risco imediato de release, mas não garante cobertura completa.
