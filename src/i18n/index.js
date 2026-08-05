import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react'

export const SUPPORTED_LOCALES = ['es', 'en']
export const DEFAULT_LOCALE = 'es'
export const LOCALE_STORAGE_KEY = 'vendrava:locale:v1'

export const messages = {
  es: {
    common: {
      appName: 'Vendrava',
      from: 'Desde',
      until: 'Hasta',
      comingSoon: 'próximamente',
      create: 'Crear',
      save: 'Guardar cambios',
      saving: 'Guardando…',
      cancel: 'Cancelar',
      close: 'Cerrar',
      retry: 'Reintentar',
      reload: 'Recargar aplicación',
      search: 'Buscar',
      loading: 'Cargando…',
      language: 'Idioma',
      spanish: 'Español',
      english: 'English',
      theme: 'Tema',
      themeAuto: 'Auto',
      themeLight: 'Claro',
      themeDark: 'Oscuro',
      enabled: 'Activado',
      disabled: 'Desactivado',
      connected: 'Conectado',
      notConnected: 'Sin conectar',
      unavailable: 'No disponible',
      realData: 'Datos reales',
      demoMode: 'Modo demo',
      noResults: 'No hay resultados',
      all: 'Todos',
      today: 'Hoy',
      next: 'Siguiente',
      previous: 'Anterior',
    },
    nav: {
      dashboard: 'Dashboard',
      objectives: 'Objetivos',
      acquisition: 'Captación',
      conversation: 'Conversación',
      nurturing: 'Nutrición',
      growth: 'Growth',
      sales: 'Ventas',
      system: 'Sistema',
      campaigns: 'Campañas',
      ads: 'Ads',
      social: 'Redes sociales',
      prospectFinder: 'Prospect Finder',
      landings: 'Landings & webs',
      funnels: 'Funnels',
      organicLeads: 'Organic Leads',
      seo: 'SEO',
      inbox: 'Inbox',
      calls: 'Llamadas',
      agents: 'Agentes IA',
      playbooks: 'Playbooks',
      voiceTest: 'Test de Voz',
      emailMarketing: 'Email marketing',
      automations: 'Automatizaciones',
      growthHub: 'Growth Hub',
      leads: 'Leads',
      pipeline: 'Pipeline',
      meetings: 'Reuniones',
      revenueIntelligence: 'Inteligencia comercial',
      insights: 'Insights',
      knowledgeBase: 'Knowledge Base',
      settings: 'Configuración',
      governance: 'Gobierno empresarial',
      accessControl: 'Control de accesos',
      adRecipes: 'Recetas Ads',
    },
    sidebar: {
      viewAll: 'Ver todo',
      modulesAvailable: '{{count}} módulos disponibles',
      systemStatus: 'Estado del sistema',
      statusUnavailable: 'Estado no disponible en esta vista',
      aiCallUsage: 'Uso de llamadas IA',
      usageUnavailable: 'No disponible. Conecta una fuente de consumo para consultar el uso y los límites.',
      logout: 'Cerrar sesión',
    },
    experience: {
      workView: 'Vista de trabajo',
      navigationMode: 'Modo de navegación',
      basic: 'Básico',
      recommended: 'Recomendado',
      recommendedShort: 'Recomend.',
      advanced: 'Avanzado',
      basicDescription: 'Solo las áreas esenciales para trabajar sin ruido.',
      recommendedDescription: 'Las áreas seleccionadas para tu negocio, objetivo y perfil.',
      advancedDescription: 'Toda la plataforma disponible para tu plan.',
      guidedSetup: 'Configuración guiada',
      context: 'Tu contexto',
      objective: 'Tu objetivo',
      role: 'Tu papel',
      workspace: 'Tu espacio',
      skipSetup: 'Saltar configuración inicial',
      saveAndContinue: 'Guardar y continuar',
      finish: 'Empezar',
    },
    settings: {
      title: 'Configuración',
      general: 'GENERAL',
      platform: 'PLATAFORMA',
      communication: 'COMUNICACIÓN',
      security: 'SEGURIDAD',
      billing: 'FACTURACIÓN',
      companyProfile: 'Perfil de la empresa',
      myProfile: 'Mi perfil',
      usersTeams: 'Usuarios y equipos',
      rolesPermissions: 'Roles y permisos',
      phoneNumbers: 'Números de teléfono',
      integrations: 'Integraciones',
      apiWebhooks: 'API y webhooks',
      variablesFields: 'Variables y campos',
      messageTemplates: 'Plantillas de mensaje',
      emailNotifications: 'Email y notificaciones',
      reminders: 'Recordatorios',
      calendars: 'Calendarios',
      securityAccess: 'Seguridad y acceso',
      ssoAuth: 'SSO y autenticación',
      audit: 'Auditoría',
      planUsage: 'Plan y uso',
      billingDetails: 'Facturación',
      paymentMethods: 'Métodos de pago',
      personalInformation: 'Información personal',
      accountPreferences: 'Gestiona tu información personal y preferencias de cuenta.',
      companyPreferences: 'Actualiza la información general de tu empresa y preferencias regionales.',
      fullName: 'Nombre completo',
      email: 'Email',
      role: 'Rol',
      organizationId: 'ID de organización',
      changePhoto: 'Cambiar foto',
      password: 'Contraseña',
      currentPassword: 'Contraseña actual',
      newPassword: 'Nueva contraseña',
      confirmPassword: 'Confirmar contraseña',
      language: 'Idioma',
      integrationsEmpty: 'Sin integraciones conectadas todavía.',
      helpCenter: 'Centro de ayuda',
      documentation: 'Documentación',
      guidesTutorials: 'Guías y tutoriales',
      support: 'Soporte',
      contactTeam: 'Contacta a nuestro equipo',
      updates: 'Novedades',
      latestUpdates: 'Ver últimas actualizaciones',
    },
    auth: {
      protectedAccess: 'Acceso protegido',
      encryptedData: 'Datos cifrados',
      available247: 'IA disponible 24/7',
      conversationalIntelligence: 'Inteligencia conversacional',
      activeConversation: 'Conversación activa',
      confirmedMeeting: 'Agenda confirmada',
      listening: 'Escuchando · 00:42',
      meetingToday: 'Reunión · hoy 16:30',
      active: 'Vendrava está activa',
      commercialTeam: 'Tu equipo comercial',
      autopilot: 'En piloto automático.',
      agentsDescription: 'Agentes de voz que llaman, califican y agendan por ti, sin pausas.',
      designedForTeams: 'Diseñado para equipos que quieren crecer',
      simpleHumanScalable: 'Simple. Humano. Escalable.',
      welcomeBack: 'Bienvenido de nuevo.',
      accessPlatform: 'Accede a tu plataforma de IA conversacional',
      workspaceProtected: 'Tu espacio de trabajo está protegido',
      email: 'Correo electrónico',
      emailPlaceholder: 'tu@empresa.com',
      password: 'Contraseña',
      passwordPlaceholder: 'Tu contraseña',
      hidePassword: 'Ocultar contraseña',
      showPassword: 'Mostrar contraseña',
      forgotPassword: '¿La olvidaste?',
      recoveryTitle: 'Recupera el acceso con soporte',
      recoveryDescription: 'No se enviará ningún correo desde esta pantalla. Indica tu cuenta y abre un mensaje para que soporte valide la solicitud.',
      accountEmail: 'Correo de la cuenta',
      openSupportEmail: 'Abrir correo de soporte',
      signIn: 'Iniciar sesión',
      signingIn: 'Iniciando sesión…',
      missingCredentials: 'Introduce tu correo electrónico y contraseña para continuar.',
      invalidCredentials: 'El correo o la contraseña no son correctos.',
      signInError: 'No hemos podido iniciar sesión. Inténtalo de nuevo.',
    },
    errors: {
      viewReload: 'Esta vista necesita volver a cargarse',
      accountProtected: 'El resto de tu cuenta sigue protegido. Puedes reintentar la pantalla o recargar la aplicación completa.',
      technicalDetail: 'Detalle técnico',
      notFoundTitle: 'Esta página no existe',
      notFoundDescription: 'La dirección {{path}} no está disponible o ha cambiado.',
      goHome: 'Ir al inicio',
    },
    onboarding: {
      businessTypeTitle: '¿Qué tipo de negocio quieres hacer crecer?',
      objectiveTitle: '¿Qué resultado quieres priorizar?',
      profileTitle: '¿Cómo vas a usar Vendrava?',
      planTitle: '¿Qué nivel de experiencia necesitas?',
      buildActionCenter: 'Construyamos tu centro de acción',
      intro: 'Te enseñaremos primero lo que te ayuda a conseguir el resultado que buscas.',
      step: 'Paso {{current}} de {{total}}',
      recommendedWorkspace: 'Tu espacio recomendado',
      clearPlan: 'Empezarás con un plan claro, sin perder el resto de la plataforma.',
      recommendationIntro: 'Estas son las áreas que mejor encajan con tus respuestas. Puedes cambiar de modo cuando quieras.',
      recommendedModules: 'Módulos recomendados',
      noAdditionalModules: 'No hay módulos adicionales para esta combinación todavía.',
      initialMode: 'Selecciona el modo inicial',
      planNote: 'El plan solo organiza lo que ves en la navegación. No cambia tu suscripción ni tus permisos reales.',
      skipForNow: 'Saltar por ahora',
      back: 'Volver',
      continue: 'Continuar',
      enterWorkspace: 'Entrar a mi espacio',
    },
    dashboard: {
      operationsCenter: 'Centro de operaciones', welcome: 'Hola, Equipo Comercial 👋', todaySummary: 'Aquí tienes el resumen de tu actividad de hoy.', noComparison: 'Sin comparación', previousWeek: 'Semana anterior', previousMonth: 'Mes anterior', previousYear: 'Año anterior', callsMade: 'Llamadas\nrealizadas', contactedLeads: 'Leads\ncontactados', meetingsBooked: 'Reuniones\nagendadas', conversionRate: 'Tasa de\nconversión', pipelineGenerated: 'Pipeline\ngenerado', attributedRevenue: 'Ingresos\natribuidos', systemRoi: 'ROI del\nsistema', liveData: 'Datos reales', noDataYet: 'Sin datos todavía', disconnectedApi: 'API desconectada', syncing: 'Sincronizando…', demoActive: 'Datos demo activos', metric: 'Métrica', value: 'Valor', change: 'Cambio %', editDashboard: 'Editar dashboard', visibleWidgets: '{{visible}} de {{total}} visibles', widgetHelp: 'Arrastra los widgets para reorganizarlos. Arrastra las esquinas para redimensionarlos. Pulsa la × de un widget para quitarlo.', removedWidgets: 'Widgets eliminados', availableWidgets: 'Widgets disponibles', reset: 'Restablecer', allVisible: 'Todos los widgets están visibles. Elimina alguno desde el dashboard para que aparezca aquí.',
    },
    status: { live: 'Datos reales', demo: 'Modo demo explícito', empty: 'Sin datos todavía', disconnected: 'Integración desconectada', error: 'Error de conexión', loading: 'Cargando datos', plan: 'No incluido en tu plan', retry: 'Reintentar', configure: 'Configurar' },
    calls: { title: 'Llamadas', subtitle: 'Escucha, entiende y convierte cada conversación.', commands: 'Comandos', refresh: 'Actualizar', filters: 'Filtros', export: 'Exportar', newCall: 'Nueva llamada', intelligence: 'Vendrava intelligence', heroTitle: 'Cada conversación', heroAccent: 'es una oportunidad.', heroDescription: 'La IA de Vendrava analiza tus llamadas, detecta señales clave y te ayuda a tomar mejores decisiones para cerrar más.', recentCalls: 'Ver llamadas recientes', copilot: 'Abrir copiloto', summary: 'Resumen de llamadas', totalCalls: 'Llamadas totales', averageDuration: 'Duración promedio', conversionRate: 'Tasa de conversión', meetingsBooked: 'Reuniones agendadas', recent: 'Llamadas recientes', conversationsInView: '{{count}} conversaciones en esta vista', customizeView: 'Personalizar vista', searchPlaceholder: 'Buscar contacto, empresa o cargo…', contact: 'Contacto', company: 'Empresa', date: 'Fecha', outcome: 'Resultado', selectAll: 'Seleccionar todas las llamadas visibles', noCalls: 'Aún no hay llamadas', noMatches: 'No encontramos llamadas', startCall: 'Inicia una llamada para registrar la primera conversación.', tryAnother: 'Prueba con otro contacto, empresa o resultado.', todayPerformance: 'Rendimiento de hoy', syncedMetrics: 'Métricas sincronizadas', noMetrics: 'Sin métricas disponibles', liveMetrics: 'Métricas reales disponibles.', noPerformanceData: 'Aún no hay datos de rendimiento', notQueued: 'La llamada no se pudo poner en cola. Inténtalo de nuevo.', leadWithoutCampaign: 'El lead no tiene campaña asignada. Asócialo a una campaña antes de llamar.', leadWithoutPhone: 'El lead no tiene teléfono.', queueUnavailable: 'El sistema de llamadas no está disponible ahora mismo.',
    },
    modal: { newLead: 'Nuevo lead', createLead: 'Crear lead', newAgent: 'Nuevo agente IA', createAgent: 'Crear agente', newArticle: 'Nuevo artículo', createArticle: 'Crear artículo', newAutomation: 'Nueva automatización', createAutomation: 'Crear automatización', newMeeting: 'Nueva reunión', createMeeting: 'Crear reunión', rescheduleMeeting: 'Reprogramar reunión', confirmNewDate: 'Confirmar nueva fecha', dateTimeRequired: 'Indica fecha y hora', newOpportunity: 'Nueva oportunidad', createOpportunity: 'Crear oportunidad', newPlaybook: 'Crear playbook', createPlaybook: 'Crear playbook', importLeads: 'Importar leads desde CSV', createError: 'No se pudo crear el registro.', connectionError: 'Error de conexión', campaignRequired: 'Selecciona una campaña', fileRequired: 'Selecciona un archivo CSV', importError: 'No se pudo importar el CSV', selectExistingLead: 'Selecciona un lead existente de la lista.', opportunityNameOptional: 'Nombre de la oportunidad (opcional)', fullName: 'Nombre completo', name: 'Nombre', role: 'Cargo', company: 'Empresa', email: 'Email', phone: 'Teléfono', status: 'Estado', potentialValue: 'Valor potencial', source: 'Fuente', tags: 'Etiquetas', callNow: 'Llamar ahora si tiene teléfono', agentName: 'Nombre del agente', subrole: 'Subrol', objective: 'Descripción / objetivo', personality: 'Personalidad', title: 'Título', category: 'Categoría', summary: 'Descripción / resumen', author: 'Autor', description: 'Descripción', trigger: 'Disparador', channelResponse: 'Respuesta por canal', sendToSegment: 'Enviar el lead a un segmento de Mautic cuando se dispare', segmentAlias: 'Alias del segmento en Mautic', lead: 'Lead', newLead: 'Crear nuevo', existingLead: 'Usar lead existente', searchLead: 'Buscar por nombre, teléfono o email…', selectedLead: 'Lead seleccionado', stage: 'Etapa', date: 'Fecha', time: 'Hora', duration: 'Duración', meetingObjective: 'Objetivo de la reunión', changeReason: 'Motivo del cambio (opcional)', estimatedValue: 'Valor estimado (€)', probability: 'Probabilidad (0-100)', type: 'Tipo', campaign: 'Campaña', import: 'Importar', processing: 'Procesando…', sending: 'Enviando…', imported: 'Importados', duplicates: 'Duplicados', errors: 'Errores', rows: 'filas', expectedColumns: 'Columnas esperadas: name, phone, email, company.', autoCall: 'Llamar automáticamente a los importados', importing: 'Importando…', importCompleted: 'Importación completada', importErrors: 'Importación con errores',
    },
    legal: { backToLogin: '← Volver al acceso', privacyTitle: 'Política de privacidad', termsTitle: 'Términos de uso', lastUpdated: 'Última actualización: 15 de julio de 2026', privacy1: 'Vendrava trata los datos necesarios para prestar el servicio: datos de usuarios autorizados, información comercial introducida por la organización y datos técnicos de uso y seguridad. Los datos se procesan siguiendo las instrucciones de la organización titular y las configuraciones activadas en su cuenta.', privacy2: 'El acceso está protegido mediante controles de autenticación y las integraciones externas se habilitan explícitamente desde la plataforma. La organización debe aplicar las obligaciones de información, consentimiento y conservación que correspondan a sus contactos.', privacy3: 'Para ejercer derechos sobre tus datos, comunicar una incidencia de privacidad o solicitar información sobre el tratamiento aplicable a tu organización, escribe a soporte@vendrava.app. El acuerdo de tratamiento de datos suscrito con la organización titular prevalece sobre este resumen informativo.', viewTerms: 'Consultar los términos de uso', terms1: 'El acceso a Vendrava está reservado a las personas autorizadas por la organización titular de la cuenta. Cada persona usuaria debe proteger sus credenciales y utilizar la plataforma de forma lícita y conforme a las políticas internas de su organización.', terms2: 'La organización titular es responsable de contar con una base legal para los datos que incorpora y las comunicaciones que realiza desde la plataforma, así como de revisar las configuraciones de campañas, automatizaciones e integraciones antes de activarlas.', terms3: 'Para incidencias de acceso, seguridad o uso de la cuenta, contacta con soporte@vendrava.app. La relación contractual aplicable y cualquier anexo de tratamiento de datos prevalecen sobre este resumen informativo.', viewPrivacy: 'Consultar la política de privacidad' },
    campaignShare: { loading: 'Cargando resumen de campaña…', unavailable: 'Este enlace ya no está disponible', loadError: 'No pudimos cargar la campaña', askUpdatedLink: 'Pide a la persona que te lo compartió un enlace actualizado.', retry: 'Vuelve a intentarlo en unos minutos.', readOnly: 'Vista compartida de solo lectura', campaignSummary: 'Resumen de campaña', objectiveFallback: 'Un resumen claro del progreso comercial y las señales que está generando esta campaña.', conversion: 'conversión', metrics: 'Métricas de campaña', contactsAdded: 'contactos incorporados', coverage: '{{rate}}% de cobertura', opportunities: 'oportunidades activadas', commercialProgress: 'Progreso comercial', interestToConversation: 'Del interés a la conversación.', realActivity: 'Las métricas se actualizan con la actividad real de la campaña.', leadsReceived: 'Leads recibidos', contactsWorked: 'Contactos trabajados', meetingsGenerated: 'Reuniones generadas', secureFooter: 'Datos compartidos de forma segura por Robin.', realtime: 'Actualizado en tiempo real' },
    landing: { loading: 'Preparando tu experiencia…', openError: 'No hemos podido abrir esta landing.', retryLink: 'Revisa el enlace e inténtalo de nuevo.', retry: 'Volver a intentar', backHome: 'Volver al inicio', landingNav: 'Navegación de landing', includes: 'Qué incluye', process: 'Cómo funciona', faq: 'Preguntas frecuentes', information: 'Quiero información', nextStep: 'Quiero dar el siguiente paso', seeProcess: 'Ver cómo funciona', noCommitment: 'Sin compromiso', protectedData: 'Datos protegidos', humanResponse: 'Respuesta humana', personalizedExperience: 'Experiencia de atención personalizada', nextMove: 'Tu próximo paso', startsHere: 'empieza aquí', offerAvailable: 'Oferta disponible', noFinePrint: 'Sin letra pequeña', receive: 'Qué recibirás', requestGuidance: 'Solicitar orientación', benefitsTitle: 'Todo lo necesario para avanzar con confianza.', benefitsDescription: 'Una experiencia simple, humana y pensada para que el siguiente paso sea evidente.', designedForCase: 'Diseñado para tu caso', processTitle: 'Un proceso sencillo en tres pasos.', processDescription: 'Menos fricción, más claridad desde la primera conversación.', tellUs: 'Cuéntanos', tellUsText: 'Comparte tus datos y qué quieres conseguir.', guideYou: 'Te orientamos', guideYouText: 'Entendemos tu caso y te proponemos la mejor dirección.', start: 'Empieza', startText: 'Elige el siguiente paso con toda la información.', conversationBeforeCall: 'La conversación empieza antes de la llamada.', contextText: 'Te damos contexto, escuchamos tus necesidades y respetamos el ritmo que necesitas para decidir.', talkToSomeone: 'Hablar con alguien', resolveQuestions: 'Resolvemos tus dudas.', faqDescription: 'Si no encuentras la respuesta, puedes dejarnos tus datos y te ayudamos personalmente.', ready: '¿Listo para avanzar?', finalTitle: 'El siguiente paso puede ser más sencillo.', finalText: 'Cuéntanos qué necesitas y empezamos por ahí.', landingFooter: 'Experiencia de captación de Vendrava', responsibleData: 'Tratamiento responsable de tus datos', formStep: 'Da el siguiente paso', formTitle: 'Hablemos de lo que necesitas.', formDescription: 'Déjanos tus datos y te contactaremos con una orientación personalizada.', fullName: 'Nombre completo', phone: 'Teléfono', optional: 'Opcional', bestTime: '¿Cuándo te viene mejor?', asSoonAsPossible: 'Cuando antes', morning: 'Por la mañana', afternoon: 'Por la tarde', afterSix: 'Después de las 18:00', consent: 'Acepto que me contacten para responder a mi solicitud.', sendingRequest: 'Enviando solicitud…', contactMe: 'Quiero que me contacten', usedOnly: 'Tus datos se utilizan únicamente para responderte.', requestReceived: 'Solicitud recibida', thanks: 'Gracias, {{name}}.', receivedDescription: 'Hemos recibido tus datos. Pronto nos pondremos en contacto contigo para entender mejor lo que necesitas.', reviewRequest: 'Revisamos tu solicitud', respectTime: 'Respetamos tu franja preferida', clearResponse: 'Te damos una respuesta clara', closeConfirmation: 'Cerrar confirmación', namePhoneRequired: 'Indica tu nombre y teléfono para poder contactarte.', consentRequired: 'Necesitamos tu autorización para responder a esta solicitud.', sendError: 'No se pudo enviar. Inténtalo de nuevo.' },
    modules: { campaignsTitle: 'Te traemos clientes.', campaignsSubtitle: 'Lanza campañas, convierte el interés en conversaciones y lleva cada oportunidad hasta la reunión.', newCampaign: 'Nueva campaña', createCampaign: 'Crear campaña', allCampaigns: 'Todas las campañas', campaignPerformance: 'Rendimiento', leadsTitle: 'Convierte señales comerciales en la siguiente conversación correcta.', leadsHero: 'Prioriza lo que puede cerrar hoy', leadsHeroText: 'Vendrava cruza intención, momento y contexto para que el equipo enfoque su tiempo en los leads con más probabilidad de conversión.', pipelineTitle: 'Pipeline', pipelineCreate: 'Crear oportunidad', automationTitle: 'Automatizaciones', automationSubtitle: 'Diseña flujos que trabajan en segundo plano para mover cada oportunidad.', agentTitle: 'Agentes IA', knowledgeTitle: 'Knowledge Base', insightsTitle: 'Insights', meetingsTitle: 'Reuniones', meetingsSubtitle: 'Organiza el siguiente paso de cada conversación.', viewFlows: 'Ver flujos', createFlow: 'Crear un flujo', exploreAutomations: 'Explorar automatizaciones', automationEngine: 'Motor operativo listo', automationHeroTitle: 'Tu operación no debería depender de recordar cada paso.', automationHeroText: 'Conecta disparadores y acciones para que el seguimiento ocurra solo, con la misma precisión cada vez.', simpleArchitecture: 'Arquitectura simple', lessRepetition: 'Menos tareas repetidas. Más tiempo para decidir.', automationFlowText: 'Cada flujo combina un evento de entrada con acciones medibles y fáciles de revisar.', trigger: 'Disparador', rule: 'Regla', action: 'Acción', quickStart: 'Empieza rápido', threeFlows: 'Tres flujos para ponerlo en marcha', useKnownBase: 'Usa una base conocida y ajusta los detalles a tu proceso.', createFromScratch: 'Crear desde cero', controlCenter: 'Centro de control', allFlows: 'Todos tus flujos', automationLibraryText: 'Busca, filtra y revisa el estado de cada automatización.', automationCount: '{{shown}} de {{total}} flujos', automationSearch: 'Buscar por nombre o descripción…', automationName: 'Automatización', status: 'Estado', executions: 'Ejecuciones', lastExecution: 'Última ejecución', noFilteredFlows: 'No hay flujos con estos filtros', noAutomations: 'Todavía no tienes automatizaciones', noFlowsHint: 'Prueba con otra búsqueda o cambia el filtro para ver más resultados.', createFirstFlow: 'Crea tu primer flujo y deja que el seguimiento ocurra automáticamente.', agentsSubtitle: 'Crea y configura los agentes de voz de tu organización.', agentSettings: 'Configuración de agentes', agentHeroTitle: 'Centraliza la configuración de tus agentes.', agentHeroText: 'Consulta los agentes registrados y guarda los cambios que admite la plataforma.', workspace: 'Tu espacio de trabajo', selectAgentText: 'Selecciona un agente para revisar sus campos configurables.', registeredAgents: 'Agentes registrados', visibleAgents: '{{count}} visibles', searchAgent: 'Buscar agente…', recent: 'Más recientes', nameAZ: 'Nombre A-Z', noMatchingAgents: 'No hay agentes que coincidan con los filtros.', noRegisteredAgents: 'Todavía no hay agentes registrados.', createNewAgent: 'Crear nuevo agente', selectOrCreateAgent: 'Selecciona o crea un agente', selectOrCreateAgentText: 'Cuando haya un agente registrado podrás revisar y guardar su configuración desde aquí.', saveChanges: 'Guardar cambios', savingChanges: 'Guardando…', upcoming: 'Disponible próximamente', roleStored: 'Rol guardado en el agente', choosePurpose: 'Elige el propósito', profile: 'Perfil actual', fieldPersistent: 'Campo persistente', agentInstructions: 'Instrucciones del agente', agentInstructionsText: 'Estas instrucciones se guardan como el prompt del sistema del agente.', identity: 'Identidad del agente', fieldsPersistent: 'Campos persistentes', voiceSettings: 'Configuración de voz', keyMessages: 'Mensajes clave', sourcePending: 'Fuente de datos pendiente', manageKnowledge: 'Gestionar Knowledge Base', activity: 'Actividad', knowledgeTitle: 'Conecta el conocimiento de tu negocio.', knowledgeText: 'Gestiona artículos y fuentes desde el espacio de Knowledge Base.', kbSubtitle: 'Centraliza la información que tus agentes necesitan para responder.', insightsSubtitle: 'Convierte la actividad de tu CRM en decisiones que mueven el pipeline.' },
    meta: { title: 'Cuenta de Meta Ads', subtitle: 'Conecta tu cuenta publicitaria para publicar campañas reales.', connected: 'Cuenta conectada correctamente.', connectError: 'No se pudo conectar la cuenta. Inténtalo de nuevo.', oauthError: 'No se pudo iniciar el OAuth.', budgetSaved: 'Presupuesto diario guardado.', budgetSaveError: 'No se pudo guardar el presupuesto.', pixelSaved: 'Pixel ID guardado.', pixelSaveError: 'No se pudo guardar el Pixel ID.', disconnectConfirm: '¿Seguro que quieres desconectar la cuenta de Meta?', disconnected: 'Cuenta desconectada.', disconnectError: 'No se pudo desconectar la cuenta.', noAccount: 'No hay ninguna cuenta de Meta conectada.', connectAccount: 'Conectar cuenta de Meta', accountId: 'ID de cuenta publicitaria', status: 'Estado', page: 'Página de Meta', connectedAt: 'Conectada', dailyCap: 'Tope diario de gasto (€)', noCap: 'Sin tope', save: 'Guardar', dailyCapHint: 'Si el gasto del día supera este valor, la campaña se pausa automáticamente.', pixelId: 'Pixel ID de Meta', pixelHint: 'Necesario para enviar conversiones (Lead, Schedule) a Meta Conversions API.', disconnect: 'Desconectar cuenta' },
    adPlaybooks: { title: 'Recetas de anuncios', subtitle: 'Playbooks por vertical para el wizard de Meta Ads.', new: 'Nueva receta', total: 'Recetas totales', active: 'Activas', inactive: 'Inactivas', search: 'Buscar por vertical…', noItems: 'No hay recetas todavía. Crea la primera.', noMatches: 'Ninguna receta coincide con «{{query}}».', usedIn: 'Usada en {{count}} campañas', usedInOne: 'Usada en {{count}} campaña', edit: 'Editar', disable: 'Desactivar', enable: 'Activar', vertical: 'Vertical', landingTemplate: 'Landing template', offer: 'Oferta', leadMagnet: 'Lead magnet', adCopy: 'Copy del anuncio', imagePrompt: 'Prompt de imagen', imagePromptPlaceholder: 'Prompt en inglés para generar la imagen', save: 'Guardar', saving: 'Guardando…', cancel: 'Cancelar', loadError: 'No se pudieron cargar las recetas.', required: 'Completa los campos obligatorios.', saved: 'Receta guardada.', saveError: 'No se pudo guardar la receta.', statusError: 'No se pudo cambiar el estado.' },
    details: { back: 'Volver', agents: 'Agentes IA', train: 'Entrenar', save: 'Guardar cambios', saved: 'Guardado', summary: 'Resumen', conversations: 'Conversaciones', configuration: 'Configuración', playbooks: 'Playbooks', performance: 'Rendimiento', noRecording: 'No hay grabación disponible', noRecordingText: 'Esta llamada no tiene una grabación asociada.', play: 'Reproducir llamada', pause: 'Pausar llamada', downloadAudio: 'Descargar audio', noCall: 'No se pudo cargar la llamada.', noCallText: 'Revisa la conexión e inténtalo de nuevo.', transcript: 'Transcripción', notes: 'Notas', addNote: 'Añadir nota', notePlaceholder: 'Escribe una nota…', saveNote: 'Guardar nota', noNotes: 'Todavía no hay notas.', action: 'Acción', delete: 'Eliminar', updateError: 'No se pudo actualizar la acción.', failedSave: 'No se pudo guardar la nota.', failedDelete: 'No se pudo eliminar la nota.', loadingCall: 'Cargando llamada…' },
    voiceTest: { title: 'Test de voz', subtitle: 'Prueba la calidad de voz de tu agente en tiempo real y revisa el rendimiento de la sesión.', back: 'Volver a agentes', systemReady: 'Sistema operativo', configuration: 'Configuración', session: 'Sesión de prueba', intro: 'Añade el agente que quieres escuchar. La organización se obtiene de tu sesión protegida.', optional: 'opcional', agentPlaceholder: 'Selecciona un Agent ID', privateSession: 'Los datos se usan solo durante esta sesión.', agentResponse: 'Respuesta del agente', micActive: 'Micrófono activo', engineReady: 'Motor de voz preparado', agentSpeaking: 'El agente está hablando', listening: 'Te estamos escuchando', ready: 'Listo para hablar', start: 'Iniciar sesión', stop: 'Detener sesión', microphoneHint: 'Se usará el micrófono predeterminado de tu dispositivo.', conversation: 'Conversación', realtimeSignals: 'Transcripción y señales en tiempo real', live: 'En vivo', waiting: 'En espera', clear: 'Limpiar', listeningVoice: 'Escuchando tu voz', realtimeResponse: 'Tu voz y la respuesta del agente aparecerán aquí en tiempo real.', bidirectionalAudio: 'Audio bidireccional', wordConfidence: 'Confianza por palabra', private: 'Sesión privada', diagnostics: 'Diagnósticos de la sesión', inactive: 'Inactivo', responding: 'Agente respondiendo', latency: 'Latencia', lastTurn: 'Último turno completo', noData: 'Sin datos todavía', network: 'Red', sent: 'enviados', received: 'recibidos', confidence: 'Confianza', lastTranscript: 'Última transcripción', performance: 'Rendimiento', lastTurnLatency: 'Latencia del último turno', updated: 'Actualizada', signals: 'Señales', sessionStatus: 'Estado de la sesión', reset: 'Restablecer sesión', activeTime: 'Tiempo activo', turns: 'Turnos', interruptions: 'Interrupciones', microphone: 'Micrófono', inputLevel: 'Nivel de entrada', realtimeMetrics: 'Las métricas se actualizan en tiempo real durante la sesión.', underControl: 'Audio, transcripción y latencia bajo control.', backendUnavailable: 'Comprueba que el backend esté disponible en el puerto 3000.' },
    options: {
      servicios: ['Servicios', 'Clínicas, despachos, formación o servicios profesionales.'], local: ['Negocio local', 'Captas clientes en una ciudad o zona concreta.'], b2b: ['B2B', 'Vendes a otras empresas con ciclos comerciales consultivos.'], ecommerce: ['E-commerce', 'Vendes productos y necesitas volumen y recurrencia.'], agencia: ['Agencia', 'Llevas marketing o ventas para clientes y cuentas distintas.'],
      leads: ['Conseguir leads', 'Aumentar el número de oportunidades cualificadas.'], ventas: ['Cerrar más ventas', 'Convertir mejor los leads que ya entran.'], campanas: ['Coordinar campañas', 'Unir Ads, redes, email y landings en un mismo plan.'], retencion: ['Mejorar la relación', 'Automatizar seguimiento, nutrición y reactivación.'], visibilidad: ['Ganar visibilidad', 'Aprovechar búsquedas, contenido y presencia local.'],
      comercial: ['Comercial', 'Prioriza el seguimiento, las reuniones y el cierre.'], admin: ['Administrador', 'Necesita control, permisos, configuración y visión global.'], direccion: ['Dirección', 'Busca decisiones rápidas sobre ingresos, rendimiento y riesgos.'], marketing: ['Marketing', 'Orquesta campañas, contenido, audiencias y automatización.'],
      starter: ['Starter', 'Operativa esencial para un equipo pequeño.'], pro: ['Pro', 'Captación, conversación, automatización y ventas.'], agency: ['Agency', 'Gestión avanzada de clientes, cuentas y crecimiento.'], enterprise: ['Enterprise', 'Gobierno, permisos y control para organizaciones.'],
    },
  },
  en: {
    common: {
      appName: 'Vendrava', create: 'Create', from: 'From', until: 'Until', comingSoon: 'coming soon', save: 'Save changes', saving: 'Saving…', cancel: 'Cancel', close: 'Close', retry: 'Retry', reload: 'Reload application', search: 'Search', loading: 'Loading…', language: 'Language', spanish: 'Español', english: 'English', theme: 'Theme', themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark', enabled: 'Enabled', disabled: 'Disabled', connected: 'Connected', notConnected: 'Not connected', unavailable: 'Unavailable', realData: 'Live data', demoMode: 'Demo mode', noResults: 'No results', all: 'All', today: 'Today', next: 'Next', previous: 'Previous',
    },
    nav: {
      dashboard: 'Dashboard', objectives: 'Objectives', acquisition: 'Acquisition', conversation: 'Conversation', nurturing: 'Nurturing', growth: 'Growth', sales: 'Sales', system: 'System', campaigns: 'Campaigns', ads: 'Ads', social: 'Social media', prospectFinder: 'Prospect Finder', landings: 'Landings & websites', funnels: 'Funnels', organicLeads: 'Organic Leads', seo: 'SEO', inbox: 'Inbox', calls: 'Calls', agents: 'AI Agents', playbooks: 'Playbooks', voiceTest: 'Voice Test', emailMarketing: 'Email marketing', automations: 'Automations', growthHub: 'Growth Hub', leads: 'Leads', pipeline: 'Pipeline', meetings: 'Meetings', revenueIntelligence: 'Revenue intelligence', insights: 'Insights', knowledgeBase: 'Knowledge Base', settings: 'Settings', governance: 'Enterprise governance', accessControl: 'Access control', adRecipes: 'Ad recipes',
    },
    sidebar: {
      viewAll: 'View all', modulesAvailable: '{{count}} modules available', systemStatus: 'System status', statusUnavailable: 'Status unavailable in this view', aiCallUsage: 'AI call usage', usageUnavailable: 'Unavailable. Connect a usage source to check consumption and limits.', logout: 'Sign out',
    },
    experience: {
      workView: 'Workspace view', navigationMode: 'Navigation mode', basic: 'Basic', recommended: 'Recommended', recommendedShort: 'Recommended', advanced: 'Advanced', basicDescription: 'Only the essential areas for focused work.', recommendedDescription: 'Areas selected for your business, objective and role.', advancedDescription: 'The full platform available for your plan.', guidedSetup: 'Guided setup', context: 'Your context', objective: 'Your objective', role: 'Your role', workspace: 'Your workspace', skipSetup: 'Skip initial setup', saveAndContinue: 'Save and continue', finish: 'Get started',
    },
    settings: {
      title: 'Settings', general: 'GENERAL', platform: 'PLATFORM', communication: 'COMMUNICATION', security: 'SECURITY', billing: 'BILLING', companyProfile: 'Company profile', myProfile: 'My profile', usersTeams: 'Users and teams', rolesPermissions: 'Roles and permissions', phoneNumbers: 'Phone numbers', integrations: 'Integrations', apiWebhooks: 'API and webhooks', variablesFields: 'Variables and fields', messageTemplates: 'Message templates', emailNotifications: 'Email and notifications', reminders: 'Reminders', calendars: 'Calendars', securityAccess: 'Security and access', ssoAuth: 'SSO and authentication', audit: 'Audit log', planUsage: 'Plan and usage', billingDetails: 'Billing', paymentMethods: 'Payment methods', personalInformation: 'Personal information', accountPreferences: 'Manage your personal information and account preferences.', companyPreferences: 'Update your company information and regional preferences.', fullName: 'Full name', email: 'Email', role: 'Role', organizationId: 'Organization ID', changePhoto: 'Change photo', password: 'Password', currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Confirm password', language: 'Language', integrationsEmpty: 'No integrations connected yet.', helpCenter: 'Help center', documentation: 'Documentation', guidesTutorials: 'Guides and tutorials', support: 'Support', contactTeam: 'Contact our team', updates: 'What’s new', latestUpdates: 'View latest updates',
    },
    auth: {
      protectedAccess: 'Protected access', encryptedData: 'Encrypted data', available247: 'AI available 24/7', conversationalIntelligence: 'Conversational intelligence', activeConversation: 'Active conversation', confirmedMeeting: 'Meeting confirmed', listening: 'Listening · 00:42', meetingToday: 'Meeting · today 16:30', active: 'Vendrava is active', commercialTeam: 'Your sales team', autopilot: 'On autopilot.', agentsDescription: 'Voice agents that call, qualify and book meetings for you, without pauses.', designedForTeams: 'Built for teams that want to grow', simpleHumanScalable: 'Simple. Human. Scalable.', welcomeBack: 'Welcome back.', accessPlatform: 'Access your conversational AI platform', workspaceProtected: 'Your workspace is protected', email: 'Email address', emailPlaceholder: 'you@company.com', password: 'Password', passwordPlaceholder: 'Your password', hidePassword: 'Hide password', showPassword: 'Show password', forgotPassword: 'Forgot password?', recoveryTitle: 'Recover access with support', recoveryDescription: 'No email will be sent from this screen. Enter your account and open a message so support can validate the request.', accountEmail: 'Account email', openSupportEmail: 'Open support email', signIn: 'Sign in', signingIn: 'Signing in…', missingCredentials: 'Enter your email and password to continue.', invalidCredentials: 'The email or password is incorrect.', signInError: 'We could not sign you in. Please try again.',
    },
    errors: { viewReload: 'This view needs to be reloaded', accountProtected: 'The rest of your account is protected. You can retry the screen or reload the full application.', technicalDetail: 'Technical details', notFoundTitle: 'This page does not exist', notFoundDescription: 'The address {{path}} is unavailable or has changed.', goHome: 'Go to home' },
    onboarding: {
      businessTypeTitle: 'What kind of business do you want to grow?', objectiveTitle: 'Which outcome should you prioritize?', profileTitle: 'How will you use Vendrava?', planTitle: 'What level of experience do you need?', buildActionCenter: 'Let’s build your action center', intro: 'We will show you first what helps you achieve the result you want.', step: 'Step {{current}} of {{total}}', recommendedWorkspace: 'Your recommended workspace', clearPlan: 'You will start with a clear plan without losing access to the rest of the platform.', recommendationIntro: 'These areas best match your answers. You can change mode whenever you want.', recommendedModules: 'Recommended modules', noAdditionalModules: 'There are no additional modules for this combination yet.', initialMode: 'Choose the initial mode', planNote: 'The plan only organizes what you see in navigation. It does not change your subscription or actual permissions.', skipForNow: 'Skip for now', back: 'Back', continue: 'Continue', enterWorkspace: 'Enter my workspace',
    },
    dashboard: {
      operationsCenter: 'Operations center', welcome: 'Hello, Sales Team 👋', todaySummary: 'Here is a summary of your activity today.', noComparison: 'No comparison', previousWeek: 'Previous week', previousMonth: 'Previous month', previousYear: 'Previous year', callsMade: 'Calls\nmade', contactedLeads: 'Leads\ncontacted', meetingsBooked: 'Meetings\nbooked', conversionRate: 'Conversion\nrate', pipelineGenerated: 'Pipeline\ngenerated', attributedRevenue: 'Attributed\nrevenue', systemRoi: 'System\nROI', liveData: 'Live data', noDataYet: 'No data yet', disconnectedApi: 'API disconnected', syncing: 'Syncing…', demoActive: 'Demo data active', metric: 'Metric', value: 'Value', change: 'Change %', editDashboard: 'Edit dashboard', visibleWidgets: '{{visible}} of {{total}} visible', widgetHelp: 'Drag widgets to reorder them. Drag the corners to resize them. Press the × on a widget to remove it.', removedWidgets: 'Removed widgets', availableWidgets: 'Available widgets', reset: 'Reset', allVisible: 'All widgets are visible. Remove one from the dashboard to make it appear here.',
    },
    status: { live: 'Live data', demo: 'Explicit demo mode', empty: 'No data yet', disconnected: 'Integration disconnected', error: 'Connection error', loading: 'Loading data', plan: 'Not included in your plan', retry: 'Retry', configure: 'Configure' },
    calls: { title: 'Calls', subtitle: 'Listen, understand and convert every conversation.', commands: 'Commands', refresh: 'Refresh', filters: 'Filters', export: 'Export', newCall: 'New call', intelligence: 'Vendrava intelligence', heroTitle: 'Every conversation', heroAccent: 'is an opportunity.', heroDescription: 'Vendrava AI analyzes your calls, detects key signals and helps you make better decisions to close more deals.', recentCalls: 'View recent calls', copilot: 'Open copilot', summary: 'Call summary', totalCalls: 'Total calls', averageDuration: 'Average duration', conversionRate: 'Conversion rate', meetingsBooked: 'Meetings booked', recent: 'Recent calls', conversationsInView: '{{count}} conversations in this view', customizeView: 'Customize view', searchPlaceholder: 'Search contact, company or role…', contact: 'Contact', company: 'Company', date: 'Date', outcome: 'Outcome', selectAll: 'Select all visible calls', noCalls: 'No calls yet', noMatches: 'No calls found', startCall: 'Start a call to record the first conversation.', tryAnother: 'Try another contact, company or outcome.', todayPerformance: 'Today’s performance', syncedMetrics: 'Metrics synced', noMetrics: 'No metrics available', liveMetrics: 'Live metrics available.', noPerformanceData: 'No performance data yet', notQueued: 'The call could not be queued. Please try again.', leadWithoutCampaign: 'This lead has no campaign assigned. Link it to a campaign before calling.', leadWithoutPhone: 'This lead has no phone number.', queueUnavailable: 'The calling system is unavailable right now.',
    },
    modal: { newLead: 'New lead', createLead: 'Create lead', newAgent: 'New AI agent', createAgent: 'Create agent', newArticle: 'New article', createArticle: 'Create article', newAutomation: 'New automation', createAutomation: 'Create automation', newMeeting: 'New meeting', createMeeting: 'Create meeting', rescheduleMeeting: 'Reschedule meeting', confirmNewDate: 'Confirm new date', dateTimeRequired: 'Enter a date and time', newOpportunity: 'New opportunity', createOpportunity: 'Create opportunity', newPlaybook: 'Create playbook', createPlaybook: 'Create playbook', importLeads: 'Import leads from CSV', createError: 'The record could not be created.', connectionError: 'Connection error', campaignRequired: 'Select a campaign', fileRequired: 'Select a CSV file', importError: 'Could not import the CSV file', selectExistingLead: 'Select an existing lead from the list.', opportunityNameOptional: 'Opportunity name (optional)', fullName: 'Full name', name: 'Name', role: 'Role', company: 'Company', email: 'Email', phone: 'Phone', status: 'Status', potentialValue: 'Potential value', source: 'Source', tags: 'Tags', callNow: 'Call now if a phone number is available', agentName: 'Agent name', subrole: 'Sub-role', objective: 'Description / objective', personality: 'Personality', title: 'Title', category: 'Category', summary: 'Description / summary', author: 'Author', description: 'Description', trigger: 'Trigger', channelResponse: 'Channel response', sendToSegment: 'Send the lead to a Mautic segment when triggered', segmentAlias: 'Mautic segment alias', lead: 'Lead', newLead: 'Create new', existingLead: 'Use existing lead', searchLead: 'Search by name, phone or email…', selectedLead: 'Selected lead', stage: 'Stage', date: 'Date', time: 'Time', duration: 'Duration', meetingObjective: 'Meeting objective', changeReason: 'Reason for change (optional)', estimatedValue: 'Estimated value (€)', probability: 'Probability (0-100)', type: 'Type', campaign: 'Campaign', import: 'Import', processing: 'Processing…', sending: 'Sending…', imported: 'Imported', duplicates: 'Duplicates', errors: 'Errors', rows: 'rows', expectedColumns: 'Expected columns: name, phone, email, company.', autoCall: 'Call imported leads automatically', importing: 'Importing…', importCompleted: 'Import completed', importErrors: 'Import completed with errors',
    },
    legal: { backToLogin: '← Back to sign in', privacyTitle: 'Privacy policy', termsTitle: 'Terms of use', lastUpdated: 'Last updated: July 15, 2026', privacy1: 'Vendrava processes the data required to provide the service: authorized user data, commercial information entered by the organization, and technical usage and security data. Data is processed according to the instructions of the account owner and the settings enabled in the account.', privacy2: 'Access is protected by authentication controls and external integrations are explicitly enabled from the platform. The organization must apply the information, consent and retention obligations that apply to its contacts.', privacy3: 'To exercise your data rights, report a privacy issue or request information about the processing applicable to your organization, email soporte@vendrava.app. The data processing agreement signed with the account owner prevails over this summary.', viewTerms: 'Read the terms of use', terms1: 'Access to Vendrava is reserved for people authorized by the account owner. Each user must protect their credentials and use the platform lawfully and according to their organization’s internal policies.', terms2: 'The account owner is responsible for having a legal basis for the data it imports and communications it sends through the platform, and for reviewing campaign, automation and integration settings before enabling them.', terms3: 'For access, security or account-use issues, contact soporte@vendrava.app. The applicable contractual relationship and any data processing addendum prevail over this summary.', viewPrivacy: 'Read the privacy policy' },
    campaignShare: { loading: 'Loading campaign summary…', unavailable: 'This link is no longer available', loadError: 'We could not load the campaign', askUpdatedLink: 'Ask the person who shared it for an updated link.', retry: 'Please try again in a few minutes.', readOnly: 'Read-only shared view', campaignSummary: 'Campaign summary', objectiveFallback: 'A clear summary of the commercial progress and signals generated by this campaign.', conversion: 'conversion', metrics: 'Campaign metrics', contactsAdded: 'contacts added', coverage: '{{rate}}% coverage', opportunities: 'opportunities activated', commercialProgress: 'Commercial progress', interestToConversation: 'From interest to conversation.', realActivity: 'Metrics update with the campaign’s real activity.', leadsReceived: 'Leads received', contactsWorked: 'Contacts worked', meetingsGenerated: 'Meetings generated', secureFooter: 'Data securely shared by Robin.', realtime: 'Updated in real time' },
    landing: { loading: 'Preparing your experience…', openError: 'We could not open this landing page.', retryLink: 'Check the link and try again.', retry: 'Try again', backHome: 'Back to home', landingNav: 'Landing page navigation', includes: 'What’s included', process: 'How it works', faq: 'Frequently asked questions', information: 'I want information', nextStep: 'I want to take the next step', seeProcess: 'See how it works', noCommitment: 'No commitment', protectedData: 'Protected data', humanResponse: 'Human response', personalizedExperience: 'Personalized support experience', nextMove: 'Your next step', startsHere: 'starts here', offerAvailable: 'Available offer', noFinePrint: 'No fine print', receive: 'What you’ll receive', requestGuidance: 'Request guidance', benefitsTitle: 'Everything you need to move forward with confidence.', benefitsDescription: 'A simple, human experience designed to make the next step obvious.', designedForCase: 'Designed for your case', processTitle: 'A simple three-step process.', processDescription: 'Less friction, more clarity from the first conversation.', tellUs: 'Tell us', tellUsText: 'Share your details and what you want to achieve.', guideYou: 'We guide you', guideYouText: 'We understand your case and suggest the best direction.', start: 'Get started', startText: 'Choose your next step with all the information.', conversationBeforeCall: 'The conversation starts before the call.', contextText: 'We provide context, listen to your needs and respect the pace you need to decide.', talkToSomeone: 'Talk to someone', resolveQuestions: 'We answer your questions.', faqDescription: 'If you cannot find the answer, leave your details and we will help personally.', ready: 'Ready to move forward?', finalTitle: 'The next step can be simpler.', finalText: 'Tell us what you need and we will start there.', landingFooter: 'Vendrava acquisition experience', responsibleData: 'Responsible data handling', formStep: 'Take the next step', formTitle: 'Let’s talk about what you need.', formDescription: 'Leave your details and we will contact you with personalized guidance.', fullName: 'Full name', phone: 'Phone', optional: 'Optional', bestTime: 'When works best for you?', asSoonAsPossible: 'As soon as possible', morning: 'In the morning', afternoon: 'In the afternoon', afterSix: 'After 6:00 PM', consent: 'I agree to be contacted to respond to my request.', sendingRequest: 'Sending request…', contactMe: 'Contact me', usedOnly: 'Your data is used only to reply to you.', requestReceived: 'Request received', thanks: 'Thank you, {{name}}.', receivedDescription: 'We received your details. We will contact you soon to better understand what you need.', reviewRequest: 'We review your request', respectTime: 'We respect your preferred time', clearResponse: 'We give you a clear response', closeConfirmation: 'Close confirmation', namePhoneRequired: 'Enter your name and phone number so we can contact you.', consentRequired: 'We need your authorization to respond to this request.', sendError: 'Could not send. Please try again.' },
    modules: { campaignsTitle: 'We bring you customers.', campaignsSubtitle: 'Launch campaigns, turn interest into conversations and take every opportunity to the meeting.', newCampaign: 'New campaign', createCampaign: 'Create campaign', allCampaigns: 'All campaigns', campaignPerformance: 'Performance', leadsTitle: 'Turn commercial signals into the right next conversation.', leadsHero: 'Prioritize what can close today', leadsHeroText: 'Vendrava combines intent, timing and context so the team can focus on leads most likely to convert.', pipelineTitle: 'Pipeline', pipelineCreate: 'Create opportunity', automationTitle: 'Automations', automationSubtitle: 'Design workflows that work in the background to move every opportunity forward.', agentTitle: 'AI Agents', knowledgeTitle: 'Knowledge Base', insightsTitle: 'Insights', meetingsTitle: 'Meetings', meetingsSubtitle: 'Organize the next step for every conversation.', viewFlows: 'View flows', createFlow: 'Create a flow', exploreAutomations: 'Explore automations', automationEngine: 'Automation engine ready', automationHeroTitle: 'Your operation should not depend on remembering every step.', automationHeroText: 'Connect triggers and actions so follow-up happens automatically, with the same precision every time.', simpleArchitecture: 'Simple architecture', lessRepetition: 'Fewer repetitive tasks. More time to decide.', automationFlowText: 'Each flow combines an input event with measurable, easy-to-review actions.', trigger: 'Trigger', rule: 'Rule', action: 'Action', quickStart: 'Get started quickly', threeFlows: 'Three flows to get moving', useKnownBase: 'Start with a proven base and adjust the details to your process.', createFromScratch: 'Create from scratch', controlCenter: 'Control center', allFlows: 'All your flows', automationLibraryText: 'Search, filter and review the status of every automation.', automationCount: '{{shown}} of {{total}} flows', automationSearch: 'Search by name or description…', automationName: 'Automation', status: 'Status', executions: 'Executions', lastExecution: 'Last execution', noFilteredFlows: 'No flows match these filters', noAutomations: 'You do not have automations yet', noFlowsHint: 'Try another search or change the filter to see more results.', createFirstFlow: 'Create your first flow and let follow-up happen automatically.', agentsSubtitle: 'Create and configure your organization’s voice agents.', agentSettings: 'Agent settings', agentHeroTitle: 'Centralize your agent configuration.', agentHeroText: 'Review registered agents and save the changes supported by the platform.', workspace: 'Your workspace', selectAgentText: 'Select an agent to review its configurable fields.', registeredAgents: 'Registered agents', visibleAgents: '{{count}} visible', searchAgent: 'Search agent…', recent: 'Most recent', nameAZ: 'Name A-Z', noMatchingAgents: 'No agents match these filters.', noRegisteredAgents: 'There are no registered agents yet.', createNewAgent: 'Create new agent', selectOrCreateAgent: 'Select or create an agent', selectOrCreateAgentText: 'Once an agent is registered, you can review and save its configuration here.', saveChanges: 'Save changes', savingChanges: 'Saving…', upcoming: 'Available soon', roleStored: 'Role stored on the agent', choosePurpose: 'Choose the purpose', profile: 'Current profile', fieldPersistent: 'Persistent field', agentInstructions: 'Agent instructions', agentInstructionsText: 'These instructions are saved as the agent system prompt.', identity: 'Agent identity', fieldsPersistent: 'Persistent fields', voiceSettings: 'Voice settings', keyMessages: 'Key messages', sourcePending: 'Source pending', manageKnowledge: 'Manage Knowledge Base', activity: 'Activity', knowledgeTitle: 'Connect your business knowledge.', knowledgeText: 'Manage articles and sources from Knowledge Base.', kbSubtitle: 'Centralize the information your agents need to answer.', insightsSubtitle: 'Turn CRM activity into decisions that move the pipeline.' },
    meta: { title: 'Meta Ads account', subtitle: 'Connect your ad account to publish real campaigns.', connected: 'Account connected successfully.', connectError: 'The account could not be connected. Try again.', oauthError: 'Could not start OAuth.', budgetSaved: 'Daily budget saved.', budgetSaveError: 'Could not save the budget.', pixelSaved: 'Pixel ID saved.', pixelSaveError: 'Could not save the Pixel ID.', disconnectConfirm: 'Are you sure you want to disconnect the Meta account?', disconnected: 'Account disconnected.', disconnectError: 'Could not disconnect the account.', noAccount: 'No Meta account is connected.', connectAccount: 'Connect Meta account', accountId: 'Ad account ID', status: 'Status', page: 'Meta page', connectedAt: 'Connected', dailyCap: 'Daily spend cap (€)', noCap: 'No cap', save: 'Save', dailyCapHint: 'If daily spend exceeds this value, the campaign is paused automatically.', pixelId: 'Meta Pixel ID', pixelHint: 'Required to send conversions (Lead, Schedule) to the Meta Conversions API.', disconnect: 'Disconnect account' },
    adPlaybooks: { title: 'Ad recipes', subtitle: 'Playbooks by vertical for the Meta Ads wizard.', new: 'New recipe', total: 'Total recipes', active: 'Active', inactive: 'Inactive', search: 'Search by vertical…', noItems: 'There are no recipes yet. Create the first one.', noMatches: 'No recipe matches «{{query}}».', usedIn: 'Used in {{count}} campaigns', usedInOne: 'Used in {{count}} campaign', edit: 'Edit', disable: 'Disable', enable: 'Enable', vertical: 'Vertical', landingTemplate: 'Landing template', offer: 'Offer', leadMagnet: 'Lead magnet', adCopy: 'Ad copy', imagePrompt: 'Image prompt', imagePromptPlaceholder: 'English prompt used to generate the image', save: 'Save', saving: 'Saving…', cancel: 'Cancel', loadError: 'Could not load the recipes.', required: 'Complete the required fields.', saved: 'Recipe saved.', saveError: 'Could not save the recipe.', statusError: 'Could not change the status.' },
    details: { back: 'Back', agents: 'AI agents', train: 'Train', save: 'Save changes', saved: 'Saved', summary: 'Summary', conversations: 'Conversations', configuration: 'Configuration', playbooks: 'Playbooks', performance: 'Performance', noRecording: 'No recording available', noRecordingText: 'This call has no recording attached.', play: 'Play call', pause: 'Pause call', downloadAudio: 'Download audio', noCall: 'The call could not be loaded.', noCallText: 'Check the connection and try again.', transcript: 'Transcript', notes: 'Notes', addNote: 'Add note', notePlaceholder: 'Write a note…', saveNote: 'Save note', noNotes: 'There are no notes yet.', action: 'Action', delete: 'Delete', updateError: 'Could not update the action.', failedSave: 'Could not save the note.', failedDelete: 'Could not delete the note.', loadingCall: 'Loading call…' },
    voiceTest: { title: 'Voice test', subtitle: 'Test your agent’s voice quality in real time and review session performance.', back: 'Back to agents', systemReady: 'System operational', configuration: 'Configuration', session: 'Test session', intro: 'Add the agent you want to hear. Your organization is loaded from the protected session.', optional: 'optional', agentPlaceholder: 'Select an Agent ID', privateSession: 'Data is used only during this session.', agentResponse: 'Agent response', micActive: 'Microphone active', engineReady: 'Voice engine ready', agentSpeaking: 'The agent is speaking', listening: 'We are listening', ready: 'Ready to speak', start: 'Start session', stop: 'Stop session', microphoneHint: 'Your device default microphone will be used.', conversation: 'Conversation', realtimeSignals: 'Real-time transcript and signals', live: 'Live', waiting: 'Waiting', clear: 'Clear', listeningVoice: 'Listening to your voice', realtimeResponse: 'Your voice and the agent response will appear here in real time.', bidirectionalAudio: 'Bidirectional audio', wordConfidence: 'Word confidence', private: 'Private session', diagnostics: 'Session diagnostics', inactive: 'Inactive', responding: 'Agent responding', latency: 'Latency', lastTurn: 'Last complete turn', noData: 'No data yet', network: 'Network', sent: 'sent', received: 'received', confidence: 'Confidence', lastTranscript: 'Latest transcript', performance: 'Performance', lastTurnLatency: 'Latest turn latency', updated: 'Updated', signals: 'Signals', sessionStatus: 'Session status', reset: 'Reset session', activeTime: 'Active time', turns: 'Turns', interruptions: 'Interruptions', microphone: 'Microphone', inputLevel: 'Input level', realtimeMetrics: 'Metrics update in real time during the session.', underControl: 'Audio, transcript and latency under control.', backendUnavailable: 'Check that the backend is available on port 3000.' },
    options: {
      servicios: ['Services', 'Clinics, firms, education or professional services.'], local: ['Local business', 'Acquire customers in a specific city or area.'], b2b: ['B2B', 'Sell to other companies through consultative sales cycles.'], ecommerce: ['E-commerce', 'Sell products and need volume and repeat purchases.'], agencia: ['Agency', 'Run marketing or sales for different clients and accounts.'],
      leads: ['Generate leads', 'Increase the number of qualified opportunities.'], ventas: ['Close more sales', 'Convert the leads you already receive more effectively.'], campanas: ['Coordinate campaigns', 'Connect Ads, social, email and landings in one plan.'], retencion: ['Improve relationships', 'Automate follow-up, nurturing and reactivation.'], visibilidad: ['Increase visibility', 'Use search, content and local presence more effectively.'],
      comercial: ['Sales', 'Prioritize follow-up, meetings and closing.'], admin: ['Administrator', 'Needs control, permissions, configuration and global visibility.'], direccion: ['Leadership', 'Needs fast decisions on revenue, performance and risk.'], marketing: ['Marketing', 'Orchestrate campaigns, content, audiences and automation.'],
      starter: ['Starter', 'Essential operations for a small team.'], pro: ['Pro', 'Acquisition, conversation, automation and sales.'], agency: ['Agency', 'Advanced management of clients, accounts and growth.'], enterprise: ['Enterprise', 'Governance, permissions and organizational control.'],
    },
  },
}

function readInitialLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  let stored = null
  try {
    stored = window.localStorage?.getItem(LOCALE_STORAGE_KEY)
  } catch {
    // Fall back to the browser language when storage is unavailable.
  }
  if (SUPPORTED_LOCALES.includes(stored)) return stored
  return window.navigator?.language?.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LOCALE
}

function resolveMessage(locale, key) {
  return key.split('.').reduce((value, part) => value?.[part], messages[locale])
    ?? key.split('.').reduce((value, part) => value?.[part], messages[DEFAULT_LOCALE])
}

function interpolate(value, variables) {
  if (!variables || typeof value !== 'string') return value
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(variables[name] ?? ''))
}

export function getLocale() {
  return readInitialLocale()
}

export function localeCode(locale = DEFAULT_LOCALE) {
  return locale === 'en' ? 'en-US' : 'es-ES'
}

export function formatLocaleNumber(value, locale = DEFAULT_LOCALE, options) {
  return new Intl.NumberFormat(localeCode(locale), options).format(value)
}

export function formatLocaleDate(value, locale = DEFAULT_LOCALE, options) {
  return new Intl.DateTimeFormat(localeCode(locale), options).format(value)
}

export function createTranslator(locale) {
  return (key, variables) => interpolate(resolveMessage(locale, key), variables)
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readInitialLocale)
  const setLocale = nextLocale => {
    const normalized = String(nextLocale || '').toLowerCase().split('-')[0]
    if (!SUPPORTED_LOCALES.includes(normalized)) return
    try {
      window.localStorage?.setItem(LOCALE_STORAGE_KEY, normalized)
      if (typeof document !== 'undefined') document.documentElement.lang = normalized
    } catch {
      // The in-memory locale remains authoritative when browser storage is blocked.
    }
    setLocaleState(normalized)
  }

  useEffect(() => {
    try {
      window.localStorage?.setItem(LOCALE_STORAGE_KEY, locale)
      if (typeof document !== 'undefined') document.documentElement.lang = locale
    } catch {
      // The current session still works when storage is blocked.
    }
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t: createTranslator(locale) }), [locale])
  return createElement(I18nContext.Provider, { value }, children)
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}

export function localeLabel(locale) {
  return locale === 'en' ? messages.en.common.english : messages.es.common.spanish
}
