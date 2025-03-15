document.addEventListener('DOMContentLoaded', function() {
    // Elementos da UI
    const whatsappChannelsContainer = document.getElementById('whatsappChannels');
    const addWhatsappChannelButton = document.getElementById('addWhatsappChannel');
    const dialerDelayInput = document.getElementById('dialerDelay');
    const threeCXDomainInput = document.getElementById('threeCXDomain');
    const kommoDomainInput = document.getElementById('kommoDomain');
    const saveAllButton = document.getElementById('saveAll');
    const scanTabsButton = document.getElementById('scanTabs');
    const statusMessageElement = document.getElementById('statusMessage');
    const threeCXStatusElement = document.getElementById('threeCXStatus');
    const debugInfoElement = document.getElementById('debugInfo');
    const debugModeInput = document.getElementById('debugMode');

    // Função para criar um novo campo de canal
    function createChannelField(value = '') {
        const channelGroup = document.createElement('div');
        channelGroup.className = 'whatsapp-channel';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'whatsapp-channel-input';
        input.placeholder = 'Ex: Raro';
        input.value = value;

        const removeButton = document.createElement('button');
        removeButton.className = 'secondary';
        removeButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        `;
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
    chrome.storage.sync.get(['whatsappChannels', 'dialerDelay', 'threeCXDomain', 'kommoDomain', 'debugMode'], (result) => {
        // Carrega canais do WhatsApp
        const channels = result.whatsappChannels || [''];
        channels.forEach(channel => {
            whatsappChannelsContainer.appendChild(createChannelField(channel));
        });

        // Carrega outras configurações
        dialerDelayInput.value = result.dialerDelay || '5';
        threeCXDomainInput.value = result.threeCXDomain || '';
        kommoDomainInput.value = result.kommoDomain || '';
        debugModeInput.checked = result.debugMode || false;
        
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

        if (!kommoDomainInput.value) {
            showStatusMessage('Por favor, preencha o subdomínio do Kommo', true);
            return;
        }

        // Salvar configurações
        chrome.storage.sync.set({
            whatsappChannels: channels,
            dialerDelay: dialerDelayInput.value,
            threeCXDomain: threeCXDomainInput.value,
            kommoDomain: kommoDomainInput.value,
            debugMode: debugModeInput.checked
        }, () => {
            showStatusMessage('Configurações salvas com sucesso!');
            checkThreeCXStatus(); // Verificar status após salvar
        });
    });
}); 