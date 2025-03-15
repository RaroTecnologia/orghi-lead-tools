console.log('Orghi Lead Tools - Content Script Carregado');

// Função para ocultar linhas de WhatsApp não desejadas
function filterWhatsappLines(officialLine) {
    console.log('Iniciando filterWhatsappLines com linha:', officialLine);

    // Função que aplica o filtro em um elemento
    function applyFilter(element) {
        console.log('Aplicando filtro em elemento:', element);
        const items = element.querySelectorAll('.tips-item');
        items.forEach(item => {
            // Verifica se é um item de WhatsApp (procurando pela imagem do WhatsApp)
            const isWhatsApp = item.querySelector('img[src*="whatsapp"]') || 
                             item.querySelector('img[src*="waba"]') ||
                             item.querySelector('img[src*="amocrmwa"]');
            
            if (isWhatsApp) {
                const itemText = item.textContent.trim();
                console.log('Item WhatsApp encontrado:', itemText);
                
                if (!itemText.includes(officialLine)) {
                    console.log('Ocultando:', itemText);
                    item.style.display = 'none';
                } else {
                    console.log('Mantendo visível:', itemText);
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
                console.log('Ocultando WhatsApp Lite');
                messenger.parentElement.style.display = 'none';
                // Oculta também o contador +1 se existir
                const counter = messenger.parentElement.querySelector('.profile_messengers-counter');
                if (counter) {
                    counter.style.display = 'none';
                }
            } else if (isCloudAPI) {
                console.log('Mantendo Cloud API visível');
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
                        console.log('Dropdown adicionado:', node);
                        applyFilter(node);
                    }
                    // Procura por dropdowns dentro do node adicionado
                    const dropdowns = node.querySelectorAll('.tips__inner.custom-scroll');
                    dropdowns.forEach(dropdown => {
                        console.log('Dropdown encontrado dentro do node:', dropdown);
                        applyFilter(dropdown);
                    });
                }
            });

            // Verifica o target da mutação
            if (mutation.target.nodeType === 1) {
                if (isRelevantDropdown(mutation.target)) {
                    console.log('Dropdown modificado:', mutation.target);
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
    console.log('Verificando dropdowns existentes...');
    const existingDropdowns = document.querySelectorAll('.tips__inner.custom-scroll');
    existingDropdowns.forEach(dropdown => {
        console.log('Dropdown existente encontrado:', dropdown);
        applyFilter(dropdown);
    });

    // Verifica mensageiros existentes
    console.log('Verificando mensageiros existentes...');
    filterProfileMessengers();
}

// Carrega a configuração inicial
console.log('Carregando configuração inicial...');
chrome.storage.sync.get(['whatsappLine'], function(result) {
    if (result.whatsappLine) {
        console.log('Linha configurada:', result.whatsappLine);
        filterWhatsappLines(result.whatsappLine);
    } else {
        console.log('Nenhuma linha configurada ainda');
    }
});

// Função para coletar os status do funil
function getStatusList() {
    const statusList = [];
    const statusElements = document.querySelectorAll('.pipeline_status');
    
    statusElements.forEach(element => {
        const titleElement = element.querySelector('.pipeline_status__head_title span.block-selectable');
        const statusHead = element.querySelector('.pipeline_status__head');
        
        if (titleElement && statusHead) {
            const statusId = statusHead.getAttribute('data-id');
            const statusName = titleElement.textContent.trim();
            
            if (statusId && statusName) {
                statusList.push({
                    id: statusId,
                    name: statusName
                });
            }
        }
    });

    console.log('Status encontrados:', statusList);
    return statusList;
}

// Atualiza o listener de mensagens para incluir a coleta de status
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Mensagem recebida:', request);
    if (request.action === 'updateWhatsappLine') {
        console.log('Atualizando linha para:', request.line);
        filterWhatsappLines(request.line);
    } else if (request.action === 'startDialer') {
        console.log('Iniciando discador...');
        startDialer(request.statusId);
    } else if (request.action === 'getStatusList') {
        console.log('Coletando lista de status...');
        sendResponse({ statusList: getStatusList() });
    }
    return true; // Mantém o canal de mensagem aberto para respostas assíncronas
});

// Atualiza a função startDialer para usar o ID do status
function startDialer(statusId) {
    console.log('Iniciando startDialer com statusId:', statusId);
    
    if (!statusId) {
        console.log('StatusId não fornecido');
        alert('Por favor, selecione um status no funil.');
        return;
    }

    const targetColumn = document.querySelector(`.pipeline_status__head[data-id="${statusId}"]`);
    console.log('Coluna encontrada:', targetColumn);
    
    if (!targetColumn) {
        alert('Status não encontrado no funil.');
        return;
    }

    const statusContainer = targetColumn.closest('.pipeline_status');
    console.log('Container do status:', statusContainer);
    
    if (!statusContainer) {
        alert('Não foi possível encontrar os leads deste status.');
        return;
    }

    const leads = statusContainer.querySelectorAll('.pipeline_leads__item');
    console.log('Leads encontrados:', leads.length);
    
    const leadCount = 5;
    
    if (leads.length === 0) {
        alert('Nenhum lead encontrado neste status.');
        return;
    }

    const phoneNumbers = [];
    for (let i = 0; i < Math.min(leads.length, leadCount); i++) {
        const lead = leads[i];
        const phoneElement = lead.querySelector('.pipeline_leads__note');
        const nameElement = lead.querySelector('.pipeline_leads__title-text');
        const leadId = nameElement?.getAttribute('href')?.split('/').pop();
        
        if (phoneElement && nameElement && leadId) {
            const phone = phoneElement.textContent.trim();
            const name = nameElement.textContent.trim();
            const leadUrl = nameElement.getAttribute('href');
            
            console.log('Dados encontrados:', { name, phone, leadId, leadUrl });
            
            if (phone) {
                phoneNumbers.push({ name, phone, leadId, leadUrl });
            }
        }
    }

    if (phoneNumbers.length === 0) {
        alert('Nenhum número de telefone encontrado nos leads selecionados.');
        return;
    }

    const existingDialer = document.getElementById('orghi-dialer');
    if (existingDialer) {
        existingDialer.remove();
    }

    const dialer = document.createElement('div');
    dialer.id = 'orghi-dialer';
    dialer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 12px;
        padding: 20px;
        width: 320px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        z-index: 9999;
        font-family: system-ui, -apple-system, sans-serif;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 1px solid #eee;
    `;
    
    const title = document.createElement('div');
    title.innerHTML = `
        <h3 style="margin: 0; color: #2C3E50;">Discador Orghi</h3>
        <div style="font-size: 12px; color: #7F8C8D; margin-top: 4px;">
            ${phoneNumbers.length} leads encontrados
        </div>
    `;
    
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
        border: none;
        background: none;
        font-size: 24px;
        cursor: pointer;
        padding: 0 5px;
        color: #95A5A6;
        transition: color 0.2s;
    `;
    closeButton.onmouseover = () => closeButton.style.color = '#2C3E50';
    closeButton.onmouseout = () => closeButton.style.color = '#95A5A6';
    closeButton.onclick = () => dialer.remove();

    header.appendChild(title);
    header.appendChild(closeButton);
    dialer.appendChild(header);

    // Container principal
    const mainContainer = document.createElement('div');
    mainContainer.style.cssText = `
        background: #F8FAFC;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
    `;

    // Informações do lead atual
    const currentLead = phoneNumbers[0];
    const leadInfo = document.createElement('div');
    leadInfo.style.cssText = `
        margin-bottom: 15px;
        padding-bottom: 15px;
        border-bottom: 1px solid #E2E8F0;
    `;
    
    leadInfo.innerHTML = `
        <div style="font-size: 18px; font-weight: 600; color: #2C3E50; margin-bottom: 8px;">
            ${currentLead.name}
        </div>
        <div style="font-size: 16px; color: #3498DB; font-weight: 500;">
            ${currentLead.phone}
        </div>
    `;

    // Botões de ação
    const actionButtons = document.createElement('div');
    actionButtons.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    `;

    const dialButton = document.createElement('button');
    dialButton.innerHTML = `
        <div style="font-size: 14px; font-weight: 500;">Discar</div>
    `;
    dialButton.style.cssText = `
        padding: 10px;
        border: none;
        border-radius: 6px;
        background: #2ECC71;
        color: white;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    dialButton.onmouseover = () => dialButton.style.background = '#27AE60';
    dialButton.onmouseout = () => dialButton.style.background = '#2ECC71';
    dialButton.onclick = async () => {
        try {
            // Formata o número para discagem
            const phoneNumber = currentLead.phone.replace(/[\s\-\(\)]/g, '');
            
            // Verifica se o 3CX está disponível
            const is3CXAvailable = await check3CXAvailability();
            
            if (is3CXAvailable) {
                // Atualiza o status do botão
                dialButton.style.background = '#27AE60';
                dialButton.innerHTML = `
                    <div style="font-size: 14px; font-weight: 500;">Discando via 3CX...</div>
                `;
                
                // Faz a chamada via 3CX
                await makeCall3CX(phoneNumber);
                
                // Aguarda callback do 3CX (simulado por enquanto)
                setTimeout(() => {
                    // Atualiza interface após a chamada
                    dialButton.style.background = '#2ECC71';
                    dialButton.innerHTML = `
                        <div style="font-size: 14px; font-weight: 500;">Discar Próximo</div>
                    `;
                    
                    // TODO: Implementar lógica para passar para o próximo lead
                }, 2000);
            } else {
                // Fallback para o método anterior se o 3CX não estiver disponível
                const telNumber = `tel:${phoneNumber}`;
                window.open(telNumber, '_blank');
                
                dialButton.style.background = '#27AE60';
                dialButton.innerHTML = `
                    <div style="font-size: 14px; font-weight: 500;">Discando...</div>
                `;
                
                setTimeout(() => {
                    dialButton.style.background = '#2ECC71';
                    dialButton.innerHTML = `
                        <div style="font-size: 14px; font-weight: 500;">Discar</div>
                    `;
                }, 2000);
            }
        } catch (error) {
            console.error('Erro ao discar:', error);
            alert('Erro ao tentar discar. Por favor, tente novamente.');
            
            dialButton.style.background = '#2ECC71';
            dialButton.innerHTML = `
                <div style="font-size: 14px; font-weight: 500;">Discar</div>
            `;
        }
    };

    const viewButton = document.createElement('button');
    viewButton.innerHTML = `
        <div style="font-size: 14px; font-weight: 500;">Ver Lead</div>
    `;
    viewButton.style.cssText = `
        padding: 10px;
        border: 1px solid #BDC3C7;
        border-radius: 6px;
        background: white;
        color: #7F8C8D;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    viewButton.onmouseover = () => {
        viewButton.style.background = '#F8F9FA';
        viewButton.style.borderColor = '#95A5A6';
    };
    viewButton.onmouseout = () => {
        viewButton.style.background = 'white';
        viewButton.style.borderColor = '#BDC3C7';
    };
    viewButton.onclick = async () => {
        try {
            // Busca a página do lead
            const response = await fetch(currentLead.leadUrl);
            const html = await response.text();
            
            // Cria um DOM parser
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Encontra o container principal do lead
            const leadContent = doc.querySelector('.card-fields');
            if (leadContent) {
                // Remove qualquer preview existente
                const existingPreview = document.getElementById('orghi-lead-preview');
                if (existingPreview) {
                    existingPreview.remove();
                }
                
                // Cria o container do preview
                const previewContainer = document.createElement('div');
                previewContainer.id = 'orghi-lead-preview';
                previewContainer.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                    z-index: 10000;
                    width: 80%;
                    max-width: 800px;
                    max-height: 80vh;
                    overflow-y: auto;
                `;
                
                // Adiciona o cabeçalho
                const previewHeader = document.createElement('div');
                previewHeader.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 1px solid #eee;
                `;
                
                const previewTitle = document.createElement('h3');
                previewTitle.textContent = currentLead.name;
                previewTitle.style.margin = '0';
                
                const closePreviewButton = document.createElement('button');
                closePreviewButton.textContent = '×';
                closePreviewButton.style.cssText = `
                    border: none;
                    background: none;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0 5px;
                `;
                closePreviewButton.onclick = () => previewContainer.remove();
                
                previewHeader.appendChild(previewTitle);
                previewHeader.appendChild(closePreviewButton);
                previewContainer.appendChild(previewHeader);
                
                // Adiciona o conteúdo do lead
                previewContainer.appendChild(leadContent.cloneNode(true));
                
                // Adiciona o overlay
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    z-index: 9999;
                `;
                overlay.onclick = () => {
                    overlay.remove();
                    previewContainer.remove();
                };
                
                document.body.appendChild(overlay);
                document.body.appendChild(previewContainer);
            } else {
                alert('Não foi possível carregar os detalhes do lead');
            }
        } catch (error) {
            console.error('Erro ao buscar lead:', error);
            alert('Erro ao carregar detalhes do lead. Por favor, tente novamente.');
        }
    };

    actionButtons.appendChild(dialButton);
    actionButtons.appendChild(viewButton);

    mainContainer.appendChild(leadInfo);
    mainContainer.appendChild(actionButtons);
    dialer.appendChild(mainContainer);

    // Lista de próximos leads
    if (phoneNumbers.length > 1) {
        const nextLeadsTitle = document.createElement('div');
        nextLeadsTitle.textContent = 'Próximos Leads';
        nextLeadsTitle.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            color: #7F8C8D;
            margin-bottom: 10px;
        `;
        dialer.appendChild(nextLeadsTitle);

        const leadsList = document.createElement('div');
        leadsList.style.cssText = `
            max-height: 200px;
            overflow-y: auto;
        `;

        phoneNumbers.slice(1).forEach((item, index) => {
            const leadItem = document.createElement('div');
            leadItem.style.cssText = `
                padding: 10px;
                background: white;
                border: 1px solid #E2E8F0;
                margin-bottom: 8px;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            
            leadItem.innerHTML = `
                <div style="font-weight: 500; color: #2C3E50;">${item.name}</div>
                <div style="font-size: 13px; color: #7F8C8D;">${item.phone}</div>
            `;
            
            leadItem.onmouseover = () => {
                leadItem.style.background = '#F8FAFC';
                leadItem.style.borderColor = '#CBD5E1';
            };
            leadItem.onmouseout = () => {
                leadItem.style.background = 'white';
                leadItem.style.borderColor = '#E2E8F0';
            };
            
            leadItem.onclick = () => {
                window.location.href = item.leadUrl;
            };

            leadsList.appendChild(leadItem);
        });

        dialer.appendChild(leadsList);
    }

    document.body.appendChild(dialer);

    // Inicia a discagem automaticamente
    setTimeout(() => {
        dialButton.click();
    }, 500);
}

// Função para verificar se o 3CX está disponível
function check3CXAvailability() {
    return new Promise((resolve) => {
        // Verifica se a janela do 3CX está aberta
        chrome.runtime.sendMessage({ action: 'find3CXTab' }, (response) => {
            resolve(response && response.found);
        });
    });
}

// Função para fazer a chamada via 3CX
async function makeCall3CX(phoneNumber) {
    try {
        // Remove todos os caracteres não numéricos
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        
        // Envia mensagem para o background script fazer a chamada
        chrome.runtime.sendMessage({
            action: 'make3CXCall',
            number: cleanNumber
        }, (response) => {
            if (response && response.success) {
                console.log('Chamada iniciada com sucesso');
            } else {
                console.error('Erro ao iniciar chamada:', response?.error);
            }
        });
    } catch (error) {
        console.error('Erro ao fazer chamada:', error);
        throw error;
    }
} 