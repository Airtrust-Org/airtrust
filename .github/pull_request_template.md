# Pull Request - AirTrust

## 📋 Peer Review Checklist

### ✅ Code Quality
- [ ] **Código segue padrões estabelecidos** (ESLint sem warnings)
- [ ] **Componentes React seguem convenções** (hooks, props, naming)
- [ ] **TypeScript tipos estão corretos** (sem `any`, interfaces bem definidas)
- [ ] **Funções são pequenas e têm responsabilidade única** (< 50 linhas idealmente)
- [ ] **Variáveis e funções têm nomes descritivos**
- [ ] **Não há código comentado ou debug logs** em produção

### 🧪 Testes e Qualidade
- [ ] **Testes unitários cobrem nova funcionalidade** (>85% coverage)
- [ ] **Testes E2E cobrem workflows críticos**
- [ ] **Testes passam localmente** (`npm run test`)
- [ ] **Build não quebrou** (`npm run build`)
- [ ] **Performance não foi degradada** (Lighthouse score mantido)
- [ ] **Não há memory leaks** (React DevTools verificado)

### 🔒 Segurança
- [ ] **Input validation implementada** (Zod schemas)
- [ ] **Sanitização de dados** para prevenir XSS
- [ ] **Autorização verificada** onde necessário
- [ ] **Secrets não expostos** no frontend
- [ ] **SQL injection prevenido** (prepared statements)
- [ ] **Dependencies vulneráveis verificadas** (`npm audit`)

### ♿ Acessibilidade
- [ ] **ARIA labels em elementos interativos**
- [ ] **Navegação completa por teclado**
- [ ] **Contraste de cores adequado** (WCAG AA)
- [ ] **Foco visível em todos elementos** interativos
- [ ] **Screen readers testados** (pelo menos VoiceOver/NVDA)
- [ ] **Formulários têm labels associadas**

### 📖 Documentação
- [ ] **OpenAPI spec atualizada** para novos endpoints
- [ ] **README atualizado** se necessário
- [ ] **Componentes React documentados** (JSDoc com props)
- [ ] **Changelog atualizado** com mudanças
- [ ] **Migration guide** se breaking changes

### 🚀 DevOps e Deploy
- [ ] **Feature flags configuradas** se necessário
- [ ] **Environment variables documentadas**
- [ ] **Database migrations testadas** (up/down)
- [ ] **Rollback plan documentado**
- [ ] **Health checks não quebrados**

---

## 📝 Descrição das Mudanças

### O que foi alterado?
<!-- Descreva as mudanças principais -->

### Por que foi alterado?
<!-- Contexto e justificativa -->

### Como foi testado?
<!-- Passos para reproduzir e testar -->

---

## 🎯 Tipo de Mudança
- [ ] 🐛 Bug fix (mudança que corrige um problema)
- [ ] ✨ Nova feature (mudança que adiciona funcionalidade)
- [ ] 💥 Breaking change (mudança que quebra compatibilidade)
- [ ] 📝 Mudança de documentação
- [ ] 🎨 Mudança de estilo/formatação
- [ ] ♻️ Refatoração (sem mudança de funcionalidade)
- [ ] ⚡ Melhoria de performance
- [ ] 🔧 Mudança de configuração/build

---

## 🔗 Links Relacionados
<!-- Issues, designs, PRs relacionados -->
- Closes #[issue number]
- Related to #[issue number]
- Design: [Figma/mockup link]

---

## 📊 Impacto Esperado

### Performance
- [ ] Sem impacto na performance
- [ ] Melhoria na performance
- [ ] Possível degradação (justificar)

### Dados
- [ ] Sem mudanças no banco de dados
- [ ] Migration necessária (testada)
- [ ] Backup recomendado antes do deploy

### Usuários
- [ ] Transparente para usuários
- [ ] Requer treinamento/comunicação
- [ ] Breaking change para APIs externas

---

## 🤝 Pair Programming
- [ ] Este código foi desenvolvido em pair programming
- [ ] Code review adicional requerido
- [ ] Solo development (standard review)

**Pair partner:** @[username]

---

## ⚠️ Notas Especiais para Review
<!-- Qualquer coisa que os reviewers devem prestar atenção especial -->

---

## ✅ Checklist do Autor
Antes de submeter este PR, confirmo que:

- [ ] Testei todas as funcionalidades alteradas
- [ ] Rodei `npm run lint` sem erros
- [ ] Rodei `npm run test` - todos passaram
- [ ] Verifiquei que `npm run build` funciona
- [ ] Li minha própria PR para catch óbvios problemas
- [ ] Atualizei documentação relevante
- [ ] Considerei impacto de acessibilidade
- [ ] Verifiquei que não há informação sensível exposta

---

**Review process:**
1. **Self-review** pelo autor primeiro
2. **Automated checks** (CI/CD, linting, tests)  
3. **Peer review** por pelo menos 1 desenvolvedor
4. **QA review** se alterações de UI/UX
5. **Security review** se mudanças sensíveis

**Para emergências/hotfixes:** Ping @team-lead no Slack
