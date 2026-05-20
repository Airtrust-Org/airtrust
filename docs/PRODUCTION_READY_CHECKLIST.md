# Production Ready Checklist - AirTrust

Esta checklist deve ser completada antes de qualquer deploy para produção.

## ✅ 1. Testes Automatizados (QA)

### Testes E2E
- [ ] **Cypress tests passando** (`npm run test:e2e`)
- [ ] **Cobertura E2E >95%** dos workflows críticos
- [ ] **Testes de segurança passando** (`npm run security:test`)
- [ ] **Cross-browser testing** (Chrome, Firefox, Safari, Edge)
- [ ] **Mobile responsiveness** testado

### Testes Unitários
- [ ] **Vitest tests passando** (`npm run test`)
- [ ] **Test coverage >85%** (`npm run test:coverage`)
- [ ] **Component tests** para todos componentes críticos
- [ ] **Hook tests** para todos custom hooks
- [ ] **Utility function tests** para lógica de negócio

### Testes de Integração
- [ ] **API integration tests** funcionando
- [ ] **Database integration tests** executados
- [ ] **Authentication flow** testado end-to-end

**Evidências requeridas:**
- [ ] Screenshot do test coverage report
- [ ] Cypress test video de workflows críticos
- [ ] Test execution logs sem erros

---

## ♿ 2. Acessibilidade (A11Y)

### Padrões WCAG 2.1 AA
- [ ] **Contrast ratio ≥4.5:1** para texto normal
- [ ] **Contrast ratio ≥3:1** para texto grande
- [ ] **Keyboard navigation** funciona em toda aplicação
- [ ] **Focus indicators** visíveis e consistentes
- [ ] **Screen reader compatibility** testado

### ARIA Implementation
- [ ] **ARIA labels** em todos elementos interativos
- [ ] **ARIA roles** corretos para componentes customizados
- [ ] **ARIA live regions** para updates dinâmicos
- [ ] **ARIA expanded/selected** states corretos

### Formulários
- [ ] **Labels associados** a todos inputs (`htmlFor`/`id`)
- [ ] **Required fields** indicados visualmente e programaticamente
- [ ] **Error messages** associados aos campos (`aria-describedby`)
- [ ] **Field instructions** claras e acessíveis

**Evidências requeridas:**
- [ ] axe-core audit report sem violações críticas
- [ ] Screen reader testing report (NVDA/JAWS/VoiceOver)
- [ ] Keyboard navigation test checklist

---

## ⚡ 3. Performance Benchmarks (SRE)

### Lighthouse Scores
- [ ] **Performance Score ≥90**
- [ ] **Accessibility Score ≥95**
- [ ] **Best Practices Score ≥90**
- [ ] **SEO Score ≥90**

### Core Web Vitals
- [ ] **LCP (Largest Contentful Paint) <2.5s**
- [ ] **FID (First Input Delay) <100ms**
- [ ] **CLS (Cumulative Layout Shift) <0.1**

### API Performance
- [ ] **Average response time <200ms**
- [ ] **99th percentile response time <500ms**
- [ ] **Error rate <1%**
- [ ] **Database queries optimized** (no N+1 queries)

### Load Testing
- [ ] **100 concurrent users** handled successfully
- [ ] **1000 requests/minute** without degradation
- [ ] **Memory usage stable** under load
- [ ] **CPU usage <70%** under normal load

**Evidências requeridas:**
- [ ] Lighthouse report HTML exportado
- [ ] Load testing results (Apache Bench/Artillery)
- [ ] Performance monitoring dashboard screenshot

---

## 📚 4. Documentação (Engineering)

### API Documentation
- [ ] **OpenAPI spec atualizada** (`openapi.yaml`)
- [ ] **Todos endpoints documentados** com exemplos
- [ ] **Request/response schemas** definidos
- [ ] **Error codes documentados** com mensagens

### Component Documentation
- [ ] **Storybook stories** para componentes principais
- [ ] **Props interface documentation** (JSDoc)
- [ ] **Usage examples** para componentes complexos
- [ ] **Component testing guide**

### System Documentation
- [ ] **Architecture overview** atualizado
- [ ] **Database schema documentation**
- [ ] **Deployment guide** atualizado
- [ ] **Environment variables** documentadas
- [ ] **Troubleshooting guide** com problemas comuns

**Evidências requeridas:**
- [ ] Link para documentação publicada
- [ ] API docs acessíveis via `/docs`
- [ ] README atualizado com setup instructions

---

## 🚩 5. Feature Flags (DevOps)

### Feature Flag Implementation
- [ ] **Critical features** behind feature flags
- [ ] **Rollout strategy** definida (5% → 25% → 100%)
- [ ] **Kill switch** implementado para features críticas
- [ ] **A/B testing** configurado onde aplicável

### Configuration
- [ ] **Environment-specific** flag configurations
- [ ] **User-based targeting** implementado
- [ ] **Flag monitoring** configurado
- [ ] **Rollback procedure** documentado

**Evidências requeridas:**
- [ ] Feature flags configuration file
- [ ] Rollout plan documento
- [ ] Kill switch test executado

---

## 📊 6. Monitoramento Contínuo (SRE)

### Application Monitoring
- [ ] **Error tracking** configurado (Sentry/Bugsnag)
- [ ] **Performance monitoring** ativo (New Relic/DataDog)
- [ ] **Custom metrics** implementados
- [ ] **Alert rules** configurados

### Infrastructure Monitoring
- [ ] **Server health** monitorado
- [ ] **Database performance** rastreado
- [ ] **API endpoints** com health checks
- [ ] **SSL certificate** monitoring

