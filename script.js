// Sistema de Entrevistas - Script Principal
console.log('Script principal carregado!');

// Variáveis Globais
var entrevistas = [];
var cargosAtivos = [];
try {
    entrevistas = JSON.parse(localStorage.getItem('entrevistas')) || [];
} catch (e) {
    entrevistas = [];
}

// Vincular funções ao escopo global explicitamente para evitar ReferenceErrors
window.sincronizarComPlanilha = async function () {
    console.log('--- Iniciando Sincronização ---');
    if (!GOOGLE_SCRIPT_URL) {
        alert('⚠️ Erro: URL do Google Script não configurada.');
        return;
    }

    // Limpa a URL de espaços em branco acidentais
    const urlLimpa = GOOGLE_SCRIPT_URL.trim();
    mostrarMensagem('🔄 Conectando à Planilha...', 'info');

    try {
        const urlFinal = `${urlLimpa}?action=read&t=${Date.now()}`;
        console.log('Chamando URL:', urlFinal);

        const response = await fetch(urlFinal);

        console.log('Status da Resposta:', response.status);

        if (!response.ok) {
            throw new Error(`Erro Servidor: ${response.status} ${response.statusText}`);
        }

        const dadosPlanilha = await response.json();
        console.log('Dados processados:', dadosPlanilha);

        if (Array.isArray(dadosPlanilha)) {
            if (dadosPlanilha.length === 0) {
                mostrarMensagem('ℹ️ Sincronizado, mas a planilha parece estar vazia.', 'info');
                return;
            }

            let novosRegistros = 0;
            let atualizados = 0;
            let precisaSubir = [];

            dadosPlanilha.forEach(item => {
                if (item && item.candidatoNome) {
                    const indexExistente = entrevistas.findIndex(e => e.id === item.id);
                    if (indexExistente !== -1) {
                        // COMPARAÇÃO INTELIGENTE: Quem tem mais informações?
                        const pesoLocal = (entrevistas[indexExistente].respostas ? entrevistas[indexExistente].respostas.length : 0);
                        const pesoPlanilha = (item.respostas ? item.respostas.length : 0);

                        if (pesoPlanilha >= pesoLocal) {
                            // Planilha está mais completa ou igual: atualiza local
                            entrevistas[indexExistente] = { ...entrevistas[indexExistente], ...item };
                            atualizados++;
                        } else {
                            // Local está mais completo: prepara para subir para a planilha
                            precisaSubir.push(entrevistas[indexExistente]);
                        }
                    } else {
                        // Não existe localmente: Adiciona novo vindo da nuvem
                        entrevistas.push(item);
                        novosRegistros++;
                    }
                }
            });

            // Verificar se há itens locais que NÃO estão na planilha (ex: importados recentemente)
            const idsPlanilha = new Set(dadosPlanilha.map(d => d.id));
            entrevistas.forEach(e => {
                if (!idsPlanilha.has(e.id)) {
                    precisaSubir.push(e);
                }
            });

            if (novosRegistros > 0 || atualizados > 0 || precisaSubir.length > 0) {
                localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
                removerDuplicatas();
                carregarDados();

                let msg = `✅ Sincronizado!`;
                if (novosRegistros > 0) msg += ` ${novosRegistros} novos baixados.`;
                if (atualizados > 0) msg += ` ${atualizados} atualizados.`;

                if (precisaSubir.length > 0) {
                    mostrarMensagem(`${msg}<br>🔄 Enviando ${precisaSubir.length} atualizações locais para a nuvem...`, 'info');
                    // Enviar lotes para não travar
                    precisaSubir.forEach((item, idx) => {
                        setTimeout(() => enviarParaGoogleSheets(item), idx * 800);
                    });
                } else {
                    mostrarMensagem(msg, 'success');
                }
            } else {
                mostrarMensagem('ℹ️ Seu sistema e a planilha já estão em perfeita harmonia.', 'info');
            }
        } else {
            console.warn('Formato inesperado:', dadosPlanilha);
            mostrarMensagem('❌ A planilha enviou dados em formato inválido. Verifique o Script do Google.', 'error');
        }
    } catch (erro) {
        console.error('ERRO NA SINCRONIZAÇÃO:', erro);

        let msgAux = 'Verifique se clicou em "Implantar > Nova Implantação" no Google.';
        if (erro.name === 'AbortError') msgAux = 'A conexão demorou muito e foi cancelada.';
        if (erro.message.includes('CORS') || erro.message.includes('fetch')) {
            msgAux = 'Bloqueio de segurança ou erro de rede. Certifique-se de que a URL termina em <b>/exec</b> e o acesso é para <b>"Qualquer pessoa"</b>.';
        }

        mostrarMensagem(`❌ Falha na Sincronização.<br><small>${msgAux}</small>`, 'error');
    }
};

window.limparDadosTeste = function () {
    mostrarConfirmacao('Deseja realmente apagar todas as entrevistas com o nome "teste"? Esta ação não pode ser desfeita localmente.', () => {
        const totalAntes = entrevistas.length;
        entrevistas = entrevistas.filter(e => e.candidatoNome.toLowerCase().trim() !== 'teste');
        const removidos = totalAntes - entrevistas.length;

        if (removidos > 0) {
            localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
            carregarDados();
            mostrarMensagem(`🧹 Limpeza concluída! ${removidos} registros de teste foram removidos.`, 'success');
        } else {
            mostrarMensagem('ℹ️ Nenhum registro com o nome "teste" foi encontrado.', 'info');
        }
    });
};

// Função para remover duplicatas (Nome + Cargo + Data)
window.removerDuplicatas = function () {
    const totalAntes = entrevistas.length;
    const vistos = new Map();

    // Ordenar para que os itens com mais dados (respostas) venham primeiro
    const entrevistasOrdenadas = [...entrevistas].sort((a, b) => {
        const pesoA = (a.respostas ? a.respostas.length : 0) + (a.status === 'contratado' ? 100 : 0);
        const pesoB = (b.respostas ? b.respostas.length : 0) + (b.status === 'contratado' ? 100 : 0);
        return pesoB - pesoA;
    });

    const filtrados = entrevistasOrdenadas.filter(e => {
        if (!e || !e.candidatoNome) return false;

        // Chave de unicidade (Nome + Cargo + Data) para limpar até se IDs forem diferentes por erro
        const chave = `${e.candidatoNome.trim().toLowerCase()}|${e.cargo}|${e.dataEntrevista}`;

        if (vistos.has(chave)) return false;
        vistos.set(chave, true);
        return true;
    });

    entrevistas = filtrados;
    localStorage.setItem('entrevistas', JSON.stringify(entrevistas));

    const removidos = totalAntes - entrevistas.length;
    if (removidos > 0) console.log(`🧹 Limpeza: ${removidos} duplicatas removidas.`);
    return removidos;
};


let cargoSelecionado = null;
let entrevistaAtual = null;
let ultimoItemExcluido = null;
let cronometroInterval = null;
let tempoInicioCronometro = 0;
let agendaVisualizacao = 'triagem'; // 'triagem' ou 'gerencia'
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxlcg9AruQ8UqR8cUh65wJT_xjZYVNdE0vCVXtSyyAVt9LJ0EE3A8rQUpNfDwZD8Z3fDQ/exec'; // ⚠️ COLE A URL DO SEU SCRIPT DO GOOGLE AQUI (PASSO 9)

// Inicialização do sistema
document.addEventListener('DOMContentLoaded', function () {
    verificarAcesso(); // Inicia a proteção de login
    verificarCompatibilidadeDados(); // Garante que dados antigos funcionem
    inicializarSistema();
    carregarDados();
    configurarEventos();
    verificarRascunho();
    removerDuplicatas(); // Limpar ao abrir o sistema
    inicializarTema();

    // Sincronização Automática ao Iniciar (após 2 segundos para não travar o carregamento inicial)
    setTimeout(() => {
        if (typeof sincronizarComPlanilha === 'function') {
            console.log('🔄 Sincronização automática iniciada...');
            sincronizarComPlanilha();
        }
    }, 2000);
});

function inicializarSistema() {
    // Inicializar Cargos (LocalStorage ou Padrão do arquivo cargos.js)
    const cargosSalvos = localStorage.getItem('cargosPersonalizados');
    if (cargosSalvos) {
        cargosAtivos = JSON.parse(cargosSalvos);
    } else {
        // Se não tiver salvo, usa o padrão (deep copy para evitar referência)
        cargosAtivos = typeof cargos !== 'undefined' ? JSON.parse(JSON.stringify(cargos)) : [];
    }

    // Configurar data atual
    const data = new Date();
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    document.getElementById('dataEntrevista').value = `${ano}-${mes}-${dia}`;

    // Carregar cargos no select
    carregarCargosSelect();
    carregarCargosFiltro();

    // Configurar sistema de abas
    configurarAbas();

    // Configurar Data Inicial do Painel do Dia
    const painelFiltro = document.getElementById('dataFiltroPainel');
    if (painelFiltro) {
        painelFiltro.value = `${ano}-${mes}-${dia}`;
    }

    // --- INJEÇÃO DE CAMPOS NOVOS (Link e Botões de Relatório) ---
    // 1. Campo de Link da Reunião no formulário principal
    const localSelect = document.getElementById('localEntrevista');
    if (localSelect && !document.getElementById('linkReuniao')) {
        const container = document.createElement('div');
        container.className = 'form-group';
        container.innerHTML = `
            <label style="display:block; margin-bottom:5px; margin-top:10px; font-weight:bold; color:#555;">Link da Reunião (Google Meet)</label>
            <input type="text" id="linkReuniao" placeholder="Cole o link aqui..." style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
        `;
        localSelect.parentElement.insertAdjacentElement('afterend', container);
    }

    // 2. Botões de Relatórios Gerais na aba Relatório
    const tabRelatorio = document.getElementById('tab-relatorio');
    if (tabRelatorio && !document.getElementById('botoesRelatoriosGerais')) {
        const div = document.createElement('div');
        div.id = 'botoesRelatoriosGerais';
        div.innerHTML = `
            <div style="background:white; padding:15px; border-radius:8px; margin-bottom:20px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                <h3 style="margin-top:0; color:#6a0dad; border-bottom:1px solid #eee; padding-bottom:10px;">📊 Relatórios Gerais</h3>
                
                <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                    <label for="periodoRelatorio" style="font-weight:bold; color:#555;">Período:</label>
                    <select id="periodoRelatorio" style="padding: 8px; border-radius: 5px; border: 1px solid #ccc; background: white;">
                        <option value="todos">Todo o Período</option>
                        <option value="7dias">Últimos 7 dias</option>
                        <option value="30dias">Últimos 30 dias</option>
                    </select>
                </div>

                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                    <button class="btn" onclick="gerarRelatorioListaPDF('agendadas')" style="background:#e8f0fe; color:#1967d2; border:1px solid #aecbfa;">📅 Agendadas (Triagem)</button>
                    <button class="btn" onclick="gerarRelatorioListaPDF('agendadas_gerencia')" style="background:#fff7ed; color:#c2410c; border:1px solid #fdba74;">👔 Agendadas (Gerência)</button>
                    <button class="btn" onclick="gerarRelatorioListaPDF('realizadas')" style="background:#d4edda; color:#155724; border:1px solid #c3e6cb;">✅ Histórico / Realizadas</button>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; border-top: 1px dashed #eee; padding-top: 10px;">
                    <button class="btn" onclick="gerarRelatorioStatusFeedback('geral')" style="background:#f3e8ff; color:#6a0dad; border:1px solid #d8b4fe;">📢 Relatório Geral de Feedback</button>
                    <button class="btn" onclick="gerarRelatorioStatusFeedback('pendentes')" style="background:#fff7ed; color:#c2410c; border:1px solid #fdba74;">⚠️ Pendentes de Feedback</button>
                </div>
            </div>
        `;
        tabRelatorio.insertBefore(div, tabRelatorio.firstChild);
    }
}

function carregarDados() {
    // Carregar estatísticas
    atualizarEstatisticas();

    // Carregar histórico
    carregarHistoricoEntrevistas();

    // Carregar Painel do Dia
    carregarPainelDia();

    // Atualizar select de relatório
    atualizarSelectRelatorio();
}

function configurarEventos() {
    // Evento de seleção de cargo
    document.getElementById('cargo').addEventListener('change', function () {
        const cargoId = this.value;
        if (cargoId) {
            selecionarCargo(cargoId);
        } else {
            document.getElementById('cargoInfo').classList.add('hidden');
            document.getElementById('perguntasContainer').innerHTML =
                '<div class="no-data">Selecione um cargo para visualizar as perguntas da entrevista</div>';
        }
    });

    // Evento do formulário
    document.getElementById('formEntrevista').addEventListener('submit', function (e) {
        e.preventDefault();
        if (cargoSelecionado) {
            iniciarEntrevista();
        } else {
            alert('Por favor, selecione um cargo primeiro.');
        }
    });

    // Auto-save: Monitorar mudanças no formulário
    // Otimização: Debounce para evitar travamentos em sessões longas (espera 1s após parar de digitar)
    const salvarRascunhoDebounced = debounce(salvarRascunhoAutomatico, 1000);
    document.getElementById('formEntrevista').addEventListener('input', salvarRascunhoDebounced);
    document.getElementById('perguntasContainer').addEventListener('input', salvarRascunhoDebounced);
    document.getElementById('avaliacaoContainer').addEventListener('click', salvarRascunhoAutomatico); // Para cliques nos botões

    // Busca no histórico
    document.getElementById('buscarEntrevista').addEventListener('input', function () {
        carregarHistoricoEntrevistas(this.value);
    });

    // Filtros avançados
    ['filtroStatus', 'filtroCargoHistorico', 'filtroDataInicio', 'filtroDataFim'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => carregarHistoricoEntrevistas(document.getElementById('buscarEntrevista').value));
    });

    // Eventos do Painel do Dia
    const filtroPainel = document.getElementById('dataFiltroPainel');
    if (filtroPainel) {
        filtroPainel.addEventListener('change', function () {
            carregarPainelDia(this.value);
        });
    }

    // Toggle Dark Mode
    const btnToggleTheme = document.getElementById('toggleDarkMode');
    if (btnToggleTheme) {
        btnToggleTheme.addEventListener('click', alternarTema);
    }

    // Seleção de entrevista para relatório
    document.getElementById('selecionarEntrevistaRelatorio').addEventListener('change', function () {
        const index = this.value;
        if (index !== '') {
            carregarPreviewRelatorio(parseInt(index));
        } else {
            document.getElementById('relatorioPreview').classList.add('hidden');
            document.getElementById('acoesRelatorio').querySelectorAll('button').forEach(btn => {
                btn.disabled = true;
            });
        }
    });

    // Drag and Drop para perguntas no editor
    const containerPerguntas = document.getElementById('containerPerguntasEditor');
    if (containerPerguntas) {
        containerPerguntas.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = getDragAfterElement(containerPerguntas, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                if (afterElement == null) {
                    containerPerguntas.appendChild(draggable);
                } else {
                    containerPerguntas.insertBefore(draggable, afterElement);
                }
            }
        });
    }
}

