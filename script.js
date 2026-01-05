// Sistema de Entrevistas - Script Principal
let entrevistas = JSON.parse(localStorage.getItem('entrevistas')) || [];
let cargoSelecionado = null;
let entrevistaAtual = null;
let ultimoItemExcluido = null;
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbziYqw4CANDC_waumX9zffeuNg2PbB3wJ_y5dI3YTN-2-tjXEBdrD922jUVQvzRfecjdw/exec'; // ⚠️ COLE A URL DO SEU SCRIPT DO GOOGLE AQUI (PASSO 9)

// Inicialização do sistema
document.addEventListener('DOMContentLoaded', function() {
    inicializarSistema();
    carregarDados();
    configurarEventos();
    verificarRascunho();
    inicializarTema();
});

function inicializarSistema() {
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
}

function carregarDados() {
    // Carregar estatísticas
    atualizarEstatisticas();
    
    // Carregar histórico
    carregarHistoricoEntrevistas();
    
    // Atualizar select de relatório
    atualizarSelectRelatorio();
}

function configurarEventos() {
    // Evento de seleção de cargo
    document.getElementById('cargo').addEventListener('change', function() {
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
    document.getElementById('formEntrevista').addEventListener('submit', function(e) {
        e.preventDefault();
        if (cargoSelecionado) {
            iniciarEntrevista();
        } else {
            alert('Por favor, selecione um cargo primeiro.');
        }
    });
    
    // Auto-save: Monitorar mudanças no formulário
    document.getElementById('formEntrevista').addEventListener('input', salvarRascunhoAutomatico);
    document.getElementById('perguntasContainer').addEventListener('input', salvarRascunhoAutomatico);
    document.getElementById('avaliacaoContainer').addEventListener('click', salvarRascunhoAutomatico); // Para cliques nos botões
    
    // Busca no histórico
    document.getElementById('buscarEntrevista').addEventListener('input', function() {
        carregarHistoricoEntrevistas(this.value);
    });
    
    // Filtros avançados
    ['filtroStatus', 'filtroCargoHistorico', 'filtroDataInicio', 'filtroDataFim'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => carregarHistoricoEntrevistas(document.getElementById('buscarEntrevista').value));
    });

    // Toggle Dark Mode
    document.getElementById('toggleDarkMode').addEventListener('click', alternarTema);
    
    // Seleção de entrevista para relatório
    document.getElementById('selecionarEntrevistaRelatorio').addEventListener('change', function() {
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
}

function configurarAbas() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Remover active de todas as abas
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Adicionar active na aba clicada
            this.classList.add('active');
            document.getElementById(`tab-${this.dataset.tab}`).classList.add('active');
            
            // Ações específicas por aba
            switch(this.dataset.tab) {
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
            }
        });
    });
}

function carregarCargosSelect() {
    const select = document.getElementById('cargo');
    select.innerHTML = '<option value="">Escolha um cargo...</option>';
    
    cargos.forEach(cargo => {
        const option = document.createElement('option');
        option.value = cargo.id;
        option.textContent = `${cargo.nome} (${cargo.categoria})`;
        select.appendChild(option);
    });
}

function carregarCargosFiltro() {
    const select = document.getElementById('filtroCargoHistorico');
    select.innerHTML = '<option value="">Todos os Cargos</option>';
    
    cargos.forEach(cargo => {
        const option = document.createElement('option');
        option.value = cargo.nome; // Usando nome para facilitar filtro
        option.textContent = cargo.nome;
        select.appendChild(option);
    });
}

function selecionarCargo(cargoId) {
    cargoSelecionado = cargos.find(c => c.id === cargoId);
    
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

function iniciarEntrevista() {
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
        dataRegistro: new Date().toISOString()
    };
    
    // Validar dados
    if (!dadosBasicos.candidatoNome || !dadosBasicos.entrevistador) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }
    
    // Criar objeto da entrevista
    entrevistaAtual = {
        id: `entrevista_${Date.now()}`,
        ...dadosBasicos,
        respostas: [],
        avaliacoes: {},
        pontosFortes: '',
        pontosMelhorar: '',
        observacoes: '',
        status: 'analise' // Status inicial ao começar a entrevista
    };
    
    // Alertar que entrevista começou
    alert(`Entrevista iniciada para ${dadosBasicos.candidatoNome} - ${cargoSelecionado.nome}`);
}

