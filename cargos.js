// Base de dados de cargos e suas perguntas
const cargos = [
    {
        id: 'operacional',
        nome: 'Assistente de Loja / Atendente Vendas',
        categoria: 'Operacional',
        salario: 'R$ 1.600,00 + VT + benefícios',
        horario: 'Seg a Sex: 09h às 18h | Sáb: 09h às 14h (Exceto Mercadão: 09h às 18h)',
        duracao: '30-45 minutos',
        beneficios: ['VT', 'Ifood Benefícios', 'Plano de Saúde'],
        perguntas: [
            {
                categoria: 'Abertura e Apresentação',
                texto: 'Para começarmos, você poderia me contar um pouco sobre você e o que te motivou a se candidatar para esta posição?'
            },
            {
                categoria: 'Requisitos Básicos',
                texto: 'Atualmente, em qual bairro você reside? (Bras de Pina, Madureira ou Campo Grande?)'
            },
            {
                categoria: 'Requisitos Básicos',
                texto: 'O salário base de R$ 1.600,00 + VT + benefícios do Ifood e Plano de Saúde está dentro da sua expectativa?'
            },
            {
                categoria: 'Atendimento ao Cliente',
                texto: 'Em seu emprego anterior, conte-me sobre uma situação em que você precisou lidar com um cliente difícil ou insatisfeito. O que aconteceu e qual foi o resultado?'
            },
            {
                categoria: 'Atendimento ao Cliente',
                texto: 'Como você convenceria um cliente que está apenas "dando uma olhada" a realizar uma compra?'
            },
            {
                categoria: 'Operações de Caixa',
                texto: 'Você já teve experiência com sistema PDV (Frente de Caixa) ou máquina de cartão? Em caso positivo, qual sistema?'
            },
            {
                categoria: 'Operações de Caixa',
                texto: 'Me fale sobre um dia em que você estava muito ocupado no caixa. Como você manteve a calma, a organização e a precisão no fechamento?'
            },
            {
                categoria: 'Organização e Estoque',
                texto: 'Descreva uma vez em que você identificou que um produto estava em falta ou perto do vencimento. O que você fez?'
            },
            {
                categoria: 'Trabalho em Equipe',
                texto: 'Em um ambiente de loja, é comum todos ajudarem em todas as tarefas. Como você se sente em ter que, por exemplo, interromper a reposição para atender um cliente no caixa ou ajudar na limpeza do ambiente?'
            },
            {
                categoria: 'Resiliência e Rotina',
                texto: 'A vaga exige ficar a maior parte do tempo em pé e lidar com picos de movimento. Como você lida com essa rotina fisicamente desgastante?'
            },
            {
                categoria: 'Proatividade',
                texto: 'Dê um exemplo de algo que você fez, sem que ninguém pedisse, para melhorar a organização da loja ou a experiência do cliente em seu emprego anterior.'
            },
            {
                categoria: 'Expectativas',
                texto: 'O que te atrai em trabalhar na nossa empresa?'
            },
            {
                categoria: 'Expectativas',
                texto: 'Na descrição da vaga, falamos sobre oportunidades de crescimento. Onde você se vê daqui a 2 ou 3 anos?'
            },
            {
                categoria: 'Logística',
                texto: 'Você tem alguma restrição para trabalhar aos sábados?'
            }
        ],
        competencias: [
            { nome: 'Atendimento ao Cliente', peso: 25 },
            { nome: 'Operações de Caixa', peso: 20 },
            { nome: 'Organização e Estoque', peso: 20 },
            { nome: 'Trabalho em Equipe', peso: 20 },
            { nome: 'Proatividade', peso: 15 }
        ]
    },
    {
        id: 'gerente-loja',
        nome: 'Gerente de Loja',
        categoria: 'Gerencial',
        salario: 'R$ 2.800,00 + VT + benefícios',
        horario: 'Seg a Sex: 09h às 18h | Sáb: 09h às 14h (Exceto Mercadão: 09h às 18h)',
        duracao: '60-75 minutos',
        beneficios: ['VT', 'Ifood Benefícios (R$20/dia)', 'Plano de Saúde'],
        perguntas: [
            {
                categoria: 'Experiência Técnica',
                texto: 'Conte-nos sobre sua experiência anterior em cargos de supervisão ou vendas no varejo, especialmente com produtos perecíveis ou descartáveis.'
            },
            {
                categoria: 'Experiência Técnica',
                texto: 'Qual é o seu conhecimento em gestão de estoque para produtos com prazos de validade curtos? Como você controla e evita desperdícios?'
            },
            {
                categoria: 'Experiência Técnica',
                texto: 'Quais sistemas de PDV e controle de estoque você já utilizou? Pode nos dar um exemplo de como usou esses sistemas no dia a dia?'
            },
            {
                categoria: 'Experiência Técnica',
                texto: 'Como você organiza a rotina de reposição e exposição de produtos para maximizar as vendas e minimizar perdas?'
            },
            {
                categoria: 'Liderança',
                texto: 'Conte-nos sobre uma situação em que você precisou motivar uma equipe para bater uma meta desafiadora. O que você fez e qual foi o resultado?'
            },
            {
                categoria: 'Liderança',
                texto: 'Como você lida com um funcionário que consistentemente não atinge suas metas de vendas?'
            },
            {
                categoria: 'Gestão de Conflitos',
                texto: 'Dê um exemplo de um conflito dentro da equipe que você mediou. Quais foram seus passos para resolvê-lo?'
            },
            {
                categoria: 'Gestão de Equipe',
                texto: 'Como você garante que todos os membros da equipe estejam alinhados com os padrões de atendimento ao cliente?'
            },
            {
                categoria: 'Resolução de Problemas',
                texto: 'Suponha que um lote importante de um produto perecível está perto do vencimento. Quais ações você tomaria para evitar a perda?'
            },
            {
                categoria: 'Resolução de Problemas',
                texto: 'Um cliente reclama que um produto fresco (ex: pão, legumes) na gôndola não está com a qualidade esperada. Como você e sua equipe lidariam com isso?'
            },
            {
                categoria: 'Análise e Planejamento',
                texto: 'As vendas de um produto descartável que sempre foi um carro-chefe caíram 15% no último mês. Qual seria o seu plano de ação?'
            },
            {
                categoria: 'Logística',
                texto: 'Confirmar disponibilidade para o horário de trabalho (Segunda a Sábado)'
            },
            {
                categoria: 'Expectativas',
                texto: 'O que te atrai em trabalhar na nossa empresa?'
            },
            {
                categoria: 'Expectativas',
                texto: 'Onde você se vê daqui a 2 ou 3 anos na empresa?'
            }
        ],
        competencias: [
            { nome: 'Liderança', peso: 25 },
            { nome: 'Gestão de Equipe', peso: 20 },
            { nome: 'Conhecimento Técnico', peso: 20 },
            { nome: 'Resolução de Problemas', peso: 20 },
            { nome: 'Planejamento Estratégico', peso: 15 }
        ]
    },
    {
        id: 'auxiliar-producao',
        nome: 'Auxiliar de Produção',
        categoria: 'Operacional',
        salario: 'R$ 1.600,00 + VT + benefícios',
        horario: 'Seg a Sex: 09h às 18h | Sáb: 09h às 14h (Exceto Mercadão: 09h às 18h)',
        duracao: '30-45 minutos',
        beneficios: ['VT', 'Ifood Benefícios', 'Plano de Saúde'],
        perguntas: [
            {
                categoria: 'Abertura',
                texto: 'Conte um pouco sobre sua trajetória profissional e o que te motiva a trabalhar em produção.'
            },
            {
                categoria: 'Experiência',
                texto: 'Você já trabalhou em ambiente industrial ou de produção? Descreva suas responsabilidades.'
            },
            {
                categoria: 'Segurança',
                texto: 'Qual sua experiência com procedimentos de segurança no trabalho e EPIs?'
            },
            {
                categoria: 'Organização',
                texto: 'Como você lida com a necessidade de seguir procedimentos operacionais rigorosos?'
            },
            {
                categoria: 'Trabalho em Equipe',
                texto: 'Como você contribui para um ambiente de trabalho colaborativo?'
            },
            {
                categoria: 'Proatividade',
                texto: 'Dê um exemplo de quando você identificou uma oportunidade de melhoria no processo.'
            },
            {
                categoria: 'Resistência',
                texto: 'Como você lida com tarefas repetitivas ou fisicamente exigentes?'
            },
            {
                categoria: 'Qualidade',
                texto: 'O que você faz quando identifica um produto fora dos padrões de qualidade?'
            }
        ],
        competencias: [
            { nome: 'Segurança', peso: 25 },
            { nome: 'Qualidade', peso: 20 },
            { nome: 'Produtividade', peso: 20 },
            { nome: 'Trabalho em Equipe', peso: 20 },
            { nome: 'Proatividade', peso: 15 }
        ]
    }
];

// Competências padrão para avaliação
const competenciasPadrao = [
    { nome: 'Comunicação', descricao: 'Clareza e eficácia na comunicação' },
    { nome: 'Proatividade', descricao: 'Iniciativa e antecipação de necessidades' },
    { nome: 'Trabalho em Equipe', descricao: 'Colaboração e relacionamento interpessoal' },
    { nome: 'Resolução de Problemas', descricao: 'Capacidade de analisar e resolver situações' },
    { nome: 'Adaptabilidade', descricao: 'Flexibilidade frente a mudanças' },
    { nome: 'Organização', descricao: 'Planejamento e organização do trabalho' },
    { nome: 'Comprometimento', descricao: 'Dedicação e responsabilidade' }
];