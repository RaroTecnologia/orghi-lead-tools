document.addEventListener('DOMContentLoaded', () => {
  const leadStatus = document.getElementById('lead-status');
  const leadCount = document.getElementById('lead-count');
  const startDialerButton = document.getElementById('start-dialer');
  const settingsButton = document.getElementById('settings-button');
  const logsContainer = document.getElementById('logs');
  let waitTimer = null;
  let currentLeads = null;
  let currentLeadIndex = 0;

  // Função para salvar estado
  function saveState() {
    const state = {
      selectedStatus: leadStatus.value,
      count: leadCount.value,
      logs: Array.from(logsContainer.children).map(log => ({
        message: log.querySelector('.log-message').textContent,
        type: log.className.replace('log-entry ', ''),
        time: log.querySelector('.log-time').textContent
      }))
    };
    console.log('Salvando estado:', state);
    chrome.storage.local.set({ popupState: state }, () => {
      if (chrome.runtime.lastError) {
        console.error('Erro ao salvar estado:', chrome.runtime.lastError);
      } else {
        console.log('Estado salvo com sucesso');
      }
    });
  }

  // Função para carregar estado
  async function loadState() {
    console.log('Carregando estado...');
    return new Promise((resolve) => {
      chrome.storage.local.get(['popupState'], (result) => {
        console.log('Estado carregado:', result.popupState);
        
        if (result.popupState) {
          // Restaura status selecionado
          if (result.popupState.selectedStatus) {
            leadStatus.value = result.popupState.selectedStatus;
            console.log('Status restaurado:', result.popupState.selectedStatus);
          }

          // Restaura quantidade
          if (result.popupState.count) {
            leadCount.value = result.popupState.count;
            console.log('Quantidade restaurada:', result.popupState.count);
          }

          // Restaura logs
          if (result.popupState.logs && result.popupState.logs.length > 0) {
            logsContainer.innerHTML = ''; // Limpa logs antes de restaurar
            result.popupState.logs.forEach(log => {
              const logEntry = document.createElement('div');
              logEntry.className = `log-entry ${log.type}`;
              logEntry.innerHTML = `
                <span class="log-time">${log.time}</span>
                <span class="log-message">${log.message}</span>
              `;
              logsContainer.appendChild(logEntry);
            });
            console.log('Logs restaurados:', result.popupState.logs.length);
          } else {
            console.log('Nenhum log para restaurar');
            logsContainer.innerHTML = '';
            addLog('💡 Discador pronto');
          }
        } else {
          console.log('Nenhum estado anterior encontrado');
          logsContainer.innerHTML = '';
          addLog('💡 Discador pronto');
        }
        resolve();
      });
    });
  }

  // Função para formatar tempo
  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Função para adicionar log
  function addLog(message, type = 'info') {
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
    
    // Salva estado após adicionar log
    saveState();
  }

  // Função para iniciar temporizador
  function startTimer(seconds) {
    if (waitTimer) {
      clearInterval(waitTimer);
    }

    let remainingTime = seconds;
    addLog(`⏳ Aguardando ${formatTime(remainingTime)} para próxima ligação...`, 'timer');

    waitTimer = setInterval(() => {
      remainingTime--;
      
      // Atualiza o último log de timer
      const lastLog = logsContainer.querySelector('.log-entry.timer:last-child');
      if (lastLog) {
        lastLog.querySelector('.log-message').textContent = 
          `⏳ Aguardando ${formatTime(remainingTime)} para próxima ligação...`;
      }

      if (remainingTime <= 0) {
        clearInterval(waitTimer);
        waitTimer = null;
        addLog('✅ Tempo de espera concluído');
        if (currentLeads && currentLeadIndex < currentLeads.length) {
          processNextLead(currentLeads, currentLeadIndex);
        }
      }
    }, 1000);
  }

  // Função para processar próximo lead
  async function processNextLead(leads, index = 0) {
    if (!leads || index >= leads.length) {
      addLog('✅ Todas as ligações foram realizadas');
      currentLeads = null;
      currentLeadIndex = 0;
      return;
    }

    currentLeads = leads;
    currentLeadIndex = index;

    const lead = leads[index];
    addLog(`📞 Ligando para ${lead.name} (${lead.phone}) - ${index + 1}/${leads.length}`);
    
    try {
      // Formata o número removendo caracteres especiais e espaços
      const formattedPhone = lead.phone.replace(/[^\d+]/g, '');
      
      // Abre a página de detalhes do lead em uma nova aba
      if (lead.detailsUrl) {
        chrome.tabs.create({ 
          url: `https://raro.kommo.com${lead.detailsUrl}`,
          active: false // Mantém o foco na aba atual
        });
      }
      
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          action: 'makeCall',
          phoneNumber: formattedPhone
        }, resolve);
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Erro desconhecido');
      }
      
      addLog(`✅ Ligação iniciada para ${lead.name}`);
      
      // Aguarda a ligação terminar verificando o status
      await new Promise((resolve) => {
        const checkStatus = () => {
          chrome.runtime.sendMessage({ 
            action: 'checkStatus',
            tabId: response.tabId
          }, (result) => {
            if (result.error) {
              addLog(`❌ Erro ao verificar status: ${result.error}`);
              setTimeout(checkStatus, 1000);
              return;
            }

            addLog(`🔄 Status do discador: ${result.classes}`);
            
            // Se o status é available, a ligação terminou
            if (result.classes.includes('available')) {
              addLog('✅ Detectado fim da ligação - status available');
              resolve();
              return;
            }
            
            setTimeout(checkStatus, 1000);
          });
        };
        checkStatus();
      });

      addLog(`📱 Ligação finalizada para ${lead.name}`);
      
      // Verifica se é a última ligação
      if (index + 1 >= leads.length) {
        addLog('✅ Todas as ligações foram realizadas');
        currentLeads = null;
        currentLeadIndex = 0;
        return;
      }
      
      // Se não for a última, agenda a próxima
      chrome.storage.sync.get(['dialerDelay'], (result) => {
        const waitSeconds = (result.dialerDelay || 5) * 1;
        addLog(`⏳ Configurado para aguardar ${waitSeconds} segundos`);
        currentLeadIndex = index + 1;
        startTimer(waitSeconds);
      });
      
    } catch (error) {
      addLog(`❌ Erro ao ligar para ${lead.name}: ${error.message}`);
      // Em caso de erro, continua para o próximo lead após 5 segundos
      setTimeout(() => {
        currentLeadIndex = index + 1;
        processNextLead(leads, currentLeadIndex);
      }, 5000);
    }
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

            resolve({ leads });
          }, 1000);
        });
      },
      args: [statusId, count]
    });

    return results[0].result;
  }

  // Carregar status dos leads do storage
  chrome.storage.sync.get(['leadStatuses'], (result) => {
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

  // Listener para mensagens de debug do background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'debug') {
      addLog(request.message);
    }
    // Atualiza os status quando receber do content script
    if (request.type === 'leadStatuses') {
      leadStatus.innerHTML = request.statuses
        .map(status => `<option value="${status.id}">${status.name}</option>`)
        .join('');
      addLog('✅ Status dos leads atualizados');
    }
  });

  // Event listener para o botão de configurações
  settingsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Event listener para o botão de iniciar discador
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
        addLog('❌ ' + result.error);
        return;
      }

      if (!result.leads || result.leads.length === 0) {
        addLog('❌ Nenhum lead encontrado com telefone');
        return;
      }

      addLog(`✅ ${result.leads.length} leads encontrados`);
      
      // Reseta o estado atual
      currentLeads = null;
      currentLeadIndex = 0;
      
      // Inicia o processamento dos leads
      processNextLead(result.leads, 0);
      
    } catch (error) {
      addLog(`❌ ${error.message}`, 'error');
    }
  });

  // Event listeners para salvar estado
  leadStatus.addEventListener('change', saveState);
  leadCount.addEventListener('input', saveState);

  // Limpa os logs ao abrir
  logsContainer.innerHTML = '';
  addLog('💡 Discador pronto');

  // Carrega estado ao iniciar
  loadState().then(() => {
    console.log('Inicialização completa');
  });
}); 