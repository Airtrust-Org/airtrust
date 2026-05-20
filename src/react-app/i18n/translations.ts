export type SupportedLanguage = 'pt-BR' | 'en-US';

export type TranslationKey =
  | 'common.loading'
  | 'auth.login.title'
  | 'auth.login.email'
  | 'auth.login.password'
  | 'auth.login.submit'
  | 'auth.login.submitting'
  | 'auth.login.forgotPassword'
  | 'auth.login.error'
  | 'layout.nav.dashboard'
  | 'layout.nav.employees'
  | 'layout.nav.qualifications'
  | 'layout.nav.simulators'
  | 'layout.nav.escalas'
  | 'layout.nav.frms'
  | 'layout.actions.settings'
  | 'layout.actions.switchCompanySuccess'
  | 'layout.actions.switchCompanyError'
  | 'layout.mobile.systemName'
  | 'layout.mobile.activeCompany'
  | 'layout.mobile.notifications'
  | 'layout.mobile.logout'
  | 'layout.user.default'
  | 'layout.aria.logoHome'
  | 'layout.aria.menu'
  | 'settings.system.language.label'
  | 'settings.system.language.auto'
  | 'settings.system.language.ptBr'
  | 'settings.system.language.enUs'
  | 'settings.system.language.help'
  | 'settings.system.language.changed'
  | 'invite.createPassword.title'
  | 'invite.createPassword.validating'
  | 'invite.createPassword.inviteFor'
  | 'invite.createPassword.newPassword'
  | 'invite.createPassword.confirmPassword'
  | 'invite.createPassword.placeholder.password'
  | 'invite.createPassword.placeholder.confirm'
  | 'invite.createPassword.submitting'
  | 'invite.createPassword.submit'
  | 'invite.error.missingToken'
  | 'invite.error.invalidOrExpired'
  | 'invite.error.validationFailed'
  | 'invite.error.minPassword'
  | 'invite.error.passwordMismatch'
  | 'invite.error.acceptFailed'
  | 'invite.error.acceptGeneric'
  | 'invite.success.passwordCreated'
  | 'protected.loading'
  | 'protected.denied.title'
  | 'protected.denied.description'
  | 'protected.denied.backHome'
  | 'settings.page.title'
  | 'settings.page.subtitle'
  | 'settings.tab.companies'
  | 'settings.tab.users'
  | 'settings.tab.registry'
  | 'settings.tab.backup'
  | 'settings.tab.imports'
  | 'settings.tab.integrations'
  | 'settings.tab.system'
  | 'settings.tab.dangerZone'
  | 'settings.import.title'
  | 'settings.import.subtitle'
  | 'settings.system.loadError'
  | 'settings.system.companyMissing'
  | 'settings.system.fileMustBeImage'
  | 'settings.system.fileTooLarge'
  | 'settings.system.fileConvertedTooLarge'
  | 'settings.system.uploadNoUrl'
  | 'settings.system.uploadSuccess'
  | 'settings.system.uploadError'
  | 'settings.system.saveSuccess'
  | 'settings.system.saveError'
  | 'settings.system.resetWarning'
  | 'settings.system.resetSuccess'
  | 'settings.system.loading'
  | 'settings.system.section.title'
  | 'settings.system.appName.label'
  | 'settings.system.appName.help'
  | 'settings.system.pageSize.label'
  | 'settings.system.pageSize.help'
  | 'settings.system.pageSize.20'
  | 'settings.system.pageSize.50'
  | 'settings.system.pageSize.100'
  | 'settings.system.compactHeader.label'
  | 'settings.system.compactHeader.help'
  | 'settings.system.animations.label'
  | 'settings.system.animations.help'
  | 'settings.system.branding.title'
  | 'settings.system.logo.title'
  | 'settings.system.logo.help'
  | 'settings.system.logo.upload'
  | 'settings.system.logo.previewAlt'
  | 'settings.system.logo.none'
  | 'settings.system.favicon.title'
  | 'settings.system.favicon.help'
  | 'settings.system.favicon.upload'
  | 'settings.system.favicon.previewAlt'
  | 'settings.system.favicon.none'
  | 'settings.system.saveButton'
  | 'settings.system.savingButton'
  | 'settings.system.resetButton'
  | 'settings.companies.loadError'
  | 'settings.companies.deleteSuccess'
  | 'settings.companies.deleteError'
  | 'settings.companies.title'
  | 'settings.companies.subtitle'
  | 'settings.companies.new'
  | 'settings.companies.status.active'
  | 'settings.companies.status.inactive'
  | 'settings.companies.cnpj'
  | 'settings.companies.notInformed'
  | 'settings.companies.plan'
  | 'settings.companies.usersLimit'
  | 'settings.companies.storage'
  | 'settings.companies.edit'
  | 'settings.companies.delete'
  | 'settings.companies.empty.title'
  | 'settings.companies.empty.subtitle'
  | 'settings.companies.modal.editTitle'
  | 'settings.companies.modal.createTitle'
  | 'settings.companies.deleteConfirm.title'
  | 'settings.companies.deleteConfirm.question'
  | 'settings.companies.deleteConfirm.warning'
  | 'common.cancel'
  | 'sim.calendar.title'
  | 'sim.calendar.subtitle'
  | 'sim.calendar.today'
  | 'sim.calendar.scheduled'
  | 'sim.calendar.completed'
  | 'sim.calendar.searchPlaceholder'
  | 'sim.calendar.status.all'
  | 'sim.calendar.status.scheduled'
  | 'sim.calendar.status.inProgress'
  | 'sim.calendar.status.completed'
  | 'sim.calendar.status.canceled'
  | 'sim.calendar.instructor.all'
  | 'sim.calendar.filters.clear'
  | 'sim.calendar.view.monthly'
  | 'sim.calendar.view.weekly'
  | 'sim.calendar.view.agenda'
  | 'sim.calendar.nav.prevMonth'
  | 'sim.calendar.nav.nextMonth'
  | 'sim.calendar.agenda.noEventsInDay'
  | 'sim.calendar.agenda.emptyTitle'
  | 'sim.calendar.agenda.emptySubtitle'
  | 'sim.calendar.card.participants'
  | 'sim.calendar.card.instructor'
  | 'sim.calendar.card.examiner'
  | 'sim.calendar.card.sessionsCount'
  | 'sim.calendar.card.na'
  | 'sim.calendar.loading'
  | 'sim.calendar.nextSchedules'
  | 'settings.users.title'
  | 'settings.users.subtitle'
  | 'settings.users.activeCompanyTitle'
  | 'settings.users.inviteButton'
  | 'settings.users.table.user'
  | 'settings.users.table.email'
  | 'settings.users.table.profile'
  | 'settings.users.table.actions'
  | 'settings.users.table.loading'
  | 'settings.users.table.empty'
  | 'settings.users.role.manager'
  | 'settings.users.role.instructor'
  | 'settings.users.role.student'
  | 'settings.users.role.admin'
  | 'settings.users.role.viewer'
  | 'settings.users.action.edit'
  | 'settings.users.action.removeAccess'
  | 'settings.users.inviteModal.title'
  | 'settings.users.inviteModal.availableCompanies'
  | 'settings.users.inviteModal.noCompanies'
  | 'settings.users.inviteModal.fullName'
  | 'settings.users.inviteModal.profile'
  | 'settings.users.inviteModal.modules'
  | 'settings.users.inviteModal.sending'
  | 'settings.users.inviteModal.submit'
  | 'settings.users.inviteModal.namePlaceholder'
  | 'settings.users.inviteModal.emailPlaceholder'
  | 'settings.users.editModal.title'
  | 'settings.users.editModal.companies'
  | 'settings.users.editModal.noCompanies'
  | 'settings.users.editModal.profile'
  | 'settings.users.editModal.modules'
  | 'settings.users.editModal.saving'
  | 'settings.users.editModal.save'
  | 'settings.users.roleOption.manager'
  | 'settings.users.roleOption.instructor'
  | 'settings.users.roleOption.student'
  | 'settings.users.roleOption.viewer'
  | 'settings.users.error.loadList'
  | 'settings.users.error.selectOneCompany'
  | 'settings.users.error.inviteUser'
  | 'settings.users.error.inviteProcess'
  | 'settings.users.error.selectCompany'
  | 'settings.users.error.removeUser'
  | 'settings.users.error.loadAccess'
  | 'settings.users.error.loadEditData'
  | 'settings.users.error.updateAccess'
  | 'settings.users.error.saveChanges'
  | 'settings.users.success.userRemoved'
  | 'settings.users.success.accessUpdated'
  | 'settings.users.confirm.removeUser'
  | 'settings.users.module.panel'
  | 'settings.users.module.employees'
  | 'settings.users.module.qualifications'
  | 'settings.users.module.simulators'
  | 'settings.users.module.frms'
  | 'settings.users.module.settings'
  | 'settings.integrations.edapp.error.loadStatus'
  | 'settings.integrations.edapp.error.createWebhook'
  | 'settings.integrations.edapp.error.removeWebhook'
  | 'settings.integrations.edapp.error.add'
  | 'settings.integrations.edapp.error.remove'
  | 'settings.integrations.edapp.error.sync'
  | 'settings.integrations.edapp.success.webhookCreated'
  | 'settings.integrations.edapp.success.webhookRemoved'
  | 'settings.integrations.edapp.success.userMapped'
  | 'settings.integrations.edapp.success.courseMapped'
  | 'settings.integrations.edapp.success.removed'
  | 'settings.integrations.edapp.success.syncCompleted'
  | 'settings.integrations.edapp.confirm.createWebhook'
  | 'settings.integrations.edapp.confirm.removeWebhook'
  | 'settings.integrations.edapp.confirm.removeMapping'
  | 'settings.integrations.edapp.confirm.removeCourseMapping'
  | 'settings.integrations.edapp.confirm.sync'
  | 'settings.integrations.edapp.loading'
  | 'settings.integrations.edapp.title'
  | 'settings.integrations.edapp.subtitle'
  | 'settings.integrations.edapp.syncButton'
  | 'settings.integrations.edapp.tab.status'
  | 'settings.integrations.edapp.tab.users'
  | 'settings.integrations.edapp.tab.courses'
  | 'settings.integrations.edapp.webhook.title'
  | 'settings.integrations.edapp.webhook.active'
  | 'settings.integrations.edapp.webhook.id'
  | 'settings.integrations.edapp.webhook.updatedAt'
  | 'settings.integrations.edapp.webhook.remove'
  | 'settings.integrations.edapp.webhook.notConfigured'
  | 'settings.integrations.edapp.webhook.createAuto'
  | 'settings.integrations.edapp.stats.receivedEvents'
  | 'settings.integrations.edapp.stats.processed'
  | 'settings.integrations.edapp.stats.errors'
  | 'settings.integrations.edapp.stats.lastEvent'
  | 'settings.integrations.edapp.stats.none'
  | 'settings.integrations.edapp.stats.mappedUsers'
  | 'settings.integrations.edapp.stats.mappedCourses'
  | 'settings.integrations.edapp.users.title'
  | 'settings.integrations.edapp.users.activeMappings'
  | 'settings.integrations.edapp.users.add'
  | 'settings.integrations.edapp.users.table.employee'
  | 'settings.integrations.edapp.users.table.actions'
  | 'settings.integrations.edapp.courses.title'
  | 'settings.integrations.edapp.courses.activeMappings'
  | 'settings.integrations.edapp.courses.add'
  | 'settings.integrations.edapp.courses.table.course'
  | 'settings.integrations.edapp.courses.table.courseId'
  | 'settings.integrations.edapp.courses.table.qualification'
  | 'settings.integrations.edapp.courses.table.actions'
  | 'settings.integrations.edapp.action.remove'
  | 'settings.integrations.edapp.modal.user.title'
  | 'settings.integrations.edapp.modal.user.employeeId'
  | 'settings.integrations.edapp.modal.user.userId'
  | 'settings.integrations.edapp.modal.user.emailOptional'
  | 'settings.integrations.edapp.modal.course.title'
  | 'settings.integrations.edapp.modal.course.courseId'
  | 'settings.integrations.edapp.modal.course.courseName'
  | 'settings.integrations.edapp.modal.course.qualificationCode'
  | 'settings.integrations.edapp.modal.course.qualificationPlaceholder'
  | 'settings.integrations.edapp.button.save'
  | 'settings.registry.title'
  | 'settings.registry.subtitle'
  | 'settings.hardRefresh.title'
  | 'settings.hardRefresh.subtitle'
  | 'settings.hardRefresh.whenUse'
  | 'settings.hardRefresh.item1'
  | 'settings.hardRefresh.item2'
  | 'settings.hardRefresh.item3'
  | 'settings.backup.title'
  | 'settings.backup.subtitle'
  | 'settings.backup.createManual'
  | 'settings.backup.stats.total'
  | 'settings.backup.stats.completed'
  | 'settings.backup.stats.totalSize'
  | 'settings.backup.stats.lastBackup'
  | 'settings.backup.stats.na'
  | 'settings.backup.history.title'
  | 'settings.backup.history.loading'
  | 'settings.backup.history.empty'
  | 'settings.backup.table.status'
  | 'settings.backup.table.type'
  | 'settings.backup.table.createdAt'
  | 'settings.backup.table.records'
  | 'settings.backup.table.size'
  | 'settings.backup.table.duration'
  | 'settings.backup.table.retention'
  | 'settings.backup.table.actions'
  | 'settings.backup.actions.details'
  | 'settings.backup.actions.download'
  | 'settings.backup.actions.restore'
  | 'settings.backup.actions.remove'
  | 'settings.backup.actions.close'
  | 'settings.backup.logs.title'
  | 'settings.backup.logs.records'
  | 'settings.backup.modal.create.title'
  | 'settings.backup.modal.create.type'
  | 'settings.backup.modal.create.type.full'
  | 'settings.backup.modal.create.type.modular'
  | 'settings.backup.modal.create.type.incremental'
  | 'settings.backup.modal.create.modules'
  | 'settings.backup.modal.create.retention'
  | 'settings.backup.modal.create.retention.30days'
  | 'settings.backup.modal.create.retention.1year'
  | 'settings.backup.modal.create.retention.7years'
  | 'settings.backup.modal.create.description'
  | 'settings.backup.modal.create.descriptionPlaceholder'
  | 'settings.backup.modal.create.submit'
  | 'settings.backup.modal.restore.title'
  | 'settings.backup.modal.restore.warning1'
  | 'settings.backup.modal.restore.warning2'
  | 'settings.backup.modal.restore.modules'
  | 'settings.backup.modal.restore.submit'
  | 'settings.backup.confirm.restore'
  | 'settings.backup.confirm.remove'
  | 'settings.backup.alert.createSuccess'
  | 'settings.backup.alert.createError'
  | 'settings.backup.alert.restoreSuccess'
  | 'settings.backup.alert.restoreError'
  | 'settings.backup.alert.removeSuccess'
  | 'settings.backup.alert.removeError'
  | 'settings.backup.alert.downloadError'
  | 'settings.backup.alert.errorPrefix'
  | 'settings.backup.alert.restoreErrorPrefix'
  | 'settings.danger.clean.title'
  | 'settings.danger.clean.subtitle'
  | 'settings.danger.clean.bannerTitle'
  | 'settings.danger.clean.bannerLine1'
  | 'settings.danger.clean.bannerLine2'
  | 'settings.danger.clean.bannerLine3'
  | 'settings.danger.clean.clearButton'
  | 'settings.danger.clean.modal.title'
  | 'settings.danger.clean.modal.removing'
  | 'settings.danger.clean.modal.records'
  | 'settings.danger.clean.modal.checkbox'
  | 'settings.danger.clean.modal.inputLabel'
  | 'settings.danger.clean.modal.inputPlaceholder'
  | 'settings.danger.clean.modal.confirm'
  | 'settings.danger.clean.modal.processing'
  | 'settings.danger.clean.toast.confirmSteps'
  | 'settings.danger.clean.toast.errorPrefix'
  | 'settings.danger.clean.toast.errorClean'
  | 'settings.danger.level.low'
  | 'settings.danger.level.medium'
  | 'settings.danger.level.high'
  | 'settings.danger.level.critical'
  | 'settings.danger.module.qualifications.name'
  | 'settings.danger.module.qualifications.desc'
  | 'settings.danger.module.imports.name'
  | 'settings.danger.module.imports.desc'
  | 'settings.danger.module.trainingCatalog.name'
  | 'settings.danger.module.trainingCatalog.desc'
  | 'settings.danger.module.roles.name'
  | 'settings.danger.module.roles.desc'
  | 'settings.danger.module.aircraft.name'
  | 'settings.danger.module.aircraft.desc'
  | 'settings.danger.module.sectors.name'
  | 'settings.danger.module.sectors.desc'
  | 'settings.danger.module.audit.name'
  | 'settings.danger.module.audit.desc'
  | 'settings.danger.module.employees.name'
  | 'settings.danger.module.employees.desc'
  | 'settings.danger.module.clearAll.name'
  | 'settings.danger.module.clearAll.desc';

