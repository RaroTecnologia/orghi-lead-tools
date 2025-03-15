document.addEventListener('DOMContentLoaded', () => {
  const leadStatus = document.getElementById('lead-status');
  const leadCount = document.getElementById('lead-count');
  const startDialerButton = document.getElementById('start-dialer');
  const logsContainer = document.getElementById('logs');
  let waitTimer = null;

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
    logEntry.innerHTML = `
      <span class="time">[${time}]</span>
      <span class="message">${message}</span>
    `;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
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
        lastLog.querySelector('.message').textContent = 
          `⏳ Aguardando ${formatTime(remainingTime)} para próxima ligação...`;
      }

      if (remainingTime <= 0) {
        clearInterval(waitTimer);
        waitTimer = null;
        addLog('✅ Tempo de espera concluído');
        processNextLead();
      }
    }, 1000);
  }

  // Função para processar próximo lead
  async function processNextLead(leads, currentIndex = 0) {
    if (!leads || currentIndex >= leads.length) {
      addLog('✅ Todas as ligações foram realizadas');
      return;
    }

    const lead = leads[currentIndex];
    addLog(`📞 Ligando para ${lead.name} (${lead.phone})`);
    
    try {
      // Formata o número removendo caracteres especiais e espaços
      const formattedPhone = lead.phone.replace(/[^\d+]/g, '');
      
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
            if (result.available) {
              resolve();
            } else {
              setTimeout(checkStatus, 1000);
            }
          });
        };
        checkStatus();
      });

      addLog(`📱 Ligação finalizada para ${lead.name}`);
      
      // Busca o tempo configurado no storage
      chrome.storage.sync.get(['waitTime'], (result) => {
        const waitSeconds = (result.waitTime || 30) * 1; // Converte para segundos
        startTimer(waitSeconds);
        
        // Agenda o próximo lead
        setTimeout(() => {
          processNextLead(leads, currentIndex + 1);
        }, waitSeconds * 1000);
      });
      
    } catch (error) {
      addLog(`❌ Erro ao ligar para ${lead.name}: ${error.message}`);
      // Em caso de erro, continua para o próximo lead
      processNextLead(leads, currentIndex + 1);
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
                
                return {
                  id: lead.getAttribute('data-id'),
                  name: nameEl ? nameEl.textContent.trim() : '',
                  phone: phone
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

      addLog(`✅ ${result.leads.length} leads encontrados`);
      
      // Inicia o processamento dos leads
      processNextLead(result.leads);
      
    } catch (error) {
      addLog(`❌ ${error.message}`, 'error');
    }
  });

  // Limpa os logs ao abrir
  logsContainer.innerHTML = '';
  addLog('💡 Discador pronto');
}); 