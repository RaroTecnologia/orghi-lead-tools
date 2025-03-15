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
  const callTimer = document.getElementById('call-timer');
  const endCallButton = document.getElementById('end-call');
  const forceResetButton = document.getElementById('force-reset');
  
  // Elementos da seção de notas
  const noteSection = document.getElementById('noteSection');
  const noteTypeSelect = document.getElementById('noteTypeSelect');
  const customNoteContainer = document.getElementById('customNoteContainer');
  const customNoteInput = document.getElementById('customNoteInput');
  const saveNoteButton = document.getElementById('saveNoteButton');
  
  let debugMode = false;
  let state = {
    currentLeads: null,
    currentLeadIndex: 0,
    isPaused: false,
    isRunning: false
  };

  let callTimerInterval = null;
  let callDuration = 0;

  // Templates de notas
  const noteTemplates = {
    'not-answered': () => 'Ligação não atendida.',
    'not-interested': () => 'Cliente não demonstrou interesse no momento.',
    'callback': () => 'Cliente solicitou retorno em outro momento.',
    'wrong-number': () => 'Número incorreto.',
    'not-person': () => 'Não é a pessoa.',
    'changed-phone': () => 'Cliente trocou de telefone.',
    'summary': () => customNoteInput.value.trim()
  };

  // Função para mostrar erros
  function showError(message) {
    addLog(`❌ ${message}`, 'error');
  }

  // Função para formatar o tempo
  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Função para iniciar o contador
  function startCallTimer() {
    callDuration = 0;
    callTimer.textContent = formatTime(callDuration);
    
    if (callTimerInterval) {
      clearInterval(callTimerInterval);
    }
    
    callTimerInterval = setInterval(() => {
      callDuration++;
      callTimer.textContent = formatTime(callDuration);
    }, 1000);
  }

  // Função para parar o contador
  function stopCallTimer() {
    if (callTimerInterval) {
      clearInterval(callTimerInterval);
      callTimerInterval = null;
    }
    callDuration = 0;
    callTimer.textContent = '00:00';
  }

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
      hideNoteSection(); // Esconde a seção de notas
      addLog('✅ Discador finalizado', 'success');
      stopCallTimer();
      return;
    }
    
    const total = state.currentLeads.length;
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

      // Inicia o timer quando uma nova ligação começa
      if (!state.isPaused && current <= total) {
        startCallTimer();
      } else {
        stopCallTimer();
      }

      // Habilita/desabilita o botão de encerrar ligação
      endCallButton.disabled = state.isPaused || current > total || noteSection.style.display === 'block';
    } else {
      // Se não estiver rodando, mostra estado inicial
      emptyState.style.display = 'flex';
      statusCounter.style.display = 'none';
      statusTimer.style.display = 'none';
      progressBar.style.width = '0%';
      startDialerButton.disabled = false;
      pauseDialerButton.classList.add('hidden');
      hideNoteSection(); // Esconde a seção de notas
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

        // Extrai o código do funil da URL completa usando regex melhorado
        const pipelineMatch = window.location.href.match(/\/leads\/pipeline\/(\d+)/);
        const pipelineId = pipelineMatch ? pipelineMatch[1] : null;
        
        if (!pipelineId) {
          return { error: 'ID do funil não encontrado' };
        }

        // Busca os leads na página
        const leads = [];
        
        // Encontra a lista de leads do status específico
        const statusList = document.querySelector(`.pipeline_items__list[data-id="${statusId}"]`);
        if (!statusList) {
          return { error: 'Lista de leads não encontrada para este status' };
        }

        // Busca todos os leads dentro desta lista
        const cards = statusList.querySelectorAll('.pipeline_leads__item');
        
        cards.forEach(card => {
          // Extrai informações do lead
          const name = card.querySelector('.pipeline_leads__title-text')?.textContent?.trim() || 'Sem nome';
          const phone = card.querySelector('.pipeline_leads__note')?.textContent?.trim();
          const detailsUrl = card.querySelector('.pipeline_leads__title-text')?.getAttribute('href');
          
          if (phone) {
            leads.push({
              id: card.dataset.id,
              name,
              phone,
              detailsUrl
            });
          }
        });

        return {
          leads: leads.slice(0, count),
          pipelineId
        };
      },
      args: [statusId, count]
    });

    if (!results || !results[0] || results[0].result.error) {
      throw new Error(results?.[0]?.result?.error || 'Erro ao buscar leads');
    }

    return results[0].result;
  }

  // Função para carregar os status do funil
  async function loadPipelineStatuses() {
    try {
      const tab = await getKommoTab();
      addLog('🔍 Buscando status do pipeline...', 'info');
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Verifica se estamos na página correta
          if (!window.location.pathname.includes('/leads/pipeline/')) {
            return { error: 'Navegue para a página de Pipeline no Kommo' };
          }

          // Busca os status disponíveis
          const statuses = Array.from(document.querySelectorAll('.pipeline_status__head'))
            .map(status => ({
              id: status.getAttribute('data-id'),
              name: status.querySelector('.pipeline_status__head_title').textContent.trim()
            }))
            .filter(status => status.id);

          return { statuses };
        }
      });

      if (!results || !results[0] || !results[0].result.statuses) {
        throw new Error('Erro ao carregar status do funil');
      }

      const statuses = results[0].result.statuses;
      addLog(`✅ Encontrados ${statuses.length} status`, 'info');
      
      // Limpa e preenche o select
      leadStatus.innerHTML = '';
      
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Selecione um status';
      leadStatus.appendChild(defaultOption);
      
      statuses.forEach(status => {
        const option = document.createElement('option');
        option.value = status.id;
        option.textContent = status.name;
        leadStatus.appendChild(option);
      });

      // Salva os status no storage para uso futuro
      chrome.storage.sync.set({ leadStatuses: statuses });

    } catch (error) {
      addLog(`❌ Erro ao carregar status: ${error.message}`, 'error');
      showError(error.message);
    }
  }

  // Carrega os status salvos do storage ao iniciar
  chrome.storage.sync.get(['leadStatuses'], (result) => {
    if (result.leadStatuses && result.leadStatuses.length > 0) {
      leadStatus.innerHTML = '';
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Selecione um status';
      leadStatus.appendChild(defaultOption);
      
      result.leadStatuses.forEach(status => {
        const option = document.createElement('option');
        option.value = status.id;
        option.textContent = status.name;
        leadStatus.appendChild(option);
      });
      
      addLog('✅ Status carregados do cache', 'info');
    } else {
      leadStatus.innerHTML = '<option value="">Abra o Kommo para carregar os status</option>';
      addLog('⚠️ Abra o Kommo para carregar os status', 'info');
    }
  });

  // Event Listeners
  settingsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  startDialerButton.addEventListener('click', async () => {
    try {
      const statusId = leadStatus.value;
      const count = parseInt(leadCount.value);
      
      if (!statusId) {
        throw new Error('Selecione um status');
      }
      
      if (!count || count < 1) {
        throw new Error('Quantidade de leads inválida');
      }
      
      const tab = await getKommoTab();
      const { leads, pipelineId } = await getLeadsFromPage(tab.id, statusId, count);
      
      if (!leads || leads.length === 0) {
        throw new Error('Nenhum lead encontrado com telefone neste status');
      }

      // Renderiza a lista de leads
      renderLeadsList(leads);
      
      // Inicia o discador
      chrome.runtime.sendMessage({
        action: 'startDialer',
        leads,
        pipelineId
      }, (response) => {
        if (!response || !response.success) {
          showError('Erro ao iniciar discador');
          return;
        }
        addLog('🚀 Discador iniciado', 'success');
      });

    } catch (error) {
      showError(error.message);
    }
  });

  pauseDialerButton.addEventListener('click', () => {
    const isPaused = pauseDialerButton.classList.contains('paused');
    
    chrome.runtime.sendMessage({
      action: isPaused ? 'resumeDialer' : 'pauseDialer'
    }, (response) => {
      if (!response || !response.success) {
        showError('Erro ao ' + (isPaused ? 'retomar' : 'pausar') + ' discador');
        return;
      }
      
      pauseDialerButton.classList.toggle('paused');
      pauseDialerButton.innerHTML = isPaused ? `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      ` : `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      `;
      
      addLog(isPaused ? '▶️ Discador retomado' : '⏸️ Discador pausado', 'info');
    });
  });

  // Funções da seção de notas
  function showNoteSection() {
    noteSection.style.display = 'block';
    // Scroll para a seção de notas
    noteSection.scrollIntoView({ behavior: 'smooth' });
  }

  function hideNoteSection() {
    noteSection.style.display = 'none';
    noteTypeSelect.value = '';
    customNoteInput.value = '';
    customNoteContainer.style.display = 'none';
  }

  // Event listeners da seção de notas
  noteTypeSelect.addEventListener('change', () => {
    const isCustom = noteTypeSelect.value === 'summary';
    customNoteContainer.style.display = isCustom ? 'block' : 'none';
    if (isCustom) {
      customNoteInput.focus();
    }
  });

  // Modifica o listener do botão de encerrar ligação
  endCallButton.addEventListener('click', async () => {
    try {
      // Desabilita o botão para evitar duplo clique
      endCallButton.disabled = true;
      
      // Envia mensagem para encerrar a ligação no 3CX
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'endCall'
        }, resolve);
      });

      if (!response || !response.success) {
        throw new Error('Erro ao encerrar ligação');
      }

    } catch (error) {
      showError(error.message);
      endCallButton.disabled = false;
    }
  });

  // Ajusta o listener do botão de salvar nota
  saveNoteButton.addEventListener('click', async () => {
    try {
      const type = noteTypeSelect.value;
      
      if (!type) {
        throw new Error('Por favor, selecione um motivo para a ligação');
      }

      const note = type === 'summary' ? customNoteInput.value.trim() : noteTemplates[type]();
      
      if (!note) {
        throw new Error('Por favor, digite um resumo da conversa');
      }

      const tab = await getKommoTab();
      
      // Executa o script para adicionar a nota no Kommo
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (noteText) => {
          return new Promise((resolve, reject) => {
            try {
              // Seleciona o tipo "Nota" no seletor
              const noteSwitcher = document.querySelector('.js-switcher-note');
              if (!noteSwitcher) {
                throw new Error('Seletor de tipo de nota não encontrado');
              }
              noteSwitcher.click();

              // Aguarda o campo de nota aparecer
              setTimeout(() => {
                // Encontra o campo de texto da nota
                const noteField = document.querySelector('.feed-compose__message');
                if (!noteField) {
                  throw new Error('Campo de nota não encontrado');
                }

                // Limpa o campo e insere o texto da nota
                noteField.textContent = noteText;

                // Dispara evento de input para ativar o botão de adicionar
                noteField.dispatchEvent(new Event('input', { bubbles: true }));

                // Encontra e clica no botão de adicionar
                const addButton = document.querySelector('.js-note-submit');
                if (!addButton) {
                  throw new Error('Botão de adicionar não encontrado');
                }

                // Clica no botão
                addButton.click();

                // Aguarda um pouco para garantir que a nota foi salva
                setTimeout(() => resolve(true), 2000);
              }, 500);
            } catch (error) {
              reject(error);
            }
          });
        },
        args: [note]
      });

      addLog('✅ Nota salva com sucesso', 'success');
      
      // Esconde a seção de notas
      hideNoteSection();

      // Aguarda um momento antes de prosseguir
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Notifica o background que a nota foi salva
      const noteSavedResponse = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'noteSaved'
        }, resolve);
      });

      if (!noteSavedResponse || !noteSavedResponse.success) {
        throw new Error('Erro ao confirmar salvamento da nota');
      }

      addLog('📞 Iniciando próxima ligação...', 'info');

    } catch (error) {
      showError(error.message);
    }
  });

  // Listener para atualizações de estado
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'stateUpdate') {
      updateProgress(message.state);
    } else if (message.type === 'callEnded') {
      // Quando a ligação terminar no 3CX
      stopCallTimer();
      endCallButton.disabled = true;
      pauseDialerButton.disabled = true;
      showNoteSection();
      addLog('📞 Ligação encerrada', 'info');
      addLog('📝 Aguardando nota...', 'info');
    }
  });

  // Carrega o estado inicial
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response) {
      updateProgress(response);
    }
  });

  // Carrega os status do funil
  loadPipelineStatuses();

  // Carrega configurações iniciais
  chrome.storage.sync.get(['debugMode'], (result) => {
    // Configura debug mode
    debugMode = result.debugMode || false;
    logsContainer.classList.toggle('visible', debugMode);
    forceResetButton.classList.toggle('visible', debugMode);
  });

  // Botão de reset forçado (debug)
  forceResetButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'forceReset' }, () => {
      addLog('🔄 Reset forçado executado', 'info');
      
      // Limpa o estado local
      state = {
        currentLeads: null,
        currentLeadIndex: 0,
        isPaused: false,
        isRunning: false,
        countdown: 0
      };

      // Limpa a interface
      emptyState.style.display = 'flex';
      statusCounter.style.display = 'none';
      statusTimer.style.display = 'none';
      progressBar.style.width = '0%';
      leadsList.innerHTML = '';
      currentCountSpan.textContent = '0';
      totalCountSpan.textContent = '0';
      startDialerButton.disabled = false;
      pauseDialerButton.classList.add('hidden');
      pauseDialerButton.classList.remove('paused');
      endCallButton.disabled = true;
      
      // Para o timer
      stopCallTimer();
      
      // Atualiza o progresso
      updateProgress(state);
    });
  });
}); 