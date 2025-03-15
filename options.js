document.addEventListener('DOMContentLoaded', function() {
    // Elementos da UI
    const whatsappChannelsContainer = document.getElementById('whatsappChannels');
    const addWhatsappChannelButton = document.getElementById('addWhatsappChannel');
    const dialerDelayInput = document.getElementById('dialerDelay');
    const threeCXDomainInput = document.getElementById('threeCXDomain');
    const saveAllButton = document.getElementById('saveAll');
    const scanTabsButton = document.getElementById('scanTabs');
    const statusMessageElement = document.getElementById('statusMessage');
    const threeCXStatusElement = document.getElementById('threeCXStatus');
    const debugInfoElement = document.getElementById('debugInfo');

    // Função para criar um novo campo de canal
    function createChannelField(value = '') {
        const channelGroup = document.createElement('div');
        channelGroup.className = 'form-group whatsapp-channel';
        channelGroup.style.display = 'flex';
        channelGroup.style.gap = '10px';
        channelGroup.style.alignItems = 'center';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'whatsapp-channel-input';
        input.placeholder = 'Ex: Raro';
        input.value = value;
        input.style.flex = '1';

        const removeButton = document.createElement('button');
        removeButton.textContent = '✕';
        removeButton.className = 'secondary';
        removeButton.style.padding = '8px 12px';
        removeButton.onclick = () => channelGroup.remove();

        channelGroup.appendChild(input);
        channelGroup.appendChild(removeButton);
        return channelGroup;
    }

    // Função para mostrar mensagem de status
    function showStatusMessage(message, isError = false) {
        statusMessageElement.textContent = message;
        statusMessageElement.className = 'status-message ' + (isError ? 'error' : 'success');
        setTimeout(() => {
            statusMessageElement.className = 'status-message';
        }, 3000);
    }

    // Função para atualizar o status do 3CX
    function updateThreeCXStatus(found, details = '') {
        threeCXStatusElement.textContent = found ? 'Conectado' : 'Desconectado';
        threeCXStatusElement.className = 'status-badge ' + (found ? 'connected' : 'disconnected');
        
        if (details) {
            debugInfoElement.textContent = details;
            debugInfoElement.style.display = 'block';
        } else {
            debugInfoElement.style.display = 'none';
        }
    }

    // Carregar configurações salvas
    chrome.storage.sync.get(['whatsappChannels', 'dialerDelay', 'threeCXDomain'], (result) => {
        // Carrega canais do WhatsApp
        const channels = result.whatsappChannels || [''];
        channels.forEach(channel => {
            whatsappChannelsContainer.appendChild(createChannelField(channel));
        });

        dialerDelayInput.value = result.dialerDelay || '5';
        threeCXDomainInput.value = result.threeCXDomain || '';
        
        // Verificar status do 3CX ao carregar
        checkThreeCXStatus();
    });

    // Event listener para adicionar novo canal
    addWhatsappChannelButton.addEventListener('click', () => {
        whatsappChannelsContainer.appendChild(createChannelField());
    });

    // Função para verificar status do 3CX
    function checkThreeCXStatus() {
        chrome.runtime.sendMessage({ action: 'find3CXTab' }, (response) => {
            if (chrome.runtime.lastError) {
                updateThreeCXStatus(false, 'Erro ao verificar status: ' + chrome.runtime.lastError.message);
                return;
            }

            if (response && response.found) {
                updateThreeCXStatus(true, `3CX encontrado!\nTab ID: ${response.tabId}\nURL: ${response.url}`);
            } else {
                updateThreeCXStatus(false, 'Nenhuma aba do 3CX encontrada. Certifique-se que o PWA está aberto.');
            }
        });
    }

    // Event listener para o botão de scan
    scanTabsButton.addEventListener('click', () => {
        checkThreeCXStatus();
    });

    // Event listener para salvar configurações
    saveAllButton.addEventListener('click', () => {
        // Coleta todos os canais de WhatsApp
        const channels = Array.from(document.querySelectorAll('.whatsapp-channel-input'))
            .map(input => input.value.trim())
            .filter(value => value); // Remove valores vazios

        if (channels.length === 0) {
            showStatusMessage('Por favor, adicione pelo menos um canal do WhatsApp', true);
            return;
        }

        if (!dialerDelayInput.value || isNaN(dialerDelayInput.value)) {
            showStatusMessage('Por favor, insira um tempo válido entre ligações', true);
            return;
        }

        if (!threeCXDomainInput.value) {
            showStatusMessage('Por favor, preencha o domínio do 3CX', true);
            return;
        }

        // Salvar configurações
        chrome.storage.sync.set({
            whatsappChannels: channels,
            dialerDelay: dialerDelayInput.value,
            threeCXDomain: threeCXDomainInput.value
        }, () => {
            showStatusMessage('Configurações salvas com sucesso!');
            checkThreeCXStatus(); // Verificar status após salvar
        });
    });
}); 