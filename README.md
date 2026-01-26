# 📋 Sistema de Entrevistas - Varejo

Este é um sistema robusto e intuitivo desenvolvido para otimizar o processo de recrutamento e seleção, especificamente adaptado para o setor de varejo (Princesinha Festas). O sistema permite desde o agendamento inicial até a análise final de competências com o auxílio de Inteligência Artificial.

## 🚀 Funcionalidades principais

-   **🎯 Nova Entrevista:** Fluxo completo para iniciar entrevistas, com cronômetro integrado e perguntas específicas por cargo.
-   **📅 Painel do Dia:** Visualização rápida de todas as entrevistas agendadas para a data atual, facilitando a organização do recrutador.
-   **📅 Agenda:** Gerenciamento de entrevistas de triagem e entrevistas com a gerência.
-   **📊 Histórico:** Banco de dados de todas as entrevistas realizadas, com filtros avançados por nome, cargo, data e status.
-   **📄 Relatórios PDF:** Geração automática de relatórios detalhados em PDF para compartilhamento com gestores.
-   **📈 Estatísticas:** Dashboard com funil de conversão e gráficos de distribuição por cargo e volume mensal.
-   **⚙️ Configurações:** Gestão de cargos, perguntas e integração com APIs.
-   **🤖 Inteligência Artificial:** Integração com o Google Gemini para gerar análises automáticas e pareceres profissionais baseados nas respostas dos candidatos.

## 📂 Estrutura de Arquivos

-   `index.html`: Estrutura principal da aplicação e interface do usuário.
-   `style.css`: Estilização completa, incluindo suporte a **Modo Escuro**.
-   `script.js`: Lógica de negócio, manipulação de dados, integração com APIs e geração de PDFs.
-   `cargos.js`: Definição dos cargos, perguntas padrão e competências avaliadas.

## 🛠️ Configuração Inicial

Para que todas as funcionalidades funcionem corretamente, siga estes passos:

1.  **Google Sheets (Nuvem):**
    -   Configure um script no Google Apps Script para receber os dados.
    -   Cole a URL gerada na variável `GOOGLE_SCRIPT_URL` no topo do arquivo `script.js`.

2.  **Inteligência Artificial (Gemini):**
    -   Obtenha uma chave de API gratuita no [Google AI Studio](https://aistudio.google.com/app/apikey).
    -   No sistema, vá em **Configurações** e salve sua chave no campo correspondente.

3.  **Acesso Restrito:**
    -   O sistema possui uma tela de login simples. A senha padrão configurada é `Rebeca2708`.

## 💻 Como usar

Basta abrir o arquivo `index.html` em qualquer navegador moderno. O sistema utiliza `localStorage` para persistência local dos dados e sincroniza com a nuvem quando configurado.

---
*Desenvolvido para facilitar a vida do RH e garantir as melhores contratações.*