function configurarAbas() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            // Remover active de todas as abas
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Adicionar active na aba clicada
            this.classList.add('active');
            document.getElementById(`tab-${this.dataset.tab}`).classList.add('active');

            // Ações específicas por aba
            switch (this.dataset.tab) {
                case 'historico':
                    carregarHistoricoEntrevistas();
                    break;
                case 'agenda':
                    carregarAgenda();
                    break;
                case 'relatorio':
                    atualizarSelectRelatorio();
                    break;
                case 'estatisticas':
                    atualizarEstatisticas();
                    break;
                case 'configuracoes':
                    renderizarListaCargos();
                    break;
                case 'painel-dia':
                    carregarPainelDia();
                    break;
            }
        });
    });
}

function carregarCargosSelect() {
    const select = document.getElementById('cargo');
    select.innerHTML = '<option value="">Escolha um cargo...</option>';

    cargosAtivos.forEach(cargo => {
        const option = document.createElement('option');
        option.value = cargo.id;
        option.textContent = `${cargo.nome} (${cargo.categoria})`;
        select.appendChild(option);
    });
}

function carregarCargosFiltro() {
    const select = document.getElementById('filtroCargoHistorico');
    select.innerHTML = '<option value="">Todos os Cargos</option>';

    cargosAtivos.forEach(cargo => {
        const option = document.createElement('option');
        option.value = cargo.nome; // Usando nome para facilitar filtro
        option.textContent = cargo.nome;
        select.appendChild(option);
    });
}

function selecionarCargo(cargoId) {
    cargoSelecionado = cargosAtivos.find(c => c.id === cargoId);

    if (cargoSelecionado) {
        // Atualizar info do cargo
        document.getElementById('cargoNomeSelecionado').textContent = cargoSelecionado.nome;
        document.getElementById('totalPerguntas').textContent = cargoSelecionado.perguntas.length;

        // Atualizar script (salário, benefícios, duração)
        document.getElementById('cargoDuracao').textContent = cargoSelecionado.duracao;
        document.getElementById('cargoSalario').textContent = cargoSelecionado.salario;
        document.getElementById('cargoBeneficios').textContent = cargoSelecionado.beneficios.join(', ');
        document.getElementById('cargoHorario').textContent = cargoSelecionado.horario;

        document.getElementById('cargoInfo').classList.remove('hidden');

        // Carregar perguntas
        carregarPerguntasCargo();

        // Carregar sistema de avaliação
        carregarSistemaAvaliacao();
    }
}

