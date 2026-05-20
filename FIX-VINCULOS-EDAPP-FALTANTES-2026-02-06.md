# Fix Vínculos EdApp Faltantes - 2026-02-06

## 📋 Contexto

Auditoria do CSV EdApp identificou 33 funcionários total:

- **12** já vinculados corretamente ✅
- **2** existem no AirTrust mas SEM vínculo EdApp ⚠️
- **19** não existem no AirTrust (podem ser ignorados) ❌

## ✅ Funcionários que EXISTEM no AirTrust e precisam de vínculo

### 1. Antonio Luiz Simões Ramos

- **Email**: antonio.ramos@voecostadosol.com.br
- **AirTrust ID**: 3
- **Matrícula**: 00074
- **Função**: PIC (SK76)
- **EdApp User ID**: ❓ PRECISA BUSCAR

### 2. Vitor De Almeida Costa

- **Email**: vitor.costa@voecostadosol.com.br
- **AirTrust ID**: 32
- **Matrícula**: 00221
- **Função**: Copiloto (SK76)
- **EdApp User ID**: ❓ PRECISA BUSCAR

## ❌ Funcionários do CSV que NÃO existem no AirTrust (ignorar)

1. andre.garcia@voecostadosol.com.br
2. andre.marques@voecostadosol.com.br
3. andre.santos@voecostadosol.com.br
4. bruno.silva@voecostadosol.com.br
5. camila.souza@voecostadosol.com.br
6. carlos.gomes@voecostadosol.com.br
7. cristiano.nunes@voecostadosol.com.br
8. daniel.andrade@voecostadosol.com.br
9. fabio.rocha@voecostadosol.com.br
10. felipe.carvalho@voecostadosol.com.br
11. fernando.castro@voecostadosol.com.br
12. gabriel.freitas@voecostadosol.com.br
13. jose.martins@voecostadosol.com.br
14. leonardo.costa@voecostadosol.com.br
15. lucas.rodrigues@voecostadosol.com.br
16. marcelo.oliveira@voecostadosol.com.br
17. paulo.araujo@voecostadosol.com.br
18. ricardo.lima@voecostadosol.com.br
19. rodrigo.almeida@voecostadosol.com.br

## 🔧 Ações Necessárias

### 1. Buscar EdApp User IDs

Preciso dos EdApp User IDs para Antonio Ramos e Vitor Costa. Há 3 formas de obter:

#### Opção A: Via EdApp API

```bash
curl -H "Authorization: Bearer <EDAPP_API_TOKEN>" \
  "https://rest.edapp.com/v2/users?email=antonio.ramos@voecostadosol.com.br"

curl -H "Authorization: Bearer <EDAPP_API_TOKEN>" \
  "https://rest.edapp.com/v2/users?email=vitor.costa@voecostadosol.com.br"
```

#### Opção B: Verificar eventos existentes

```sql
SELECT DISTINCT
  edapp_user_id,
  JSON_EXTRACT(payload_json, '$.data.userId') as user_id_payload
FROM integracoes_edapp_eventos
WHERE JSON_EXTRACT(payload_json, '$.data.userId') IS NOT NULL
ORDER BY created_at DESC;
```

#### Opção C: Exportação CSV EdApp

Se o CSV exportado incluir campo `user_id` ou `id`, usar diretamente.

### 2. Criar Vínculos (após obter IDs)

```sql
-- Antonio Ramos
INSERT INTO integracoes_edapp_usuarios (
  funcionario_id,
  edapp_user_id,
  edapp_email,
  edapp_username,
  ativo,
  created_at,
  updated_at
) VALUES (
  3,
  '<EDAPP_USER_ID_ANTONIO>',
  'antonio.ramos@voecostadosol.com.br',
  'Antonio Ramos',
  1,
  datetime('now'),
  datetime('now')
);

-- Vitor Costa
INSERT INTO integracoes_edapp_usuarios (
  funcionario_id,
  edapp_user_id,
  edapp_email,
  edapp_username,
  ativo,
  created_at,
  updated_at
) VALUES (
  32,
  '<EDAPP_USER_ID_VITOR>',
  'vitor.costa@voecostadosol.com.br',
  'Vitor Costa',
  1,
  datetime('now'),
  datetime('now')
);
```

### 3. Reprocessar Eventos Históricos

Após criar os vínculos, importar histórico via API:

```bash
curl -X POST https://api.airtrust.online/api/integracoes/edapp/importar-historico
```

Ou via interface web:

- Configurações > Integrações > EdApp > **Importar Histórico**

## 📊 Estatísticas do CSV (33 funcionários)

### Cursos por funcionário (25 com cursos):

- **B (CRM)**: 21 conclusões
- **C (Desorientação Espacial)**: 18 conclusões
- **E1 (CFIT)**: 17 conclusões
- **E2 (Perda Controle)**: 17 conclusões
- **E4 (Windshear)**: 17 conclusões
- **E5 (Voo Controlado Terreno)**: 17 conclusões
- **E6 (Turbulência Severa)**: 17 conclusões

### Distribuição:

- ✅ 12 funcionários já vinculados (100% emails corretos)
- ⚠️ 2 funcionários precisam vínculo (Antonio + Vitor)
- ❌ 19 funcionários não existem no AirTrust
- ℹ️ 8 funcionários sem cursos concluídos

## ⚠️ Observações

1. **CSV Desatualizado**: Faltam eventos de 2026 (ex: Filipe's B em 2026-01-23 e E6 em 2026-02-05)
2. **Eduardo Ribeiro**: Aparece no CSV mas JÁ está vinculado (ID 10)
3. **19 emails não encontrados**: Provavelmente são funcionários de teste ou inativos

## 🎯 Próximo Passo

**AGUARDANDO**: EdApp User IDs de Antonio Ramos e Vitor Costa para criar os vínculos e reprocessar eventos.

---

**Data**: 2026-02-06  
**Status**: ⏳ Pendente EdApp User IDs  
**Responsável**: Sistema AirTrust
