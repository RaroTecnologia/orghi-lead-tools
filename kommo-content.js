// Envolvendo todo o código em uma IIFE para permitir o uso do return
(function() {
  // Verifica se o script já foi carregado
  if (window.orghiLeadToolsLoaded) {
    console.log('[Orghi Lead Tools] Script já carregado, ignorando...');
    return;
  }
  window.orghiLeadToolsLoaded = true;

  // Função para debug
  function debugLog(message) {
    console.log('[Orghi Lead Tools]', message);
  }

  // Verifica se estamos na página correta
  function isOnPipelinePage() {
    const isPipeline = window.location.pathname.includes('/leads/pipeline/');
    debugLog(`Verificando página: ${window.location.pathname} - É pipeline? ${isPipeline}`);
    return isPipeline;
  }

  // Função para navegar para a página de pipeline
  function navigateToPipeline() {
    debugLog('Navegando para página de pipeline...');
    window.location.href = window.location.origin + '/leads/pipeline/';
    return new Promise(resolve => {
      // Aguarda a navegação completar
      const checkLoaded = setInterval(() => {
        if (document.readyState === 'complete' && isOnPipelinePage()) {
          clearInterval(checkLoaded);
          debugLog('Navegação completa!');
          resolve();
        }
      }, 100);
    });
  }

  // Função para debug com verificação de disponibilidade do chrome.runtime
  function sendMessageSafely(message) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(message);
      } catch (error) {
        console.error('[Orghi Lead Tools] Erro ao enviar mensagem:', error);
      }
    } else {
      console.warn('[Orghi Lead Tools] chrome.runtime não está disponível');
    }
  }

  // Função para salvar no storage com verificação
  function saveToStorageSafely(data) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      try {
        chrome.storage.sync.set(data);
      } catch (error) {
        console.error('[Orghi Lead Tools] Erro ao salvar no storage:', error);
      }
    } else {
      console.warn('[Orghi Lead Tools] chrome.storage não está disponível');
    }
  }

  // Função para observar mudanças na página e detectar quando os status são carregados
  function observeStatusChanges() {
    // Se não estiver na página correta, não faz nada
    if (!isOnPipelinePage()) {
      debugLog('Não estamos na página de pipeline, ignorando observação');
      return;
    }

    debugLog('Iniciando observação de status...');

    // Tenta encontrar os status imediatamente
    const checkStatus = () => {
      debugLog('Verificando status...');
      const statusElements = document.querySelectorAll('.pipeline_status__head');
      debugLog(`Encontrados ${statusElements.length} status`);
      
      if (statusElements.length > 0) {
        const statuses = Array.from(statusElements).map(el => ({
          id: el.getAttribute('data-id') || el.id.replace('status_id_', ''),
          name: el.querySelector('.pipeline_status__head_title').textContent.trim()
        }));

        debugLog('Status encontrados:', statuses);

        // Usa as funções seguras
        saveToStorageSafely({ leadStatuses: statuses });
        sendMessageSafely({
          type: 'leadStatuses',
          statuses: statuses
        });

        return true;
      }
      return false;
    };

    // Tenta imediatamente
    if (checkStatus()) {
      debugLog('Status encontrados imediatamente!');
      return;
    }

    // Se não encontrou, observa mudanças
    debugLog('Iniciando observador de mudanças...');
    const observer = new MutationObserver(() => {
      if (checkStatus()) {
        debugLog('Status encontrados após mudança!');
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Tenta novamente após 2 segundos
    setTimeout(() => {
      if (checkStatus()) {
        debugLog('Status encontrados no timeout!');
        observer.disconnect();
      }
    }, 2000);
  }

  // Função para buscar leads de um status específico
  async function getLeadsFromStatus(statusId, count) {
    debugLog(`Buscando ${count} leads do status ${statusId}`);

    // Se não estiver na página correta, navega para ela
    if (!isOnPipelinePage()) {
      debugLog('Não estamos na página de pipeline, navegando...');
      await navigateToPipeline();
    }

    // Clica no status para filtrar
    const statusElement = document.querySelector(`#status_id_${statusId}`);
    if (!statusElement) {
      debugLog('Status não encontrado!');
      return { error: 'Status não encontrado' };
    }

    debugLog('Clicando no status...');
    statusElement.click();

    // Aguarda carregar os leads
    return new Promise((resolve) => {
      setTimeout(() => {
        const leads = Array.from(document.querySelectorAll('.pipeline-leads__item'))
          .slice(0, count)
          .map(lead => {
            const nameEl = lead.querySelector('.pipeline-leads__item-title');
            const phoneEl = lead.querySelector('[data-type="phone"]');
            
            return {
              id: lead.getAttribute('data-id'),
              name: nameEl ? nameEl.textContent.trim() : '',
              phone: phoneEl ? phoneEl.getAttribute('data-phone') : ''
            };
          })
          .filter(lead => lead.phone); // Filtra apenas leads com telefone

        debugLog(`Encontrados ${leads.length} leads com telefone`);
        resolve({ leads });
      }, 1000); // Aguarda 1 segundo para carregar os leads
    });
  }

  // Função para ocultar linhas de WhatsApp não desejadas
  function filterWhatsappLines(channels) {
    debugLog(`Iniciando filterWhatsappLines com canais:`, channels);

    // Verifica se estamos na página de detalhes do lead
    if (!window.location.pathname.includes('/leads/detail/')) {
      debugLog('Não estamos na página de detalhes do lead, ignorando filtro');
      return;
    }

    // Função que aplica o filtro em um elemento
    function applyFilter(element) {
      debugLog('Aplicando filtro em elemento:', element);
      const items = element.querySelectorAll('.tips-item');
      items.forEach(item => {
        // Verifica se é um item de WhatsApp (procurando pela imagem do WhatsApp)
        const isWhatsApp = item.querySelector('img[src*="whatsapp"]') || 
                          item.querySelector('img[src*="waba"]') ||
                          item.querySelector('img[src*="amocrmwa"]');
        
        if (isWhatsApp) {
          const itemText = item.textContent.trim();
          debugLog(`Item WhatsApp encontrado: ${itemText}`);
          
          // Verifica se o item contém algum dos canais permitidos
          const isAllowed = channels.some(channel => itemText.includes(channel));
          
          if (!isAllowed) {
            debugLog(`Ocultando: ${itemText}`);
            item.style.display = 'none';
          } else {
            debugLog(`Mantendo visível: ${itemText} (canal permitido)`);
            item.style.display = '';
          }
        }
      });
    }

    // Função para filtrar os mensageiros no perfil
    function filterProfileMessengers() {
      const messengers = document.querySelectorAll('.profile_messengers-item');
      messengers.forEach(messenger => {
        const isWhatsAppLite = messenger.classList.contains('profile_messengers-item-com.amocrm.amocrmwa');
        const isCloudAPI = messenger.classList.contains('profile_messengers-item-waba');
        
        if (isWhatsAppLite) {
          debugLog('Ocultando WhatsApp Lite');
          messenger.parentElement.style.display = 'none';
          // Oculta também o contador +1 se existir
          const counter = messenger.parentElement.querySelector('.profile_messengers-counter');
          if (counter) {
            counter.style.display = 'none';
          }
        } else if (isCloudAPI) {
          debugLog('Mantendo Cloud API visível');
          messenger.style.display = '';
          // Ajusta o wrapper do Cloud API
          const wrapper = messenger.closest('.profile_messengers-item-wrapper');
          if (wrapper) {
            wrapper.style.marginLeft = '0';
            wrapper.style.paddingLeft = '0';
          }
          // Ajusta o container dos mensageiros
          const container = messenger.closest('.profile_messengers-inner');
          if (container) {
            container.style.marginLeft = '0';
            container.style.paddingLeft = '0';
          }
        }
      });
    }

    // Função para verificar se um elemento é um dropdown relevante
    function isRelevantDropdown(element) {
      return element && 
             element.classList.contains('tips__inner') && 
             element.classList.contains('custom-scroll');
    }

    // Observer para mudanças no DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Verifica nodes adicionados
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Elemento HTML
            if (isRelevantDropdown(node)) {
              debugLog('Dropdown adicionado:', node);
              applyFilter(node);
            }
            // Procura por dropdowns dentro do node adicionado
            const dropdowns = node.querySelectorAll('.tips__inner.custom-scroll');
            dropdowns.forEach(dropdown => {
              debugLog('Dropdown encontrado dentro do node:', dropdown);
              applyFilter(dropdown);
            });
          }
        });

        // Verifica o target da mutação
        if (mutation.target.nodeType === 1) {
          if (isRelevantDropdown(mutation.target)) {
            debugLog('Dropdown modificado:', mutation.target);
            applyFilter(mutation.target);
          }
          // Verifica se há mensageiros no perfil
          filterProfileMessengers();
        }
      });
    });

    // Configuração do observer
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-type']
    });

    // Verifica dropdowns já existentes
    debugLog('Verificando dropdowns existentes...');
    const existingDropdowns = document.querySelectorAll('.tips__inner.custom-scroll');
    existingDropdowns.forEach(dropdown => {
      debugLog('Dropdown existente encontrado:', dropdown);
      applyFilter(dropdown);
    });

    // Verifica mensageiros existentes
    debugLog('Verificando mensageiros existentes...');
    filterProfileMessengers();
  }

  // Carrega a configuração inicial do WhatsApp
  debugLog('Carregando configuração do WhatsApp...');
  chrome.storage.sync.get(['whatsappChannels'], function(result) {
    if (result.whatsappChannels && result.whatsappChannels.length > 0) {
      debugLog(`Canais configurados:`, result.whatsappChannels);
      filterWhatsappLines(result.whatsappChannels);
    } else {
      debugLog('Nenhum canal configurado ainda');
    }
  });

  // Inicia observação quando a página carregar
  debugLog('Content script carregado!');
  observeStatusChanges();

  // Função para gerenciar tentativas de ligação
  async function handleCallAttempt(motivoNome) {
    // Busca o motivo e suas tentativas
    const result = await new Promise(resolve => {
      chrome.storage.sync.get(['motivos', 'lastAttempts'], resolve);
    });

    const motivo = result.motivos?.find(m => m.nome === motivoNome);
    if (!motivo || !motivo.tentativas?.length) {
      debugLog('Motivo não encontrado ou sem tentativas configuradas');
      return null;
    }

    // Inicializa ou recupera o contador de tentativas para este lead
    const leadId = window.location.pathname.split('/').pop();
    const lastAttempts = result.lastAttempts || {};
    const currentAttempt = (lastAttempts[leadId] || 0) + 1;

    // Se o motivo tem apenas uma tentativa, sempre retorna ela
    if (motivo.tentativas.length === 1) {
      debugLog('Motivo tem apenas uma tentativa, retornando ela');
      return motivo.tentativas[0];
    }

    // Se já passou da última tentativa
    if (currentAttempt > motivo.tentativas.length) {
      debugLog('Todas as tentativas foram esgotadas');
      return null;
    }

    // Atualiza o contador de tentativas
    lastAttempts[leadId] = currentAttempt;
    await new Promise(resolve => {
      chrome.storage.sync.set({ lastAttempts }, resolve);
    });

    // Retorna a configuração da tentativa atual
    return motivo.tentativas[currentAttempt - 1];
  }

  // Atualiza o listener de mensagens para usar a nova função
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        debugLog('Mensagem recebida:', request);
        
        // Responde ao ping
        if (request.action === 'ping') {
          sendResponse({ status: 'ok' });
          return;
        }
        
        // Busca leads
        if (request.action === 'getLeads') {
          getLeadsFromStatus(request.status, request.count)
            .then(sendResponse);
          return true;
        }

        // Atualiza linha do WhatsApp
        if (request.action === 'updateWhatsappLine') {
          debugLog(`Atualizando canais para:`, request.channels);
          filterWhatsappLines(request.channels);
          sendResponse({ success: true });
          return;
        }

        // Gerencia tentativa de ligação
        if (request.action === 'handleCallAttempt') {
          handleCallAttempt(request.motivoNome)
            .then(attempt => {
              if (attempt) {
                sendResponse({
                  success: true,
                  status: attempt.status,
                  nota: attempt.nota
                });
              } else {
                sendResponse({
                  success: false,
                  error: 'Todas as tentativas foram esgotadas'
                });
              }
            });
          return true;
        }
      });
    } catch (error) {
      console.error('[Orghi Lead Tools] Erro ao configurar listener de mensagens:', error);
    }
  }

  // Função para adicionar o botão do discador
  function addDialerButton() {
    // Verifica se está na página do pipeline
    if (!window.location.pathname.includes('/leads/pipeline/')) {
      return;
    }

    // Procura o container de ações
    const actionsContainer = document.querySelector('.list__top__actions');
    if (!actionsContainer) {
      return;
    }

    // Procura o botão "Novo lead" para referência
    const newLeadButton = actionsContainer.querySelector('.button-input_add-lead');
    if (!newLeadButton) {
      return;
    }

    // Verifica se o botão já existe para evitar duplicatas
    if (actionsContainer.querySelector('#orghi-dialer-button')) {
      return;
    }

    // Cria o botão do discador
    const dialerButton = document.createElement('a');
    dialerButton.id = 'orghi-dialer-button'; // ID único para verificação
    dialerButton.className = 'button-input button-input_add button-input_blue';
    dialerButton.style.marginRight = '8px';
    dialerButton.innerHTML = `
      <svg class="svg-icon" style="width: 12px; height: 12px;" viewBox="0 0 24 24">
        <path fill="currentColor" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
      </svg>
      <span class="button-input-inner__text">Discador</span>
    `;

    // Adiciona o evento de clique
    dialerButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'openPopup'
      });
    });

    // Insere o botão antes do "Novo lead"
    newLeadButton.parentNode.insertBefore(dialerButton, newLeadButton);
  }

  // Observa mudanças específicas na DOM para adicionar o botão quando necessário
  const observer = new MutationObserver((mutations) => {
    // Verifica se já existe o botão
    if (!document.querySelector('#orghi-dialer-button')) {
      addDialerButton();
    }
  });

  // Inicia a observação apenas no container principal
  const mainContainer = document.querySelector('#work_area') || document.body;
  observer.observe(mainContainer, {
    childList: true,
    subtree: true
  });

  // Tenta adicionar o botão imediatamente
  addDialerButton();
})(); 