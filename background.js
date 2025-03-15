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
          resolve(false);
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
      
      for (const tab of tabs) {
        const is3CX = await is3CXURL(tab.url);
        
        console.log('🔎 Verificando aba:', {
          url: tab.url,
          title: tab.title,
          id: tab.id,
          is3CX
        });
        
        if (is3CX) {
          console.log('✅ Aba 3CX encontrada:', {
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
          // Aguarda elementos carregarem
          const waitForElement = (selector, timeout = 5000) => {
            return new Promise((resolve, reject) => {
              const startTime = Date.now();
              
              const checkElement = () => {
                let element = null;
                
                // Tenta diferentes estratégias
                if (selector === '#menuDialer') {
                  // Primeiro tenta pelo ID
                  element = document.querySelector('#menuDialer');
                  if (!element) {
                    // Tenta pelo atributo role e title
                    element = document.querySelector('a[role="button"][title="Discador"]');
                  }
                  if (!element) {
                    // Tenta pelo ícone dentro do botão
                    const icon = document.querySelector('.customSVGIcons.svg-sm');
                    if (icon) {
                      element = icon.closest('a[role="button"]');
                    }
                  }
                } else if (selector === '#btnCall') {
                  // Primeiro tenta pelo ID
                  element = document.querySelector('#btnCall');
                  if (!element) {
                    // Tenta pelo ícone do telefone
                    element = document.querySelector('button.btnNum span[app-phone-alt-solid-icon]').closest('button');
                  }
                } else {
                  element = document.querySelector(selector);
                }
                
                if (element) {
                  console.log('Elemento encontrado:', {
                    selector,
                    element: element.outerHTML,
                    isVisible: element.offsetParent !== null
                  });
                  resolve(element);
                } else if (Date.now() - startTime > timeout) {
                  const html = document.body.innerHTML;
                  console.log('HTML disponível (primeiros 500 caracteres):', html.substring(0, 500));
                  reject(new Error(`Elemento ${selector} não encontrado após ${timeout}ms`));
                } else {
                  setTimeout(checkElement, 100);
                }
              };
              
              checkElement();
            });
          };

          // Função para verificar status
          const checkStatus = async () => {
            const statusIndicator = document.querySelector('i[data-qa="status-indicator"]');
            if (!statusIndicator) {
              throw new Error('Indicador de status não encontrado');
            }

            const style = getComputedStyle(statusIndicator);
            const backgroundColor = style.backgroundColor;
            console.log('Status atual:', backgroundColor);

            // Verifica se a classe 'available' está presente
            const isAvailableClass = statusIndicator.classList.contains('available');
            console.log('Tem classe available:', isAvailableClass);

            const isAvailable = isAvailableClass || 
                              backgroundColor.includes('var(--status-available)') || 
                              backgroundColor.includes('rgb(0, 255, 0)') ||
                              backgroundColor.includes('#00ff00');

            return isAvailable;
          };

          // Função para aguardar ficar disponível
          const waitForAvailable = async (maxWaitTime = 300000) => {
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWaitTime) {
              if (await checkStatus()) {
                return true;
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            throw new Error('Timeout aguardando ficar disponível');
          };

          // Função para clicar em um elemento com retry
          const clickElement = async (element, maxRetries = 3) => {
            for (let i = 0; i < maxRetries; i++) {
              try {
                console.log('Tentando clicar no elemento:', {
                  tagName: element.tagName,
                  id: element.id,
                  classes: element.className,
                  isVisible: element.offsetParent !== null
                });

                // Tenta diferentes métodos de clique
                try {
                  element.click();
                } catch (e) {
                  console.log('Clique direto falhou, tentando evento');
                  element.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  }));
                }

                await new Promise(resolve => setTimeout(resolve, 2000));
                return;
              } catch (error) {
                console.log(`Tentativa ${i + 1} falhou:`, error);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
            throw new Error('Falha ao clicar no elemento após várias tentativas');
          };

          // Fluxo principal
          (async () => {
            try {
              console.log('Iniciando fluxo de ligação...');
              
              // Primeiro verifica se está disponível
              console.log('Verificando status...');
              await waitForAvailable();
              console.log('Status disponível, iniciando ligação...');

              // Tenta encontrar o botão do discador
              console.log('Procurando botão do discador...');
              const dialerButton = await waitForElement('#menuDialer');
              console.log('Botão do discador encontrado:', dialerButton);
              await clickElement(dialerButton);

              // Aguarda o input do discador aparecer
              console.log('Aguardando input do discador...');
              const phoneInput = await waitForElement('#dialpad-input');
              console.log('Input encontrado, preenchendo número:', phoneNumber);
              
              // Limpa o input antes
              phoneInput.value = '';
              phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Preenche o número
              phoneInput.value = phoneNumber;
              phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
              phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
              await new Promise(resolve => setTimeout(resolve, 2000));

              // Aguarda o botão de chamada
              console.log('Procurando botão de chamada...');
              const callButton = await waitForElement('#btnCall');
              console.log('Botão de chamada encontrado, clicando...');
              await clickElement(callButton);

              console.log('Chamada iniciada com sucesso');
              resolve({ success: true });
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
          return { error: 'Indicador de status não encontrado' };
        }

        const style = getComputedStyle(statusIndicator);
        const backgroundColor = style.backgroundColor;

        const isAvailable = backgroundColor.includes('var(--status-available)') || 
                          backgroundColor.includes('rgb(0, 255, 0)') ||
                          backgroundColor.includes('#00ff00');

        return { available: isAvailable };
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