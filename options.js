document.addEventListener('DOMContentLoaded', function() {
    // Elementos da UI
    const whatsappLineInput = document.getElementById('whatsappLine');
    const dialerDelayInput = document.getElementById('dialerDelay');
    const threeCXDomainInput = document.getElementById('threeCXDomain');
    const saveAllButton = document.getElementById('saveAll');
    const scanTabsButton = document.getElementById('scanTabs');
    const statusMessageElement = document.getElementById('statusMessage');
    const threeCXStatusElement = document.getElementById('threeCXStatus');
    const debugInfoElement = document.getElementById('debugInfo');

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
    chrome.storage.sync.get(['whatsappLine', 'dialerDelay', 'threeCXDomain'], (result) => {
        whatsappLineInput.value = result.whatsappLine || '';
        dialerDelayInput.value = result.dialerDelay || '5';
        threeCXDomainInput.value = result.threeCXDomain || '';
        
        // Verificar status do 3CX ao carregar
        checkThreeCXStatus();
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
        // Validar campos
        if (!whatsappLineInput.value) {
            showStatusMessage('Por favor, preencha o nome da linha do WhatsApp', true);
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
            whatsappLine: whatsappLineInput.value,
            dialerDelay: dialerDelayInput.value,
            threeCXDomain: threeCXDomainInput.value
        }, () => {
            showStatusMessage('Configurações salvas com sucesso!');
            checkThreeCXStatus(); // Verificar status após salvar
        });
    });
}); 