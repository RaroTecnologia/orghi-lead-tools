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

        // Salva no storage
        chrome.storage.sync.set({ leadStatuses: statuses });

        // Envia para o popup
        chrome.runtime.sendMessage({
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

  // Listener para mensagens do popup
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
      return true; // Mantém a conexão aberta para resposta assíncrona
    }

    // Atualiza linha do WhatsApp
    if (request.action === 'updateWhatsappLine') {
      debugLog(`Atualizando canais para:`, request.channels);
      filterWhatsappLines(request.channels);
      sendResponse({ success: true });
      return;
    }
  });
})(); 