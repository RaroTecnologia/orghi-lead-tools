// Variável para armazenar o ID da aba do 3CX
let threeCXTabId = null;

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
  console.log('Iniciando ligação para:', phone);
  
  try {
    const result = await find3CXTab();
    
    if (!result.found) {
      throw new Error('3CX não encontrado');
    }

    console.log('Executando script na aba:', result.tabId);

    const scriptResult = await chrome.scripting.executeScript({
      target: { tabId: result.tabId },
      func: (phoneNumber) => {
        return new Promise((resolve) => {
          // Função para monitorar status da ligação
          const monitorCallStatus = () => {
            return new Promise((resolve) => {
              let wasInCall = false;
              
              const checkStatus = () => {
                const statusIndicator = document.querySelector('i[data-qa="status-indicator"]');
                if (!statusIndicator) return setTimeout(checkStatus, 500);
                
                // Verifica pelos estados usando as classes
                const isAvailable = statusIndicator.classList.contains('available');
                const isInCall = !isAvailable && !statusIndicator.classList.contains('unavailable');
                
                console.log('Status atual:', {
                  classes: statusIndicator.className,
                  isAvailable,
                  isInCall,
                  wasInCall
                });
                
                if (isInCall) {
                  console.log('Em chamada...');
                  wasInCall = true;
                } else if (wasInCall && isAvailable) {
                  console.log('Chamada finalizada - status voltou para disponível');
                  resolve();
                  return;
                }
                
                setTimeout(checkStatus, 500);
              };
              
              checkStatus();
            });
          };

          // Função otimizada para aguardar elementos
          const waitForElement = (selector, timeout = 3000) => {
            return new Promise((resolve, reject) => {
              const startTime = Date.now();
              
              const checkElement = () => {
                let element = null;
                
                // Tenta diferentes estratégias em ordem de prioridade
                if (selector === '#menuDialer') {
                  const selectors = [
                    '#menuDialer',
                    'a[role="button"][title="Discador"]',
                    'a[role="button"] .customSVGIcons.svg-sm',
                    'a.header-button[title="Discador"]'
                  ];
                  
                  for (const sel of selectors) {
                    element = document.querySelector(sel);
                    if (element) {
                      if (sel.includes('.customSVGIcons')) {
                        element = element.closest('a[role="button"]');
                      }
                      break;
                    }
                  }
                } else if (selector === '#btnCall') {
                  const selectors = [
                    '#btnCall',
                    'button.btnNum span[app-phone-alt-solid-icon]',
                    'button.btnNum'
                  ];
                  
                  for (const sel of selectors) {
                    element = document.querySelector(sel);
                    if (element) {
                      if (sel.includes('span')) {
                        element = element.closest('button');
                      }
                      break;
                    }
                  }
                } else {
                  element = document.querySelector(selector);
                }
                
                if (element && element.offsetParent !== null) {
                  console.log('Elemento encontrado e visível:', selector);
                  resolve(element);
                } else if (Date.now() - startTime > timeout) {
                  reject(new Error(`Elemento ${selector} não encontrado após ${timeout}ms`));
                } else {
                  setTimeout(checkElement, 50); // Reduzido para 50ms
                }
              };
              
              checkElement();
            });
          };

          // Função otimizada para clicar
          const clickElement = async (element) => {
            try {
              element.click();
            } catch (e) {
              element.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              }));
            }
            // Reduzido para 500ms
            await new Promise(resolve => setTimeout(resolve, 500));
          };

          // Fluxo principal otimizado
          (async () => {
            try {
              console.log('Iniciando fluxo de ligação...');
              
              // Encontra e clica no botão do discador
              console.log('Procurando botão do discador...');
              const dialerButton = await waitForElement('#menuDialer');
              await clickElement(dialerButton);

              // Aguarda e preenche o input
              console.log('Aguardando input do discador...');
              const phoneInput = await waitForElement('#dialpad-input');
              
              // Limpa e preenche o número rapidamente
              phoneInput.value = '';
              phoneInput.value = phoneNumber;
              phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
              phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Reduzido para 300ms
              await new Promise(resolve => setTimeout(resolve, 300));

              // Clica para ligar
              console.log('Procurando botão de chamada...');
              const callButton = await waitForElement('#btnCall');
              await clickElement(callButton);

              console.log('Aguardando fim da chamada...');
              await monitorCallStatus();

              console.log('Chamada finalizada com sucesso');
              resolve({ success: true, completed: true });
            } catch (error) {
              console.error('Erro durante a ligação:', error);
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
    console.error('Erro ao fazer ligação:', error);
    throw error;
  }
}

// Listener para mensagens
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Mensagem recebida:', request);
  
  if (request.action === 'find3CXTab') {
    find3CXTab().then(sendResponse);
    return true; // Mantém o canal de mensagem aberto
  }
  
  if (request.action === 'makeCall') {
    makeCall(request.phoneNumber).then(sendResponse).catch(error => {
      console.error('Erro ao fazer ligação:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Mantém o canal de mensagem aberto
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