/**
 * OPENAPI SPECIFICATION - AirTrust API
 *
 * Documentação automática da API no formato OpenAPI 3.0
 * Acesse via GET /api/docs
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AirTrust API',
    description: 'API de gestão de qualificações, habilitações, treinamentos e LMS para aviação',
    version: '2.0.0',
    contact: {
      name: 'AirTrust Support',
      email: 'suporte@airtrust.com.br',
    },
  },
  servers: [
    {
      url: 'https://api.airtrust.online',
      description: 'Produção',
    },
    {
      url: 'https://airtrust-api-staging.airtrust.workers.dev',
      description: 'Staging',
    },
    {
      url: 'http://localhost:8787',
      description: 'Desenvolvimento Local',
    },
  ],
  tags: [
    { name: 'Health', description: 'Status e saúde do sistema' },
    { name: 'Auth', description: 'Autenticação e autorização' },
    { name: 'Funcionários', description: 'Gestão de funcionários' },
    { name: 'Qualificações', description: 'Gestão de qualificações e treinamentos' },
    { name: 'Habilitações', description: 'Gestão de habilitações' },
    { name: 'Licenças', description: 'Gestão de licenças' },
    { name: 'Simuladores', description: 'Gestão de sessões de simulador' },
    { name: 'Dashboard', description: 'Estatísticas e métricas' },
    { name: 'LMS', description: 'Catálogo, matrículas, progresso e assets do LMS interno' },
    { name: 'Integrações', description: 'Integrações com sistemas externos (EdApp)' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Verificar saúde do sistema',
        description: 'Retorna status de conectividade com D1, R2 e métricas',
        responses: {
          '200': {
            description: 'Sistema saudável',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    status: { type: 'string', example: 'healthy' },
                    checks: {
                      type: 'object',
                      properties: {
                        database: {
                          type: 'object',
                          properties: {
                            status: { type: 'string', example: 'ok' },
                            latency: { type: 'number', example: 12 },
                          },
                        },
                        storage: {
                          type: 'object',
                          properties: {
                            status: { type: 'string', example: 'ok' },
                            latency: { type: 'number', example: 5 },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '503': {
            description: 'Sistema com problemas',
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Autenticar usuário',
        description: 'Faz login e retorna token JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'admin@airtrust.com.br' },
                  password: { type: 'string', example: '********' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login bem-sucedido',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    token: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        email: { type: 'string' },
                        role: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Credenciais inválidas' },
          '429': { description: 'Muitas tentativas (rate limit)' },
        },
      },
    },
    '/api/funcionarios': {
      get: {
        tags: ['Funcionários'],
        summary: 'Listar funcionários',
        description: 'Retorna lista paginada de funcionários',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['ativo', 'inativo'] } },
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de funcionários',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Funcionario' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
        },
      },
      post: {
        tags: ['Funcionários'],
        summary: 'Criar funcionário',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FuncionarioInput' },
            },
          },
        },
        responses: {
          '201': { description: 'Funcionário criado' },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
        },
      },
    },
    '/api/qualificacoes': {
      get: {
        tags: ['Qualificações'],
        summary: 'Listar qualificações',
        description: 'Retorna qualificações com filtros',
        parameters: [
          { name: 'funcionario_id', in: 'query', schema: { type: 'integer' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['valida', 'vencendo', 'vencida'] },
          },
          { name: 'tipo_id', in: 'query', schema: { type: 'integer' } },
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de qualificações' },
        },
      },
    },
    '/api/dashboard/stats': {
      get: {
        tags: ['Dashboard'],
        summary: 'Estatísticas do dashboard',
        description: 'Retorna métricas consolidadas do sistema',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Estatísticas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        funcionarios: { type: 'integer' },
                        qualificacoes: {
                          type: 'object',
                          properties: {
                            total: { type: 'integer' },
                            validas: { type: 'integer' },
                            vencendo: { type: 'integer' },
                            vencidas: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/lms/cursos': {
      get: {
        tags: ['LMS'],
        summary: 'Listar cursos LMS',
        description: 'Lista cursos LMS ativos da empresa com filtros e paginação.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
          { name: 'categoria', in: 'query', schema: { type: 'string' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          {
            name: 'publicados',
            in: 'query',
            schema: { type: 'string', enum: ['0', '1'], default: '1' },
            description: 'Quando omitido, retorna apenas cursos publicados.',
          },
        ],
        responses: {
          '200': {
            description: 'Cursos LMS encontrados',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/LmsCurso' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
        },
      },
      post: {
        tags: ['LMS'],
        summary: 'Criar curso LMS',
        description: 'Cria curso LMS. Conteúdo pode ser anexado depois pelos endpoints de upload.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LmsCursoInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Curso LMS criado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/LmsCurso' },
                  },
                },
              },
            },
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
        },
      },
    },
    '/api/lms/cursos/stats': {
      get: {
        tags: ['LMS'],
        summary: 'Estatísticas do LMS',
        description: 'Retorna KPIs operacionais do LMS para gestores e administradores.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'KPIs do LMS',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/LmsStats' },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
        },
      },
    },
    '/api/lms/cursos/{id}': {
      get: {
        tags: ['LMS'],
        summary: 'Detalhar curso LMS',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': {
            description: 'Curso LMS encontrado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/LmsCurso' },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
          '404': { description: 'Curso não encontrado' },
        },
      },
      put: {
        tags: ['LMS'],
        summary: 'Atualizar curso LMS',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LmsCursoUpdateInput' },
            },
          },
        },
        responses: {
          '200': { description: 'Curso atualizado' },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Curso não encontrado' },
        },
      },
      delete: {
        tags: ['LMS'],
        summary: 'Excluir curso LMS',
        description: 'Realiza exclusão lógica do curso.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Curso removido' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Curso não encontrado' },
        },
      },
    },
    '/api/lms/matriculas': {
      post: {
        tags: ['LMS'],
        summary: 'Criar matrícula LMS',
        description:
          'Matrícula individual. Usuário comum só pode matricular a si mesmo; gestores podem matricular terceiros.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LmsMatriculaInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Matrícula criada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/LmsMatricula' },
                  },
                },
              },
            },
          },
          '200': { description: 'Matrícula cancelada previamente e reativada' },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Curso ou funcionário não encontrado' },
          '409': { description: 'Funcionário já matriculado' },
        },
      },
    },
    '/api/lms/matriculas/minhas': {
      get: {
        tags: ['LMS'],
        summary: 'Listar minhas matrículas LMS',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Matrículas do usuário autenticado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/LmsMatricula' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
        },
      },
    },
    '/api/lms/matriculas/lote': {
      post: {
        tags: ['LMS'],
        summary: 'Criar matrículas em lote',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LmsMatriculaLoteInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Processamento do lote concluído',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        criadas: { type: 'integer', example: 10 },
                        ignoradas: { type: 'integer', example: 2 },
                        erros: { type: 'integer', example: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Curso ou funcionários não encontrados' },
        },
      },
    },
    '/api/lms/matriculas/curso/{curso_id}': {
      get: {
        tags: ['LMS'],
        summary: 'Listar matrículas por curso',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'curso_id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
        ],
        responses: {
          '200': {
            description: 'Matrículas do curso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/LmsMatricula' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
        },
      },
    },
    '/api/lms/matriculas/{id}': {
      get: {
        tags: ['LMS'],
        summary: 'Detalhar matrícula LMS',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': {
            description: 'Matrícula encontrada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/LmsMatriculaDetalhe' },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Matrícula não encontrada' },
        },
      },
      delete: {
        tags: ['LMS'],
        summary: 'Cancelar matrícula LMS',
        description: 'Realiza cancelamento lógico da matrícula e registra auditoria.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Matrícula cancelada' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Matrícula não encontrada' },
        },
      },
    },
    '/api/lms/matriculas/{id}/status': {
      patch: {
        tags: ['LMS'],
        summary: 'Atualizar status de matrícula LMS',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO', 'CANCELADO'],
                  },
                  observacoes: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Status atualizado' },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Matrícula não encontrada' },
        },
      },
    },
    '/api/lms/matriculas/scorm/commit': {
      post: {
        tags: ['LMS'],
        summary: 'Persistir progresso SCORM',
        description:
          'Recebe commit SCORM 1.2 ou 2004, atualiza progresso da matrícula e pode gerar qualificação automática.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LmsScormCommitInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Commit processado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        matricula_id: { type: 'integer' },
                        novo_status: { type: 'string' },
                        progresso_pct: { type: 'integer' },
                        qualificacao_gerada: {
                          type: 'object',
                          nullable: true,
                          properties: {
                            qualificacao_id: { type: 'integer' },
                            qualificacao_historico_id: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Matrícula não encontrada' },
        },
      },
    },
    '/api/lms/scorm/state/{matriculaId}': {
      get: {
        tags: ['LMS'],
        summary: 'Obter estado SCORM salvo',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'matriculaId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Estado SCORM da matrícula',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/LmsScormState' },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Matrícula não encontrada' },
        },
      },
    },
    '/api/lms/xapi/statements': {
      post: {
        tags: ['LMS'],
        summary: 'Persistir statement xAPI',
        description:
          'Recebe statement xAPI, atualiza progresso da matrícula H5P e pode gerar qualificação automática.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LmsXapiStatementInput' },
            },
          },
        },
        responses: {
          '201': { description: 'Statement salvo' },
          '400': { description: 'Statement inválido' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Matrícula não encontrada' },
        },
      },
    },
    '/api/lms/xapi/statements/{matriculaId}': {
      get: {
        tags: ['LMS'],
        summary: 'Listar statements xAPI de uma matrícula',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'matriculaId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
        ],
        responses: {
          '200': { description: 'Statements encontrados' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Matrícula não encontrada' },
        },
      },
    },
    '/api/lms/assets/session': {
      post: {
        tags: ['LMS'],
        summary: 'Abrir sessão curta de assets LMS',
        description:
          'Emite cookie efêmero para carregamento de assets protegidos de SCORM e H5P em iframes.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Sessão de assets ativada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        active: { type: 'boolean', example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Funcionario: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nome: { type: 'string' },
          cpf: { type: 'string' },
          email: { type: 'string' },
          funcao: { type: 'string' },
          setor: { type: 'string' },
          status: { type: 'string', enum: ['ativo', 'inativo'] },
          data_admissao: { type: 'string', format: 'date' },
        },
      },
      FuncionarioInput: {
        type: 'object',
        required: ['nome', 'cpf'],
        properties: {
          nome: { type: 'string', minLength: 3 },
          cpf: { type: 'string', pattern: '^[0-9]{11}$' },
          email: { type: 'string', format: 'email' },
          funcao_id: { type: 'integer' },
          setor_id: { type: 'integer' },
          data_admissao: { type: 'string', format: 'date' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      LmsCurso: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          empresa_id: { type: 'integer' },
          titulo: { type: 'string' },
          descricao: { type: 'string', nullable: true },
          categoria: { type: 'string', nullable: true },
          idioma: { type: 'string', example: 'pt-BR' },
          tipo_conteudo: { type: 'string', enum: ['scorm', 'h5p', 'video'] },
          scorm_versao: { type: 'string', nullable: true, enum: ['1.2', '2004'] },
          scorm_mastery_score: { type: 'integer', nullable: true },
          scorm_launch_file: { type: 'string', nullable: true },
          scorm_package_r2_prefix: { type: 'string', nullable: true },
          qualificacao_tipo_id: { type: 'integer', nullable: true },
          qualificacao_tipo_nome: { type: 'string', nullable: true },
          qualificacao_tipo_codigo: { type: 'string', nullable: true },
          gerar_qualificacao_ao_concluir: { type: 'integer', enum: [0, 1] },
          publicado: { type: 'integer', enum: [0, 1] },
          ativo: { type: 'integer', enum: [0, 1] },
          carga_horaria_minutos: { type: 'integer', nullable: true },
          carga_horaria_inicial_horas: { type: 'number', nullable: true },
          carga_horaria_recorrente_horas: { type: 'number', nullable: true },
          conteudo_programatico: { type: 'string', nullable: true },
          observacoes: { type: 'string', nullable: true },
          thumbnail_r2_key: { type: 'string', nullable: true },
          total_matriculas: { type: 'integer', nullable: true },
          total_concluidos: { type: 'integer', nullable: true },
          created_at: { type: 'string', format: 'date-time', nullable: true },
          updated_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      LmsCursoInput: {
        type: 'object',
        required: ['titulo'],
        properties: {
          titulo: { type: 'string', minLength: 2, maxLength: 255 },
          descricao: { type: 'string', nullable: true },
          categoria: { type: 'string', nullable: true },
          carga_horaria_minutos: { type: 'integer', minimum: 0, default: 0 },
          conteudo_programatico: { type: 'string', nullable: true },
          observacoes: { type: 'string', nullable: true },
          carga_horaria_inicial_horas: { type: 'number', nullable: true, minimum: 0 },
          carga_horaria_recorrente_horas: { type: 'number', nullable: true, minimum: 0 },
          idioma: { type: 'string', default: 'pt-BR' },
          tipo_conteudo: { type: 'string', enum: ['scorm', 'h5p', 'video'], default: 'scorm' },
          scorm_versao: { type: 'string', nullable: true, enum: ['1.2', '2004'] },
          scorm_mastery_score: { type: 'integer', minimum: 0, maximum: 100, default: 70 },
          qualificacao_tipo_id: { type: 'integer', nullable: true },
          gerar_qualificacao_ao_concluir: { type: 'integer', enum: [0, 1], default: 0 },
          publicado: { type: 'integer', enum: [0, 1], default: 0 },
        },
      },
      LmsCursoUpdateInput: {
        type: 'object',
        properties: {
          titulo: { type: 'string', minLength: 2, maxLength: 255 },
          descricao: { type: 'string', nullable: true },
          categoria: { type: 'string', nullable: true },
          carga_horaria_minutos: { type: 'integer', minimum: 0 },
          conteudo_programatico: { type: 'string', nullable: true },
          observacoes: { type: 'string', nullable: true },
          carga_horaria_inicial_horas: { type: 'number', nullable: true, minimum: 0 },
          carga_horaria_recorrente_horas: { type: 'number', nullable: true, minimum: 0 },
          idioma: { type: 'string' },
          tipo_conteudo: { type: 'string', enum: ['scorm', 'h5p', 'video'] },
          scorm_versao: { type: 'string', nullable: true, enum: ['1.2', '2004'] },
          scorm_mastery_score: { type: 'integer', minimum: 0, maximum: 100 },
          qualificacao_tipo_id: { type: 'integer', nullable: true },
          gerar_qualificacao_ao_concluir: { type: 'integer', enum: [0, 1] },
          publicado: { type: 'integer', enum: [0, 1] },
          ativo: { type: 'integer', enum: [0, 1] },
          version_tag: { type: 'string', nullable: true },
        },
      },
      LmsMatricula: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          empresa_id: { type: 'integer' },
          curso_id: { type: 'integer' },
          funcionario_id: { type: 'integer' },
          funcionario_nome: { type: 'string', nullable: true },
          funcionario_matricula: { type: 'string', nullable: true },
          titulo: { type: 'string', nullable: true },
          categoria: { type: 'string', nullable: true },
          tipo_conteudo: { type: 'string', nullable: true, enum: ['scorm', 'h5p', 'video'] },
          status: {
            type: 'string',
            enum: ['NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO', 'CANCELADO'],
          },
          progresso_pct: { type: 'integer', nullable: true },
          score_final: { type: 'number', nullable: true },
          data_matricula: { type: 'string', format: 'date-time', nullable: true },
          data_inicio: { type: 'string', format: 'date-time', nullable: true },
          data_conclusao: { type: 'string', nullable: true },
          data_expiracao: { type: 'string', nullable: true },
          observacoes: { type: 'string', nullable: true },
          tentativas: { type: 'integer', nullable: true },
          qualificacao_historico_id: { type: 'integer', nullable: true },
          thumbnail_r2_key: { type: 'string', nullable: true },
          scorm_versao: { type: 'string', nullable: true, enum: ['1.2', '2004'] },
          publicado: { type: 'integer', nullable: true, enum: [0, 1] },
          created_at: { type: 'string', format: 'date-time', nullable: true },
          updated_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      LmsMatriculaDetalhe: {
        allOf: [
          { $ref: '#/components/schemas/LmsMatricula' },
          {
            type: 'object',
            properties: {
              scorm_progresso: { type: 'object', nullable: true, additionalProperties: true },
              xapi_summary: {
                type: 'object',
                nullable: true,
                properties: {
                  total_statements: { type: 'integer' },
                  last_verb: { type: 'string', nullable: true },
                  last_timestamp: { type: 'string', nullable: true },
                },
              },
            },
          },
        ],
      },
      LmsMatriculaInput: {
        type: 'object',
        required: ['funcionario_id', 'curso_id'],
        properties: {
          funcionario_id: { type: 'integer', minimum: 1 },
          curso_id: { type: 'integer', minimum: 1 },
          data_expiracao: { type: 'string', nullable: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          observacoes: { type: 'string', nullable: true },
        },
      },
      LmsMatriculaLoteInput: {
        type: 'object',
        required: ['funcionario_ids', 'curso_id'],
        properties: {
          funcionario_ids: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: { type: 'integer', minimum: 1 },
          },
          curso_id: { type: 'integer', minimum: 1 },
          data_expiracao: { type: 'string', nullable: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          observacoes: { type: 'string', nullable: true },
        },
      },
      LmsScormCommitInput: {
        type: 'object',
        required: ['matricula_id'],
        properties: {
          matricula_id: { type: 'integer', minimum: 1 },
          lesson_status: { type: 'string', nullable: true },
          completion_status: { type: 'string', nullable: true },
          success_status: { type: 'string', nullable: true },
          score_raw: { type: 'number', nullable: true },
          score_max: { type: 'number', nullable: true },
          score_min: { type: 'number', nullable: true },
          score_scaled: { type: 'number', nullable: true },
          session_time: { type: 'string', nullable: true },
          total_time: { type: 'string', nullable: true },
          suspend_data: { type: 'string', nullable: true, maxLength: 65535 },
          launch_data: { type: 'string', nullable: true },
          cmi_json: { type: 'string', nullable: true },
        },
      },
      LmsScormState: {
        type: 'object',
        properties: {
          matricula_id: { type: 'integer' },
          status: { type: 'string' },
          progresso: { type: 'object', nullable: true, additionalProperties: true },
        },
      },
      LmsXapiStatementInput: {
        type: 'object',
        required: ['matricula_id', 'actor', 'verb', 'object'],
        properties: {
          matricula_id: { type: 'integer', minimum: 1 },
          actor: { type: 'object', additionalProperties: true },
          verb: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', format: 'uri' },
              display: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
          object: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' },
              objectType: { type: 'string' },
              definition: { type: 'object', additionalProperties: true },
            },
          },
          result: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              completion: { type: 'boolean' },
              duration: { type: 'string' },
              response: { type: 'string' },
              score: {
                type: 'object',
                properties: {
                  raw: { type: 'number' },
                  max: { type: 'number' },
                  min: { type: 'number' },
                  scaled: { type: 'number', minimum: -1, maximum: 1 },
                },
              },
            },
          },
          context: { type: 'object', additionalProperties: true },
          timestamp: { type: 'string' },
        },
      },
      LmsStats: {
        type: 'object',
        properties: {
          cursos_ativos: { type: 'integer' },
          total_cursos: { type: 'integer' },
          cursos_publicados: { type: 'integer' },
          total_alunos: { type: 'integer' },
          total_matriculados: { type: 'integer' },
          total_matriculas: { type: 'integer' },
          concluidas: { type: 'integer' },
          em_andamento: { type: 'integer' },
          nao_iniciadas: { type: 'integer' },
          qualificacoes_geradas: { type: 'integer' },
          taxa_conclusao_pct: { type: 'integer' },
          top_cursos: { type: 'array', items: { type: 'object', additionalProperties: true } },
          atrasadas: { type: 'array', items: { type: 'object', additionalProperties: true } },
          recent_completions: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          featured_courses: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
          code: { type: 'string' },
        },
      },
    },
  },
};

/**
 * HTML para visualização Swagger UI
 */
export function getSwaggerHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>AirTrust API - Documentação</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
}
