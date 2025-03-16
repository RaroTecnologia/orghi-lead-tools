// Variável para armazenar o ID da aba do 3CX
let threeCXTabId = null;

// Variável para armazenar o ID da janela do popup
let popupWindowId = null;

// Estado do discador
let state = {
  currentLeads: null,
  currentLeadIndex: 0,
  isPaused: false,
  isRunning: false,
  waitTimer: null,
  countdown: 0,
  pipelineId: null,
  waitingNote: false,
  noteResolver: null
};

// Função para verificar se uma URL é do 3CX
function is3CXURL(url) {
  if (!url) return false;
  
  // Converte para URL para facilitar a comparação
  try {
    const urlObj = new URL(url);
    
    // Obtém o domínio configurado do storage
    return new Promise((resolve) => {
      chrome.storage.sync.get(['threeCXDomain'], (result) => {
        if (!result.threeCXDomain) {
          console.log('Nenhum domínio 3CX configurado');
          // Se não tiver domínio configurado, tenta identificar pelo hostname
          resolve(urlObj.hostname.includes('3cx.cloud') || urlObj.hostname.includes('3cx.com'));
          return;
        }
        
        console.log('Comparando:', {
          urlHostname: urlObj.hostname,
          configuredDomain: result.threeCXDomain
        });
        
        resolve(urlObj.hostname === result.threeCXDomain);
      });
    });
  } catch (e) {
    console.error('Erro ao verificar URL do 3CX:', e);
    return Promise.resolve(false);
  }
}

// Função para obter o padrão de URL do 3CX baseado no domínio configurado
function get3CXUrlPattern() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['threeCXDomain'], (result) => {
      console.log('Domínio 3CX configurado:', result.threeCXDomain);
      
      if (result.threeCXDomain) {
        resolve(`*://${result.threeCXDomain}/*`);
      } else {
        // Se não houver domínio configurado, usa um padrão mais permissivo
        resolve('*://*/*');
      }
    });
  });
}

// Função para encontrar a aba do 3CX
async function find3CXTab() {
  console.log('🔍 Procurando aba do 3CX...');
  
  const urlPattern = await get3CXUrlPattern();
  console.log('📝 Usando padrão de URL:', urlPattern);
  
  return new Promise((resolve) => {
    chrome.tabs.query({}, async (tabs) => {
      console.log('📊 Total de abas encontradas:', tabs.length);
      
      // Primeiro tenta encontrar pelo domínio configurado
      for (const tab of tabs) {
        const is3CX = await is3CXURL(tab.url);
        
        console.log('🔎 Verificando aba:', {
          url: tab.url,
          title: tab.title,
          id: tab.id,
          is3CX
        });
        
        if (is3CX) {
          console.log('✅ Aba 3CX encontrada pelo domínio:', {
            url: tab.url,
            title: tab.title,
            id: tab.id
          });
          
          threeCXTabId = tab.id;
          resolve({
            found: true,
            tabId: tab.id,
            url: tab.url
          });
          return;
        }
      }
      
      // Se não encontrou pelo domínio, tenta pelo título
      for (const tab of tabs) {
        if (tab.title && tab.title.includes('3CX')) {
          console.log('✅ Aba 3CX encontrada pelo título:', {
            url: tab.url,
            title: tab.title,
            id: tab.id
          });
          
          threeCXTabId = tab.id;
          resolve({
            found: true,
            tabId: tab.id,
            url: tab.url
          });
          return;
        }
      }
      
      console.log('❌ Nenhuma aba 3CX encontrada');
      threeCXTabId = null;
      resolve({ found: false });
    });
  });
}