function carregarPerguntasCargo() {
    const container = document.getElementById('perguntasContainer');

    if (!cargoSelecionado || cargoSelecionado.perguntas.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhuma pergunta cadastrada para este cargo.</div>';
        return;
    }

    let html = '';
    cargoSelecionado.perguntas.forEach((pergunta, index) => {
        html += `
            <div class="pergunta-item">
                <div class="pergunta-header">
                    <span class="pergunta-categoria">${pergunta.categoria}</span>
                    <div class="pergunta-texto">${index + 1}. ${pergunta.texto}</div>
                </div>
                <div class="resposta-input">
                    <textarea 
                        class="resposta-pergunta" 
                        data-index="${index}"
                        placeholder="Digite a resposta do candidato aqui..."
                        rows="3"></textarea>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function carregarSistemaAvaliacao() {
    const container = document.getElementById('avaliacaoContainer');
    const competencias = cargoSelecionado.competencias || competenciasPadrao;

    let html = '';
    competencias.forEach((competencia, index) => {
        html += `
            <div class="avaliacao-item" data-competencia="${competencia.nome}">
                <div class="avaliacao-header">
                    <div class="avaliacao-titulo">${competencia.nome}</div>
                    <div class="notas-container">
                        ${[1, 2, 3, 4, 5].map(nota => `
                            <button type="button" class="nota-btn" data-nota="${nota}" onclick="selecionarNota(this, '${competencia.nome}')">
                                ${nota}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="competencia-desc">${competencia.descricao || 'Avalie esta competência'}</div>
                <div class="motivo-container hidden"></div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function selecionarNota(botao, competencia) {
    // Remover active de todos os botões da mesma competência
    const item = botao.closest('.avaliacao-item');
    item.querySelectorAll('.nota-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Adicionar active no botão clicado
    botao.classList.add('active');

    // Feedback visual para notas baixas (<= 2)
    const nota = parseInt(botao.dataset.nota);
    const motivoContainer = item.querySelector('.motivo-container');

    if (nota <= 2) {
        motivoContainer.innerHTML = `
            <input type="text" class="motivo-input motivo-nota-baixa" 
                placeholder="Motivo da nota baixa em ${competencia}..." 
                aria-label="Motivo da nota baixa">
        `;
        motivoContainer.classList.remove('hidden');
    } else {
        motivoContainer.classList.add('hidden');
        motivoContainer.innerHTML = '';
    }
}

window.iniciarEntrevista = function () {
    // Coletar dados básicos
    const dadosBasicos = {
        candidatoNome: document.getElementById('candidatoNome').value,
        cargo: document.getElementById('cargo').value,
        cargoNome: cargoSelecionado.nome,
        dataEntrevista: document.getElementById('dataEntrevista').value,
        horaEntrevista: document.getElementById('horaEntrevista').value,
        vagaInhire: document.getElementById('vagaInhire').value,
        entrevistador: document.getElementById('entrevistador').value,
        localEntrevista: document.getElementById('localEntrevista').value,
        linkReuniao: document.getElementById('linkReuniao') ? document.getElementById('linkReuniao').value : '',
        dataRegistro: new Date().toISOString()
    };

    // Validar dados
    if (!dadosBasicos.candidatoNome || !dadosBasicos.entrevistador) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    // --- PROTEÇÃO DE ID: Verificar se este candidato já tem um agendamento pendente ---
    const agendamentoExistente = entrevistas.find(e =>
        e.candidatoNome.trim().toLowerCase() === dadosBasicos.candidatoNome.trim().toLowerCase() &&
        e.cargo === dadosBasicos.cargo &&
        (e.status === 'agendado' || e.status === 'agendado_gerencia' || e.status === 'aprovado_triagem')
    );

    // Se já existe um agendamento, HERDA o ID dele para evitar duplicar na planilha
    const idUnico = (entrevistaAtual && entrevistaAtual.id) ? entrevistaAtual.id :
        (agendamentoExistente ? agendamentoExistente.id : `entrevista_${Date.now()}`);

    // Criar/Atualizar objeto da entrevista
    entrevistaAtual = {
        ...(agendamentoExistente || {}), // Herda dados existentes se houver
        ...dadosBasicos,
        id: idUnico,
        respostas: (agendamentoExistente && agendamentoExistente.respostas && agendamentoExistente.respostas.length > 0) ? agendamentoExistente.respostas : [],
        avaliacoes: (agendamentoExistente && agendamentoExistente.avaliacoes) ? agendamentoExistente.avaliacoes : {},
        pontosFortes: (agendamentoExistente && agendamentoExistente.pontosFortes) ? agendamentoExistente.pontosFortes : '',
        pontosMelhorar: (agendamentoExistente && agendamentoExistente.pontosMelhorar) ? agendamentoExistente.pontosMelhorar : '',
        observacoes: (agendamentoExistente && agendamentoExistente.observacoes) ? agendamentoExistente.observacoes : '',
        status: (agendamentoExistente && agendamentoExistente.status === 'agendado_gerencia') ? 'agendado_gerencia' : 'analise'
    };

    // Alertar que entrevista começou
    alert(`Entrevista iniciada para ${dadosBasicos.candidatoNome} - ${cargoSelecionado.nome}`);

    // Iniciar Cronômetro
    iniciarCronometro();

    // --- UX: Melhoria de fluxo ---
    // 1. Ocultar formulário para focar na entrevista
    const form = document.getElementById('formEntrevista');
    form.classList.add('hidden');

    // 2. Adicionar botão para reexibir dados se necessário
    const cardHeader = form.parentElement.querySelector('h2');
    let btnToggle = document.getElementById('btnToggleForm');

    if (!btnToggle) {
        btnToggle = document.createElement('button');
        btnToggle.id = 'btnToggleForm';
        btnToggle.type = 'button';
        btnToggle.className = 'btn btn-small btn-secondary';
        btnToggle.style.fontSize = '14px';
        btnToggle.onclick = function () {
            form.classList.toggle('hidden');
            this.textContent = form.classList.contains('hidden') ? '👁️ Ver Dados' : '🙈 Ocultar Dados';
        };
        // Ajustar layout do header
        cardHeader.style.display = 'flex';
        cardHeader.style.justifyContent = 'space-between';
        cardHeader.style.alignItems = 'center';
        cardHeader.appendChild(btnToggle);
    }
    btnToggle.textContent = '👁️ Ver Dados';

    // 3. Rolar suavemente para a área de perguntas
    const perguntasCard = document.getElementById('perguntasContainer').closest('.card');
    if (perguntasCard) {
        perguntasCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function salvarEntrevista() {
    if (!entrevistaAtual) {
        alert('Por favor, inicie uma entrevista primeiro.');
        return;
    }

    // Parar Cronômetro
    pararCronometro();

    // Feedback visual imediato para evitar sensação de travamento
    const btnSalvar = document.querySelector('button[onclick="salvarEntrevista()"]');
    const textoOriginal = btnSalvar ? btnSalvar.innerHTML : '💾 Salvar Entrevista Completa';

    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '⏳ Processando...';
    }

    // Timeout para permitir que a tela atualize antes do processamento pesado
    setTimeout(() => {
        try {
            executarSalvamento(btnSalvar, textoOriginal);
        } catch (erro) {
            console.error(erro);
            alert('Ocorreu um erro ao salvar. Tente novamente.');
            if (btnSalvar) {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = textoOriginal;
            }
        }
    }, 100);
}

function executarSalvamento(btnSalvar, textoOriginal) {
    // Proteção contra erro de cargo não selecionado (comum em edições antigas)
    if (!cargoSelecionado) {
        const cargoId = document.getElementById('cargo').value;
        cargoSelecionado = cargosAtivos.find(c => c.id === cargoId);
        if (!cargoSelecionado) {
            throw new Error("Cargo inválido ou não selecionado. Selecione o cargo novamente.");
        }
    }

    // Coletar respostas das perguntas
    const respostas = [];
    document.querySelectorAll('.resposta-pergunta').forEach(textarea => {
        const index = parseInt(textarea.dataset.index);
        const pergunta = cargoSelecionado.perguntas[index];
        respostas.push({
            pergunta: pergunta.texto,
            categoria: pergunta.categoria,
            resposta: textarea.value.trim()
        });
    });

    // Coletar avaliações
    const avaliacoes = {};
    document.querySelectorAll('.avaliacao-item').forEach(item => {
        const competencia = item.dataset.competencia;
        const notaBtn = item.querySelector('.nota-btn.active');
        const nota = notaBtn ? parseInt(notaBtn.dataset.nota) : 0;

        // Capturar motivo se houver
        const motivoInput = item.querySelector('.motivo-input');
        const motivo = motivoInput ? motivoInput.value : '';

        avaliacoes[competencia] = motivo ? { nota, motivo } : nota;
    });

    // Calcular média
    const notas = Object.values(avaliacoes).filter(n => n > 0);
    const media = notas.length > 0 ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1) : 0;

    // Atualizar objeto da entrevista
    entrevistaAtual.respostas = respostas;
    entrevistaAtual.avaliacoes = avaliacoes;
    entrevistaAtual.mediaAvaliacao = parseFloat(media);
    entrevistaAtual.pontosFortes = document.getElementById('pontosFortes').value;
    entrevistaAtual.pontosMelhorar = document.getElementById('pontosMelhorar').value;
    entrevistaAtual.observacoes = document.getElementById('observacoes').value;
    entrevistaAtual.duracaoReal = document.getElementById('cronometro').textContent; // Salvar duração

    // Coletar status
    const statusRadio = document.querySelector('input[name="status"]:checked');
    let statusFinal = statusRadio ? statusRadio.value : 'analise';
    // Se aprovado na triagem, muda para status específico de fluxo
    if (statusFinal === 'aprovado') statusFinal = 'aprovado_triagem';

    entrevistaAtual.status = statusFinal;

    // Salvar no banco de dados
    // VERIFICAÇÃO DE DUPLICIDADE: Se já existe ID, atualiza. Se não, cria novo.
    const indexExistente = entrevistas.findIndex(e => e.id === entrevistaAtual.id);
    if (indexExistente !== -1) {
        entrevistas[indexExistente] = entrevistaAtual;
    } else {
        entrevistas.push(entrevistaAtual);
    }

    localStorage.setItem('entrevistas', JSON.stringify(entrevistas));

    // Enviar backup para o Google Sheets
    enviarParaGoogleSheets(entrevistaAtual);

    localStorage.removeItem('rascunhoEntrevista'); // Limpar rascunho
    // Limpar formulário
    limparFormulario();

    // Mostrar confirmação
    mostrarMensagem('✅ Entrevista salva com sucesso!', 'success');

    // Atualizar histórico
    carregarHistoricoEntrevistas();

    // Ir para aba de histórico
    document.querySelector('[data-tab="historico"]').click();

    // Restaurar botão (caso o usuário volte para a aba)
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = textoOriginal;
    }
}

function limparFormulario() {
    document.getElementById('formEntrevista').reset();

    pararCronometro(); // Resetar cronômetro
    document.getElementById('cronometro').classList.add('hidden');

    // Restaurar visibilidade do formulário
    document.getElementById('formEntrevista').classList.remove('hidden');
    const btnToggle = document.getElementById('btnToggleForm');
    if (btnToggle) btnToggle.remove();

    document.getElementById('cargoInfo').classList.add('hidden');
    document.getElementById('perguntasContainer').innerHTML =
        '<div class="no-data">Selecione um cargo para visualizar as perguntas da entrevista</div>';
    document.getElementById('avaliacaoContainer').innerHTML = '';
    document.getElementById('pontosFortes').value = '';
    document.getElementById('pontosMelhorar').value = '';
    document.getElementById('observacoes').value = '';

    // Resetar data para hoje
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('dataEntrevista').value = hoje;
    document.getElementById('horaEntrevista').value = '';
    document.getElementById('vagaInhire').value = '';
    if (document.getElementById('linkReuniao')) document.getElementById('linkReuniao').value = '';

    cargoSelecionado = null;
    entrevistaAtual = null;
}

function alterarCargo() {
    document.getElementById('cargo').value = '';
    document.getElementById('cargoInfo').classList.add('hidden');
    document.getElementById('perguntasContainer').innerHTML =
        '<div class="no-data">Selecione um cargo para visualizar as perguntas da entrevista</div>';
    document.getElementById('avaliacaoContainer').innerHTML = '';
    cargoSelecionado = null;
}

// --- Agenda e Google Calendar ---
window.agendarGoogleCalendar = function () {
    const nome = document.getElementById('candidatoNome').value;
    const cargoId = document.getElementById('cargo').value;
    const data = document.getElementById('dataEntrevista').value;
    const hora = document.getElementById('horaEntrevista').value;
    const vagaInhire = document.getElementById('vagaInhire').value;
    const entrevistador = document.getElementById('entrevistador').value;
    const local = document.getElementById('localEntrevista').value;

    if (!nome || !cargoId || !data || !hora) {
        alert('Preencha Nome, Cargo, Data e Hora para agendar.');
        return;
    }

    const cargo = cargosAtivos.find(c => c.id === cargoId);

    // Calcular datas
    const dataInicio = new Date(`${data}T${hora}`);
    // Extrair duração (ex: "30-45 minutos" -> pega 45, ou default 60)
    const duracaoMatch = cargo.duracao.match(/(\d+)/g);
    const minutosDuracao = duracaoMatch ? parseInt(duracaoMatch[duracaoMatch.length - 1]) : 60;

    const dataFim = new Date(dataInicio.getTime() + minutosDuracao * 60000);

    // Formatar para YYYYMMDDTHHMMSS (Google Calendar Link format)
    const formatGoogleDate = (date) => {
        return date.toISOString().replace(/-|:|\.\d\d\d/g, "");
    };

    const dates = `${formatGoogleDate(dataInicio)}/${formatGoogleDate(dataFim)}`;
    const titulo = encodeURIComponent(`${cargo.nome} - ${nome}`);
    const detalhes = encodeURIComponent(`Vaga no InHire: ${vagaInhire || 'N/A'}\nEntrevistador: ${entrevistador}\nCargo: ${cargo.nome}`);
    const location = encodeURIComponent(local === 'online' ? 'Google Meet / Online' : 'Presencial');

    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${titulo}&dates=${dates}&details=${detalhes}&location=${location}`;

    window.open(url, '_blank');

    // Pedir o link gerado
    setTimeout(() => {
        const link = prompt("🔗 Se você gerou um link de reunião (Google Meet), cole-o aqui para salvar no relatório:");
        if (link && document.getElementById('linkReuniao')) {
            document.getElementById('linkReuniao').value = link;
        }
    }, 1000);
}

window.salvarAgendamento = function () {
    const dadosBasicos = {
        candidatoNome: document.getElementById('candidatoNome').value,
        cargo: document.getElementById('cargo').value,
        dataEntrevista: document.getElementById('dataEntrevista').value,
        horaEntrevista: document.getElementById('horaEntrevista').value,
        vagaInhire: document.getElementById('vagaInhire').value,
        entrevistador: document.getElementById('entrevistador').value,
        localEntrevista: document.getElementById('localEntrevista').value,
        linkReuniao: document.getElementById('linkReuniao') ? document.getElementById('linkReuniao').value : '',
        dataRegistro: new Date().toISOString()
    };

    if (!dadosBasicos.candidatoNome || !dadosBasicos.cargo || !dadosBasicos.dataEntrevista) {
        alert('Preencha os campos obrigatórios para salvar na agenda.');
        return;
    }

    const cargo = cargosAtivos.find(c => c.id === dadosBasicos.cargo);

    // --- PROTEÇÃO: Verificar se já existe agendamento igual para evitar cliques duplos ---
    const jaExiste = entrevistas.find(e =>
        e.candidatoNome.trim().toLowerCase() === dadosBasicos.candidatoNome.trim().toLowerCase() &&
        e.cargo === dadosBasicos.cargo &&
        e.dataEntrevista === dadosBasicos.dataEntrevista &&
        e.status === 'agendado'
    );

    if (jaExiste) {
        mostrarMensagem('ℹ️ Este candidato já está agendado para este dia.', 'info');
        document.querySelector('[data-tab="agenda"]').click();
        return;
    }

    const agendamento = {
        id: `agendamento_${Date.now()}`,
        ...dadosBasicos,
        cargoNome: cargo.nome,
        respostas: [],
        avaliacoes: {},
        status: 'agendado'
    };

    entrevistas.push(agendamento);
    localStorage.setItem('entrevistas', JSON.stringify(entrevistas));

    // Enviar backup para o Google Sheets
    enviarParaGoogleSheets(agendamento);

    mostrarMensagem('📅 Agendamento salvo com sucesso!', 'success');
    limparFormulario();
    document.querySelector('[data-tab="agenda"]').click();
}

// --- Auto-save e Rascunho ---
function salvarRascunhoAutomatico() {
    if (!cargoSelecionado) return;

    const rascunho = {
        dadosBasicos: {
            candidatoNome: document.getElementById('candidatoNome').value,
            cargo: document.getElementById('cargo').value,
            entrevistador: document.getElementById('entrevistador').value,
            dataEntrevista: document.getElementById('dataEntrevista').value,
            horaEntrevista: document.getElementById('horaEntrevista').value,
            vagaInhire: document.getElementById('vagaInhire').value
        },
        respostas: {},
        avaliacoes: {},
        extras: {
            pontosFortes: document.getElementById('pontosFortes').value,
            pontosMelhorar: document.getElementById('pontosMelhorar').value,
            observacoes: document.getElementById('observacoes').value
        },
        timestamp: new Date().getTime()
    };

    // Salvar respostas
    document.querySelectorAll('.resposta-pergunta').forEach(textarea => {
        rascunho.respostas[textarea.dataset.index] = textarea.value;
    });

    // Salvar avaliações
    document.querySelectorAll('.avaliacao-item').forEach(item => {
        const comp = item.dataset.competencia;
        const btn = item.querySelector('.nota-btn.active');
        if (btn) rascunho.avaliacoes[comp] = btn.dataset.nota;
    });

    localStorage.setItem('rascunhoEntrevista', JSON.stringify(rascunho));
}

function verificarRascunho() {
    const rascunho = JSON.parse(localStorage.getItem('rascunhoEntrevista'));
    if (rascunho && (new Date().getTime() - rascunho.timestamp) < 86400000) { // Menos de 24h
        mostrarConfirmacao('Existe uma entrevista não salva. Deseja restaurar?', () => {
            restaurarRascunho(rascunho);
        });
    }
}

function restaurarRascunho(rascunho) {
    document.getElementById('candidatoNome').value = rascunho.dadosBasicos.candidatoNome;
    document.getElementById('entrevistador').value = rascunho.dadosBasicos.entrevistador;
    document.getElementById('dataEntrevista').value = rascunho.dadosBasicos.dataEntrevista;
    document.getElementById('horaEntrevista').value = rascunho.dadosBasicos.horaEntrevista || '';
    document.getElementById('vagaInhire').value = rascunho.dadosBasicos.vagaInhire || '';
    if (document.getElementById('linkReuniao') && rascunho.dadosBasicos.linkReuniao) document.getElementById('linkReuniao').value = rascunho.dadosBasicos.linkReuniao;
    document.getElementById('cargo').value = rascunho.dadosBasicos.cargo;

    // Disparar evento de mudança de cargo para carregar estrutura
    selecionarCargo(rascunho.dadosBasicos.cargo);

    // Preencher o resto após carregar estrutura
    setTimeout(() => {
        // Restaurar respostas
        Object.entries(rascunho.respostas).forEach(([idx, val]) => {
            const el = document.querySelector(`.resposta-pergunta[data-index="${idx}"]`);
            if (el) el.value = val;
        });

        // Restaurar avaliações
        Object.entries(rascunho.avaliacoes).forEach(([comp, nota]) => {
            const item = document.querySelector(`.avaliacao-item[data-competencia="${comp}"]`);
            if (item) {
                const btn = item.querySelector(`.nota-btn[data-nota="${nota}"]`);
                if (btn) selecionarNota(btn, comp);
            }
        });

        document.getElementById('pontosFortes').value = rascunho.extras.pontosFortes;
        document.getElementById('pontosMelhorar').value = rascunho.extras.pontosMelhorar;
        document.getElementById('observacoes').value = rascunho.extras.observacoes;

        iniciarEntrevista(); // Recriar objeto entrevistaAtual
        mostrarMensagem('📝 Rascunho restaurado com sucesso!', 'success');
    }, 200);
}
// --- Agenda ---
window.mudarVisualizacaoAgenda = function (tipo) {
    agendaVisualizacao = tipo;

    // Atualizar botões
    const btnTriagem = document.getElementById('btnAgendaTriagem');
    const btnGerencia = document.getElementById('btnAgendaGerencia');

    if (tipo === 'triagem') {
        btnTriagem.classList.add('active', 'btn-primary');
        btnTriagem.classList.remove('btn-secondary');
        btnGerencia.classList.remove('active', 'btn-primary');
        btnGerencia.classList.add('btn-secondary');
    } else {
        btnGerencia.classList.add('active', 'btn-primary');
        btnGerencia.classList.remove('btn-secondary');
        btnTriagem.classList.remove('active', 'btn-primary');
        btnTriagem.classList.add('btn-secondary');
    }

    carregarAgenda();
}

window.carregarAgenda = function () {
    const container = document.getElementById('agendaContainer');

    // Filtrar com base na visualização atual
    let listaFiltrada = [];

    if (agendaVisualizacao === 'triagem') {
        listaFiltrada = entrevistas.filter(e => e.status === 'agendado');
    } else {
        listaFiltrada = entrevistas.filter(e => e.status === 'agendado_gerencia');
    }

    // Ordenar por data
    const listaOrdenada = listaFiltrada.sort((a, b) => {
        // Para gerência, usa a data da gerência se existir
        const dataStrA = agendaVisualizacao === 'gerencia' && a.dadosGerencia ? a.dadosGerencia.data : a.dataEntrevista;
        const horaStrA = agendaVisualizacao === 'gerencia' && a.dadosGerencia ? a.dadosGerencia.hora : a.horaEntrevista;

        const dataStrB = agendaVisualizacao === 'gerencia' && b.dadosGerencia ? b.dadosGerencia.data : b.dataEntrevista;
        const horaStrB = agendaVisualizacao === 'gerencia' && b.dadosGerencia ? b.dadosGerencia.hora : b.horaEntrevista;

        const dataA = new Date(`${a.dataEntrevista}T${a.horaEntrevista || '00:00'}`);
        const dataB = new Date(`${b.dataEntrevista}T${b.horaEntrevista || '00:00'}`);
        return dataA - dataB;
    });

    if (listaOrdenada.length === 0) {
        container.innerHTML = `<div class="no-data">Nenhuma entrevista agendada para ${agendaVisualizacao === 'triagem' ? 'Triagem' : 'Gerência'}.</div>`;
        return;
    }

    // Agrupar por dia
    const grupos = {};
    listaOrdenada.forEach(e => {
        const data = agendaVisualizacao === 'gerencia' && e.dadosGerencia ? e.dadosGerencia.data : e.dataEntrevista;
        if (!grupos[data]) grupos[data] = [];
        grupos[data].push(e);
    });

    let html = '';
    Object.keys(grupos).sort().forEach(data => {
        const itens = grupos[data];

        html += `
            <div class="agenda-dia">
                <div class="agenda-data-titulo">${formatarData(data)}</div>
                ${itens.map((item) => {
            const realIndex = entrevistas.indexOf(item);
            const hora = agendaVisualizacao === 'gerencia' && item.dadosGerencia ? item.dadosGerencia.hora : (item.horaEntrevista || '??:??');
            const extraInfo = agendaVisualizacao === 'gerencia' && item.dadosGerencia ? `<br><small>👔 Gerente: ${item.dadosGerencia.gerente}</small>` : '';

            // Botões diferentes para cada agenda
            let botoes = '';
            if (agendaVisualizacao === 'triagem') {
                botoes = `
                            <button class="btn btn-small btn-secondary" onclick="mostrarEdicaoAgendamento(${realIndex})">✏️ Editar</button>
                            <button class="btn btn-small" onclick="editarEntrevista(${realIndex})">▶️ Iniciar</button>
                            <button class="btn btn-small btn-danger" onclick="excluirEntrevista(${realIndex})">🗑️ Excluir</button>
                        `;
            } else {
                botoes = `
                            <button class="btn btn-small btn-secondary" onclick="mostrarEdicaoGerencia(${realIndex})" style="background: #fff7ed; color: #c2410c; border-color: #fdba74;">✏️ Editar</button>
                            <button class="btn btn-small btn-success" onclick="abrirModalResultadoGerencia(${realIndex})">✅ Resultado</button>
                            <button class="btn btn-small btn-danger" onclick="excluirEntrevista(${realIndex})">🗑️ Cancelar</button>
                        `;
            }

            return `
                    <div class="agenda-item">
                        <div>
                            <span class="agenda-hora">${hora}</span> 
                            <strong>${item.candidatoNome}</strong> - ${item.cargoNome}
                            ${extraInfo}
                        </div>
                        <div style="display: flex; gap: 5px;">
                            ${botoes}
                        </div>
                    </div>
                `}).join('')}
            </div>
        `;
    });

    container.innerHTML = html;
}

window.mostrarEdicaoAgendamento = function (index) {
    const entrevista = entrevistas[index];
    const container = document.getElementById('agendaContainer');

    const cargoOptions = cargosAtivos.map(c =>
        `<option value="${c.id}" ${c.id === entrevista.cargo ? 'selected' : ''}>${c.nome}</option>`
    ).join('');

    container.innerHTML = `
        <div class="card-edicao" style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
           <h3 style="color: #6a0dad; margin-bottom: 15px;">✏️ Editar Agendamento</h3>
           <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Nome</label>
                    <input type="text" id="editNome" value="${entrevista.candidatoNome}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                </div>
                
                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Cargo</label>
                    <select id="editCargo" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                        ${cargoOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Data</label>
                    <input type="date" id="editData" value="${entrevista.dataEntrevista}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                </div>

                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Horário</label>
                    <input type="time" id="editHora" value="${entrevista.horaEntrevista || ''}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                </div>

                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Entrevistador</label>
                    <input type="text" id="editEntrevistador" value="${entrevista.entrevistador || ''}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                </div>

                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Local / Link</label>
                    <select id="editLocal" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                        <option value="online" ${entrevista.localEntrevista === 'online' ? 'selected' : ''}>Online (Google Meet)</option>
                        <option value="presencial" ${entrevista.localEntrevista === 'presencial' ? 'selected' : ''}>Presencial</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Link Reunião</label>
                    <input type="text" id="editLinkReuniao" value="${entrevista.linkReuniao || ''}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                </div>

                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Link da Vaga (InHire)</label>
                    <input type="text" id="editVagaInhire" value="${entrevista.vagaInhire || ''}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                </div>
            </div>

            <div style="margin-top: 25px; display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="carregarAgenda()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Cancelar
                </button>
                <button onclick="salvarEdicaoAgendamento(${index})" style="padding: 10px 20px; background: #6a0dad; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    💾 Salvar Alterações
                </button>
            </div>
        </div>
    `;
}

window.salvarEdicaoAgendamento = function (index) {
    const entrevista = entrevistas[index];
    const cargoId = document.getElementById('editCargo').value;
    const cargoObj = cargosAtivos.find(c => c.id === cargoId);

    entrevista.candidatoNome = document.getElementById('editNome').value;
    entrevista.cargo = cargoId;
    entrevista.cargoNome = cargoObj ? cargoObj.nome : entrevista.cargoNome;
    entrevista.dataEntrevista = document.getElementById('editData').value;
    entrevista.horaEntrevista = document.getElementById('editHora').value;
    entrevista.entrevistador = document.getElementById('editEntrevistador').value;
    entrevista.localEntrevista = document.getElementById('editLocal').value;
    entrevista.linkReuniao = document.getElementById('editLinkReuniao').value;
    entrevista.vagaInhire = document.getElementById('editVagaInhire').value;

    localStorage.setItem('entrevistas', JSON.stringify(entrevistas));

    // Enviar atualização para o Google Sheets
    enviarParaGoogleSheets(entrevista);

    mostrarMensagem('✅ Agendamento atualizado!', 'success');
    carregarAgenda();
    carregarPainelDia(); // Atualizar painel se modificado
}

// --- Funções de Compatibilidade e Novas Abas ---
function verificarCompatibilidadeDados() {
    let alterado = false;
    entrevistas.forEach(e => {
        // 1. Garantir IDs únicos
        if (!e.id) {
            e.id = `entrevista_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            alterado = true;
        }
        // 2. Mapear status antigo 'aprovado' para 'aprovado_triagem'
        if (e.status === 'aprovado') {
            e.status = 'aprovado_triagem';
            alterado = true;
        }
        // 3. Garantir que datas tenham o formato correto (YYYY-MM-DD)
        if (e.dataEntrevista && e.dataEntrevista.includes('/')) {
            const partes = e.dataEntrevista.split('/');
            if (partes.length === 3) {
                e.dataEntrevista = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
                alterado = true;
            }
        }
    });
    if (alterado) {
        localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
    }
}

function carregarPainelDia(dataFiltro = null) {
    const container = document.getElementById('painelDiaContainer');
    const resumo = document.getElementById('painelResumoDia');
    const titulo = document.getElementById('dataPainelTitulo');

    if (!container || !resumo) return;

    const dataAlvo = dataFiltro || new Date().toISOString().split('T')[0];

    // Atualizar títulos e campos
    if (titulo) titulo.textContent = formatarData(dataAlvo);
    if (!dataFiltro && document.getElementById('dataFiltroPainel')) {
        document.getElementById('dataFiltroPainel').value = dataAlvo;
    }

    // Filtrar entrevistas daquele dia (aparece se for a data da triagem OU a data da gerência)
    const entrevistasDoDia = entrevistas.filter(e => {
        const dataTriagem = e.dataEntrevista;
        const dataGerencia = (e.dadosGerencia && e.dadosGerencia.data) ? e.dadosGerencia.data : null;

        return dataTriagem === dataAlvo || dataGerencia === dataAlvo;
    });

    // Ordenar por hora
    entrevistasDoDia.sort((a, b) => {
        const horaA = a.status === 'agendado_gerencia' ? a.dadosGerencia.hora : a.horaEntrevista;
        const horaB = b.status === 'agendado_gerencia' ? b.dadosGerencia.hora : b.horaEntrevista;
        return (horaA || '00:00').localeCompare(horaB || '00:00');
    });

    // Atualizar Resumo
    const total = entrevistasDoDia.length;
    // TRIAGENS: Contamos todos que tiveram a entrevista de triagem marcada para este dia
    const triagem = entrevistasDoDia.filter(e => e.dataEntrevista === dataAlvo).length;

    // GERÊNCIA: Contamos todos que têm a entrevista de gerência marcada para este dia
    const gerencia = entrevistasDoDia.filter(e => e.dadosGerencia && e.dadosGerencia.data === dataAlvo).length;

    resumo.innerHTML = `
        <div class="stat-card" style="padding: 15px; background: #f8f9fa;">
            <div class="stat-number">${total}</div>
            <div class="stat-label">Total do Dia</div>
        </div>
        <div class="stat-card" style="padding: 15px; background: #e8f0fe; color: #1967d2;">
            <div class="stat-number">${triagem}</div>
            <div class="stat-label">📋 Triagens</div>
        </div>
        <div class="stat-card" style="padding: 15px; background: #fff7ed; color: #c2410c;">
            <div class="stat-number">${gerencia}</div>
            <div class="stat-label">👔 Gerência</div>
        </div>
    `;

    if (total === 0) {
        container.innerHTML = `<div class="no-data">Nenhuma atividade agendada para este dia.</div>`;
        return;
    }

    let html = '';
    entrevistasDoDia.forEach(item => {
        const realIndex = entrevistas.indexOf(item);
        const hora = (item.dadosGerencia && item.dadosGerencia.hora) ? item.dadosGerencia.hora : (item.horaEntrevista || '??:??');

        let labelStatus = '';
        let corStatus = '#666';

        if (item.status === 'agendado') { labelStatus = '📋 TRIAGEM PENDENTE'; corStatus = '#1967d2'; }
        else if (item.status === 'agendado_gerencia') { labelStatus = '👔 GERÊNCIA AGENDADA'; corStatus = '#c2410c'; }
        else if (item.status === 'contratado') { labelStatus = '✅ CONTRATADO'; corStatus = '#059669'; }
        else if (item.status === 'reprovado' || item.status === 'reprovado_gerencia') { labelStatus = '❌ REPROVADO'; corStatus = '#dc2626'; }
        else if (item.status === 'vaga_cancelada') { labelStatus = '🚫 VAGA CANCELADA'; corStatus = '#4b5563'; }
        else if (item.status === 'desistencia_candidato') { labelStatus = '🚶 DESISTÊNCIA'; corStatus = '#6b7280'; }
        else { labelStatus = item.status.toUpperCase(); }

        html += `
            <div class="agenda-item" style="border-left: 5px solid ${corStatus}; padding: 15px; margin-bottom: 10px; background: ${item.status === 'agendado' || item.status === 'agendado_gerencia' ? '#fff' : '#f8fafc'}; opacity: ${item.status === 'agendado' || item.status === 'agendado_gerencia' ? '1' : '0.8'};">
                <div style="flex: 1;">
                    <span class="agenda-hora" style="font-size: 1.1em; font-weight: bold;">${hora}</span> 
                    <span style="font-size: 0.75em; padding: 2px 8px; border-radius: 12px; background: ${corStatus}15; color: ${corStatus}; margin-left: 10px; font-weight: bold; border: 1px solid ${corStatus}33;">${labelStatus}</span>
                    <div style="margin-top: 8px;">
                        <strong style="font-size: 1.1em;">${item.candidatoNome}</strong> - ${item.cargoNome}
                        ${item.dadosGerencia && item.dadosGerencia.gerente ? `<br><small style="color: #666;">👔 Gerente: ${item.dadosGerencia.gerente}</small>` : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${(item.status === 'agendado' || item.status === 'agendado_gerencia' || item.status === 'analise' || item.status === 'aprovado_triagem') ?
                `<button class="btn btn-small" onclick="${item.status === 'agendado_gerencia' ? `abrirModalResultadoGerencia(${realIndex})` : `editarEntrevista(${realIndex})`}" style="background: ${corStatus};">▶️ Iniciar/Finalizar</button>` :
                `<button class="btn btn-small btn-secondary" onclick="verDetalhesEntrevista(${realIndex})" title="Ver resumo">👁️ Ver</button>`
            }
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

window.mostrarEdicaoGerencia = function (index) {
    const entrevista = entrevistas[index];
    const container = (document.getElementById('tab-painel-dia').classList.contains('active')) ?
        document.getElementById('painelDiaContainer') :
        document.getElementById('agendaContainer');

    if (!entrevista.dadosGerencia) {
        entrevista.dadosGerencia = { data: entrevista.dataEntrevista, hora: '', gerente: '', observacoes: '' };
    }

    container.innerHTML = `
        <div class="card-edicao" style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: 1px solid #c2410c;">
           <h3 style="color: #c2410c; margin-bottom: 15px;">✏️ Editar Entrevista Gerência</h3>
           <p><strong>Candidato:</strong> ${entrevista.candidatoNome}</p>
           
           <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Data Gerência</label>
                    <input type="date" id="editDataG" value="${entrevista.dadosGerencia.data}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                </div>
                
                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Hora Gerência</label>
                    <input type="time" id="editHoraG" value="${entrevista.dadosGerencia.hora}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                </div>

                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Nome do Gerente</label>
                    <input type="text" id="editGerenteG" value="${entrevista.dadosGerencia.gerente}" placeholder="Nome do gerente que fará a entrevista" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                </div>

                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Observações para Gerência</label>
                    <textarea id="editObsG" rows="3" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">${entrevista.dadosGerencia.observacoes || ''}</textarea>
                </div>
            </div>

            <div style="margin-top: 25px; display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="carregarAgenda(); carregarPainelDia();" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Cancelar
                </button>
                <button onclick="salvarEdicaoGerencia(${index})" style="padding: 10px 20px; background: #c2410c; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    💾 Salvar Alterações
                </button>
            </div>
        </div>
    `;
}

window.salvarEdicaoGerencia = function (index) {
    const entrevista = entrevistas[index];

    entrevista.dadosGerencia = {
        data: document.getElementById('editDataG').value,
        hora: document.getElementById('editHoraG').value,
        gerente: document.getElementById('editGerenteG').value,
        observacoes: document.getElementById('editObsG').value
    };

    localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
    enviarParaGoogleSheets(entrevista);

    mostrarMensagem('✅ Dados da gerência atualizados!', 'success');
    carregarAgenda();
    carregarPainelDia();
}

// Histórico de Entrevistas
function carregarHistoricoEntrevistas(filtro = '') {
    const container = document.getElementById('listaEntrevistas');
    const filtroStatus = document.getElementById('filtroStatus').value;
    const filtroCargo = document.getElementById('filtroCargoHistorico').value;
    const dataInicio = document.getElementById('filtroDataInicio').value;
    const dataFim = document.getElementById('filtroDataFim').value;

    let entrevistasFiltradas = entrevistas;

    // Aplicar filtro de texto
    if (filtro) {
        const termo = filtro.toLowerCase();
        entrevistasFiltradas = entrevistasFiltradas.filter(e =>
            e.candidatoNome.toLowerCase().includes(termo) ||
            e.cargoNome.toLowerCase().includes(termo) ||
            e.entrevistador.toLowerCase().includes(termo)
        );
    }

    // Aplicar filtro de status
    if (filtroStatus) {
        entrevistasFiltradas = entrevistasFiltradas.filter(e => e.status === filtroStatus);
    }

    // Filtro Cargo
    if (filtroCargo) {
        entrevistasFiltradas = entrevistasFiltradas.filter(e => e.cargoNome === filtroCargo);
    }

    // Filtro Data
    if (dataInicio) {
        entrevistasFiltradas = entrevistasFiltradas.filter(e => e.dataEntrevista >= dataInicio);
    }
    if (dataFim) {
        entrevistasFiltradas = entrevistasFiltradas.filter(e => e.dataEntrevista <= dataFim);
    }

    // Ordenar por data (mais recente primeiro)
    entrevistasFiltradas.sort((a, b) => {
        const dateA = a.dataRegistro ? new Date(a.dataRegistro) : (a.dataEntrevista ? new Date(a.dataEntrevista) : new Date(0));
        const dateB = b.dataRegistro ? new Date(b.dataRegistro) : (b.dataEntrevista ? new Date(b.dataEntrevista) : new Date(0));
        return dateB - dateA;
    });

    // Separar em Agendadas e Realizadas
    const agendadas = entrevistasFiltradas.filter(e => e.status === 'agendado');
    const realizadas = entrevistasFiltradas.filter(e => e.status !== 'agendado');

    const gerarCard = (entrevista) => {
        const realIndex = entrevistas.indexOf(entrevista);
        const dataFormatada = formatarData(entrevista.dataEntrevista);
        const statusClass = `status-${entrevista.status}`;
        const statusText = {
            'aprovado': '✅ Aprovado (Antigo)',
            'aprovado_triagem': '📋 Aprovado na Triagem',
            'reprovado': '❌ Reprovado',
            'analise': '⏳ Em análise',
            'faltou': '🚫 Faltou',
            'agendado': '📅 Agendado',
            'agendado_gerencia': '👔 Agendado Gerência',
            'contratado': '🎉 Contratado',
            'reprovado_gerencia': '❌ Reprovado Gerência'
        }[entrevista.status] || entrevista.status;

        // Lógica de botões de ação
        let botoesAcao = '';
        // Botão de Feedback (para reprovados, contratados ou faltou)
        if (['reprovado', 'reprovado_gerencia', 'contratado', 'faltou'].includes(entrevista.status)) {
            const feedbackClass = entrevista.feedbackEnviado ? 'enviado' : '';
            const feedbackText = entrevista.feedbackEnviado ? '✉️ Feedback Enviado' : '✉️ Marcar Feedback';
            botoesAcao += `
                <button class="btn btn-small btn-feedback ${feedbackClass}" onclick="alternarFeedback(${realIndex})">
                    ${feedbackText}
                </button>
            `;
        }

        // Botão Agendar Gerência (para aprovados na triagem)
        // CORREÇÃO: Aceitar tanto 'aprovado_triagem' (novo) quanto 'aprovado' (antigo)
        if (entrevista.status === 'aprovado_triagem' || entrevista.status === 'aprovado') {
            botoesAcao += `
                <button class="btn btn-small btn-primary" onclick="abrirModalGerencia(${realIndex})">
                    📅 Agendar Gerência
                </button>
            `;
        }

        // Botão Resultado Gerência (para agendados gerencia)
        if (entrevista.status === 'agendado_gerencia') {
            botoesAcao += `
                <button class="btn btn-small btn-success" onclick="abrirModalResultadoGerencia(${realIndex})">
                    ✅ Resultado Gerência
                </button>
            `;
        }

        return `
            <div class="entrevista-item ${entrevista.status}">
                <div class="entrevista-header">
                    <div class="candidato-info">
                        <h3>${entrevista.candidatoNome}</h3>
                        <div class="candidato-cargo">${entrevista.cargoNome}</div>
                    </div>
                    <div class="entrevista-status ${statusClass}">
                        ${statusText}
                    </div>
                </div>
                
                <div class="entrevista-detalhes">
                    <div class="detalhe-item">
                        <div class="detalhe-label">Data</div>
                        <div class="detalhe-valor">${dataFormatada}</div>
                    </div>
                    <div class="detalhe-item">
                        <div class="detalhe-label">Entrevistador</div>
                        <div class="detalhe-valor">${entrevista.entrevistador}</div>
                    </div>
                    <div class="detalhe-item">
                        <div class="detalhe-label">Avaliação</div>
                        <div class="detalhe-valor">${entrevista.mediaAvaliacao || 'N/A'}/5</div>
                        ${entrevista.duracaoReal ? `<div style="font-size:0.8em; color:#666; margin-top:2px;">${entrevista.duracaoReal}</div>` : ''}
                    </div>
                    <div class="detalhe-item">
                        <div class="detalhe-label">Local</div>
                        <div class="detalhe-valor">${entrevista.localEntrevista || 'Não informado'}</div>
                    </div>
                </div>
                
                <div class="acoes-entrevista">
                    ${botoesAcao}
                    <button class="btn btn-small" onclick="verDetalhesEntrevista(${realIndex})">
                        👁️ Detalhes
                    </button>
                    <button class="btn btn-small btn-pdf" onclick="gerarRelatorioEntrevista(${realIndex})">
                        📄 PDF
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="editarEntrevista(${realIndex})">
                        ✏️ Editar
                    </button>
                    <button class="btn btn-small btn-danger" onclick="excluirEntrevista(${realIndex})">
                        🗑️ Excluir
                    </button>
                </div>
            </div>
        `;
    };

    window.toggleSecaoHistorico = function (id) {
        const conteudo = document.getElementById(id);
        const icon = document.getElementById('icon-' + id);
        if (conteudo.classList.contains('hidden-secao')) {
            conteudo.classList.remove('hidden-secao');
            icon.textContent = '▼';
        } else {
            conteudo.classList.add('hidden-secao');
            icon.textContent = '▶';
        }
    };


    container.innerHTML = `
        <div class="historico-layout-vertical">
            <div class="secao-historico">
                <h3 onclick="toggleSecaoHistorico('secao-agendadas')" style="color: #6a0dad; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                    <span>📅 Agendadas / Em Andamento (${agendadas.length})</span>
                    <span id="icon-secao-agendadas" style="font-size: 0.8em; opacity: 0.6;">▶</span>
                </h3>
                <div id="secao-agendadas" class="conteudo-secao hidden-secao">
                    ${agendadas.length ? agendadas.map(gerarCard).join('') : '<div class="no-data">Nenhum agendamento encontrado.</div>'}
                </div>
            </div>
            <div class="secao-historico">
                <h3 onclick="toggleSecaoHistorico('secao-realizadas')" style="color: #6a0dad; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                    <span>✅ Histórico (${realizadas.length})</span>
                    <span id="icon-secao-realizadas" style="font-size: 0.8em; opacity: 0.6;">▼</span>
                </h3>
                <div id="secao-realizadas" class="conteudo-secao">
                    ${realizadas.length ? realizadas.map(gerarCard).join('') : '<div class="no-data">Nenhuma entrevista realizada encontrada.</div>'}
                </div>
            </div>
        </div>
    `;
}

function verDetalhesEntrevista(index) {
    const entrevista = entrevistas[index];
    let html = `
        <h3>${entrevista.candidatoNome} - ${entrevista.cargoNome}</h3>
        <div class="detalhes-grid">
            <div><strong>Data:</strong> ${formatarData(entrevista.dataEntrevista)}</div>
            <div><strong>Entrevistador:</strong> ${entrevista.entrevistador}</div>
            <div><strong>Status:</strong> ${entrevista.status}</div>
            <div><strong>Média:</strong> ${entrevista.mediaAvaliacao || 'N/A'}/5</div>
            ${entrevista.duracaoReal ? `<div><strong>Duração:</strong> ${entrevista.duracaoReal}</div>` : ''}
        </div>
        
        <h4>📝 Respostas da Entrevista</h4>
        <div class="respostas-lista">
    `;

    entrevista.respostas.forEach((resposta, i) => {
        html += `
            <div class="resposta-item">
                <div class="resposta-pergunta"><strong>${i + 1}. ${resposta.pergunta}</strong></div>
                <div class="resposta-texto">${resposta.resposta || '<em>Sem resposta</em>'}</div>
            </div>
        `;
    });

    html += `
        </div>
        
        <h4>📊 Avaliação</h4>
        <div class="avaliacoes-lista">
    `;

    Object.entries(entrevista.avaliacoes || {}).forEach(([competencia, nota]) => {
        const valorNota = typeof nota === 'object' ? nota.nota : nota;
        const motivo = typeof nota === 'object' ? `<br><small><em>Motivo: ${nota.motivo}</em></small>` : '';
        html += `
            <div class="avaliacao-item">
                <span class="competencia">${competencia}:</span>
                <span class="nota">${valorNota}/5</span>
                ${motivo}
            </div>
        `;
    });

    if (entrevista.pontosFortes) {
        html += `<h4>✨ Pontos Fortes</h4><p>${entrevista.pontosFortes}</p>`;
    }

    if (entrevista.pontosMelhorar) {
        html += `<h4>📈 Pontos a Melhorar</h4><p>${entrevista.pontosMelhorar}</p>`;
    }

    if (entrevista.observacoes) {
        html += `<h4>📝 Observações</h4><p>${entrevista.observacoes}</p>`;
    }

    document.getElementById('modalDetalhesConteudo').innerHTML = html;
    document.getElementById('modalDetalhes').style.display = 'flex';
}

function gerarRelatorioEntrevista(index) {
    // Ir para aba de relatório
    document.querySelector('[data-tab="relatorio"]').click();

    // Selecionar a entrevista no select
    document.getElementById('selecionarEntrevistaRelatorio').value = index;

    // Carregar preview
    setTimeout(() => {
        carregarPreviewRelatorio(index);
    }, 100);
}

function editarEntrevista(index) {
    const entrevista = entrevistas[index];

    // 1. MUDANÇA: Navegar imediatamente para a aba de entrevista para feedback visual instantâneo
    document.querySelector('[data-tab="entrevista"]').click();

    // Restaurar visibilidade do formulário para edição
    document.getElementById('formEntrevista').classList.remove('hidden');
    const btnToggle = document.getElementById('btnToggleForm');
    if (btnToggle) btnToggle.remove();

    // Definir como entrevista atual para permitir edição e salvamento direto
    entrevistaAtual = entrevista;

    // Se for uma entrevista agendada (ainda não realizada), iniciar o cronômetro
    if (entrevista.status === 'agendado') {
        iniciarCronometro();
    } else {
        document.getElementById('cronometro').classList.add('hidden');
    }

    // Preencher formulário com dados da entrevista
    document.getElementById('candidatoNome').value = entrevista.candidatoNome;
    document.getElementById('cargo').value = entrevista.cargo;
    document.getElementById('entrevistador').value = entrevista.entrevistador;
    document.getElementById('horaEntrevista').value = entrevista.horaEntrevista || '';
    document.getElementById('vagaInhire').value = entrevista.vagaInhire || '';
    if (document.getElementById('linkReuniao')) document.getElementById('linkReuniao').value = entrevista.linkReuniao || '';

    // Selecionar o cargo
    setTimeout(() => {
        selecionarCargo(entrevista.cargo);

        // Preencher respostas
        setTimeout(() => {
            entrevista.respostas.forEach((resposta, i) => {
                const textarea = document.querySelector(`.resposta-pergunta[data-index="${i}"]`);
                if (textarea) {
                    textarea.value = resposta.resposta;
                }
            });

            // Preencher avaliações
            Object.entries(entrevista.avaliacoes || {}).forEach(([competencia, nota]) => {
                const item = document.querySelector(`.avaliacao-item[data-competencia="${competencia}"]`);
                if (item) {
                    const notaBtn = item.querySelector(`.nota-btn[data-nota="${nota}"]`);
                    if (notaBtn) {
                        notaBtn.classList.add('active');
                    }
                }
            });

            // Preencher campos adicionais
            document.getElementById('pontosFortes').value = entrevista.pontosFortes || '';
            document.getElementById('pontosMelhorar').value = entrevista.pontosMelhorar || '';
            document.getElementById('observacoes').value = entrevista.observacoes || '';

            // Preencher status (com segurança caso não exista o radio button)
            const radioStatus = document.querySelector(`input[name="status"][value="${entrevista.status}"]`);
            if (radioStatus) {
                radioStatus.checked = true;
            } else if (entrevista.status === 'aprovado_triagem') {
                // Fallback para status novo no formulário antigo
                document.querySelector('input[name="status"][value="aprovado"]').checked = true;
            }

            // --- CORREÇÃO: NÃO REMOVER DO ARRAY AO EDITAR ---
            // Apenas carregamos para entrevistaAtual. O salvamento cuidará do resto.

            // Atualizar histórico
            carregarHistoricoEntrevistas();

            mostrarMensagem('📝 Entrevista carregada. O ID original foi preservado para evitar duplicatas.', 'info');
        }, 300); // Tempo reduzido para ser mais ágil
    }, 50);
}

function excluirEntrevista(index) {
    mostrarConfirmacao('Tem certeza que deseja excluir esta entrevista?', () => {
        ultimoItemExcluido = entrevistas[index];
        entrevistas.splice(index, 1);
        localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
        carregarHistoricoEntrevistas();
        carregarAgenda();
        atualizarEstatisticas();
        atualizarSelectRelatorio();
        mostrarMensagem(`
            ✅ Entrevista excluída! 
            <button onclick="desfazerExclusao()" style="background:white; border:none; padding:2px 8px; border-radius:4px; margin-left:10px; cursor:pointer; color:#333; font-weight:bold;">
                ↩️ Desfazer
            </button>
        `, 'success');
    });
}

function desfazerExclusao() {
    if (ultimoItemExcluido) {
        entrevistas.push(ultimoItemExcluido);
        localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
        ultimoItemExcluido = null;
        carregarHistoricoEntrevistas();
        carregarAgenda();
        atualizarEstatisticas();
        atualizarSelectRelatorio();
        mostrarMensagem('✅ Ação desfeita com sucesso!', 'success');
    }
}

// --- Editor de Cargos ---
function renderizarListaCargos() {
    const container = document.getElementById('listaCargosConfig');
    if (!container) return;

    if (cargosAtivos.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhum cargo cadastrado.</div>';
        return;
    }

    container.innerHTML = cargosAtivos.map(cargo => `
        <div class="item-cargo-config">
            <div>
                <h4>${cargo.nome}</h4>
                <small style="color:#666;">${cargo.categoria} • ${cargo.perguntas.length} perguntas</small>
            </div>
            <div style="display:flex; gap:5px;">
                <button class="btn btn-small btn-secondary" onclick="abrirModalCargo('${cargo.id}')">✏️ Editar</button>
                <button class="btn btn-small btn-danger" onclick="excluirCargo('${cargo.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function abrirModalCargo(cargoId = null) {
    const modal = document.getElementById('modalEditorCargo');
    const containerPerguntas = document.getElementById('containerPerguntasEditor');
    containerPerguntas.innerHTML = '';

    if (cargoId) {
        // Editar existente
        const cargo = cargosAtivos.find(c => c.id === cargoId);
        document.getElementById('tituloModalCargo').textContent = 'Editar Cargo';
        document.getElementById('editCargoId').value = cargo.id;
        document.getElementById('editCargoNome').value = cargo.nome;
        document.getElementById('editCargoCategoria').value = cargo.categoria;
        document.getElementById('editCargoDuracao').value = cargo.duracao;
        document.getElementById('editCargoSalario').value = cargo.salario;
        document.getElementById('editCargoHorario').value = cargo.horario;
        document.getElementById('editCargoBeneficios').value = Array.isArray(cargo.beneficios) ? cargo.beneficios.join(', ') : cargo.beneficios;
        document.getElementById('editCargoObservacoes').value = cargo.observacoes || '';

        cargo.perguntas.forEach(p => adicionarPerguntaEditor(p.categoria, p.texto));
    } else {
        // Novo cargo
        document.getElementById('tituloModalCargo').textContent = 'Novo Cargo';
        document.getElementById('editCargoId').value = '';
        document.getElementById('editCargoNome').value = '';
        document.getElementById('editCargoCategoria').value = '';
        document.getElementById('editCargoDuracao').value = '';
        document.getElementById('editCargoSalario').value = '';
        document.getElementById('editCargoHorario').value = '';
        document.getElementById('editCargoBeneficios').value = '';
        document.getElementById('editCargoObservacoes').value = '';

        // Adicionar uma pergunta padrão
        adicionarPerguntaEditor('Geral', '');
    }

    modal.style.display = 'flex';
}

function fecharModalCargo() {
    document.getElementById('modalEditorCargo').style.display = 'none';
}

function adicionarPerguntaEditor(categoria = '', texto = '') {
    const container = document.getElementById('containerPerguntasEditor');
    const div = document.createElement('div');
    div.className = 'pergunta-editor-item';
    div.draggable = true;
    div.innerHTML = `
        <div class="pergunta-editor-inputs">
            <input type="text" class="edit-pergunta-cat" placeholder="Categoria (ex: Técnica)" value="${categoria}" style="font-size:12px; padding:5px;">
            <textarea class="edit-pergunta-texto" placeholder="Texto da pergunta" rows="2" style="font-size:14px; padding:8px;">${texto}</textarea>
        </div>
        <button class="btn btn-small btn-danger" onclick="this.parentElement.remove()" style="height:fit-content;">🗑️</button>
    `;

    // Eventos de Drag and Drop
    div.addEventListener('dragstart', () => {
        div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
    });

    container.appendChild(div);
}

function salvarCargoEditado() {
    const id = document.getElementById('editCargoId').value;
    const nome = document.getElementById('editCargoNome').value;

    if (!nome) {
        alert('O nome do cargo é obrigatório.');
        return;
    }

    const novoCargo = {
        id: id || `cargo_${Date.now()}`,
        nome: nome,
        categoria: document.getElementById('editCargoCategoria').value,
        duracao: document.getElementById('editCargoDuracao').value,
        salario: document.getElementById('editCargoSalario').value,
        horario: document.getElementById('editCargoHorario').value,
        beneficios: document.getElementById('editCargoBeneficios').value.split(',').map(b => b.trim()).filter(b => b),
        observacoes: document.getElementById('editCargoObservacoes').value,
        perguntas: [],
        // Mantém competências padrão ou copia do primeiro cargo se for novo
        competencias: id ? cargosAtivos.find(c => c.id === id).competencias : (cargosAtivos[0] ? cargosAtivos[0].competencias : [])
    };

    // Coletar perguntas
    document.querySelectorAll('.pergunta-editor-item').forEach(item => {
        const cat = item.querySelector('.edit-pergunta-cat').value;
        const texto = item.querySelector('.edit-pergunta-texto').value;
        if (texto) {
            novoCargo.perguntas.push({ categoria: cat || 'Geral', texto: texto });
        }
    });

    if (id) {
        const index = cargosAtivos.findIndex(c => c.id === id);
        if (index !== -1) cargosAtivos[index] = novoCargo;
    } else {
        cargosAtivos.push(novoCargo);
    }

    // Salvar e atualizar
    localStorage.setItem('cargosPersonalizados', JSON.stringify(cargosAtivos));
    carregarCargosSelect();
    carregarCargosFiltro();
    renderizarListaCargos();
    fecharModalCargo();
    mostrarMensagem('✅ Cargo salvo com sucesso!', 'success');
}

function excluirCargo(id) {
    if (confirm('Tem certeza que deseja excluir este cargo?')) {
        cargosAtivos = cargosAtivos.filter(c => c.id !== id);
        localStorage.setItem('cargosPersonalizados', JSON.stringify(cargosAtivos));
        carregarCargosSelect();
        renderizarListaCargos();
    }
}

// Relatório PDF
function atualizarSelectRelatorio() {
    const select = document.getElementById('selecionarEntrevistaRelatorio');
    select.innerHTML = '<option value="">Escolha uma entrevista...</option>';

    entrevistas.forEach((entrevista, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${entrevista.candidatoNome} - ${entrevista.cargoNome} (${formatarData(entrevista.dataEntrevista)})`;
        select.appendChild(option);
    });
}

function carregarPreviewRelatorio(index) {
    const entrevista = entrevistas[index];
    if (!entrevista) return;

    const container = document.getElementById('relatorioPreview');

    let html = `
        <div class="preview-header">
            <h1 class="preview-title">Relatório de Entrevista</h1>
            <h2 class="preview-subtitle">${entrevista.candidatoNome} - ${entrevista.cargoNome}</h2>
        </div>
        
        <div class="preview-section">
            <h3 class="preview-section-title">📋 Informações Gerais</h3>
            <div class="info-grid">
                <div class="info-item">
                    <strong>Candidato:</strong> ${entrevista.candidatoNome}
                </div>
                <div class="info-item">
                    <strong>Cargo:</strong> ${entrevista.cargoNome}
                </div>
                <div class="info-item">
                    <strong>Data da Entrevista:</strong> ${formatarData(entrevista.dataEntrevista)}
                </div>
                <div class="info-item">
                    <strong>Entrevistador:</strong> ${entrevista.entrevistador}
                </div>
                <div class="info-item">
                    <strong>Status:</strong> ${entrevista.status.toUpperCase()}
                </div>
                ${entrevista.duracaoReal ? `<div class="info-item"><strong>Duração:</strong> ${entrevista.duracaoReal}</div>` : ''}
                <div class="info-item">
                    <strong>Data do Relatório:</strong> ${formatarData(new Date().toISOString())}
                </div>
            </div>
        </div>
        
        <div class="preview-section">
            <h3 class="preview-section-title">🗣️ Perguntas e Respostas</h3>
    `;

    entrevista.respostas.forEach((resposta, i) => {
        html += `
            <div class="pergunta-preview">
                <div class="pergunta-preview-texto">${i + 1}. ${resposta.pergunta}</div>
                <div class="pergunta-preview-resposta">${resposta.resposta || '<em>Não respondido</em>'}</div>
            </div>
        `;
    });

    html += `</div>`;

    // Avaliação
    if (Object.keys(entrevista.avaliacoes || {}).length > 0) {
        html += `
            <div class="preview-section">
                <h3 class="preview-section-title">📊 Avaliação por Competência</h3>
                <div class="avaliacoes-grid">
        `;

        Object.entries(entrevista.avaliacoes).forEach(([competencia, nota]) => {
            const valorNota = typeof nota === 'object' ? nota.nota : nota;
            const motivo = typeof nota === 'object' ? `<div style="font-size:0.8em; color:#666; margin-top:4px;">Motivo: ${nota.motivo}</div>` : '';
            html += `
                <div class="avaliacao-preview">
                    <div><span class="competencia">${competencia}:</span> ${motivo}</div>
                    <span class="nota">${valorNota}/5</span>
                </div>
            `;
        });

        html += `
                </div>
                <div class="media-geral">
                    <strong>Média Geral:</strong> ${entrevista.mediaAvaliacao || '0'}/5
                </div>
            </div>
        `;
    }

    // Pontos fortes e melhorar
    if (entrevista.pontosFortes) {
        html += `
            <div class="preview-section">
                <h3 class="preview-section-title">✨ Pontos Fortes</h3>
                <p>${entrevista.pontosFortes}</p>
            </div>
        `;
    }

    if (entrevista.pontosMelhorar) {
        html += `
            <div class="preview-section">
                <h3 class="preview-section-title">📈 Pontos a Melhorar</h3>
                <p>${entrevista.pontosMelhorar}</p>
            </div>
        `;
    }

    if (entrevista.observacoes) {
        html += `
            <div class="preview-section">
                <h3 class="preview-section-title">📝 Observações do Entrevistador</h3>
                <p>${entrevista.observacoes}</p>
            </div>
        `;
    }

    // Avaliação final
    const statusText = {
        'aprovado': '✅ APROVADO (TRIAGEM)',
        'aprovado_triagem': '✅ APROVADO NA TRIAGEM',
        'reprovado': '❌ CANDIDATO REPROVADO',
        'analise': '⏳ EM ANÁLISE',
        'faltou': '🚫 CANDIDATO FALTOU',
        'agendado': '📅 ENTREVISTA AGENDADA',
        'agendado_gerencia': '👔 AGENDADO COM GERÊNCIA',
        'contratado': '🎉 CANDIDATO CONTRATADO',
        'reprovado_gerencia': '❌ REPROVADO PELA GERÊNCIA'
    }[entrevista.status] || entrevista.status;

    html += `
        <div class="preview-section">
            <h3 class="preview-section-title">📋 Avaliação Final</h3>
            <div class="status-final ${entrevista.status}">
                ${statusText}
            </div>
        </div>
        
        <div class="preview-footer">
            <p><em>Relatório gerado automaticamente pelo Sistema de Entrevistas</em></p>
        </div>
    `;

    container.classList.remove('hidden');

    // Habilitar botões
    document.getElementById('acoesRelatorio').querySelectorAll('button').forEach(btn => {
        btn.disabled = false;
    });

    // Salvar índice para uso no PDF
    container.dataset.index = index;
}

function gerarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const entrevistaIndex = document.getElementById('relatorioPreview').dataset.index;
    const entrevista = entrevistas[entrevistaIndex];

    if (!entrevista) {
        mostrarMensagem('❌ Erro ao gerar PDF: entrevista não encontrada.', 'error');
        return;
    }

    // Configurações do PDF
    const margin = 20;
    let y = margin;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (2 * margin);

    // Cabeçalho
    doc.setFillColor(138, 43, 226);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('RELATÓRIO DE ENTREVISTA', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(14);
    doc.text(entrevista.candidatoNome + ' - ' + entrevista.cargoNome, pageWidth / 2, 30, { align: 'center' });

    y = 45;

    // Resetar cor
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    // Informações gerais
    doc.setFontSize(12);
    doc.setTextColor(138, 43, 226);
    doc.text('INFORMAÇÕES GERAIS', margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    const infos = [
        `Candidato: ${entrevista.candidatoNome}`,
        `Cargo: ${entrevista.cargoNome}`,
        `Data: ${formatarData(entrevista.dataEntrevista)}`,
        `Entrevistador: ${entrevista.entrevistador}`,
        `Status: ${entrevista.status.toUpperCase()}`,
        `Data do relatório: ${formatarData(new Date().toISOString())}`
    ];

    infos.forEach(info => {
        doc.text(info, margin, y);
        y += 6;
    });

    y += 10;

    // Perguntas e respostas
    doc.setFontSize(12);
    doc.setTextColor(138, 43, 226);
    doc.text('PERGUNTAS E RESPOSTAS', margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    entrevista.respostas.forEach((resposta, i) => {
        // Quebrar pergunta em linhas se necessário
        const perguntaLines = doc.splitTextToSize(`${i + 1}. ${resposta.pergunta}`, contentWidth);

        // Verificar espaço na página
        if (y + (perguntaLines.length * 5) + 20 > 280) {
            doc.addPage();
            y = margin;
        }

        // Pergunta em negrito
        doc.setFont('helvetica', 'bold');
        doc.text(perguntaLines, margin, y);
        y += (perguntaLines.length * 5) + 2;

        // Resposta
        doc.setFont('helvetica', 'normal');
        const respostaText = resposta.resposta || 'Não respondido';
        const respostaLines = doc.splitTextToSize(respostaText, contentWidth - 10);

        // Background para resposta
        doc.setFillColor(248, 245, 255);
        const respostaHeight = respostaLines.length * 5 + 4;
        doc.rect(margin + 5, y - 2, contentWidth - 10, respostaHeight, 'F');

        // Borda colorida
        doc.setFillColor(138, 43, 226);
        doc.rect(margin + 5, y - 2, 3, respostaHeight, 'F');

        doc.text(respostaLines, margin + 10, y);
        y += respostaHeight + 10;
    });

    // Avaliação
    if (Object.keys(entrevista.avaliacoes || {}).length > 0) {
        y += 5;

        doc.setFontSize(12);
        doc.setTextColor(138, 43, 226);
        doc.text('AVALIAÇÃO', margin, y);
        y += 8;

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);

        Object.entries(entrevista.avaliacoes).forEach(([competencia, nota]) => {
            const valorNota = typeof nota === 'object' ? nota.nota : nota;
            doc.text(`${competencia}: ${valorNota}/5`, margin, y);
            y += 6;
        });

        doc.text(`Média Geral: ${entrevista.mediaAvaliacao || '0'}/5`, margin, y);
        y += 10;
    }

    // Pontos fortes
    if (entrevista.pontosFortes) {
        doc.setFontSize(12);
        doc.setTextColor(138, 43, 226);
        doc.text('PONTOS FORTES', margin, y);
        y += 8;

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);

        const pontosLines = doc.splitTextToSize(entrevista.pontosFortes, contentWidth);
        doc.text(pontosLines, margin, y);
        y += (pontosLines.length * 5) + 10;
    }

    // Avaliação final
    y += 5;
    doc.setFontSize(14);
    doc.setTextColor(138, 43, 226);
    doc.text('AVALIAÇÃO FINAL', pageWidth / 2, y, { align: 'center' });
    y += 10;

    const statusText = {
        'aprovado': '✅ CANDIDATO APROVADO',
        'reprovado': '❌ CANDIDATO REPROVADO',
        'analise': '⏳ EM ANÁLISE'
    }[entrevista.status] || entrevista.status;

    doc.setFontSize(16);
    if (entrevista.status.includes('aprovado') || entrevista.status === 'contratado') {
        doc.setTextColor(0, 176, 155);
    } else if (entrevista.status === 'reprovado') {
        doc.setTextColor(255, 65, 108);
    } else {
        doc.setTextColor(138, 43, 226);
    }

    doc.text(statusText, pageWidth / 2, y, { align: 'center' });

    // Rodapé
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Sistema de Entrevistas - Relatório gerado automaticamente', pageWidth / 2, 290, { align: 'center' });

    // Salvar PDF
    const fileName = `Entrevista_${entrevista.candidatoNome.replace(/\s+/g, '_')}_${formatarData(entrevista.dataEntrevista).replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
    mostrarMensagem('✅ PDF gerado com sucesso!', 'success');
}

async function gerarRelatorioListaPDF(tipo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const periodo = document.getElementById('periodoRelatorio').value;

    let titulo = '';
    if (tipo === 'agendadas') titulo = 'RELATÓRIO DE ENTREVISTAS AGENDADAS (TRIAGEM)';
    else if (tipo === 'agendadas_gerencia') titulo = 'RELATÓRIO DE ENTREVISTAS AGENDADAS (GERÊNCIA)';
    else titulo = 'RELATÓRIO DE ENTREVISTAS REALIZADAS';

    const textoPeriodo = periodo === '7dias' ? ' (Últimos 7 dias)' : periodo === '30dias' ? ' (Últimos 30 dias)' : '';
    titulo += textoPeriodo;

    // Header
    doc.setFillColor(138, 43, 226);
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(titulo, 105, 15, { align: 'center' });

    let y = 35;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    // Filtro de data
    const dataLimite = new Date();
    if (periodo === '7dias') dataLimite.setDate(dataLimite.getDate() - 7);
    if (periodo === '30dias') dataLimite.setDate(dataLimite.getDate() - 30);
    if (periodo !== 'todos') dataLimite.setHours(0, 0, 0, 0);

    const lista = entrevistas.filter(e => {
        // Filtro de Tipo
        let statusMatch = false;
        if (tipo === 'agendadas') statusMatch = (e.status === 'agendado');
        else if (tipo === 'agendadas_gerencia') statusMatch = (e.status === 'agendado_gerencia');
        else statusMatch = (e.status !== 'agendado' && e.status !== 'agendado_gerencia');

        if (!statusMatch) return false;

        // Filtro de Data
        if (periodo === 'todos') return true;

        const dataStr = (tipo === 'agendadas_gerencia' && e.dadosGerencia) ? e.dadosGerencia.data : e.dataEntrevista;
        const dataItem = new Date(dataStr.includes('T') ? dataStr : dataStr + 'T00:00:00');
        return dataItem >= dataLimite;
    }).sort((a, b) => {
        const getDate = (item) => (tipo === 'agendadas_gerencia' && item.dadosGerencia) ? new Date(item.dadosGerencia.data) : new Date(item.dataEntrevista);
        return getDate(b) - getDate(a);
    });

    if (lista.length === 0) {
        doc.text("Nenhum registro encontrado.", 10, y);
    } else {
        lista.forEach((item, i) => {
            if (y > 270) { doc.addPage(); y = 20; }

            const data = formatarData(item.dataEntrevista);

            if (tipo === 'agendadas') {
                doc.setFont('helvetica', 'bold');
                doc.text(`${data} - ${item.horaEntrevista || '??:??'} | ${item.candidatoNome}`, 10, y);
                doc.setFont('helvetica', 'normal');
                doc.text(`${item.cargoNome}`, 10, y + 5);
                if (item.linkReuniao) {
                    doc.setTextColor(0, 0, 255);
                    doc.text(`Link: ${item.linkReuniao}`, 10, y + 10);
                    doc.setTextColor(0, 0, 0);
                    y += 15;
                } else {
                    doc.text(`Local: ${item.localEntrevista}`, 10, y + 10);
                    y += 15;
                }
            } else if (tipo === 'agendadas_gerencia') {
                const data = formatarData(item.dadosGerencia.data);
                doc.setFont('helvetica', 'bold');
                doc.text(`${data} - ${item.dadosGerencia.hora} | ${item.candidatoNome}`, 10, y);
                doc.setFont('helvetica', 'normal');
                doc.text(`Gerente: ${item.dadosGerencia.gerente}`, 10, y + 5);
                if (item.dadosGerencia.obs) {
                    doc.text(`Obs: ${item.dadosGerencia.obs}`, 10, y + 10);
                    y += 15;
                } else {
                    y += 10;
                }
            } else {
                const status = item.status.toUpperCase();
                doc.setFont('helvetica', 'bold');
                doc.text(`${data} | ${item.candidatoNome}`, 10, y);
                doc.setFont('helvetica', 'normal');
                doc.text(`${item.cargoNome} - ${status}`, 10, y + 5);
                if (item.mediaAvaliacao) {
                    doc.text(`Nota: ${item.mediaAvaliacao}/5`, 10, y + 10);
                }
                y += 15;
            }

            // Separator
            doc.setDrawColor(200);
            doc.line(10, y - 2, 200, y - 2);
            y += 5;
        });
    }

    doc.save(`Relatorio_${tipo}_${new Date().toISOString().split('T')[0]}.pdf`);
}

function imprimirRelatorio() {
    const preview = document.getElementById('relatorioPreview');
    const printWindow = window.open('', '_blank');

    printWindow.document.write(`
        <html>
            <head>
                <title>Relatório de Entrevista</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 40px;
                        color: #333;
                    }
                    .preview-header { 
                        text-align: center; 
                        margin-bottom: 40px;
                        padding-bottom: 20px;
                        border-bottom: 3px solid #8a2be2;
                    }
                    .preview-title { 
                        font-size: 28px; 
                        color: #8a2be2; 
                        margin-bottom: 10px;
                    }
                    .preview-subtitle {
                        font-size: 18px;
                        color: #666;
                    }
                    .preview-section { 
                        margin-bottom: 30px; 
                    }
                    .preview-section-title { 
                        color: #8a2be2; 
                        font-size: 18px; 
                        margin-bottom: 15px;
                        padding-bottom: 8px;
                        border-bottom: 2px solid #f0f0ff;
                    }
                    .pergunta-preview { 
                        margin-bottom: 20px;
                        page-break-inside: avoid;
                    }
                    .pergunta-preview-texto { 
                        font-weight: bold;
                        margin-bottom: 8px;
                        color: #6a0dad;
                    }
                    .pergunta-preview-resposta { 
                        margin-left: 20px;
                        color: #555;
                        line-height: 1.6;
                    }
                    .status-final {
                        text-align: center;
                        padding: 20px;
                        font-size: 20px;
                        font-weight: bold;
                        border-radius: 10px;
                        margin: 30px 0;
                    }
                    .status-final.aprovado {
                        background: #d4edda;
                        color: #155724;
                        border: 2px solid #c3e6cb;
                    }
                    .status-final.reprovado {
                        background: #f8d7da;
                        color: #721c24;
                        border: 2px solid #f5c6cb;
                    }
                    .status-final.analise {
                        background: #fff3cd;
                        color: #856404;
                        border: 2px solid #ffeaa7;
                    }
                    .status-final.faltou {
                        background: #e2e3e5;
                        color: #383d41;
                        border: 2px solid #d6d8db;
                    }
                    .status-final.agendado {
                        background: #e8f0fe;
                        color: #1967d2;
                        border: 2px solid #aecbfa;
                    }
                    .status-final.contratado {
                        background: #d1fae5;
                        color: #065f46;
                        border: 2px solid #10b981;
                    }
                    .status-final.vaga_cancelada {
                        background: #f1f5f9;
                        color: #475569;
                        border: 2px solid #cbd5e1;
                    }
                    .status-final.desistencia_candidato {
                        background: #f8fafc;
                        color: #64748b;
                        border: 2px dashed #94a3b8;
                    }
                    @media print {
                        body { margin: 20px; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                ${preview.innerHTML}
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(function() {
                            window.close();
                        }, 100);
                    }
                <\/script>
            </body>
        </html>
    `);

    printWindow.document.close();
}

// Estatísticas
function atualizarEstatisticas() {
    if (!entrevistas) return;

    // Totais
    const total = entrevistas.length;

    // AGENDADOS: Consideramos qualquer um que ainda NÃO tenha um resultado final (contratado/reprovado/etc)
    const statusFinais = ['contratado', 'reprovado', 'reprovado_gerencia', 'faltou', 'vaga_cancelada', 'desistencia_candidato'];
    const agendados = entrevistas.filter(e => !statusFinais.includes(e.status)).length;
    const realizados = total - agendados;

    document.getElementById('totalEntrevistas').textContent = total;

    // Tentar mostrar agendados se o elemento existir, ou injetar visualmente (opcional)
    const elAgendados = document.getElementById('totalAgendados');
    if (elAgendados) {
        elAgendados.textContent = agendados;
    } else {
        // Se não existir o card específico, adicionamos a info ao lado do total por enquanto
        const elTotal = document.getElementById('totalEntrevistas');
        if (elTotal && !document.getElementById('infoAgendadosExtra')) {
            const span = document.createElement('div');
            span.id = 'infoAgendadosExtra';
            span.style.fontSize = '0.5em';
            span.style.opacity = '0.8';
            span.innerHTML = `(📅 ${agendados} na fila)`;
            elTotal.appendChild(span);
        } else if (document.getElementById('infoAgendadosExtra')) {
            document.getElementById('infoAgendadosExtra').innerHTML = `(📅 ${agendados} na fila)`;
        }
    }

    const aprovados = entrevistas.filter(e => e.status === 'aprovado' || e.status === 'aprovado_triagem' || e.status === 'contratado').length;
    const reprovados = entrevistas.filter(e => e.status === 'reprovado' || e.status === 'reprovado_gerencia').length;
    const faltou = entrevistas.filter(e => e.status === 'faltou').length;

    document.getElementById('totalAprovados').textContent = aprovados;
    document.getElementById('totalReprovados').textContent = reprovados;
    document.getElementById('totalFaltou').textContent = faltou;

    // Taxa baseada apenas no que foi REALIZADO (exclui agendados)
    const baseCalculo = realizados > 0 ? realizados : 0;
    const taxa = baseCalculo > 0 ? Math.round((aprovados / baseCalculo) * 100) : 0;
    document.getElementById('taxaAprovacao').textContent = `${taxa}%`;

    // Gráfico de cargos
    atualizarGraficoCargos();

    // Gráfico mensal
    atualizarGraficoMensal();

    // Últimas entrevistas
    atualizarUltimasEntrevistas();
}

function atualizarGraficoCargos() {
    const container = document.getElementById('chartCargos');
    if (!container) return;

    // Contar entrevistas por cargo
    // Separar dados
    const contagemRealizados = {};
    const contagemAgendados = {};

    entrevistas.forEach(entrevista => {
        const statusFinais = ['contratado', 'reprovado', 'reprovado_gerencia', 'faltou', 'vaga_cancelada', 'desistencia_candidato'];
        if (!statusFinais.includes(entrevista.status)) {
            contagemAgendados[entrevista.cargoNome] = (contagemAgendados[entrevista.cargoNome] || 0) + 1;
        } else {
            contagemRealizados[entrevista.cargoNome] = (contagemRealizados[entrevista.cargoNome] || 0) + 1;
        }
    });

    const gerarBarras = (dados, titulo, cor) => {
        const cargos = Object.keys(dados);
        const valores = Object.values(dados);

        if (cargos.length === 0) return `<div style="padding:10px; color:#999; font-size:0.9em;">Sem dados de ${titulo.toLowerCase()}</div>`;

        const maxValor = Math.max(...valores);
        let html = `<h4 style="margin:10px 0 5px 0; color:#666; font-size:0.9em; border-bottom:1px solid #eee;">${titulo}</h4><div style="display:flex; align-items:flex-end; height:100px; gap:10px; margin-bottom:15px;">`;

        cargos.forEach((cargo, index) => {
            const altura = maxValor > 0 ? (valores[index] / maxValor) * 100 : 10;
            html += `
                <div class="chart-bar" style="height: ${altura}%; background:${cor}; min-width:40px;" title="${cargo}: ${valores[index]}">
                    <div class="chart-label" style="font-size:0.7em;">${cargo.split(' ')[0]}</div>
                    <div style="text-align:center; font-weight:bold; font-size:0.8em;">${valores[index]}</div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    };

    if (entrevistas.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhuma entrevista para exibir</div>';
        return;
    }

    let html = '';
    html += gerarBarras(contagemRealizados, '✅ Realizados', '#8a2be2'); // Roxo original
    html += gerarBarras(contagemAgendados, '📅 Agendados', '#aecbfa'); // Azul claro

    container.innerHTML = html;
}

function atualizarGraficoMensal() {
    const container = document.getElementById('chartMensal');
    if (!container) return;

    // Agrupar por mês (últimos 6 meses)
    // Preparar meses (últimos 6)
    const chavesMeses = [];
    const hoje = new Date();

    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
        chavesMeses.push(`${d.getMonth() + 1}/${d.getFullYear()}`);
    }

    const dadosRealizados = {};
    const dadosAgendados = {};
    chavesMeses.forEach(k => { dadosRealizados[k] = 0; dadosAgendados[k] = 0; });

    entrevistas.forEach(entrevista => {
        let key;
        if (entrevista.dataEntrevista && typeof entrevista.dataEntrevista === 'string' && entrevista.dataEntrevista.includes('-')) {
            const [ano, mes] = entrevista.dataEntrevista.split('-');
            key = `${parseInt(mes)}/${ano}`;
        } else {
            const d = new Date(entrevista.dataEntrevista);
            key = `${d.getMonth() + 1}/${d.getFullYear()}`;
        }

        if (dadosRealizados.hasOwnProperty(key)) {
            const statusFinais = ['contratado', 'reprovado', 'reprovado_gerencia', 'faltou', 'vaga_cancelada', 'desistencia_candidato'];
            if (!statusFinais.includes(entrevista.status)) {
                dadosAgendados[key]++;
            } else {
                dadosRealizados[key]++;
            }
        }
    });

    const gerarGraficoLinha = (dados, titulo, cor) => {
        const valores = Object.values(dados);
        const maxValor = Math.max(...valores, 1);
        let html = `<h4 style="margin:10px 0 5px 0; color:#666; font-size:0.9em; border-bottom:1px solid #eee;">${titulo}</h4><div style="display:flex; align-items:flex-end; height:100px; gap:10px; margin-bottom:15px;">`;

        Object.keys(dados).forEach((label, index) => {
            const altura = (valores[index] / maxValor) * 100;
            // Correção: Adicionado flex:1 e min-width para garantir visualização das barras
            html += `<div class="chart-bar" style="height: ${Math.max(altura, 5)}%; background:${cor}; flex:1; min-width:20px; position:relative; border-radius:3px 3px 0 0;" title="${label}: ${valores[index]}">
                <div style="position:absolute; top:-15px; width:100%; text-align:center; font-size:0.7em; color:#666; font-weight:bold;">${valores[index] > 0 ? valores[index] : ''}</div>
                <div class="chart-label" style="position:absolute; bottom:2px; width:100%; text-align:center; font-size:0.7em; color:${altura > 20 ? 'white' : '#333'};">${label.split('/')[0]}</div>
            </div>`;
        });
        html += '</div>';
        return html;
    };

    let html = '';
    html += gerarGraficoLinha(dadosRealizados, '✅ Realizados', '#8a2be2');
    html += gerarGraficoLinha(dadosAgendados, '📅 Agendados', '#aecbfa');

    container.innerHTML = html;
}

function atualizarUltimasEntrevistas() {
    const container = document.getElementById('listaUltimasEntrevistas');
    if (!container) return;

    const ultimas = [...entrevistas]
        .sort((a, b) => new Date(b.dataRegistro) - new Date(a.dataRegistro))
        .slice(0, 5);

    if (ultimas.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhuma entrevista realizada</div>';
        return;
    }

    let html = '<div class="lista-simples">';
    ultimas.forEach(entrevista => {
        const data = formatarData(entrevista.dataEntrevista);
        html += `
            <div class="item-simples">
                <div class="item-titulo">${entrevista.candidatoNome}</div>
                <div class="item-subtitulo">${entrevista.cargoNome} • ${data}</div>
                <div class="item-status status-${entrevista.status}">
                    ${entrevista.status === 'aprovado' ? '✅' : entrevista.status === 'reprovado' ? '❌' : entrevista.status === 'faltou' ? '🚫' : '⏳'}
                </div>
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
}

// Funções de Backup e Exportação
window.exportarDados = function () {
    if (entrevistas.length === 0) {
        alert('Não há dados para exportar.');
        return;
    }

    // Parar Cronômetro
    pararCronometro();

    const dados = JSON.stringify(entrevistas, null, 2);
    const blob = new Blob([dados], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_entrevistas_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    mostrarMensagem('📤 Backup exportado com sucesso!', 'success');
}

window.importarDados = function () {
    const input = document.getElementById('arquivoBackup');
    const arquivo = input.files[0];
    if (!arquivo) {
        alert('Selecione um arquivo JSON primeiro.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const dadosImportados = JSON.parse(e.target.result);
            if (Array.isArray(dadosImportados)) {
                const totalAntes = entrevistas.length;
                let novos = 0;
                let atualizados = 0;

                dadosImportados.forEach(item => {
                    if (item && item.candidatoNome) {
                        const indexExistente = entrevistas.findIndex(e => e.id === item.id);
                        if (indexExistente !== -1) {
                            // Se o importado tiver mais respostas ou for mais recente, atualiza
                            const pesoLocal = (entrevistas[indexExistente].respostas ? entrevistas[indexExistente].respostas.length : 0);
                            const pesoImportado = (item.respostas ? item.respostas.length : 0);

                            if (pesoImportado >= pesoLocal) {
                                entrevistas[indexExistente] = { ...entrevistas[indexExistente], ...item };
                                atualizados++;
                            }
                        } else {
                            entrevistas.push(item);
                            novos++;
                        }
                    }
                });

                localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
                removerDuplicatas();
                carregarDados();

                mostrarMensagem(`📥 Importação concluída! ${novos} novos e ${atualizados} atualizados.`, 'success');

                // Opcional: Perguntar se deseja sincronizar com a nuvem após importar
                if (novos > 0 || atualizados > 0) {
                    setTimeout(() => {
                        if (confirm(`Deseja enviar esses ${novos + atualizados} registros atualizados para a planilha online agora?`)) {
                            sincronizarComPlanilha();
                        }
                    }, 1000);
                }
            } else {
                throw new Error('Formato inválido');
            }
        } catch (erro) {
            mostrarMensagem('❌ Erro ao importar: Arquivo inválido.', 'error');
        }
    };
    reader.readAsText(input.files[0]);
}

function alternarTema() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('tema', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}

function inicializarTema() {
    if (localStorage.getItem('tema') === 'dark') {
        document.body.classList.add('dark-mode');
    }
}

// Funções auxiliares
function formatarData(dataString) {
    if (!dataString) return 'N/A';

    // Se tiver horário (ISO), converte para data local
    if (dataString.includes('T')) {
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR');
    }

    // Se for apenas data (YYYY-MM-DD), faz split para evitar problemas de fuso horário
    const [ano, mes, dia] = dataString.split('-');
    return `${dia}/${mes}/${ano}`;
}

function enviarParaGoogleSheets(dados) {
    if (!GOOGLE_SCRIPT_URL) return;

    fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain'
        },
        body: JSON.stringify(dados)
    })
        .then(() => console.log('Dados enviados para o Google Sheets'))
        .catch(erro => console.error('Erro ao enviar para Sheets:', erro));
}

function mostrarMensagem(texto, tipo = 'info') {
    // Criar elemento de mensagem
    const mensagem = document.createElement('div');
    mensagem.className = `mensagem mensagem-${tipo}`;
    mensagem.innerHTML = `
        <div class="mensagem-conteudo">
            ${texto}
            <button class="mensagem-fechar" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
    `;

    // Estilos para a mensagem
    mensagem.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${tipo === 'success' ? '#d4edda' : tipo === 'error' ? '#f8d7da' : '#fff3cd'};
        color: ${tipo === 'success' ? '#155724' : tipo === 'error' ? '#721c24' : '#856404'};
        padding: 15px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;

    document.body.appendChild(mensagem);

    // Remover após 5 segundos
    setTimeout(() => {
        if (mensagem.parentElement) {
            mensagem.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => mensagem.remove(), 300);
        }
    }, 5000);
}



function mostrarConfirmacao(mensagem, callback) {
    document.getElementById('mensagemConfirmacao').textContent = mensagem;
    document.getElementById('btnConfirmarAcao').onclick = function () {
        callback();
        fecharModalConfirmacao();
    };
    document.getElementById('modalConfirmacao').style.display = 'flex';
}

function fecharModal() {
    document.getElementById('modalDetalhes').style.display = 'none';
}

function fecharModalConfirmacao() {
    document.getElementById('modalConfirmacao').style.display = 'none';
}

// Adicionar estilos CSS para animações
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .mensagem-conteudo {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 15px;
    }
    
    .mensagem-fechar {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: inherit;
    }
    
    .detalhes-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin: 20px 0;
    }
    
    .respostas-lista {
        max-height: 300px;
        overflow-y: auto;
        margin: 20px 0;
    }
    
    .resposta-item {
        margin-bottom: 20px;
        padding: 15px;
        background: #f8f5ff;
        border-radius: 10px;
    }
    
    .resposta-pergunta {
        margin-bottom: 10px;
        color: #6a0dad;
    }
    
    .resposta-texto {
        color: #555;
        line-height: 1.6;
    }
    
    .avaliacoes-lista {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
    }
    
    .avaliacao-item {
        display: flex;
        justify-content: space-between;
        padding: 10px;
        background: #f0f0ff;
        border-radius: 8px;
    }
    
    .competencia {
        font-weight: 600;
        color: #6a0dad;
    }
    
    .nota {
        font-weight: bold;
        color: #8a2be2;
    }
    
    .info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin: 15px 0;
    }
    
    .info-item {
        padding: 12px;
        background: #f8f5ff;
        border-radius: 8px;
        border-left: 4px solid #8a2be2;
    }
    
    .avaliacoes-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 10px;
        margin: 15px 0;
    }
    
    .avaliacao-preview {
        display: flex;
        justify-content: space-between;
        padding: 10px;
        background: #f0f0ff;
        border-radius: 8px;
    }
    
    .media-geral {
        margin-top: 15px;
        padding: 15px;
        background: #8a2be2;
        color: white;
        border-radius: 10px;
        text-align: center;
        font-size: 1.2rem;
        font-weight: bold;
    }
    
    .status-final {
        text-align: center;
        padding: 25px;
        font-size: 1.5rem;
        font-weight: bold;
        border-radius: 15px;
        margin: 25px 0;
    }
    
    .status-final.aprovado {
        background: #d4edda;
        color: #155724;
        border: 3px solid #c3e6cb;
    }
    
    .status-final.reprovado {
        background: #f8d7da;
        color: #721c24;
        border: 3px solid #f5c6cb;
    }
    
    .status-final.analise {
        background: #fff3cd;
        color: #856404;
        border: 3px solid #ffeaa7;
    }

    .status-final.faltou {
        background: #e2e3e5;
        color: #383d41;
        border: 3px solid #d6d8db;
    }

    .status-final.agendado {
        background: #e8f0fe;
        color: #1967d2;
        border: 3px solid #aecbfa;
    }
    
    .preview-footer {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 2px solid #f0f0ff;
        color: #999;
        font-size: 0.9rem;
    }
    
    .lista-simples {
        margin-top: 20px;
    }
    
    .item-simples {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        margin-bottom: 10px;
        background: #f8f5ff;
        border-radius: 10px;
        border-left: 4px solid #8a2be2;
    }
    
    .item-titulo {
        font-weight: 600;
        color: #6a0dad;
    }
    
    .item-subtitulo {
        color: #666;
        font-size: 0.9rem;
    }
    
    .item-status {
        font-size: 1.2rem;
    }
    
    /* Dark Mode Styles */
    body.dark-mode {
        background-color: #121212 !important;
        color: #e0e0e0 !important;
    }
    
    body.dark-mode .container,
    body.dark-mode header,
    body.dark-mode .sidebar,
    body.dark-mode .card,
    body.dark-mode .modal-content,
    body.dark-mode .entrevista-item,
    body.dark-mode .agenda-item,
    body.dark-mode .card-edicao,
    body.dark-mode #botoesRelatoriosGerais > div {
        background-color: #1e1e1e !important;
        color: #e0e0e0 !important;
        border-color: #333 !important;
        box-shadow: 0 2px 5px rgba(255,255,255,0.05) !important;
    }
    
    body.dark-mode input,
    body.dark-mode select,
    body.dark-mode textarea {
        background-color: #2d2d2d !important;
        color: #fff !important;
        border: 1px solid #444 !important;
    }
    
    body.dark-mode h1, body.dark-mode h2, body.dark-mode h3, body.dark-mode h4, 
    body.dark-mode strong, body.dark-mode label, body.dark-mode .pergunta-texto {
        color: #bb86fc !important;
    }
    
    body.dark-mode .resposta-item,
    body.dark-mode .avaliacao-item,
    body.dark-mode .info-item,
    body.dark-mode .item-simples,
    body.dark-mode .avaliacao-preview {
        background-color: #252525 !important;
        border-color: #444 !important;
    }
`;
document.head.appendChild(style);

// Função utilitária para otimizar performance (Debounce)
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// --- Funções do Cronômetro ---
function iniciarCronometro() {
    pararCronometro(); // Limpa anterior se houver
    tempoInicioCronometro = Date.now();
    const display = document.getElementById('cronometro');

    if (display) {
        display.classList.remove('hidden');
        display.textContent = '⏱️ 00:00:00';
    }

    cronometroInterval = setInterval(() => {
        const agora = Date.now();
        const diff = agora - tempoInicioCronometro;

        const seg = Math.floor((diff / 1000) % 60);
        const min = Math.floor((diff / (1000 * 60)) % 60);
        const hr = Math.floor((diff / (1000 * 60 * 60)));

        if (display) display.textContent = `⏱️ ${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
    }, 1000);
}

function pararCronometro() {
    if (cronometroInterval) {
        clearInterval(cronometroInterval);
        cronometroInterval = null;
    }
}

// --- Funções de Gerência e Feedback ---

function alternarFeedback(index) {
    entrevistas[index].feedbackEnviado = !entrevistas[index].feedbackEnviado;
    localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
    carregarHistoricoEntrevistas(); // Recarrega para atualizar botão
    mostrarMensagem(entrevistas[index].feedbackEnviado ? '✅ Feedback marcado como enviado!' : '↩️ Feedback desmarcado.', 'success');
}

function abrirModalGerencia(index) {
    const entrevista = entrevistas[index];
    document.getElementById('indexGerencia').value = index;
    document.getElementById('nomeCandidatoGerencia').value = entrevista.candidatoNome;
    document.getElementById('modalAgendamentoGerencia').style.display = 'flex';
}

function fecharModalGerencia() {
    document.getElementById('modalAgendamentoGerencia').style.display = 'none';
}

function salvarAgendamentoGerencia() {
    const index = document.getElementById('indexGerencia').value;
    const data = document.getElementById('dataGerencia').value;
    const hora = document.getElementById('horaGerencia').value;
    const gerente = document.getElementById('nomeGerente').value;
    const obs = document.getElementById('obsGerencia').value;

    if (!data || !hora || !gerente) {
        alert('Preencha Data, Hora e Nome do Gerente.');
        return;
    }

    entrevistas[index].status = 'agendado_gerencia';
    entrevistas[index].dadosGerencia = { data, hora, gerente, obs };

    localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
    enviarParaGoogleSheets(entrevistas[index]);

    fecharModalGerencia();
    mostrarMensagem('👔 Entrevista com gerência agendada!', 'success');
    carregarHistoricoEntrevistas();
}

window.abrirModalResultadoGerencia = function (index) {
    const entrevista = entrevistas[index];
    document.getElementById('indexResultadoGerencia').value = index;
    document.getElementById('nomeCandidatoResultado').textContent = entrevista.candidatoNome;
    document.getElementById('modalResultadoGerencia').style.display = 'flex';
};

window.fecharModalResultadoGerencia = function () {
    document.getElementById('modalResultadoGerencia').style.display = 'none';
};

window.salvarResultadoGerencia = function (resultado) {
    const index = document.getElementById('indexResultadoGerencia').value;

    entrevistas[index].status = resultado;
    entrevistas[index].dataFinalizacao = new Date().toISOString();

    localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
    enviarParaGoogleSheets(entrevistas[index]);

    fecharModalResultadoGerencia();

    let msg = 'Processo finalizado.';
    if (resultado === 'contratado') msg = '🎉 Candidato Contratado!';
    if (resultado === 'vaga_cancelada') msg = '🚫 Vaga marcada como cancelada.';
    if (resultado === 'desistencia_candidato') msg = '🚶 Registrada desistência do candidato.';

    mostrarMensagem(msg, 'success');
    carregarHistoricoEntrevistas();
    carregarAgenda();
};

async function gerarRelatorioStatusFeedback(modo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const periodo = document.getElementById('periodoRelatorio').value;

    let titulo = 'RELATÓRIO GERAL DE STATUS & FEEDBACK';
    if (modo === 'pendentes') titulo = 'RELATÓRIO DE FEEDBACKS PENDENTES';

    const textoPeriodo = periodo === '7dias' ? ' (Últimos 7 dias)' : periodo === '30dias' ? ' (Últimos 30 dias)' : '';
    titulo += textoPeriodo;

    // Header
    doc.setFillColor(138, 43, 226);
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(titulo, 105, 15, { align: 'center' });

    let y = 35;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    // Helper to add section
    const addSection = (title, items, columns) => {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        doc.setTextColor(138, 43, 226);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 10, y);
        y += 8;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        if (items.length === 0) {
            doc.text("Nenhum registro encontrado.", 10, y);
            y += 10;
        } else {
            items.forEach(item => {
                if (y > 270) { doc.addPage(); y = 20; }
                const line = columns(item);
                doc.text(line, 10, y);
                y += 6;
            });
            y += 10;
        }
    };

    // Helper para filtrar por data (se modo semanal)
    const filtrarPorData = (lista) => {
        if (periodo === 'todos') return lista;
        const dataLimite = new Date();
        if (periodo === '7dias') dataLimite.setDate(dataLimite.getDate() - 7);
        if (periodo === '30dias') dataLimite.setDate(dataLimite.getDate() - 30);
        dataLimite.setHours(0, 0, 0, 0);

        return lista.filter(item => {
            const dataStr = (item.dadosGerencia && item.dadosGerencia.data) ? item.dadosGerencia.data : item.dataEntrevista;
            if (!dataStr) return false;
            const dataItem = new Date(dataStr.includes('T') ? dataStr : dataStr + 'T00:00:00');
            return dataItem >= dataLimite;
        });
    };

    // 1. Reprovados Triagem
    let reprovadosTriagem = entrevistas.filter(e => e.status === 'reprovado');
    if (modo === 'pendentes') reprovadosTriagem = reprovadosTriagem.filter(e => !e.feedbackEnviado);
    reprovadosTriagem = filtrarPorData(reprovadosTriagem);

    addSection(`1. ❌ REPROVADOS NA 1ª ETAPA (${reprovadosTriagem.length})`, reprovadosTriagem, (item) => {
        const feedback = item.feedbackEnviado ? '[Enviado]' : '[PENDENTE]';
        return `${formatarData(item.dataEntrevista)} | ${item.candidatoNome} (${item.cargoNome}) - ${feedback}`;
    });

    // 2. Fluxo Gerência
    let fluxoGerencia = entrevistas.filter(e => ['agendado_gerencia', 'contratado', 'reprovado_gerencia'].includes(e.status));
    if (modo === 'pendentes') {
        // Apenas mostrar quem precisa de feedback (Contratado ou Reprovado na Gerência)
        fluxoGerencia = fluxoGerencia.filter(e => !e.feedbackEnviado && e.status !== 'agendado_gerencia');
    }
    fluxoGerencia = filtrarPorData(fluxoGerencia);

    addSection(`2. 👔 FLUXO DE GERÊNCIA (${fluxoGerencia.length})`, fluxoGerencia, (item) => {
        const gerente = item.dadosGerencia ? item.dadosGerencia.gerente : 'N/A';
        const status = item.status === 'agendado_gerencia' ? 'Agendado' : (item.status === 'contratado' ? 'Contratado' : 'Reprovado');
        const feedback = item.feedbackEnviado ? '[Enviado]' : '[PENDENTE]';

        if (item.status === 'agendado_gerencia') return `${formatarData(item.dadosGerencia?.data || item.dataEntrevista)} | ${item.candidatoNome} - Gerente: ${gerente} (Aguardando)`;
        return `${formatarData(item.dadosGerencia?.data || item.dataEntrevista)} | ${item.candidatoNome} - ${status} - ${feedback}`;
    });

    // 3. Reprovados Gerência (Destaque específico)
    let reprovadosGerencia = entrevistas.filter(e => e.status === 'reprovado_gerencia');
    if (modo === 'pendentes') reprovadosGerencia = reprovadosGerencia.filter(e => !e.feedbackEnviado);
    reprovadosGerencia = filtrarPorData(reprovadosGerencia);

    addSection(`3. ❌ REPROVADOS NA GERÊNCIA (${reprovadosGerencia.length})`, reprovadosGerencia, (item) => {
        const gerente = item.dadosGerencia ? item.dadosGerencia.gerente : 'N/A';
        const feedback = item.feedbackEnviado ? '[Enviado]' : '[PENDENTE]';
        return `${formatarData(item.dataFinalizacao || item.dataEntrevista)} | ${item.candidatoNome} - Gerente: ${gerente} - ${feedback}`;
    });

    // 4. Faltou (Nova Seção)
    let faltouLista = entrevistas.filter(e => e.status === 'faltou');
    if (modo === 'pendentes') faltouLista = faltouLista.filter(e => !e.feedbackEnviado);
    faltouLista = filtrarPorData(faltouLista);

    addSection(`4. 🚫 CANDIDATOS QUE FALTARAM (${faltouLista.length})`, faltouLista, (item) => {
        const feedback = item.feedbackEnviado ? '[Enviado]' : '[PENDENTE]';
        return `${formatarData(item.dataEntrevista)} | ${item.candidatoNome} (${item.cargoNome}) - ${feedback}`;
    });

    doc.save(`Relatorio_Feedback_${modo}_${new Date().toISOString().split('T')[0]}.pdf`);
    mostrarMensagem('✅ Relatório gerado com sucesso!', 'success');
}

// Helper para Drag and Drop
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.pergunta-editor-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- Sistema de Login Simples (Cortina de Proteção) ---
function verificarAcesso() {
    // Verifica se já está autenticado na sessão atual do navegador
    if (sessionStorage.getItem('autenticado') === 'true') {
        return;
    }

    // Cria a cortina de bloqueio visual
    const cortina = document.createElement('div');
    cortina.id = 'cortinaLogin';
    cortina.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: #f4f4f9; z-index: 10000; display: flex;
        justify-content: center; align-items: center; font-family: Arial, sans-serif;
    `;

    // Conteúdo do cartão de login
    cortina.innerHTML = `
        <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 350px; width: 90%;">
            <div style="font-size: 40px; margin-bottom: 15px;">🔒</div>
            <h2 style="color: #6a0dad; margin-top: 0; margin-bottom: 10px;">Acesso Restrito</h2>
            <p style="color: #666; margin-bottom: 25px; font-size: 14px;">Este sistema é protegido. Por favor, identifique-se.</p>
            
            <input type="password" id="inputSenhaLogin" placeholder="Digite a senha..." style="
                width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; 
                border-radius: 6px; box-sizing: border-box; font-size: 16px; outline: none;
                transition: border 0.3s;">
            
            <button id="btnEntrarLogin" style="
                width: 100%; padding: 12px; background: #6a0dad; color: white; border: none; 
                border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 16px;
                transition: background 0.3s;">ENTRAR</button>
            
            <p id="msgErroLogin" style="color: #dc3545; margin-top: 15px; display: none; font-size: 14px; font-weight: bold;">Senha incorreta!</p>
        </div>
    `;

    document.body.appendChild(cortina);
    document.body.style.overflow = 'hidden'; // Impede rolagem da página de fundo

    // Foco no input
    setTimeout(() => document.getElementById('inputSenhaLogin').focus(), 100);

    // --- CONFIGURAÇÃO DA SENHA ---
    // Hash SHA-256 para a senha: "Rebeca2708"
    const HASH_SENHA_CORRETA = "5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5";

    const tentarLogin = async () => {
        const input = document.getElementById('inputSenhaLogin');
        const senha = input.value;
        const msgErro = document.getElementById('msgErroLogin');
        const btn = document.getElementById('btnEntrarLogin');

        if (!senha) return;

        btn.textContent = 'Verificando...';
        btn.style.opacity = '0.7';

        try {
            const msgBuffer = new TextEncoder().encode(senha);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            if (hashHex === HASH_SENHA_CORRETA) {
                sessionStorage.setItem('autenticado', 'true');
                cortina.style.opacity = '0';
                setTimeout(() => { cortina.remove(); document.body.style.overflow = 'auto'; }, 500);
            } else {
                throw new Error('Senha incorreta');
            }
        } catch (e) {
            // Fallback simples para ambiente local se crypto falhar
            if (senha === 'Rebeca2708') {
                sessionStorage.setItem('autenticado', 'true');
                cortina.style.opacity = '0';
                setTimeout(() => { cortina.remove(); document.body.style.overflow = 'auto'; }, 500);
            } else {
                msgErro.style.display = 'block';
                btn.textContent = 'ENTRAR';
                btn.style.opacity = '1';
                input.value = '';
                input.focus();
            }
        }
    };

    document.getElementById('btnEntrarLogin').addEventListener('click', tentarLogin);
    document.getElementById('inputSenhaLogin').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') tentarLogin();
    });
}