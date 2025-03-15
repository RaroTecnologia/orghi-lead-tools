document.addEventListener('DOMContentLoaded', function() {
    console.log('Popup carregado');
    
    const whatsappLineInput = document.getElementById('whatsapp-line');
    const saveWhatsappButton = document.getElementById('save-whatsapp');
    const statusMessage = document.getElementById('status-message');
    const leadStatusSelect = document.getElementById('lead-status');
    const leadCountInput = document.getElementById('lead-count');

    // Carrega a configuração salva do WhatsApp
    chrome.storage.sync.get(['whatsappLine', 'leadCount'], function(result) {
        console.log('Configuração atual:', result);
        if (result.whatsappLine) {
            whatsappLineInput.value = result.whatsappLine;
        }
        if (result.leadCount) {
            leadCountInput.value = result.leadCount;
        }
    });

    // Carrega os status do funil
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs[0]) {
            console.log('Nenhuma aba ativa encontrada');
            leadStatusSelect.innerHTML = '<option value="">Abra o Kommo primeiro</option>';
            return;
        }

        console.log('Enviando mensagem para tab:', tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatusList' }, function(response) {
            console.log('Resposta recebida:', response);
            
            if (response && response.statusList && response.statusList.length > 0) {
                // Limpa o select
                leadStatusSelect.innerHTML = '<option value="">Selecione um status</option>';
                
                // Adiciona os status como opções
                response.statusList.forEach(status => {
                    const option = document.createElement('option');
                    option.value = status.id;
                    option.textContent = status.name;
                    leadStatusSelect.appendChild(option);
                });

                // Carrega o status selecionado anteriormente
                chrome.storage.sync.get(['selectedStatus'], function(result) {
                    if (result.selectedStatus) {
                        leadStatusSelect.value = result.selectedStatus;
                    }
                });
            } else {
                leadStatusSelect.innerHTML = '<option value="">Nenhum status encontrado</option>';
            }
        });
    });

    // Salva o status selecionado
    leadStatusSelect.addEventListener('change', function() {
        const selectedStatus = {
            id: this.value,
            name: this.options[this.selectedIndex].text
        };
        
        chrome.storage.sync.set({ selectedStatus: selectedStatus.id });
    });

    // Salva a quantidade de leads quando alterada
    leadCountInput.addEventListener('change', function() {
        const count = parseInt(this.value) || 5;
        chrome.storage.sync.set({ leadCount: count });
    });

    // Salva as configurações do WhatsApp
    saveWhatsappButton.addEventListener('click', function() {
        const lineName = whatsappLineInput.value.trim();
        console.log('Tentando salvar linha:', lineName);
        
        if (!lineName) {
            showStatus('Por favor, insira o nome da linha oficial.', 'error');
            return;
        }

        chrome.storage.sync.set({
            whatsappLine: lineName
        }, function() {
            console.log('Configuração salva no storage');
            
            chrome.tabs.query({
                url: "*://*.kommo.com/*"
            }, function(tabs) {
                console.log('Tabs encontradas:', tabs);
                if (tabs.length > 0) {
                    tabs.forEach(tab => {
                        console.log('Enviando mensagem para tab:', tab.id);
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'updateWhatsappLine',
                            line: lineName
                        }, function(response) {
                            console.log('Resposta da tab:', response);
                        });
                    });
                    showStatus('Configuração salva e aplicada com sucesso!', 'success');
                } else {
                    showStatus('Configuração salva! Abra o Kommo para aplicar.', 'success');
                }
            });
        });
    });

    // Inicia o discador
    document.getElementById('start-dialer').addEventListener('click', function() {
        const selectedStatus = leadStatusSelect.value;
        const leadCount = parseInt(leadCountInput.value) || 5;

        if (!selectedStatus) {
            showStatus('Por favor, selecione um status.', 'error');
            return;
        }

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'startDialer',
                statusId: selectedStatus,
                leadCount: leadCount
            });
            window.close();
        });
    });

    function showStatus(message, type) {
        console.log('Mostrando status:', message, type);
        statusMessage.textContent = message;
        statusMessage.className = 'status-message ' + type;
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }
}); 