// Função para fazer uma ligação
async function makeCall(phone) {
  console.log('📞 Iniciando ligação para:', phone);
  
  try {
    const result = await find3CXTab();
    
    if (!result.found) {
      throw new Error('3CX não encontrado. Abra o PWA do 3CX primeiro.');
    }

    console.log('✅ Aba 3CX encontrada, executando script...');

    const scriptResult = await chrome.scripting.executeScript({
      target: { tabId: result.tabId },
      func: (phoneNumber) => {
        return new Promise((resolve) => {
          // Função para monitorar status da ligação com retry
          const monitorCallStatus = (retryCount = 0) => {
            return new Promise((resolve) => {
              let wasInCall = false;
              let checkCount = 0;
              const maxChecks = 20; // Aumentado para 10 segundos
              
              const checkStatus = () => {
                const statusIndicator = document.querySelector('i[data-qa="status-indicator"]');
                
                if (!statusIndicator && retryCount < 3) {
                  console.log(`Tentativa ${retryCount + 1} de encontrar indicador de status`);
                  setTimeout(() => monitorCallStatus(retryCount + 1), 1000);
                  return;
                }
                
                checkCount++;
                
                if (statusIndicator) {
                  const classes = statusIndicator.className;
                  const isBusy = classes.includes('busy');
                  const isRinging = classes.includes('ringing');
                  
                  console.log('📊 Status atual:', {
                    classes,
                    isBusy,
                    isRinging,
                    wasInCall,
                    checkCount
                  });
                  
                  // Se está chamando ou em ligação
                  if ((isBusy || isRinging) && !wasInCall) {
                    console.log('📞 Chamada iniciada');
                    wasInCall = true;
                  }
                  
                  // Se estava em ligação e terminou
                  if (wasInCall && !isBusy && !isRinging) {
                    console.log('✅ Chamada finalizada');
                    // Notifica o popup que a ligação terminou
                    chrome.runtime.sendMessage({
                      type: 'callEnded'
                    });
                    resolve();
                    return;
                  }
                }
                
                // Timeout após 10 segundos sem resposta
                if (checkCount >= maxChecks && !wasInCall) {
                  console.log('⚠️ Timeout: Nenhuma chamada detectada');
                  resolve();
                  return;
                }
                
                setTimeout(checkStatus, 500);
              };
              
              checkStatus();
            });
          };

          // Função otimizada para encontrar elementos com retry
          const findElement = async (selectors, timeout = 5000, retryCount = 0) => {
            const startTime = Date.now();
            
            return new Promise((resolve, reject) => {
              const check = () => {
                // Tenta cada seletor
                for (const selector of selectors) {
                  const element = document.querySelector(selector);
                  if (element && element.offsetParent !== null) {
                    console.log('✅ Elemento encontrado:', selector);
                    resolve(element);
                    return;
                  }
                }
                
                // Se passou do timeout
                if (Date.now() - startTime > timeout) {
                  if (retryCount < 3) {
                    console.log(`⚠️ Retry ${retryCount + 1}: Elemento não encontrado`);
                    setTimeout(() => {
                      findElement(selectors, timeout, retryCount + 1)
                        .then(resolve)
                        .catch(reject);
                    }, 1000);
                    return;
                  }
                  reject(new Error(`Elementos não encontrados após ${retryCount} tentativas`));
                  return;
                }
                
                setTimeout(check, 100);
              };
              
              check();
            });
          };

          // Fluxo principal com retry
          (async () => {
            try {
              console.log('🚀 Iniciando fluxo de ligação...');
              
              // Seletores do botão do discador
              const dialerSelectors = [
                '#menuDialer',
                'a[role="button"][title="Discador"]',
                'button[aria-label="Dial pad"]',
                'button[title="Dial pad"]',
                'button.dialpad-button'
              ];
              
              // Encontra e clica no botão do discador
              console.log('🔍 Procurando botão do discador...');
              const dialerButton = await findElement(dialerSelectors);
              dialerButton.click();
              await new Promise(r => setTimeout(r, 500));

              // Seletores do input de telefone
              const inputSelectors = [
                '#dialpad-input',
                'input[aria-label="Phone number"]',
                'input[placeholder*="phone"]',
                'input[type="tel"]',
                '.dialpad-input'
              ];
              
              // Encontra e preenche o input
              console.log('🔍 Procurando input do discador...');
              const phoneInput = await findElement(inputSelectors);
              phoneInput.value = phoneNumber;
              phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
              phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
              await new Promise(r => setTimeout(r, 300));

              // Seletores do botão de ligar
              const callButtonSelectors = [
                '#btnCall',
                'button[aria-label="Audio call"]',
                'button[title="Audio call"]',
                'button.call-button',
                'button.btnNum'
              ];
              
              // Encontra e clica no botão de ligar
              console.log('🔍 Procurando botão de chamada...');
              const callButton = await findElement(callButtonSelectors);
              callButton.click();

              console.log('⏳ Aguardando status da chamada...');
              await monitorCallStatus();

              console.log('✅ Fluxo de ligação concluído com sucesso');
              resolve({ success: true, completed: true });
            } catch (error) {
              console.error('❌ Erro durante a ligação:', error);
              resolve({ error: error.message });
            }
          })();
        });
      },
      args: [phone]
    });

    if (!scriptResult || !scriptResult[0] || scriptResult[0].result.error) {
      throw new Error(scriptResult?.[0]?.result?.error || 'Erro desconhecido ao executar script');
    }

    return { ...scriptResult[0].result, tabId: result.tabId };
  } catch (error) {
    console.error('❌ Erro ao fazer ligação:', error);
    throw error;
  }
}