function salvarEntrevista() {
    if (!entrevistaAtual) {
        alert('Por favor, inicie uma entrevista primeiro.');
        return;
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
    
    // Coletar status
    const statusRadio = document.querySelector('input[name="status"]:checked');
    entrevistaAtual.status = statusRadio ? statusRadio.value : 'analise';
    
    // Salvar no banco de dados
    entrevistas.push(entrevistaAtual);
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
}

function limparFormulario() {
    document.getElementById('formEntrevista').reset();
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
function agendarGoogleCalendar() {
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

    const cargo = cargos.find(c => c.id === cargoId);
    
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
}

function salvarAgendamento() {
    const dadosBasicos = {
        candidatoNome: document.getElementById('candidatoNome').value,
        cargo: document.getElementById('cargo').value,
        dataEntrevista: document.getElementById('dataEntrevista').value,
        horaEntrevista: document.getElementById('horaEntrevista').value,
        vagaInhire: document.getElementById('vagaInhire').value,
        entrevistador: document.getElementById('entrevistador').value,
        localEntrevista: document.getElementById('localEntrevista').value,
        dataRegistro: new Date().toISOString()
    };

    if (!dadosBasicos.candidatoNome || !dadosBasicos.cargo || !dadosBasicos.dataEntrevista) {
        alert('Preencha os campos obrigatórios para salvar na agenda.');
        return;
    }

    const cargo = cargos.find(c => c.id === dadosBasicos.cargo);

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

// Agenda
function carregarAgenda() {
    const container = document.getElementById('agendaContainer');
    
    // Filtrar apenas agendados ou futuros (opcional: mostrar todos ordenados)
    // Vamos mostrar tudo ordenado por data
    const listaOrdenada = [...entrevistas].sort((a, b) => {
        const dataA = new Date(`${a.dataEntrevista}T${a.horaEntrevista || '00:00'}`);
        const dataB = new Date(`${b.dataEntrevista}T${b.horaEntrevista || '00:00'}`);
        return dataA - dataB;
    });

    if (listaOrdenada.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhuma entrevista agendada.</div>';
        return;
    }

    // Agrupar por dia
    const grupos = {};
    listaOrdenada.forEach(e => {
        const data = e.dataEntrevista;
        if (!grupos[data]) grupos[data] = [];
        grupos[data].push(e);
    });

    let html = '';
    Object.keys(grupos).sort().forEach(data => {
        const itens = grupos[data];
        html += `
            <div class="agenda-dia">
                <div class="agenda-data-titulo">${formatarData(data)}</div>
                ${itens.map((item, idx) => `
                    <div class="agenda-item">
                        <div><span class="agenda-hora">${item.horaEntrevista || '??:??'}</span> <strong>${item.candidatoNome}</strong> - ${item.cargoNome}</div>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-small btn-secondary" onclick="mostrarEdicaoAgendamento(${entrevistas.indexOf(item)})">✏️ Editar</button>
                            <button class="btn btn-small" onclick="editarEntrevista(${entrevistas.indexOf(item)})">▶️ Iniciar</button>
                            <button class="btn btn-small btn-danger" onclick="excluirEntrevista(${entrevistas.indexOf(item)})">🗑️ Excluir</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    });

    container.innerHTML = html;
}

function mostrarEdicaoAgendamento(index) {
    const entrevista = entrevistas[index];
    const container = document.getElementById('agendaContainer');
    
    // Gerar opções de cargo
    const cargoOptions = cargos.map(c => 
        `<option value="${c.id}" ${c.id === entrevista.cargo ? 'selected' : ''}>${c.nome}</option>`
    ).join('');

    container.innerHTML = `
        <div class="card-edicao" style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <h3 style="color: #6a0dad; margin-bottom: 20px; border-bottom: 2px solid #f0f0ff; padding-bottom: 10px;">
                ✏️ Editar Agendamento
            </h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="form-group">
                    <label style="display:block; margin-bottom:5px; font-weight:bold; color:#555;">Nome do Candidato</label>
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

function salvarEdicaoAgendamento(index) {
    const entrevista = entrevistas[index];
    const cargoId = document.getElementById('editCargo').value;
    const cargoObj = cargos.find(c => c.id === cargoId);

    entrevista.candidatoNome = document.getElementById('editNome').value;
    entrevista.cargo = cargoId;
    entrevista.cargoNome = cargoObj ? cargoObj.nome : entrevista.cargoNome;
    entrevista.dataEntrevista = document.getElementById('editData').value;
    entrevista.horaEntrevista = document.getElementById('editHora').value;
    entrevista.entrevistador = document.getElementById('editEntrevistador').value;
    entrevista.localEntrevista = document.getElementById('editLocal').value;
    entrevista.vagaInhire = document.getElementById('editVagaInhire').value;

    localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
    
    // Enviar atualização para o Google Sheets
    enviarParaGoogleSheets(entrevista);
    
    mostrarMensagem('✅ Agendamento atualizado!', 'success');
    carregarAgenda();
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
    entrevistasFiltradas.sort((a, b) => new Date(b.dataRegistro) - new Date(a.dataRegistro));
    
    if (entrevistasFiltradas.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhuma entrevista encontrada.</div>';
        return;
    }
    
    let html = '';
    entrevistasFiltradas.forEach((entrevista, index) => {
        const realIndex = entrevistas.indexOf(entrevista);
        const dataFormatada = formatarData(entrevista.dataEntrevista);
        const statusClass = `status-${entrevista.status}`;
        const statusText = {
            'aprovado': '✅ Aprovado',
            'reprovado': '❌ Reprovado',
            'analise': '⏳ Em análise',
            'faltou': '🚫 Faltou',
            'agendado': '📅 Agendado'
        }[entrevista.status] || entrevista.status;
        
        html += `
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
                    </div>
                    <div class="detalhe-item">
                        <div class="detalhe-label">Local</div>
                        <div class="detalhe-valor">${entrevista.localEntrevista || 'Não informado'}</div>
                    </div>
                </div>
                
                <div class="acoes-entrevista">
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
    });
    
    container.innerHTML = html;
}

function verDetalhesEntrevista(index) {
    const entrevista = entrevistas[index];
    let html = `
        <h3>${entrevista.candidatoNome} - ${entrevista.cargoNome}</h3>
        <div class="detalhes-grid">
            <div><strong>Data:</strong> ${formatarData(entrevista.dataEntrevista)}</div>
            <div><strong>Entrevistador:</strong> ${entrevista.entrevistador}</div>
            <div><strong>Status:</strong> ${entrevista.status}</div>
            <div><strong>Média da Avaliação:</strong> ${entrevista.mediaAvaliacao || 'N/A'}/5</div>
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
    
    // Definir como entrevista atual para permitir edição e salvamento direto
    entrevistaAtual = entrevista;

    // Preencher formulário com dados da entrevista
    document.getElementById('candidatoNome').value = entrevista.candidatoNome;
    document.getElementById('cargo').value = entrevista.cargo;
    document.getElementById('horaEntrevista').value = entrevista.horaEntrevista || '';
    document.getElementById('vagaInhire').value = entrevista.vagaInhire || '';
    
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
            
            // Preencher status
            document.querySelector(`input[name="status"][value="${entrevista.status}"]`).checked = true;
            
            // Remover entrevista do array (será readicionada ao salvar)
            entrevistas.splice(index, 1);
            localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
            
            // Atualizar histórico
            carregarHistoricoEntrevistas();
            
            // Ir para aba de entrevista
            document.querySelector('[data-tab="entrevista"]').click();
            
            mostrarMensagem('📝 Entrevista carregada para edição. Faça as alterações e salve novamente.', 'info');
        }, 500);
    }, 100);
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
        'aprovado': '✅ CANDIDATO APROVADO',
        'reprovado': '❌ CANDIDATO REPROVADO',
        'analise': '⏳ EM ANÁLISE',
        'faltou': '🚫 CANDIDATO FALTOU',
        'agendado': '📅 ENTREVISTA AGENDADA'
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
    
    container.innerHTML = html;
    container.classList.remove('hidden');
    
    // Habilitar botões
    document.getElementById('acoesRelatorio').querySelectorAll('button').forEach(btn => {
        btn.disabled = false;
    });
    
    // Salvar índice para uso no PDF
    container.dataset.index = index;
}

async function gerarPDF() {
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
    if (entrevista.status === 'aprovado') {
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
    
    mostrarMensagem('📄 PDF gerado com sucesso!', 'success');
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
    // Totais
    document.getElementById('totalEntrevistas').textContent = entrevistas.length;
    
    const aprovados = entrevistas.filter(e => e.status === 'aprovado').length;
    const reprovados = entrevistas.filter(e => e.status === 'reprovado').length;
    const faltou = entrevistas.filter(e => e.status === 'faltou').length;
    
    document.getElementById('totalAprovados').textContent = aprovados;
    document.getElementById('totalReprovados').textContent = reprovados;
    document.getElementById('totalFaltou').textContent = faltou;
    
    const taxa = entrevistas.length > 0 ? Math.round((aprovados / entrevistas.length) * 100) : 0;
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
    const contagem = {};
    entrevistas.forEach(entrevista => {
        contagem[entrevista.cargoNome] = (contagem[entrevista.cargoNome] || 0) + 1;
    });
    
    const cargos = Object.keys(contagem);
    const valores = Object.values(contagem);
    
    if (cargos.length === 0) {
        container.innerHTML = '<div class="no-data">Nenhuma entrevista para exibir</div>';
        return;
    }
    
    const maxValor = Math.max(...valores);
    
    let html = '';
    cargos.forEach((cargo, index) => {
        const altura = maxValor > 0 ? (valores[index] / maxValor) * 100 : 10;
        html += `
            <div class="chart-bar" style="height: ${altura}%;" title="${cargo}: ${valores[index]} entrevista(s)">
                <div class="chart-label">${cargo.split(' ')[0]}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function atualizarGraficoMensal() {
    const container = document.getElementById('chartMensal');
    if (!container) return;
    
    // Agrupar por mês (últimos 6 meses)
    const meses = {};
    const hoje = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
        meses[key] = 0;
    }
    
    entrevistas.forEach(entrevista => {
        const d = new Date(entrevista.dataEntrevista);
        const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
        if (meses.hasOwnProperty(key)) meses[key]++;
    });
    
    const labels = Object.keys(meses);
    const valores = Object.values(meses);
    const maxValor = Math.max(...valores, 1);
    
    let html = '';
    labels.forEach((label, index) => {
        const altura = (valores[index] / maxValor) * 100;
        html += `<div class="chart-bar" style="height: ${Math.max(altura, 5)}%;" title="${label}: ${valores[index]}"><div class="chart-label">${label.split('/')[0]}</div></div>`;
    });
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

// --- Backup e Tema ---
function exportarDados() {
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

function importarDados() {
    const input = document.getElementById('arquivoBackup');
    if (!input.files.length) {
        alert('Selecione um arquivo JSON primeiro.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const dadosImportados = JSON.parse(e.target.result);
            if (Array.isArray(dadosImportados)) {
                entrevistas = dadosImportados;
                localStorage.setItem('entrevistas', JSON.stringify(entrevistas));
                carregarDados();
                mostrarMensagem('📥 Dados restaurados com sucesso!', 'success');
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
    document.getElementById('btnConfirmarAcao').onclick = function() {
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
`;
document.head.appendChild(style);