type TranslationMap = Record<SupportedLanguage, Record<TranslationKey, string>>;

export const translations: TranslationMap = {
  'pt-BR': {
    'common.loading': 'Carregando...',
    'auth.login.title': 'Entrar',
    'auth.login.email': 'E-mail',
    'auth.login.password': 'Senha',
    'auth.login.submit': 'Entrar',
    'auth.login.submitting': 'Entrando...',
    'auth.login.forgotPassword': 'Esqueceu sua senha?',
    'auth.login.error': 'Erro ao fazer login',
    'layout.nav.dashboard': 'Painel',
    'layout.nav.employees': 'Funcionários',
    'layout.nav.qualifications': 'Qualificações',
    'layout.nav.simulators': 'Simuladores',
    'layout.nav.escalas': 'Escala',
    'layout.nav.frms': 'FRMS',
    'layout.actions.settings': 'Configurações',
    'layout.actions.switchCompanySuccess': 'Empresa ativa alterada com sucesso.',
    'layout.actions.switchCompanyError': 'Falha ao trocar empresa.',
    'layout.mobile.systemName': 'Sistema AirTrust',
    'layout.mobile.activeCompany': 'Empresa ativa',
    'layout.mobile.notifications': 'Notificações',
    'layout.mobile.logout': 'Sair',
    'layout.user.default': 'Usuário',
    'layout.aria.logoHome': 'Voltar para página principal',
    'layout.aria.menu': 'Menu',
    'settings.system.language.label': 'Idioma',
    'settings.system.language.auto': 'Automático (localização)',
    'settings.system.language.ptBr': 'Português (Brasil)',
    'settings.system.language.enUs': 'English (United States)',
    'settings.system.language.help':
      'Automático segue sua localização. Ao escolher um idioma, ele permanece fixo.',
    'settings.system.language.changed': 'Idioma atualizado com sucesso.',
    'invite.createPassword.title': 'Criar senha de acesso',
    'invite.createPassword.validating': 'Validando convite...',
    'invite.createPassword.inviteFor': 'Convite para',
    'invite.createPassword.newPassword': 'Nova senha',
    'invite.createPassword.confirmPassword': 'Confirmar senha',
    'invite.createPassword.placeholder.password': 'Mínimo 8 caracteres',
    'invite.createPassword.placeholder.confirm': 'Repita a senha',
    'invite.createPassword.submitting': 'Salvando...',
    'invite.createPassword.submit': 'Criar senha',
    'invite.error.missingToken': 'Token de convite ausente.',
    'invite.error.invalidOrExpired': 'Convite inválido ou expirado.',
    'invite.error.validationFailed': 'Não foi possível validar o convite.',
    'invite.error.minPassword': 'A senha deve ter no mínimo 8 caracteres.',
    'invite.error.passwordMismatch': 'As senhas não conferem.',
    'invite.error.acceptFailed': 'Não foi possível concluir o convite.',
    'invite.error.acceptGeneric': 'Erro ao concluir convite. Tente novamente.',
    'invite.success.passwordCreated': 'Senha criada com sucesso. Redirecionando para o login...',
    'protected.loading': 'Carregando...',
    'protected.denied.title': 'Acesso Negado',
    'protected.denied.description': 'Você não tem permissão para acessar esta página.',
    'protected.denied.backHome': 'Voltar ao Início',
    'settings.page.title': 'Configurações',
    'settings.page.subtitle': 'Gerencie as configurações do sistema e da sua organização',
    'settings.tab.companies': 'Empresas',
    'settings.tab.users': 'Usuários',
    'settings.tab.registry': 'Cadastros',
    'settings.tab.backup': 'Backup',
    'settings.tab.imports': 'Importações e Exportações',
    'settings.tab.integrations': 'Integrações',
    'settings.tab.system': 'Sistema',
    'settings.tab.dangerZone': 'Zona de Perigo',
    'settings.import.title': 'Importações e Exportações',
    'settings.import.subtitle':
      'Centralize cargas, templates, exportações CSV e atalhos para fluxos especializados',
    'settings.system.loadError': 'Não foi possível carregar configurações globais do sistema.',
    'settings.system.companyMissing':
      'Empresa não identificada. Recarregue a página e tente novamente.',
    'settings.system.fileMustBeImage': 'deve ser um arquivo de imagem.',
    'settings.system.fileTooLarge': 'excede o limite de',
    'settings.system.fileConvertedTooLarge': 'convertido excedeu',
    'settings.system.uploadNoUrl': 'Upload sem URL de retorno.',
    'settings.system.uploadSuccess': 'carregado com sucesso.',
    'settings.system.uploadError': 'Falha ao carregar',
    'settings.system.saveSuccess': 'Configurações do sistema salvas.',
    'settings.system.saveError': 'Erro ao salvar configurações.',
    'settings.system.resetWarning':
      'Padrão aplicado localmente, mas não foi possível sincronizar no servidor.',
    'settings.system.resetSuccess': 'Configurações restauradas para o padrão.',
    'settings.system.loading': 'Carregando configurações...',
    'settings.system.section.title': 'Configurações do Sistema',
    'settings.system.appName.label': 'Nome da Aplicação',
    'settings.system.appName.help': 'Atualiza o título da aba no navegador.',
    'settings.system.pageSize.label': 'Paginação padrão',
    'settings.system.pageSize.help': 'Preferência global para tabelas compatíveis.',
    'settings.system.pageSize.20': '20 registros',
    'settings.system.pageSize.50': '50 registros',
    'settings.system.pageSize.100': '100 registros',
    'settings.system.compactHeader.label': 'Header compacto',
    'settings.system.compactHeader.help': 'Reduz altura do topo',
    'settings.system.animations.label': 'Animações',
    'settings.system.animations.help': 'Ativa transições visuais',
    'settings.system.branding.title': 'Identidade Visual (PNG)',
    'settings.system.logo.title': 'Logo do Sistema',
    'settings.system.logo.help':
      'Aceita imagens até {max} e converte automaticamente para PNG em 1024x320 px sem distorção',
    'settings.system.logo.upload': 'Upload logo',
    'settings.system.logo.previewAlt': 'Preview logo',
    'settings.system.logo.none': 'Nenhum logo personalizado',
    'settings.system.favicon.title': 'Favicon',
    'settings.system.favicon.help':
      'Aceita imagens até {max} e converte automaticamente para PNG em 512x512 px sem distorção',
    'settings.system.favicon.upload': 'Upload favicon',
    'settings.system.favicon.previewAlt': 'Preview favicon',
    'settings.system.favicon.none': 'Nenhum favicon personalizado',
    'settings.system.saveButton': 'Salvar alterações',
    'settings.system.savingButton': 'Salvando...',
    'settings.system.resetButton': 'Restaurar padrão',
    'settings.companies.loadError': 'Erro ao carregar empresas',
    'settings.companies.deleteSuccess': 'Empresa removida com sucesso!',
    'settings.companies.deleteError': 'Erro ao remover empresa',
    'settings.companies.title': 'Gestão de Empresas',
    'settings.companies.subtitle': 'Sistema multi-tenant - Administração central',
    'settings.companies.new': 'Nova Empresa',
    'settings.companies.status.active': 'Ativo',
    'settings.companies.status.inactive': 'Inativo',
    'settings.companies.cnpj': 'CNPJ',
    'settings.companies.notInformed': 'Não informado',
    'settings.companies.plan': 'Plano',
    'settings.companies.usersLimit': 'Limite Usuários',
    'settings.companies.storage': 'Storage',
    'settings.companies.edit': 'Editar',
    'settings.companies.delete': 'Excluir',
    'settings.companies.empty.title': 'Nenhuma empresa cadastrada',
    'settings.companies.empty.subtitle': 'Crie a primeira empresa para começar',
    'settings.companies.modal.editTitle': 'Editar Empresa',
    'settings.companies.modal.createTitle': 'Criar Nova Empresa',
    'settings.companies.deleteConfirm.title': 'Confirmar Exclusão',
    'settings.companies.deleteConfirm.question': 'Tem certeza que deseja excluir a empresa',
    'settings.companies.deleteConfirm.warning': 'Esta ação não pode ser desfeita.',
    'common.cancel': 'Cancelar',
    'sim.calendar.title': 'Agenda / Calendário',
    'sim.calendar.subtitle': 'Visualize e gerencie os agendamentos de simulador',
    'sim.calendar.today': 'Hoje',
    'sim.calendar.scheduled': 'Agendadas',
    'sim.calendar.completed': 'Concluídos',
    'sim.calendar.searchPlaceholder': 'Buscar por simulador, instrutor ou funcionário...',
    'sim.calendar.status.all': 'Todos os Status',
    'sim.calendar.status.scheduled': 'Agendada',
    'sim.calendar.status.inProgress': 'Em Andamento',
    'sim.calendar.status.completed': 'Concluída',
    'sim.calendar.status.canceled': 'Cancelada',
    'sim.calendar.instructor.all': 'Todos os Instrutores',
    'sim.calendar.filters.clear': 'Limpar',
    'sim.calendar.view.monthly': 'Mensal',
    'sim.calendar.view.weekly': 'Semanal',
    'sim.calendar.view.agenda': 'Agenda',
    'sim.calendar.nav.prevMonth': 'Mês anterior',
    'sim.calendar.nav.nextMonth': 'Próximo mês',
    'sim.calendar.agenda.noEventsInDay': 'Sem agendamentos',
    'sim.calendar.agenda.emptyTitle': 'Nenhum agendamento encontrado',
    'sim.calendar.agenda.emptySubtitle': 'Não há sessões agendadas para o período selecionado.',
    'sim.calendar.card.participants': 'Participantes',
    'sim.calendar.card.instructor': 'Instrutor',
    'sim.calendar.card.examiner': 'Examinador',
    'sim.calendar.card.sessionsCount': 'sessões',
    'sim.calendar.card.na': 'N/A',
    'sim.calendar.loading': 'Carregando...',
    'sim.calendar.nextSchedules': 'Próximos Agendamentos',
    'settings.users.title': 'Usuários e Permissões',
    'settings.users.subtitle': 'Gerencie quem tem acesso aos dados desta empresa.',
    'settings.users.activeCompanyTitle': 'Empresa ativa na gestão de usuários',
    'settings.users.inviteButton': 'Convidar Usuário',
    'settings.users.table.user': 'Usuário',
    'settings.users.table.email': 'Email',
    'settings.users.table.profile': 'Perfil',
    'settings.users.table.actions': 'Ações',
    'settings.users.table.loading': 'Carregando...',
    'settings.users.table.empty': 'Nenhum usuário encontrado.',
    'settings.users.role.manager': 'Gestor',
    'settings.users.role.instructor': 'Instrutor',
    'settings.users.role.student': 'Aluno',
    'settings.users.role.admin': 'Admin',
    'settings.users.role.viewer': 'Visualizador',
    'settings.users.action.edit': 'Editar usuário',
    'settings.users.action.removeAccess': 'Remover acesso',
    'settings.users.inviteModal.title': 'Convidar Usuário',
    'settings.users.inviteModal.availableCompanies': 'Empresas disponíveis para este usuário',
    'settings.users.inviteModal.noCompanies': 'Nenhuma empresa disponível para seleção.',
    'settings.users.inviteModal.fullName': 'Nome Completo',
    'settings.users.inviteModal.profile': 'Perfil de Acesso',
    'settings.users.inviteModal.modules': 'Módulos permitidos',
    'settings.users.inviteModal.sending': 'Enviando...',
    'settings.users.inviteModal.submit': 'Convidar',
    'settings.users.inviteModal.namePlaceholder': 'João Silva',
    'settings.users.inviteModal.emailPlaceholder': 'joao@exemplo.com',
    'settings.users.editModal.title': 'Editar usuário',
    'settings.users.editModal.companies': 'Empresas',
    'settings.users.editModal.noCompanies': 'Nenhuma empresa disponível para edição.',
    'settings.users.editModal.profile': 'Perfil',
    'settings.users.editModal.modules': 'Módulos permitidos',
    'settings.users.editModal.saving': 'Salvando...',
    'settings.users.editModal.save': 'Salvar alterações',
    'settings.users.roleOption.manager': 'Gestor (Acesso total à empresa)',
    'settings.users.roleOption.instructor': 'Instrutor (Fichas e Simuladores)',
    'settings.users.roleOption.student': 'Aluno (Assinar fichas)',
    'settings.users.roleOption.viewer': 'Visualizador (Apenas leitura)',
    'settings.users.error.loadList': 'Erro ao carregar lista de usuários',
    'settings.users.error.selectOneCompany': 'Selecione ao menos uma empresa',
    'settings.users.error.inviteUser': 'Erro ao convidar usuário',
    'settings.users.error.inviteProcess': 'Erro ao processar convite',
    'settings.users.error.selectCompany': 'Selecione uma empresa',
    'settings.users.error.removeUser': 'Erro ao remover usuário',
    'settings.users.error.loadAccess': 'Erro ao carregar acessos do usuário',
    'settings.users.error.loadEditData': 'Erro ao carregar dados para edição',
    'settings.users.error.updateAccess': 'Erro ao atualizar acessos',
    'settings.users.error.saveChanges': 'Erro ao salvar alterações',
    'settings.users.success.userRemoved': 'Usuário removido',
    'settings.users.success.accessUpdated': 'Acessos do usuário atualizados com sucesso',
    'settings.users.confirm.removeUser': 'Tem certeza que deseja remover este usuário da empresa?',
    'settings.users.module.panel': 'Painel',
    'settings.users.module.employees': 'Funcionários',
    'settings.users.module.qualifications': 'Qualificações',
    'settings.users.module.simulators': 'Simuladores',
    'settings.users.module.frms': 'FRMS',
    'settings.users.module.settings': 'Configurações',
    'settings.integrations.edapp.error.loadStatus': 'Erro ao carregar status',
    'settings.integrations.edapp.error.createWebhook': 'Erro ao criar webhook',
    'settings.integrations.edapp.error.removeWebhook': 'Erro ao remover webhook',
    'settings.integrations.edapp.error.add': 'Erro ao adicionar',
    'settings.integrations.edapp.error.remove': 'Erro ao remover',
    'settings.integrations.edapp.error.sync': 'Erro ao sincronizar',
    'settings.integrations.edapp.success.webhookCreated': 'Webhook criado no EdApp!',
    'settings.integrations.edapp.success.webhookRemoved': 'Webhook removido',
    'settings.integrations.edapp.success.userMapped': 'Usuário mapeado!',
    'settings.integrations.edapp.success.courseMapped': 'Curso mapeado!',
    'settings.integrations.edapp.success.removed': 'Removido',
    'settings.integrations.edapp.success.syncCompleted': 'Sincronização concluída!',
    'settings.integrations.edapp.confirm.createWebhook': 'Criar webhook no EdApp automaticamente?',
    'settings.integrations.edapp.confirm.removeWebhook': 'Remover webhook do EdApp?',
    'settings.integrations.edapp.confirm.removeMapping': 'Remover mapeamento?',
    'settings.integrations.edapp.confirm.removeCourseMapping': 'Remover mapeamento de curso?',
    'settings.integrations.edapp.confirm.sync':
      'Sincronizar integração EdApp com AirTrust? Isso irá limpar mapeamentos órfãos e corrigir inconsistências.',
    'settings.integrations.edapp.loading': 'Carregando...',
    'settings.integrations.edapp.title': 'Integração EdApp',
    'settings.integrations.edapp.subtitle': 'Configure a integração com a plataforma EAD EdApp',
    'settings.integrations.edapp.syncButton': 'Sincronizar Integração',
    'settings.integrations.edapp.tab.status': 'Status',
    'settings.integrations.edapp.tab.users': 'Usuários',
    'settings.integrations.edapp.tab.courses': 'Cursos',
    'settings.integrations.edapp.webhook.title': 'Webhook EdApp',
    'settings.integrations.edapp.webhook.active': 'Webhook ativo',
    'settings.integrations.edapp.webhook.id': 'ID',
    'settings.integrations.edapp.webhook.updatedAt': 'Atualizado',
    'settings.integrations.edapp.webhook.remove': 'Remover Webhook',
    'settings.integrations.edapp.webhook.notConfigured': 'Webhook não configurado',
    'settings.integrations.edapp.webhook.createAuto': 'Criar Webhook Automaticamente',
    'settings.integrations.edapp.stats.receivedEvents': 'Eventos Recebidos',
    'settings.integrations.edapp.stats.processed': 'Processados',
    'settings.integrations.edapp.stats.errors': 'Erros',
    'settings.integrations.edapp.stats.lastEvent': 'Último Evento',
    'settings.integrations.edapp.stats.none': 'Nenhum',
    'settings.integrations.edapp.stats.mappedUsers': 'Usuários Mapeados',
    'settings.integrations.edapp.stats.mappedCourses': 'Cursos Mapeados',
    'settings.integrations.edapp.users.title': 'Mapeamento de Usuários',
    'settings.integrations.edapp.users.activeMappings': 'mapeamentos ativos',
    'settings.integrations.edapp.users.add': 'Adicionar',
    'settings.integrations.edapp.users.table.employee': 'Funcionário',
    'settings.integrations.edapp.users.table.actions': 'Ações',
    'settings.integrations.edapp.courses.title': 'Mapeamento de Cursos',
    'settings.integrations.edapp.courses.activeMappings': 'mapeamentos ativos',
    'settings.integrations.edapp.courses.add': 'Adicionar',
    'settings.integrations.edapp.courses.table.course': 'Curso EdApp',
    'settings.integrations.edapp.courses.table.courseId': 'Course ID',
    'settings.integrations.edapp.courses.table.qualification': 'Qualificação AirTrust',
    'settings.integrations.edapp.courses.table.actions': 'Ações',
    'settings.integrations.edapp.action.remove': 'Remover',
    'settings.integrations.edapp.modal.user.title': 'Adicionar Mapeamento de Usuário',
    'settings.integrations.edapp.modal.user.employeeId': 'Funcionário ID',
    'settings.integrations.edapp.modal.user.userId': 'EdApp User ID',
    'settings.integrations.edapp.modal.user.emailOptional': 'Email (opcional)',
    'settings.integrations.edapp.modal.course.title': 'Adicionar Mapeamento de Curso',
    'settings.integrations.edapp.modal.course.courseId': 'EdApp Course ID',
    'settings.integrations.edapp.modal.course.courseName': 'Nome do Curso',
    'settings.integrations.edapp.modal.course.qualificationCode': 'Código Qualificação AirTrust',
    'settings.integrations.edapp.modal.course.qualificationPlaceholder': 'Ex: EAD_CRM_ONLINE',
    'settings.integrations.edapp.button.save': 'Salvar',
    'settings.registry.title': 'Cadastros',
    'settings.registry.subtitle': 'Gerencie funções, setores, equipamentos e aeronaves.',
    'settings.hardRefresh.title': 'Hard Refresh',
    'settings.hardRefresh.subtitle':
      'Limpe caches persistentes do navegador e recarregue o sistema para garantir que você está vendo a versão mais recente da aplicação.',
    'settings.hardRefresh.whenUse': 'Quando usar o Hard Refresh?',
    'settings.hardRefresh.item1':
      'Após um deploy quando a interface continua mostrando componentes antigos.',
    'settings.hardRefresh.item2':
      'Quando scripts ou estilos parecem desatualizados mesmo após recarregar a página.',
    'settings.hardRefresh.item3':
      'Se o navegador insistir em usar dados em cache que causam comportamentos inesperados.',
    'settings.backup.title': 'Backup & Restore',
    'settings.backup.subtitle': 'Gerenciamento de backups do sistema',
    'settings.backup.createManual': 'Criar Backup Manual',
    'settings.backup.stats.total': 'Total Backups',
    'settings.backup.stats.completed': 'Concluídos',
    'settings.backup.stats.totalSize': 'Tamanho Total',
    'settings.backup.stats.lastBackup': 'Último Backup',
    'settings.backup.stats.na': 'N/A',
    'settings.backup.history.title': 'Histórico de Backups',
    'settings.backup.history.loading': 'Carregando backups...',
    'settings.backup.history.empty': 'Nenhum backup encontrado',
    'settings.backup.table.status': 'Status',
    'settings.backup.table.type': 'Tipo',
    'settings.backup.table.createdAt': 'Criado em',
    'settings.backup.table.records': 'Registros',
    'settings.backup.table.size': 'Tamanho',
    'settings.backup.table.duration': 'Duração',
    'settings.backup.table.retention': 'Retenção',
    'settings.backup.table.actions': 'Ações',
    'settings.backup.actions.details': 'Detalhes',
    'settings.backup.actions.download': 'Download',
    'settings.backup.actions.restore': 'Restaurar',
    'settings.backup.actions.remove': 'Remover',
    'settings.backup.actions.close': 'Fechar',
    'settings.backup.logs.title': 'Logs de Execução',
    'settings.backup.logs.records': 'registros',
    'settings.backup.modal.create.title': 'Criar Backup Manual',
    'settings.backup.modal.create.type': 'Tipo de Backup',
    'settings.backup.modal.create.type.full': 'Completo (todos os módulos)',
    'settings.backup.modal.create.type.modular': 'Modular (selecionar módulos)',
    'settings.backup.modal.create.type.incremental': 'Incremental (apenas alterações)',
    'settings.backup.modal.create.modules': 'Módulos',
    'settings.backup.modal.create.retention': 'Política de Retenção',
    'settings.backup.modal.create.retention.30days': '30 Dias',
    'settings.backup.modal.create.retention.1year': '1 Ano',
    'settings.backup.modal.create.retention.7years': '7 Anos (Compliance FAA)',
    'settings.backup.modal.create.description': 'Descrição (opcional)',
    'settings.backup.modal.create.descriptionPlaceholder': 'Descreva o motivo deste backup...',
    'settings.backup.modal.create.submit': 'Criar Backup',
    'settings.backup.modal.restore.title': 'Restaurar Backup',
    'settings.backup.modal.restore.warning1':
      '⚠️ Atenção: Esta operação substituirá os dados atuais pelos dados do backup.',
    'settings.backup.modal.restore.warning2':
      'Recomendamos criar um backup atual antes de prosseguir.',
    'settings.backup.modal.restore.modules':
      'Módulos para Restaurar (deixe vazio para restaurar tudo)',
    'settings.backup.modal.restore.submit': 'Confirmar Restauração',
    'settings.backup.confirm.restore':
      'Tem certeza que deseja restaurar este backup? Esta operação não pode ser desfeita.',
    'settings.backup.confirm.remove': 'Tem certeza que deseja remover este backup?',
    'settings.backup.alert.createSuccess': 'Backup iniciado com sucesso!',
    'settings.backup.alert.createError': 'Erro ao criar backup',
    'settings.backup.alert.restoreSuccess': 'Restauração concluída com sucesso!',
    'settings.backup.alert.restoreError': 'Erro ao restaurar backup',
    'settings.backup.alert.removeSuccess': 'Backup removido com sucesso',
    'settings.backup.alert.removeError': 'Erro ao deletar backup',
    'settings.backup.alert.downloadError': 'Erro ao fazer download do backup',
    'settings.backup.alert.errorPrefix': 'Erro:',
    'settings.backup.alert.restoreErrorPrefix': 'Erro na restauração:',
    'settings.danger.clean.title': 'Limpeza de Dados',
    'settings.danger.clean.subtitle':
      '⚠️ ATENÇÃO: Esta área é restrita a administradores. Todas as ações são auditadas e irreversíveis.',
    'settings.danger.clean.bannerTitle': 'Zona de Perigo',
    'settings.danger.clean.bannerLine1':
      'As ações abaixo são permanentes e não podem ser desfeitas.',
    'settings.danger.clean.bannerLine2':
      'Use apenas para limpar o sistema antes de importar dados corretos.',
    'settings.danger.clean.bannerLine3': 'Sempre faça backup antes de prosseguir.',
    'settings.danger.clean.clearButton': 'Limpar',
    'settings.danger.clean.modal.title': 'Confirmar Limpeza',
    'settings.danger.clean.modal.removing': 'Você está prestes a remover:',
    'settings.danger.clean.modal.records': 'registros',
    'settings.danger.clean.modal.checkbox':
      'Eu entendo que esta ação é permanente e irreversível. Todos os dados serão removidos e não poderão ser recuperados.',
    'settings.danger.clean.modal.inputLabel': 'Digite LIMPAR DADOS para confirmar:',
    'settings.danger.clean.modal.inputPlaceholder': 'LIMPAR DADOS',
    'settings.danger.clean.modal.confirm': 'Confirmar Limpeza',
    'settings.danger.clean.modal.processing': 'Processando...',
    'settings.danger.clean.toast.confirmSteps': 'Por favor, confirme todas as etapas',
    'settings.danger.clean.toast.errorPrefix': '❌ Erro:',
    'settings.danger.clean.toast.errorClean': '❌ Erro ao limpar dados',
    'settings.danger.level.low': 'BAIXO',
    'settings.danger.level.medium': 'MÉDIO',
    'settings.danger.level.high': 'ALTO',
    'settings.danger.level.critical': 'CRÍTICO',
    'settings.danger.module.qualifications.name': 'Qualificações',
    'settings.danger.module.qualifications.desc':
      'Remove todas as qualificações (treinamentos, exames e checks)',
    'settings.danger.module.imports.name': 'Logs de Importação',
    'settings.danger.module.imports.desc': 'Remove histórico de importações',
    'settings.danger.module.trainingCatalog.name': 'Catálogo de Treinamentos',
    'settings.danger.module.trainingCatalog.desc':
      'Remove treinamentos do catálogo (não afeta qualificações)',
    'settings.danger.module.roles.name': 'Funções',
    'settings.danger.module.roles.desc': 'Remove funções organizacionais',
    'settings.danger.module.aircraft.name': 'Equipamentos',
    'settings.danger.module.aircraft.desc': 'Remove equipamentos do catálogo',
    'settings.danger.module.sectors.name': 'Setores',
    'settings.danger.module.sectors.desc': 'Remove setores organizacionais',
    'settings.danger.module.audit.name': 'Auditoria Antiga',
    'settings.danger.module.audit.desc': 'Remove registros de auditoria com mais de 30 dias',
    'settings.danger.module.employees.name': 'Funcionários',
    'settings.danger.module.employees.desc': 'Remove TODOS os funcionários e suas qualificações',
    'settings.danger.module.clearAll.name': '⚠️ LIMPAR TUDO',
    'settings.danger.module.clearAll.desc': 'Remove TODOS OS DADOS do sistema (irreversível!)',
  },
  'en-US': {
    'common.loading': 'Loading...',
    'auth.login.title': 'Sign In',
    'auth.login.email': 'Email',
    'auth.login.password': 'Password',
    'auth.login.submit': 'Sign In',
    'auth.login.submitting': 'Signing in...',
    'auth.login.forgotPassword': 'Forgot your password?',
    'auth.login.error': 'Login failed',
    'layout.nav.dashboard': 'Dashboard',
    'layout.nav.employees': 'Employees',
    'layout.nav.qualifications': 'Qualifications',
    'layout.nav.simulators': 'Simulators',
    'layout.nav.escalas': 'Schedule',
    'layout.nav.frms': 'FRMS',
    'layout.actions.settings': 'Settings',
    'layout.actions.switchCompanySuccess': 'Active company changed successfully.',
    'layout.actions.switchCompanyError': 'Failed to switch company.',
    'layout.mobile.systemName': 'AirTrust System',
    'layout.mobile.activeCompany': 'Active Company',
    'layout.mobile.notifications': 'Notifications',
    'layout.mobile.logout': 'Sign Out',
    'layout.user.default': 'User',
    'layout.aria.logoHome': 'Back to home page',
    'layout.aria.menu': 'Menu',
    'settings.system.language.label': 'Language',
    'settings.system.language.auto': 'Automatic (location)',
    'settings.system.language.ptBr': 'Portuguese (Brazil)',
    'settings.system.language.enUs': 'English (United States)',
    'settings.system.language.help':
      'Automatic follows your location. When you select a language, it stays fixed.',
    'settings.system.language.changed': 'Language updated successfully.',
    'invite.createPassword.title': 'Create Access Password',
    'invite.createPassword.validating': 'Validating invitation...',
    'invite.createPassword.inviteFor': 'Invitation for',
    'invite.createPassword.newPassword': 'New password',
    'invite.createPassword.confirmPassword': 'Confirm password',
    'invite.createPassword.placeholder.password': 'Minimum 8 characters',
    'invite.createPassword.placeholder.confirm': 'Repeat password',
    'invite.createPassword.submitting': 'Saving...',
    'invite.createPassword.submit': 'Create password',
    'invite.error.missingToken': 'Missing invitation token.',
    'invite.error.invalidOrExpired': 'Invalid or expired invitation.',
    'invite.error.validationFailed': 'Could not validate invitation.',
    'invite.error.minPassword': 'Password must have at least 8 characters.',
    'invite.error.passwordMismatch': 'Passwords do not match.',
    'invite.error.acceptFailed': 'Could not complete invitation.',
    'invite.error.acceptGeneric': 'Error completing invitation. Please try again.',
    'invite.success.passwordCreated': 'Password created successfully. Redirecting to login...',
    'protected.loading': 'Loading...',
    'protected.denied.title': 'Access Denied',
    'protected.denied.description': 'You do not have permission to access this page.',
    'protected.denied.backHome': 'Back to Home',
    'settings.page.title': 'Settings',
    'settings.page.subtitle': 'Manage system and organization settings',
    'settings.tab.companies': 'Companies',
    'settings.tab.users': 'Users',
    'settings.tab.registry': 'Registry',
    'settings.tab.backup': 'Backup',
    'settings.tab.imports': 'Imports & Exports',
    'settings.tab.integrations': 'Integrations',
    'settings.tab.system': 'System',
    'settings.tab.dangerZone': 'Danger Zone',
    'settings.import.title': 'Imports & Exports',
    'settings.import.subtitle':
      'Centralize uploads, templates, CSV exports, and shortcuts to specialized flows',
    'settings.system.loadError': 'Could not load global system settings.',
    'settings.system.companyMissing': 'Company not identified. Reload the page and try again.',
    'settings.system.fileMustBeImage': 'must be an image file.',
    'settings.system.fileTooLarge': 'exceeds the limit of',
    'settings.system.fileConvertedTooLarge': 'converted file exceeds',
    'settings.system.uploadNoUrl': 'Upload did not return a URL.',
    'settings.system.uploadSuccess': 'uploaded successfully.',
    'settings.system.uploadError': 'Failed to upload',
    'settings.system.saveSuccess': 'System settings saved.',
    'settings.system.saveError': 'Error saving settings.',
    'settings.system.resetWarning': 'Default applied locally, but server sync failed.',
    'settings.system.resetSuccess': 'Settings restored to defaults.',
    'settings.system.loading': 'Loading settings...',
    'settings.system.section.title': 'System Settings',
    'settings.system.appName.label': 'Application Name',
    'settings.system.appName.help': 'Updates the browser tab title.',
    'settings.system.pageSize.label': 'Default page size',
    'settings.system.pageSize.help': 'Global preference for compatible tables.',
    'settings.system.pageSize.20': '20 records',
    'settings.system.pageSize.50': '50 records',
    'settings.system.pageSize.100': '100 records',
    'settings.system.compactHeader.label': 'Compact header',
    'settings.system.compactHeader.help': 'Reduces top bar height',
    'settings.system.animations.label': 'Animations',
    'settings.system.animations.help': 'Enables visual transitions',
    'settings.system.branding.title': 'Visual Identity (PNG)',
    'settings.system.logo.title': 'System Logo',
    'settings.system.logo.help':
      'Accepts images up to {max} and auto-converts to PNG at 1024x320 px without distortion',
    'settings.system.logo.upload': 'Upload logo',
    'settings.system.logo.previewAlt': 'Logo preview',
    'settings.system.logo.none': 'No custom logo',
    'settings.system.favicon.title': 'Favicon',
    'settings.system.favicon.help':
      'Accepts images up to {max} and auto-converts to PNG at 512x512 px without distortion',
    'settings.system.favicon.upload': 'Upload favicon',
    'settings.system.favicon.previewAlt': 'Favicon preview',
    'settings.system.favicon.none': 'No custom favicon',
    'settings.system.saveButton': 'Save changes',
    'settings.system.savingButton': 'Saving...',
    'settings.system.resetButton': 'Restore default',
    'settings.companies.loadError': 'Error loading companies',
    'settings.companies.deleteSuccess': 'Company removed successfully!',
    'settings.companies.deleteError': 'Error removing company',
    'settings.companies.title': 'Company Management',
    'settings.companies.subtitle': 'Multi-tenant system - Central administration',
    'settings.companies.new': 'New Company',
    'settings.companies.status.active': 'Active',
    'settings.companies.status.inactive': 'Inactive',
    'settings.companies.cnpj': 'Tax ID',
    'settings.companies.notInformed': 'Not informed',
    'settings.companies.plan': 'Plan',
    'settings.companies.usersLimit': 'Users Limit',
    'settings.companies.storage': 'Storage',
    'settings.companies.edit': 'Edit',
    'settings.companies.delete': 'Delete',
    'settings.companies.empty.title': 'No companies registered',
    'settings.companies.empty.subtitle': 'Create your first company to start',
    'settings.companies.modal.editTitle': 'Edit Company',
    'settings.companies.modal.createTitle': 'Create New Company',
    'settings.companies.deleteConfirm.title': 'Confirm Deletion',
    'settings.companies.deleteConfirm.question': 'Are you sure you want to delete company',
    'settings.companies.deleteConfirm.warning': 'This action cannot be undone.',
    'common.cancel': 'Cancel',
    'sim.calendar.title': 'Agenda/Calendar',
    'sim.calendar.subtitle': 'View and manage simulator schedules',
    'sim.calendar.today': 'Today',
    'sim.calendar.scheduled': 'Scheduled',
    'sim.calendar.completed': 'Completed',
    'sim.calendar.searchPlaceholder': 'Search by simulator, instructor or employee...',
    'sim.calendar.status.all': 'All Status',
    'sim.calendar.status.scheduled': 'Scheduled',
    'sim.calendar.status.inProgress': 'In Progress',
    'sim.calendar.status.completed': 'Completed',
    'sim.calendar.status.canceled': 'Canceled',
    'sim.calendar.instructor.all': 'All Instructors',
    'sim.calendar.filters.clear': 'Clear',
    'sim.calendar.view.monthly': 'Monthly',
    'sim.calendar.view.weekly': 'Weekly',
    'sim.calendar.view.agenda': 'Agenda',
    'sim.calendar.nav.prevMonth': 'Previous month',
    'sim.calendar.nav.nextMonth': 'Next month',
    'sim.calendar.agenda.noEventsInDay': 'No schedules',
    'sim.calendar.agenda.emptyTitle': 'No schedules found',
    'sim.calendar.agenda.emptySubtitle': 'There are no sessions scheduled for the selected period.',
    'sim.calendar.card.participants': 'Participants',
    'sim.calendar.card.instructor': 'Instructor',
    'sim.calendar.card.examiner': 'Examiner',
    'sim.calendar.card.sessionsCount': 'session(s)',
    'sim.calendar.card.na': 'N/A',
    'sim.calendar.loading': 'Loading...',
    'sim.calendar.nextSchedules': 'Upcoming Schedules',
    'settings.users.title': 'Users and Permissions',
    'settings.users.subtitle': 'Manage who can access this company data.',
    'settings.users.activeCompanyTitle': 'Active company in user management',
    'settings.users.inviteButton': 'Invite User',
    'settings.users.table.user': 'User',
    'settings.users.table.email': 'Email',
    'settings.users.table.profile': 'Profile',
    'settings.users.table.actions': 'Actions',
    'settings.users.table.loading': 'Loading...',
    'settings.users.table.empty': 'No users found.',
    'settings.users.role.manager': 'Manager',
    'settings.users.role.instructor': 'Instructor',
    'settings.users.role.student': 'Student',
    'settings.users.role.admin': 'Admin',
    'settings.users.role.viewer': 'Viewer',
    'settings.users.action.edit': 'Edit user',
    'settings.users.action.removeAccess': 'Remove access',
    'settings.users.inviteModal.title': 'Invite User',
    'settings.users.inviteModal.availableCompanies': 'Available companies for this user',
    'settings.users.inviteModal.noCompanies': 'No company available for selection.',
    'settings.users.inviteModal.fullName': 'Full Name',
    'settings.users.inviteModal.profile': 'Access Profile',
    'settings.users.inviteModal.modules': 'Allowed modules',
    'settings.users.inviteModal.sending': 'Sending...',
    'settings.users.inviteModal.submit': 'Invite',
    'settings.users.inviteModal.namePlaceholder': 'John Smith',
    'settings.users.inviteModal.emailPlaceholder': 'john@example.com',
    'settings.users.editModal.title': 'Edit user',
    'settings.users.editModal.companies': 'Companies',
    'settings.users.editModal.noCompanies': 'No company available for editing.',
    'settings.users.editModal.profile': 'Profile',
    'settings.users.editModal.modules': 'Allowed modules',
    'settings.users.editModal.saving': 'Saving...',
    'settings.users.editModal.save': 'Save changes',
    'settings.users.roleOption.manager': 'Manager (Full company access)',
    'settings.users.roleOption.instructor': 'Instructor (Records and Simulators)',
    'settings.users.roleOption.student': 'Student (Sign records)',
    'settings.users.roleOption.viewer': 'Viewer (Read-only)',
    'settings.users.error.loadList': 'Error loading users list',
    'settings.users.error.selectOneCompany': 'Select at least one company',
    'settings.users.error.inviteUser': 'Error inviting user',
    'settings.users.error.inviteProcess': 'Error processing invitation',
    'settings.users.error.selectCompany': 'Select a company',
    'settings.users.error.removeUser': 'Error removing user',
    'settings.users.error.loadAccess': 'Error loading user access',
    'settings.users.error.loadEditData': 'Error loading data for editing',
    'settings.users.error.updateAccess': 'Error updating access',
    'settings.users.error.saveChanges': 'Error saving changes',
    'settings.users.success.userRemoved': 'User removed',
    'settings.users.success.accessUpdated': 'User access updated successfully',
    'settings.users.confirm.removeUser':
      'Are you sure you want to remove this user from the company?',
    'settings.users.module.panel': 'Dashboard',
    'settings.users.module.employees': 'Employees',
    'settings.users.module.qualifications': 'Qualifications',
    'settings.users.module.simulators': 'Simulators',
    'settings.users.module.frms': 'FRMS',
    'settings.users.module.settings': 'Settings',
    'settings.integrations.edapp.error.loadStatus': 'Error loading status',
    'settings.integrations.edapp.error.createWebhook': 'Error creating webhook',
    'settings.integrations.edapp.error.removeWebhook': 'Error removing webhook',
    'settings.integrations.edapp.error.add': 'Error adding item',
    'settings.integrations.edapp.error.remove': 'Error removing item',
    'settings.integrations.edapp.error.sync': 'Error syncing integration',
    'settings.integrations.edapp.success.webhookCreated': 'Webhook created in EdApp!',
    'settings.integrations.edapp.success.webhookRemoved': 'Webhook removed',
    'settings.integrations.edapp.success.userMapped': 'User mapped!',
    'settings.integrations.edapp.success.courseMapped': 'Course mapped!',
    'settings.integrations.edapp.success.removed': 'Removed',
    'settings.integrations.edapp.success.syncCompleted': 'Sync completed!',
    'settings.integrations.edapp.confirm.createWebhook': 'Create webhook in EdApp automatically?',
    'settings.integrations.edapp.confirm.removeWebhook': 'Remove webhook from EdApp?',
    'settings.integrations.edapp.confirm.removeMapping': 'Remove mapping?',
    'settings.integrations.edapp.confirm.removeCourseMapping': 'Remove course mapping?',
    'settings.integrations.edapp.confirm.sync':
      'Sync EdApp integration with AirTrust? This will clean orphan mappings and fix inconsistencies.',
    'settings.integrations.edapp.loading': 'Loading...',
    'settings.integrations.edapp.title': 'EdApp Integration',
    'settings.integrations.edapp.subtitle':
      'Configure integration with the EdApp e-learning platform',
    'settings.integrations.edapp.syncButton': 'Sync Integration',
    'settings.integrations.edapp.tab.status': 'Status',
    'settings.integrations.edapp.tab.users': 'Users',
    'settings.integrations.edapp.tab.courses': 'Courses',
    'settings.integrations.edapp.webhook.title': 'EdApp Webhook',
    'settings.integrations.edapp.webhook.active': 'Webhook active',
    'settings.integrations.edapp.webhook.id': 'ID',
    'settings.integrations.edapp.webhook.updatedAt': 'Updated',
    'settings.integrations.edapp.webhook.remove': 'Remove Webhook',
    'settings.integrations.edapp.webhook.notConfigured': 'Webhook not configured',
    'settings.integrations.edapp.webhook.createAuto': 'Create Webhook Automatically',
    'settings.integrations.edapp.stats.receivedEvents': 'Received Events',
    'settings.integrations.edapp.stats.processed': 'Processed',
    'settings.integrations.edapp.stats.errors': 'Errors',
    'settings.integrations.edapp.stats.lastEvent': 'Last Event',
    'settings.integrations.edapp.stats.none': 'None',
    'settings.integrations.edapp.stats.mappedUsers': 'Mapped Users',
    'settings.integrations.edapp.stats.mappedCourses': 'Mapped Courses',
    'settings.integrations.edapp.users.title': 'User Mapping',
    'settings.integrations.edapp.users.activeMappings': 'active mappings',
    'settings.integrations.edapp.users.add': 'Add',
    'settings.integrations.edapp.users.table.employee': 'Employee',
    'settings.integrations.edapp.users.table.actions': 'Actions',
    'settings.integrations.edapp.courses.title': 'Course Mapping',
    'settings.integrations.edapp.courses.activeMappings': 'active mappings',
    'settings.integrations.edapp.courses.add': 'Add',
    'settings.integrations.edapp.courses.table.course': 'EdApp Course',
    'settings.integrations.edapp.courses.table.courseId': 'Course ID',
    'settings.integrations.edapp.courses.table.qualification': 'AirTrust Qualification',
    'settings.integrations.edapp.courses.table.actions': 'Actions',
    'settings.integrations.edapp.action.remove': 'Remove',
    'settings.integrations.edapp.modal.user.title': 'Add User Mapping',
    'settings.integrations.edapp.modal.user.employeeId': 'Employee ID',
    'settings.integrations.edapp.modal.user.userId': 'EdApp User ID',
    'settings.integrations.edapp.modal.user.emailOptional': 'Email (optional)',
    'settings.integrations.edapp.modal.course.title': 'Add Course Mapping',
    'settings.integrations.edapp.modal.course.courseId': 'EdApp Course ID',
    'settings.integrations.edapp.modal.course.courseName': 'Course Name',
    'settings.integrations.edapp.modal.course.qualificationCode': 'AirTrust Qualification Code',
    'settings.integrations.edapp.modal.course.qualificationPlaceholder': 'Ex: EAD_CRM_ONLINE',
    'settings.integrations.edapp.button.save': 'Save',
    'settings.registry.title': 'Registry',
    'settings.registry.subtitle': 'Manage roles, departments, aircraft models, and aircrafts.',
    'settings.hardRefresh.title': 'Hard Refresh',
    'settings.hardRefresh.subtitle':
      'Clear persistent browser caches and reload the system to ensure you are seeing the latest application version.',
    'settings.hardRefresh.whenUse': 'When should I use Hard Refresh?',
    'settings.hardRefresh.item1': 'After a deploy when the interface still shows old components.',
    'settings.hardRefresh.item2':
      'When scripts or styles appear outdated even after reloading the page.',
    'settings.hardRefresh.item3':
      'If the browser insists on using cached data that causes unexpected behavior.',
    'settings.backup.title': 'Backup & Restore',
    'settings.backup.subtitle': 'System backup management',
    'settings.backup.createManual': 'Create Manual Backup',
    'settings.backup.stats.total': 'Total Backups',
    'settings.backup.stats.completed': 'Completed',
    'settings.backup.stats.totalSize': 'Total Size',
    'settings.backup.stats.lastBackup': 'Last Backup',
    'settings.backup.stats.na': 'N/A',
    'settings.backup.history.title': 'Backup History',
    'settings.backup.history.loading': 'Loading backups...',
    'settings.backup.history.empty': 'No backup found',
    'settings.backup.table.status': 'Status',
    'settings.backup.table.type': 'Type',
    'settings.backup.table.createdAt': 'Created at',
    'settings.backup.table.records': 'Records',
    'settings.backup.table.size': 'Size',
    'settings.backup.table.duration': 'Duration',
    'settings.backup.table.retention': 'Retention',
    'settings.backup.table.actions': 'Actions',
    'settings.backup.actions.details': 'Details',
    'settings.backup.actions.download': 'Download',
    'settings.backup.actions.restore': 'Restore',
    'settings.backup.actions.remove': 'Remove',
    'settings.backup.actions.close': 'Close',
    'settings.backup.logs.title': 'Execution Logs',
    'settings.backup.logs.records': 'records',
    'settings.backup.modal.create.title': 'Create Manual Backup',
    'settings.backup.modal.create.type': 'Backup Type',
    'settings.backup.modal.create.type.full': 'Full (all modules)',
    'settings.backup.modal.create.type.modular': 'Modular (select modules)',
    'settings.backup.modal.create.type.incremental': 'Incremental (changes only)',
    'settings.backup.modal.create.modules': 'Modules',
    'settings.backup.modal.create.retention': 'Retention Policy',
    'settings.backup.modal.create.retention.30days': '30 Days',
    'settings.backup.modal.create.retention.1year': '1 Year',
    'settings.backup.modal.create.retention.7years': '7 Years (FAA Compliance)',
    'settings.backup.modal.create.description': 'Description (optional)',
    'settings.backup.modal.create.descriptionPlaceholder': 'Describe the reason for this backup...',
    'settings.backup.modal.create.submit': 'Create Backup',
    'settings.backup.modal.restore.title': 'Restore Backup',
    'settings.backup.modal.restore.warning1':
      '⚠️ Warning: This operation will replace current data with backup data.',
    'settings.backup.modal.restore.warning2':
      'We recommend creating a current backup before proceeding.',
    'settings.backup.modal.restore.modules':
      'Modules to Restore (leave empty to restore everything)',
    'settings.backup.modal.restore.submit': 'Confirm Restore',
    'settings.backup.confirm.restore':
      'Are you sure you want to restore this backup? This operation cannot be undone.',
    'settings.backup.confirm.remove': 'Are you sure you want to remove this backup?',
    'settings.backup.alert.createSuccess': 'Backup started successfully!',
    'settings.backup.alert.createError': 'Error creating backup',
    'settings.backup.alert.restoreSuccess': 'Restore completed successfully!',
    'settings.backup.alert.restoreError': 'Error restoring backup',
    'settings.backup.alert.removeSuccess': 'Backup removed successfully',
    'settings.backup.alert.removeError': 'Error deleting backup',
    'settings.backup.alert.downloadError': 'Error downloading backup',
    'settings.backup.alert.errorPrefix': 'Error:',
    'settings.backup.alert.restoreErrorPrefix': 'Restore error:',
    'settings.danger.clean.title': 'Data Cleanup',
    'settings.danger.clean.subtitle':
      '⚠️ WARNING: This area is restricted to administrators. All actions are audited and irreversible.',
    'settings.danger.clean.bannerTitle': 'Danger Zone',
    'settings.danger.clean.bannerLine1': 'The actions below are permanent and cannot be undone.',
    'settings.danger.clean.bannerLine2':
      'Use only to clean the system before importing correct data.',
    'settings.danger.clean.bannerLine3': 'Always create a backup before proceeding.',
    'settings.danger.clean.clearButton': 'Clear',
    'settings.danger.clean.modal.title': 'Confirm Cleanup',
    'settings.danger.clean.modal.removing': 'You are about to remove:',
    'settings.danger.clean.modal.records': 'records',
    'settings.danger.clean.modal.checkbox':
      'I understand this action is permanent and irreversible. All data will be removed and cannot be recovered.',
    'settings.danger.clean.modal.inputLabel': 'Type LIMPAR DADOS to confirm:',
    'settings.danger.clean.modal.inputPlaceholder': 'LIMPAR DADOS',
    'settings.danger.clean.modal.confirm': 'Confirm Cleanup',
    'settings.danger.clean.modal.processing': 'Processing...',
    'settings.danger.clean.toast.confirmSteps': 'Please complete all confirmation steps',
    'settings.danger.clean.toast.errorPrefix': '❌ Error:',
    'settings.danger.clean.toast.errorClean': '❌ Error cleaning data',
    'settings.danger.level.low': 'LOW',
    'settings.danger.level.medium': 'MEDIUM',
    'settings.danger.level.high': 'HIGH',
    'settings.danger.level.critical': 'CRITICAL',
    'settings.danger.module.qualifications.name': 'Qualifications',
    'settings.danger.module.qualifications.desc':
      'Removes all qualifications (trainings, exams, and checks)',
    'settings.danger.module.imports.name': 'Import Logs',
    'settings.danger.module.imports.desc': 'Removes import history',
    'settings.danger.module.trainingCatalog.name': 'Training Catalog',
    'settings.danger.module.trainingCatalog.desc':
      'Removes catalog trainings (does not affect qualifications)',
    'settings.danger.module.roles.name': 'Roles',
    'settings.danger.module.roles.desc': 'Removes organizational roles',
    'settings.danger.module.aircraft.name': 'Aircraft',
    'settings.danger.module.aircraft.desc': 'Removes aircraft from catalog',
    'settings.danger.module.sectors.name': 'Sectors',
    'settings.danger.module.sectors.desc': 'Removes organizational sectors',
    'settings.danger.module.audit.name': 'Legacy Audit',
    'settings.danger.module.audit.desc': 'Removes audit logs older than 30 days',
    'settings.danger.module.employees.name': 'Employees',
    'settings.danger.module.employees.desc': 'Removes ALL employees and their qualifications',
    'settings.danger.module.clearAll.name': '⚠️ CLEAR ALL',
    'settings.danger.module.clearAll.desc': 'Removes ALL SYSTEM DATA (irreversible!)',
  },
};