### Alerting
- [ ] **Error rate >1%** alerta configurado
- [ ] **Response time >200ms** alerta ativo
- [ ] **Downtime** alertas para equipe
- [ ] **Disk space/memory** alertas configurados

**Evidências requeridas:**
- [ ] Monitoring dashboard configurado
- [ ] Alert test executado (deve disparar notificação)
- [ ] Runbook para incidentes críticos

---

## 👥 7. Peer Review Process (Gestão)

### Code Review Checklist
- [ ] **Security review** por senior dev
- [ ] **Performance review** executado
- [ ] **Accessibility review** completo
- [ ] **Architecture review** para mudanças significativas

### Pair Programming
- [ ] **Complex features** desenvolvidas em par
- [ ] **Critical bug fixes** com pair review
- [ ] **Knowledge sharing** documentado

### Quality Gates
- [ ] **All tests passing** antes do merge
- [ ] **Code coverage** mantido ou melhorado
- [ ] **Static analysis** (ESLint) sem erros críticos
- [ ] **Dependencies** auditadas para vulnerabilidades

**Evidências requeridas:**
- [ ] Pull request aprovado por 2+ reviewers
- [ ] Code review checklist completo
- [ ] Pair programming session logged (se aplicável)

---

## 🔒 8. Testes de Segurança (SecOps)

### Input Validation
- [ ] **XSS protection** testado em todos inputs
- [ ] **SQL injection** prevention validado
- [ ] **CSRF tokens** implementados
- [ ] **Input sanitization** em todas APIs

### Authentication & Authorization
- [ ] **JWT tokens** validação correta
- [ ] **Role-based access** funcionando
- [ ] **Session management** seguro
- [ ] **Password policies** implementadas (se aplicável)

### Infrastructure Security
- [ ] **HTTPS** enforced em produção
- [ ] **Security headers** configurados
- [ ] **Content Security Policy** ativo
- [ ] **Rate limiting** implementado

### Penetration Testing
- [ ] **OWASP ZAP** scan executado
- [ ] **Dependency vulnerabilities** verificadas (`npm audit`)
- [ ] **Secrets** não expostos no frontend
- [ ] **Error messages** não vazam informações sensíveis

**Evidências requeridas:**
- [ ] Security scan report sem críticos
- [ ] Penetration test results
- [ ] Vulnerability assessment completed

---

## 📊 9. Cobertura de Teste (QA)

### Unit Tests
- [ ] **>85% code coverage** alcançado
- [ ] **Critical paths** 100% cobertos
- [ ] **Edge cases** testados
- [ ] **Error handling** coberto

### Integration Tests
- [ ] **API endpoints** testados
- [ ] **Database operations** cobertas
- [ ] **Third-party integrations** testadas
- [ ] **Authentication flows** cobertos

### E2E Tests
- [ ] **Happy path** workflows completos
- [ ] **Error scenarios** testados
- [ ] **Cross-browser** compatibility
- [ ] **Mobile responsive** workflows

**Evidências requeridas:**
- [ ] Coverage report >85% em todas as categorias
- [ ] Test execution report com 100% pass rate
- [ ] Performance tests showing acceptable load times

---

## 🔄 10. Retrospectiva (Gestão Ágil)

### Lessons Learned
- [ ] **Development process** retrospective completo
- [ ] **Technical challenges** documentados
- [ ] **Team feedback** coletado e analisado
- [ ] **Improvement actions** definidos

### Metrics Analysis
- [ ] **Development time** vs estimated
- [ ] **Bug count** e resolução time
- [ ] **Performance benchmarks** vs targets
- [ ] **User feedback** se disponível

### Process Improvements
- [ ] **Workflow optimizations** identificadas
- [ ] **Tool improvements** sugeridas
- [ ] **Training needs** identificadas
- [ ] **Next iteration** planning melhorado

**Evidências requeridas:**
- [ ] Retrospective document completo
- [ ] Improvement action items com owners
- [ ] Metrics comparison (planned vs actual)

---

## 🚀 FINAL SIGN-OFF

### Tech Lead Approval
- [ ] **Architecture review** aprovada
- [ ] **Performance benchmarks** atingidos
- [ ] **Security standards** cumpridos
- [ ] **Code quality** aceitável

### QA Lead Approval  
- [ ] **Test coverage** suficiente
- [ ] **Bug severity** aceitável
- [ ] **User acceptance** criteria atendidos
- [ ] **Regression testing** completo

### DevOps Approval
- [ ] **Deployment pipeline** testado
- [ ] **Rollback plan** validado
- [ ] **Monitoring** configurado
- [ ] **Infrastructure** ready

### Product Owner Approval
- [ ] **Business requirements** atendidos
- [ ] **User experience** aprovada
- [ ] **Performance targets** atingidos
- [ ] **Go-live** approval concedido

---

**🎯 Definition of Done:** Todos os 10 critérios devem estar ✅ antes do deploy para produção.

**📋 Responsible:** [Nome do Tech Lead]  
**📅 Review Date:** [YYYY-MM-DD]  
**🔄 Next Review:** [YYYY-MM-DD]

---

**🚨 Emergency Deploy Exception Process:**
Para hotfixes críticos, mínimo de 5/10 critérios obrigatórios:
1. ✅ Testes de Segurança
2. ✅ Peer Review Process  
3. ✅ Feature Flags (kill switch)
4. ✅ Monitoramento
5. ✅ Rollback plan testado

Todos os outros critérios devem ser completados em até 48h pós-deploy.
