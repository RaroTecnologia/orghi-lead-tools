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
  });
})(); 