// Função para salvar o estado
async function saveState() {
  await chrome.storage.local.set({
    dialerState: {
      currentLeads: state.currentLeads,
      currentLeadIndex: state.currentLeadIndex,
      isPaused: state.isPaused,
      isRunning: state.isRunning,
      pipelineId: state.pipelineId
    }
  });
  // Notifica o popup sobre a mudança de estado
  broadcastState();
}

// Função para carregar o estado
async function loadState() {
  const data = await chrome.storage.local.get('dialerState');
  if (data.dialerState) {
    state = {
      ...state,
      ...data.dialerState
    };
  }
}

// Função para notificar o popup sobre mudanças no estado
function broadcastState() {
  chrome.runtime.sendMessage({
    type: 'stateUpdate',
    state: {
      currentLeads: state.currentLeads,
      currentLeadIndex: state.currentLeadIndex,
      isPaused: state.isPaused,
      isRunning: state.isRunning,
      countdown: state.countdown
    }
  });
}

// Função para formatar tempo
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Função para processar próximo lead
async function processNextLead() {
  if (!state.currentLeads || state.currentLeadIndex >= state.currentLeads.length) {
    console.log('✅ Todos os leads foram processados');
    state.isRunning = false;
    state.currentLeads = null;
    state.currentLeadIndex = 0;
    await saveState();
    return;
  }

  if (state.isPaused) {
    console.log('⏸️ Discador pausado');
    await saveState();
    return;
  }

  const lead = state.currentLeads[state.currentLeadIndex];
  console.log('📞 Ligando para:', {
    nome: lead.name,
    telefone: lead.phone,
    indice: state.currentLeadIndex + 1,
    total: state.currentLeads.length
  });
  
  try {
    // Formata o número removendo caracteres especiais e espaços
    const formattedPhone = lead.phone.replace(/[^\d+]/g, '');
    
    // Abre a página de detalhes do lead na mesma aba do Kommo
    if (lead.detailsUrl) {
      const domain = (await chrome.storage.sync.get(['kommoDomain'])).kommoDomain || 'app';
      const tabs = await chrome.tabs.query({url: "*://*.kommo.com/*"});
      if (tabs.length > 0) {
        console.log('🔗 Abrindo página do lead:', `https://${domain}.kommo.com${lead.detailsUrl}`);
        await chrome.tabs.update(tabs[0].id, { 
          url: `https://${domain}.kommo.com${lead.detailsUrl}`,
          active: false
        });
      }
    }
    
    // Faz a ligação usando a função makeCall
    console.log('📱 Iniciando chamada para:', formattedPhone);
    const response = await makeCall(formattedPhone);

    if (!response.success) {
      throw new Error(response.error || 'Erro ao fazer ligação');
    }

    console.log('✅ Chamada finalizada com sucesso');

    if (state.isPaused) return;

    // Aguarda a nota ser salva
    console.log('📝 Aguardando nota ser salva...');
    await new Promise((resolve) => {
      state.waitingNote = true;
      state.noteResolver = resolve;
    });
    state.waitingNote = false;
    console.log('✅ Nota salva, continuando fluxo...');

    // Se ainda há leads para processar
    if (state.currentLeadIndex < state.currentLeads.length - 1) {
      // Incrementa o índice após a ligação ser completada
      state.currentLeadIndex++;
      await saveState();
      
      // Aguarda o delay configurado
      const delay = (await chrome.storage.sync.get(['dialerDelay'])).dialerDelay || 5;
      console.log(`⏳ Aguardando ${delay} segundos antes da próxima chamada...`);
      
      state.countdown = delay;
      broadcastState();
      
      await new Promise(resolve => {
        let remainingTime = delay;
        state.waitTimer = setInterval(() => {
          if (state.isPaused) {
            console.log('⏸️ Timer pausado');
            clearInterval(state.waitTimer);
            state.waitTimer = null;
            resolve();
            return;
          }

          remainingTime--;
          state.countdown = remainingTime;
          broadcastState();
          
          if (remainingTime <= 0) {
            console.log('⏰ Timer finalizado');
            clearInterval(state.waitTimer);
            state.waitTimer = null;
            state.countdown = 0;
            broadcastState();
            resolve();
          }
        }, 1000);
      });

      if (!state.isPaused) {
        processNextLead();
      }
    } else {
      // Se é o último lead, incrementa o índice e aguarda 2 segundos antes de finalizar
      state.currentLeadIndex++;
      await saveState();
      
      // Retorna para a página de pipeline
      const tabs = await chrome.tabs.query({url: "*://*.kommo.com/*"});
      if (tabs.length > 0) {
        const domain = (await chrome.storage.sync.get(['kommoDomain'])).kommoDomain || 'app';
        console.log('🔄 Retornando para a página de pipeline...');
        await chrome.tabs.update(tabs[0].id, { 
          url: `https://${domain}.kommo.com/leads/pipeline/${state.pipelineId || 1}`,
          active: false
        });
      }
      
      // Aguarda 2 segundos antes de finalizar o discador
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Finaliza o discador quando todos os leads foram processados
      console.log('✅ Todas as ligações foram concluídas');
      state.isRunning = false;
      state.currentLeads = null;
      state.currentLeadIndex = 0;
      await saveState();
    }
  } catch (error) {
    console.error('❌ Erro ao processar lead:', error);
    
    // Em caso de erro, tenta o próximo lead após 5 segundos
    if (!state.isPaused) {
      console.log('⏳ Tentando próximo lead em 5 segundos...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      if (!state.isPaused) {
        if (state.currentLeadIndex < state.currentLeads.length - 1) {
          state.currentLeadIndex++;
          await saveState();
          processNextLead();
        } else {
          // Se era o último lead, finaliza após o erro
          console.log('✅ Finalizando discador após erro no último lead');
          state.isRunning = false;
          state.currentLeads = null;
          state.currentLeadIndex = 0;
          await saveState();
        }
      }
    }
  }
}

