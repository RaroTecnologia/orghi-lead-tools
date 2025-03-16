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
    const motivoNomeInput = document.getElementById('motivoNome');
    const motivoStatusInput = document.getElementById('motivoStatus');
    const motivoNotaInput = document.getElementById('motivoNota');
    const addMotivoButton = document.getElementById('addMotivo');
    const motivosList = document.getElementById('motivosList');
    const exportConfigButton = document.getElementById('exportConfig');
    const importConfigButton = document.getElementById('importConfig');
    const importFileInput = document.getElementById('importFile');

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
    chrome.storage.sync.get(['whatsappChannels', 'dialerDelay', 'threeCXDomain', 'kommoDomain', 'debugMode', 'motivos'], (result) => {
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

        // Carrega motivos
        const motivos = result.motivos || [];
        renderMotivos(motivos);
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

    // Event listener para adicionar novo motivo
    addMotivoButton.addEventListener('click', () => {
      const nome = motivoNomeInput.value.trim();
      
      // Pega apenas as tentativas que foram preenchidas e serializa os dados
      const tentativasForms = Array.from(document.querySelectorAll('.tentativa-form'));
      const tentativas = tentativasForms
        .filter(form => {
          const status = form.querySelector('.motivo-status')?.value?.trim() || '';
          const nota = form.querySelector('.motivo-nota')?.value?.trim() || '';
          return status.length > 0 && nota.length > 0;
        })
        .map(form => {
          // Serializa os dados explicitamente como strings
          const status = String(form.querySelector('.motivo-status').value || '').trim();
          const nota = String(form.querySelector('.motivo-nota').value || '').trim();
          return { status, nota };
        });

      if (!nome || tentativas.length === 0) {
        showStatusMessage('Por favor, preencha o nome e pelo menos uma tentativa', true);
        return;
      }

      // Verifica se as notas são muito longas e trunca se necessário
      const tentativasOtimizadas = tentativas.map(t => ({
        status: String(t.status).substring(0, 100),
        nota: String(t.nota).substring(0, 500)
      }));

      chrome.storage.sync.get(['motivos'], (result) => {
        // Garante que motivos é um array
        const motivos = Array.isArray(result.motivos) ? result.motivos : [];
        
        // Adiciona o novo motivo com validação
        const novoMotivo = {
          nome: String(nome).substring(0, 50),
          tentativas: tentativasOtimizadas
        };
        
        // Mantém apenas os últimos 20 motivos se exceder
        if (motivos.length >= 20) {
          motivos.shift(); // Remove o motivo mais antigo
        }
        
        motivos.push(novoMotivo);
        
        // Garante que todos os dados são serializáveis
        const motivosSerializados = JSON.parse(JSON.stringify(motivos));
        
        chrome.storage.sync.set({ motivos: motivosSerializados }, () => {
          if (chrome.runtime.lastError) {
            showStatusMessage('Erro ao salvar: ' + chrome.runtime.lastError.message, true);
            return;
          }
          
          renderMotivos(motivosSerializados);
          // Limpa os campos
          motivoNomeInput.value = '';
          document.querySelectorAll('.tentativa-form input, .tentativa-form textarea').forEach(el => el.value = '');
          showStatusMessage('Motivo adicionado com sucesso!');
        });
      });
    });

    function removeMotivo(index) {
        chrome.storage.sync.get(['motivos'], (result) => {
            const motivos = result.motivos || [];
            motivos.splice(index, 1);
            
            chrome.storage.sync.set({ motivos }, () => {
                renderMotivos(motivos);
                showStatusMessage('Motivo removido com sucesso!');
            });
        });
    }

    function renderMotivos(motivos) {
      motivosList.innerHTML = '';
      
      // Garante que motivos é um array e que cada motivo tem tentativas
      const motivosValidados = (motivos || []).map(motivo => ({
        ...motivo,
        tentativas: Array.isArray(motivo.tentativas) ? motivo.tentativas : []
      }));
      
      motivosValidados.forEach((motivo, index) => {
        const motivoEl = document.createElement('div');
        motivoEl.className = 'motivo-item';
        
        // Conteúdo principal do motivo
        const content = document.createElement('div');
        content.className = 'motivo-content';
        
        // Informações do motivo
        const infoHtml = `
          <div>
            <div class="motivo-nome">
              ${motivo.nome || 'Sem nome'}
              ${motivo.tentativas.length === 1 ? 
                '<span class="tentativa-badge">Uma tentativa</span>' : 
                '<span class="tentativa-badge">Duas tentativas</span>'}
            </div>
            <div class="motivo-tentativas">
              ${motivo.tentativas.map((t, i) => `
                <div class="motivo-tentativa">
                  <strong>${i + 1}ª Tentativa${i === 0 && motivo.tentativas.length === 1 ? ' (Única)' : ''}</strong>
                  <div class="motivo-status">Status: ${t.status || 'Não definido'}</div>
                  <div class="motivo-nota">${t.nota || 'Sem nota'}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;

        content.innerHTML = infoHtml + `
          <div class="motivo-actions">
            <button class="icon-button" title="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="icon-button danger" title="Excluir">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </div>
        `;

        // Adiciona estilos para o badge de tentativas
        const style = document.createElement('style');
        style.textContent = `
          .tentativa-badge {
            font-size: 12px;
            padding: 2px 8px;
            border-radius: 12px;
            margin-left: 8px;
            background-color: var(--bg-secondary);
            color: var(--text-secondary);
          }
        `;
        document.head.appendChild(style);

        // Formulário de edição
        const editForm = document.createElement('div');
        editForm.className = 'edit-form';
        editForm.innerHTML = `
          <div class="motivo-form">
            <div class="form-group">
              <label>Nome:</label>
              <input type="text" class="edit-nome" value="${motivo.nome}">
            </div>
            <div id="edit-tentativas-container">
              ${motivo.tentativas.map((t, i) => `
                <div class="tentativa-form">
                  <h4>${i + 1}ª Tentativa</h4>
                  <div class="form-group">
                    <input type="text" class="edit-status" value="${t.status}">
                  </div>
                  <div class="form-group">
                    <textarea class="edit-nota" rows="2">${t.nota}</textarea>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="motivo-actions">
            <button class="primary save-edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Salvar
            </button>
            <button class="secondary cancel-edit">Cancelar</button>
          </div>
        `;

        motivoEl.appendChild(content);
        motivoEl.appendChild(editForm);
        motivosList.appendChild(motivoEl);

        // Event Listeners
        const editButton = content.querySelector('.icon-button');
        const removeButton = content.querySelector('.icon-button.danger');
        const saveButton = editForm.querySelector('.save-edit');
        const cancelButton = editForm.querySelector('.cancel-edit');

        // Editar motivo
        editButton.addEventListener('click', () => {
          document.querySelectorAll('.edit-form.active').forEach(form => {
            if (form !== editForm) {
              form.classList.remove('active');
            }
          });
          editForm.classList.add('active');
          editForm.querySelector('.edit-nome').focus();
        });

        // Cancelar edição
        cancelButton.addEventListener('click', () => {
          editForm.classList.remove('active');
          // Restaura os valores originais
          editForm.querySelector('.edit-nome').value = motivo.nome;
          const statusInputs = editForm.querySelectorAll('.edit-status');
          const notaInputs = editForm.querySelectorAll('.edit-nota');
          motivo.tentativas.forEach((t, i) => {
            if (statusInputs[i]) statusInputs[i].value = t.status;
            if (notaInputs[i]) notaInputs[i].value = t.nota;
          });
        });

        // Salvar edição
        saveButton.addEventListener('click', () => {
          const newNome = editForm.querySelector('.edit-nome').value.trim();
          
          // Pega apenas as tentativas que foram preenchidas
          const tentativasForms = Array.from(editForm.querySelectorAll('.tentativa-form'));
          const newTentativas = tentativasForms
            .filter(form => {
              const status = form.querySelector('.edit-status')?.value.trim();
              const nota = form.querySelector('.edit-nota')?.value.trim();
              return status && nota;
            })
            .map(form => ({
              status: form.querySelector('.edit-status').value.trim(),
              nota: form.querySelector('.edit-nota').value.trim()
            }));

          if (!newNome || newTentativas.length === 0) {
            showStatusMessage('Por favor, preencha o nome e pelo menos uma tentativa', true);
            return;
          }

          saveEdit(index, newNome, newTentativas, editForm);
        });

        // Remover motivo
        removeButton.addEventListener('click', () => {
          if (confirm('Tem certeza que deseja excluir este motivo?')) {
            removeMotivo(index);
          }
        });
      });
    }

    // Atualiza a função de salvar edição também
    function saveEdit(index, newNome, newTentativas, editForm) {
      // Otimiza os dados antes de salvar com validação e serialização
      const tentativasOtimizadas = (Array.isArray(newTentativas) ? newTentativas : []).map(t => ({
        status: String(t.status || '').substring(0, 100),
        nota: String(t.nota || '').substring(0, 500)
      }));

      chrome.storage.sync.get(['motivos'], (result) => {
        // Garante que motivos é um array
        const motivosAtualizados = Array.isArray(result.motivos) ? result.motivos : [];
        
        // Atualiza o motivo com validação
        motivosAtualizados[index] = {
          nome: String(newNome || '').substring(0, 50),
          tentativas: tentativasOtimizadas
        };

        // Garante que todos os dados são serializáveis
        const motivosSerializados = JSON.parse(JSON.stringify(motivosAtualizados));

        chrome.storage.sync.set({ motivos: motivosSerializados }, () => {
          if (chrome.runtime.lastError) {
            showStatusMessage('Erro ao salvar: ' + chrome.runtime.lastError.message, true);
            return;
          }
          
          renderMotivos(motivosSerializados);
          editForm.classList.remove('active');
          showStatusMessage('Motivo atualizado com sucesso!');
        });
      });
    }

    // Adiciona estilos específicos para as tentativas
    const style = document.createElement('style');
    style.textContent = `
      .motivo-tentativas {
        margin-top: 12px;
      }
      
      .motivo-tentativa {
        background: var(--bg-secondary);
        padding: 12px;
        border-radius: var(--radius-sm);
        margin-bottom: 8px;
      }

      .motivo-tentativa:last-child {
        margin-bottom: 0;
      }

      .motivo-tentativa strong {
        color: var(--text-primary);
        font-size: 0.9em;
        display: block;
        margin-bottom: 4px;
      }

      .motivo-tentativa .motivo-status {
        color: var(--primary-color);
        font-size: 0.9em;
        margin-bottom: 4px;
      }

      .motivo-tentativa .motivo-nota {
        color: var(--text-secondary);
        font-size: 0.9em;
        white-space: pre-wrap;
      }
    `;
    document.head.appendChild(style);

    // Adiciona a função removeMotivo ao escopo global para o onclick funcionar
    window.removeMotivo = removeMotivo;

    // Função para exportar configurações
    function exportConfigurations() {
        chrome.storage.sync.get(null, (result) => {
            // Converte as configurações para JSON
            const configJson = JSON.stringify(result, null, 2);
            
            // Cria um blob com o JSON
            const blob = new Blob([configJson], { type: 'application/json' });
            
            // Cria uma URL para o blob
            const url = URL.createObjectURL(blob);
            
            // Cria um elemento de link para download
            const a = document.createElement('a');
            a.href = url;
            a.download = `orghi-config-${new Date().toISOString().split('T')[0]}.json`;
            
            // Adiciona o link ao documento, clica nele e remove
            document.body.appendChild(a);
            a.click();
            
            // Limpa após o download
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            showStatusMessage('Configurações exportadas com sucesso!');
        });
    }
    
    // Função para importar configurações
    function importConfigurations(file) {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                // Tenta fazer o parse do JSON
                const config = JSON.parse(event.target.result);
                
                // Verifica se o arquivo contém configurações válidas
                if (!config || typeof config !== 'object') {
                    throw new Error('Arquivo de configuração inválido');
                }
                
                // Salva as configurações no storage
                chrome.storage.sync.set(config, () => {
                    if (chrome.runtime.lastError) {
                        showStatusMessage('Erro ao importar: ' + chrome.runtime.lastError.message, true);
                        return;
                    }
                    
                    // Recarrega a página para mostrar as novas configurações
                    showStatusMessage('Configurações importadas com sucesso! Recarregando...');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                });
            } catch (error) {
                showStatusMessage('Erro ao processar o arquivo: ' + error.message, true);
            }
        };
        
        reader.onerror = () => {
            showStatusMessage('Erro ao ler o arquivo', true);
        };
        
        reader.readAsText(file);
    }
    
    // Event listeners para exportar e importar
    exportConfigButton.addEventListener('click', exportConfigurations);
    
    importConfigButton.addEventListener('click', () => {
        importFileInput.click();
    });
    
    importFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            importConfigurations(file);
        }
    });
}); 