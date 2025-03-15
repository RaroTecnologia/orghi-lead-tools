document.addEventListener('DOMContentLoaded', () => {
  // Elementos da UI
  const leadStatus = document.getElementById('lead-status');
  const leadCount = document.getElementById('lead-count');
  const startDialerButton = document.getElementById('start-dialer');
  const pauseDialerButton = document.getElementById('pause-dialer');
  const settingsButton = document.getElementById('settings-button');
  const logsContainer = document.getElementById('logs');
  const progressBar = document.getElementById('progress-bar');
  const currentCountSpan = document.getElementById('current-count');
  const totalCountSpan = document.getElementById('total-count');
  const leadsList = document.getElementById('leads-list');
  const statusTimer = document.getElementById('status-timer');
  const emptyState = document.getElementById('empty-state');
  const statusCounter = document.getElementById('status-counter');
  
  let debugMode = false;
  let state = {
    currentLeads: null,
    currentLeadIndex: 0,
    isPaused: false,
    isRunning: false
  };

  // Função para atualizar o progresso visual
  function updateProgress(newState) {
    // Atualiza o estado local
    state = { ...state, ...newState };

    // Se não há leads, limpa a interface
    if (!state.currentLeads) {
      emptyState.style.display = 'flex';
      statusCounter.style.display = 'none';
      statusTimer.style.display = 'none';
      progressBar.style.width = '0%';
      leadsList.innerHTML = '';
      startDialerButton.disabled = false;
      pauseDialerButton.classList.add('hidden');
      addLog('✅ Discador finalizado', 'success');
      return;
    }
    
    const total = state.currentLeads.length;
    // Garante que o índice atual nunca ultrapasse o total
    const current = Math.min(state.currentLeadIndex + 1, total);
    const progress = (current / total) * 100;
    
    // Atualiza a interface apenas se o discador estiver rodando
    if (state.isRunning) {
      emptyState.style.display = 'none';
      statusCounter.style.display = 'flex';
      
      // Atualiza o timer
      if (state.countdown > 0) {
        statusTimer.style.display = 'block';
        statusTimer.textContent = `Próxima ligação em ${state.countdown}s`;
      } else {
        statusTimer.style.display = 'none';
      }
      
      progressBar.style.width = `${progress}%`;
      currentCountSpan.textContent = current;
      totalCountSpan.textContent = total;
      
      // Atualiza status dos leads na lista
      const items = leadsList.querySelectorAll('.lead-item');
      items.forEach((item, index) => {
        item.classList.remove('active', 'completed');
        if (index < current - 1) {
          item.classList.add('completed');
        } else if (index === current - 1) {
          item.classList.add('active');
        }
      });

      // Atualiza estado dos botões
      startDialerButton.disabled = true;
      pauseDialerButton.classList.toggle('hidden', current >= total);
      pauseDialerButton.disabled = false;
    } else {
      // Se não estiver rodando, mostra estado inicial
      emptyState.style.display = 'flex';
      statusCounter.style.display = 'none';
      statusTimer.style.display = 'none';
      progressBar.style.width = '0%';
      startDialerButton.disabled = false;
      pauseDialerButton.classList.add('hidden');
    }

    // Se chegou ao último lead e finalizou a última chamada
    if (current === total && !state.isRunning) {
      addLog('✅ Todas as ligações foram concluídas', 'success');
      state.currentLeads = null;
      state.currentLeadIndex = 0;
      state.isPaused = false;
    }
  }

  // Função para renderizar a lista de leads
  function renderLeadsList(leads) {
    leadsList.innerHTML = '';
    leads.forEach((lead, index) => {
      const leadItem = document.createElement('div');
      leadItem.className = 'lead-item';
      
      const status = document.createElement('div');
      status.className = 'lead-status pending';
      
      const info = document.createElement('div');
      info.className = 'lead-info';
      
      const name = document.createElement('div');
      name.className = 'lead-name';
      name.textContent = lead.name;
      
      const phone = document.createElement('div');
      phone.className = 'lead-phone';
      phone.textContent = lead.phone;
      
      info.appendChild(name);
      info.appendChild(phone);
      
      leadItem.appendChild(status);
      leadItem.appendChild(info);
      leadsList.appendChild(leadItem);
    });
  }

  // Função para adicionar log
  function addLog(message, type = 'info') {
    if (!debugMode && type !== 'error') return;

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const time = new Date().toLocaleTimeString();
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = time;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'log-message';
    messageSpan.textContent = message;
    
    logEntry.appendChild(timeSpan);
    logEntry.appendChild(messageSpan);
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  // Função para verificar se o Kommo está aberto
  async function getKommoTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({url: "*://*.kommo.com/*"}, (tabs) => {
        if (tabs.length === 0) {
          reject(new Error('Kommo não encontrado. Abra o Kommo primeiro.'));
          return;
        }
        resolve(tabs[0]);
      });
    });
  }

  // Função para buscar leads diretamente na página
  async function getLeadsFromPage(tabId, statusId, count) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (statusId, count) => {
        // Verifica se estamos na página correta
        if (!window.location.pathname.includes('/leads/pipeline/')) {
          return { error: 'Navegue para a página de Pipeline no Kommo' };
        }

        // Extrai o código do funil da URL
        const pipelineId = window.location.pathname.split('/').pop();
        
        // Clica no status para filtrar
        const statusElement = document.querySelector(`#status_id_${statusId}`);
        if (!statusElement) {
          return { error: 'Status não encontrado' };
        }

        // Aguarda carregar os leads e retorna
        return new Promise((resolve) => {
          setTimeout(() => {
            const leads = Array.from(document.querySelectorAll('.pipeline_leads__item'))
              .slice(0, count)
              .map(lead => {
                const nameEl = lead.querySelector('.pipeline_leads__title-text');
                const phoneEl = lead.querySelector('.pipeline_leads__note');
                const phone = phoneEl ? phoneEl.textContent.trim().replace(/[^\d+]/g, '') : '';
                const detailsUrl = nameEl ? nameEl.getAttribute('href') : '';
                
                return {
                  id: lead.getAttribute('data-id'),
                  name: nameEl ? nameEl.textContent.trim() : '',
                  phone: phone,
                  detailsUrl: detailsUrl
                };
              })
              .filter(lead => lead.phone);

            resolve({ leads, pipelineId });
          }, 1000);
        });
      },
      args: [statusId, count]
    });

    return results[0].result;
  }

  // Função para atualizar os status dos leads
  async function updateLeadStatuses() {
    try {
      const kommoTab = await getKommoTab();
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: kommoTab.id },
        func: () => {
          // Verifica se estamos na página correta
          if (!window.location.pathname.includes('/leads/pipeline/')) {
            return { error: 'Navegue para a página de Pipeline no Kommo' };
          }

          // Extrai o código do funil da URL
          const pipelineId = window.location.pathname.split('/').pop();
          
          // Busca os status disponíveis
          const statuses = Array.from(document.querySelectorAll('.pipeline-status'))
            .map(status => ({
              id: status.getAttribute('data-id'),
              name: status.querySelector('.pipeline-status__head-title').textContent.trim()
            }))
            .filter(status => status.id);

          return { statuses, pipelineId };
        }
      });

      const result = results[0].result;
      
      if (result.error) {
        addLog('❌ ' + result.error, 'error');
        return;
      }

      if (result.statuses && result.statuses.length > 0) {
        leadStatus.innerHTML = result.statuses
          .map(status => `<option value="${status.id}">${status.name}</option>`)
          .join('');
        addLog('✅ Status dos leads atualizados');
        
        // Salva os status no storage
        chrome.storage.sync.set({ leadStatuses: result.statuses });
      }
    } catch (error) {
      addLog(`❌ ${error.message}`, 'error');
    }
  }

  // Monitora mudanças na URL do Kommo
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && changeInfo.url.includes('kommo.com/leads/pipeline/')) {
      updateLeadStatuses();
    }
  });

  // Carregar configurações iniciais
  chrome.storage.sync.get(['leadStatuses', 'debugMode'], (result) => {
    // Configura debug mode
    debugMode = result.debugMode || false;
    logsContainer.classList.toggle('visible', debugMode);
    
    // Carrega status dos leads
    if (result.leadStatuses && result.leadStatuses.length > 0) {
      leadStatus.innerHTML = result.leadStatuses
        .map(status => `<option value="${status.id}">${status.name}</option>`)
        .join('');
      addLog('✅ Status dos leads carregados');
    } else {
      leadStatus.innerHTML = '<option value="">Abra o Kommo para carregar os status</option>';
      addLog('⚠️ Abra o Kommo para carregar os status dos leads');
    }
  });

  // Event listener para o botão de iniciar
  startDialerButton.addEventListener('click', async () => {
    const status = leadStatus.value;
    const count = parseInt(leadCount.value);

    if (!status) {
      addLog('❌ Selecione um status de lead', 'error');
      return;
    }

    if (isNaN(count) || count < 1) {
      addLog('❌ Quantidade de leads inválida', 'error');
      return;
    }

    // Primeiro verifica se o 3CX está aberto
    addLog('🔍 Verificando conexão com 3CX...');
    
    try {
      const checkResult = await chrome.runtime.sendMessage({ 
        action: 'find3CXTab'
      });
      
      if (!checkResult.found) {
        throw new Error('3CX não encontrado. Abra o PWA primeiro.');
      }
      
      addLog('✅ 3CX encontrado, iniciando discador...');
      
      // Verifica se o Kommo está aberto
      const kommoTab = await getKommoTab();
      
      // Busca os leads diretamente na página
      const result = await getLeadsFromPage(kommoTab.id, status, count);
      
      if (result.error) {
        addLog('❌ ' + result.error, 'error');
        return;
      }

      if (!result.leads || result.leads.length === 0) {
        addLog('❌ Nenhum lead encontrado com telefone', 'error');
        return;
      }

      addLog(`✅ ${result.leads.length} leads encontrados`);
      
      // Inicia o discador no background
      chrome.runtime.sendMessage({ 
        action: 'startDialer',
        leads: result.leads,
        pipelineId: result.pipelineId
      }, (response) => {
        if (response.success) {
          addLog('✅ Discador iniciado');
        }
      });
      
    } catch (error) {
      addLog(`❌ ${error.message}`, 'error');
    }
  });

  // Event listener para o botão de configurações
  settingsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Event listener para o botão de pausar
  pauseDialerButton.addEventListener('click', () => {
    // Inverte o estado atual
    state.isPaused = !state.isPaused;
    const action = state.isPaused ? 'pauseDialer' : 'resumeDialer';
    
    chrome.runtime.sendMessage({ action }, (response) => {
      if (response.success) {
        addLog(state.isPaused ? '⏸️ Discador pausado' : '▶️ Discador retomado');
      } else {
        // Se falhou, reverte o estado
        state.isPaused = !state.isPaused;
      }
    });
  });

  // Carrega o estado inicial
  chrome.runtime.sendMessage({ action: 'getState' }, (state) => {
    if (state.currentLeads) {
      renderLeadsList(state.currentLeads);
    }
    updateProgress(state);
  });

  // Listener para atualizações de estado do background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'stateUpdate') {
      updateProgress(message.state);
    }
  });

  // Listener para mensagens do background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'debug' && debugMode) {
      addLog(request.message);
    }
    // Atualiza os status quando receber do content script
    else if (request.type === 'leadStatuses') {
      leadStatus.innerHTML = request.statuses
        .map(status => `<option value="${status.id}">${status.name}</option>`)
        .join('');
      addLog('✅ Status dos leads atualizados');
    }
    // Atualiza a interface quando o estado mudar
    else if (request.type === 'stateUpdate') {
      if (request.state.currentLeads) {
        renderLeadsList(request.state.currentLeads);
      }
      updateProgress(request.state);
    }
  });
}); 