// Função para abrir ou focar no popup existente
async function openOrFocusPopup() {
  if (popupWindowId !== null) {
    // Verifica se a janela ainda existe
    try {
      const window = await chrome.windows.get(popupWindowId);
      if (window) {
        // Foca na janela existente
        await chrome.windows.update(popupWindowId, { focused: true });
        return;
      }
    } catch (error) {
      // Janela não existe mais, reseta o ID
      popupWindowId = null;
    }
  }

  // Cria uma nova janela popup
  const popup = await chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: 400,
    height: 600
  });
  
  popupWindowId = popup.id;
}

// Listener para quando uma janela é fechada
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
  }
});

// Listener para quando o ícone da extensão é clicado
chrome.action.onClicked.addListener(async () => {
  if (popupWindowId !== null) {
    try {
      // Verifica se a janela ainda existe
      const window = await chrome.windows.get(popupWindowId);
      if (window) {
        // Se existe, fecha ela
        await chrome.windows.remove(popupWindowId);
        popupWindowId = null;
      }
    } catch (error) {
      // Se deu erro, provavelmente a janela não existe mais
      console.error('Erro ao verificar/fechar popup:', error);
      popupWindowId = null;
    }
  } else {
    // Se não existe popup aberto, abre um novo
    const popup = await chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 400,
      height: 600
    });
    popupWindowId = popup.id;
  }
});

// Listener unificado para mensagens
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Mensagem recebida:', request);
  
  if (request.action === 'openPopup') {
    openOrFocusPopup();
    return true;
  }
  
  if (request.action === 'find3CXTab') {
    find3CXTab().then(sendResponse);
    return true;
  }
  
  if (request.action === 'makeCall') {
    makeCall(request.phoneNumber).then(sendResponse).catch(error => {
      console.error('Erro ao fazer ligação:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'noteSaved') {
    // Resolve a Promise que está aguardando a nota ser salva
    if (state.waitingNote && state.noteResolver) {
      state.noteResolver();
    }
    sendResponse({ success: true });
  }

  if (request.action === 'checkStatus') {
    chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      func: () => {
        const statusIndicator = document.querySelector('i[data-qa="status-indicator"]');
        if (!statusIndicator) {
          console.log('Indicador de status não encontrado');
          return { error: 'Indicador de status não encontrado' };
        }

        // Verifica o status usando as classes
        const isAvailable = statusIndicator.classList.contains('available');
        const isUnavailable = statusIndicator.classList.contains('unavailable');
        
        console.log('Status atual:', {
          classes: statusIndicator.className,
          isAvailable,
          isUnavailable
        });

        return { 
          available: isAvailable,
          unavailable: isUnavailable,
          classes: statusIndicator.className
        };
      }
    }).then(result => {
      if (result[0].result.error) {
        sendResponse({ error: result[0].result.error });
      } else {
        sendResponse(result[0].result);
      }
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  }

  if (request.action === 'getState') {
    sendResponse(state);
  }
  
  else if (request.action === 'startDialer') {
    state.currentLeads = request.leads;
    state.currentLeadIndex = 0;
    state.isPaused = false;
    state.isRunning = true;
    state.pipelineId = request.pipelineId;
    saveState();
    processNextLead();
    sendResponse({ success: true });
  }
  
  else if (request.action === 'pauseDialer') {
    state.isPaused = true;
    if (state.waitTimer) {
      clearInterval(state.waitTimer);
      state.waitTimer = null;
    }
    saveState();
    sendResponse({ success: true });
  }
  
  else if (request.action === 'resumeDialer') {
    state.isPaused = false;
    saveState();
    processNextLead();
    sendResponse({ success: true });
  }

  else if (request.action === 'forceReset') {
    // Limpa o estado
    state = {
      currentLeads: null,
      currentLeadIndex: 0,
      isPaused: false,
      isRunning: false,
      waitTimer: null,
      countdown: 0,
      pipelineId: null,
      waitingNote: false,
      noteResolver: null
    };
    
    // Limpa o timer se existir
    if (state.waitTimer) {
      clearInterval(state.waitTimer);
      state.waitTimer = null;
    }
    
    // Salva o estado limpo
    saveState();
    sendResponse({ success: true });
  }

  return true; // Mantém o canal de mensagem aberto para respostas assíncronas
});

// Monitora mudanças nas abas
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && await is3CXURL(tab.url)) {
    console.log('Aba 3CX atualizada:', tab);
    threeCXTabId = tabId;
  }
});

// Monitora fechamento de abas
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === threeCXTabId) {
    console.log('Aba 3CX fechada');
    threeCXTabId = null;
  }
});

// Inicialização
loadState();

async function moveToNextStatus(statusName) {
    try {
        const tab = await getKommoTab();
        addLog(`🔄 Tentando mover para status: ${statusName}`, 'info');
        
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async function(targetStatusName) {
                // Função para aguardar um elemento aparecer
                function waitForElement(selector, maxAttempts = 10) {
                    return new Promise((resolve) => {
                        let attempts = 0;
                        const interval = setInterval(() => {
                            attempts++;
                            const element = document.querySelector(selector);
                            if (element || attempts >= maxAttempts) {
                                clearInterval(interval);
                                resolve(element);
                            }
                        }, 500);
                    });
                }

                try {
                    // Aguarda o container do seletor de status aparecer
                    const statusContainer = await waitForElement('.pipeline-select-wrapper');
                    if (!statusContainer) {
                        throw new Error('Container de status não encontrado');
                    }

                    // Verifica se o dropdown já está aberto
                    const isDropdownOpen = statusContainer.classList.contains('expanded');
                    if (!isDropdownOpen) {
                        // Clica no container para abrir o dropdown
                        statusContainer.click();
                        console.log('Container de status clicado');
                    }

                    // Aguarda a lista de status aparecer
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Encontra todos os itens de status
                    const statusItems = document.querySelectorAll('.pipeline-select__dropdown__item');
                    console.log('Status encontrados:', statusItems.length);
                    
                    let targetStatus = null;
                    let statusNames = [];

                    for (const item of statusItems) {
                        const statusText = item.querySelector('.pipeline-select__item-text')?.textContent.trim();
                        if (statusText) {
                            statusNames.push(statusText);
                            if (statusText === targetStatusName) {
                                targetStatus = item;
                                break;
                            }
                        }
                    }

                    if (!targetStatus) {
                        console.log('Status disponíveis:', statusNames.join(', '));
                        throw new Error(`Status "${targetStatusName}" não encontrado. Status disponíveis: ${statusNames.join(', ')}`);
                    }

                    // Encontra e clica no input de rádio dentro do item de status
                    const radioInput = targetStatus.querySelector('input[type="radio"]');
                    if (!radioInput) {
                        throw new Error('Input de seleção não encontrado');
                    }
                    
                    // Clica no input e no label para garantir a seleção
                    radioInput.click();
                    targetStatus.querySelector('label')?.click();
                    console.log('Status selecionado:', targetStatusName);

                    // Aguarda a mudança ser aplicada
                    await new Promise(resolve => setTimeout(resolve, 1500));

                    // Tenta diferentes seletores para o botão salvar
                    const saveButtonSelectors = [
                        '#save_and_close_contacts_link',
                        '.card-top-save-button',
                        'button.button-input_blue.card-top-save-button',
                        'button.js-button-with-loader.card-top-save-button'
                    ];

                    let saveButton = null;
                    for (const selector of saveButtonSelectors) {
                        saveButton = document.querySelector(selector);
                        if (saveButton && saveButton.offsetParent !== null) {
                            console.log('Botão salvar encontrado com seletor:', selector);
                            break;
                        }
                    }

                    if (!saveButton || saveButton.offsetParent === null) {
                        throw new Error('Botão de salvar não encontrado ou não está visível');
                    }

                    // Tenta diferentes métodos para clicar no botão
                    try {
                        // Método 1: Click direto
                        saveButton.click();
                        console.log('Click direto no botão salvar');
                    } catch (e) {
                        try {
                            // Método 2: Dispatch de evento
                            saveButton.dispatchEvent(new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window
                            }));
                            console.log('Evento de click disparado no botão salvar');
                        } catch (e2) {
                            throw new Error('Não foi possível clicar no botão salvar: ' + e2.message);
                        }
                    }

                    // Aguarda o salvamento ser concluído
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    return { success: true, message: `Status alterado para ${targetStatusName} e salvo` };
                } catch (error) {
                    console.error('Erro ao mudar status:', error);
                    return { error: error.message };
                }
            },
            args: [statusName]
        });

        const scriptResult = result[0].result;
        if (scriptResult.error) {
            throw new Error(scriptResult.error);
        }

        addLog(`✅ Status alterado e salvo com sucesso para: ${statusName}`, 'success');
        return true;
    } catch (error) {
        addLog(`❌ Erro ao mudar status: ${error.message}`, 'error');
        throw error;
    }
} 