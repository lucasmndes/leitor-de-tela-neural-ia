# Leitor GPT — versão 1.4.1

## Atualizar uma instalação existente

1. Feche o painel do Leitor GPT.
2. Extraia o ZIP e copie o conteúdo da pasta `leitor-gpt` para a pasta instalada, substituindo os arquivos. O arquivo `manifest.json` precisa estar diretamente nessa pasta; evite criar uma pasta `leitor-gpt` dentro de outra.
3. No Chrome, abra `chrome://extensions` e clique em **Recarregar** no cartão Leitor GPT.
4. Atualize a página que deseja ouvir e selecione o texto novamente.
5. Abra o painel. Se necessário, use o botão de configurações no topo para guardar novamente sua chave.

## Instalar pela primeira vez

Extraia o ZIP para uma pasta permanente. Em `chrome://extensions`, ative **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`. Fixe o Leitor GPT pelo menu de extensões do Chrome.

Não é necessário instalar programas adicionais nem executar um servidor.

## Ouvir e acompanhar

- **Seleção:** selecione texto no site, clique com o botão direito e escolha **Ler seleção com Leitor GPT**. Também é possível usar o botão **Seleção** no painel, depois de clicar no ícone da extensão nessa aba.
- **Página inteira:** clique no ícone da extensão na aba desejada e depois em **Página inteira**. Confira a prévia.
- Clique em **Ler em voz alta**. O primeiro áudio é preparado para começar. O seguinte é preparado automaticamente perto da transição, enquanto você ouve; não é preciso clicar a cada trecho.
- Use **Pausar / Continuar**, **Parar** e o controle de ritmo. Os controles ficam visíveis na base do painel. O conteúdo acima deles pode ser rolado.
- Com **Seguir e destacar na página** marcado, a frase atual recebe destaque e a página rola quando necessário. O painel também destaca a frase.

O acompanhamento por frases é uma estimativa baseada na duração do áudio e no tamanho do texto. Não há marcação exata por palavra. Em redes lentas ou diante de erros da API, ainda pode haver interrupções. Pequenas pausas naturais da voz permanecem.

## Configurar a API

Obtenha uma chave em https://platform.openai.com/api-keys e configure o acesso pago à API. O modelo `gpt-4o-mini-tts` não está disponível no Free tier da API. A cobrança da API é separada de planos do ChatGPT.

Abra o botão de configurações no canto superior direito, insira a chave e clique em **Guardar chave**. Ela fica somente no armazenamento de sessão da extensão, sem sincronização e sem acesso pelos scripts dos sites. Use **Esquecer** para removê-la. Encerrar completamente o Chrome também encerra essa sessão; processos em segundo plano podem mantê-la ativa.

Não compartilhe sua chave em conversas e não coloque chaves no código. Nenhuma chave foi incluída neste pacote.

## Vozes

Ember não está disponível na API pública de fala. A extensão oferece as vozes próprias da API: Cedar, Marin, Alloy, Ash, Ballad, Coral, Echo, Fable, Onyx, Nova, Sage, Shimmer e Verse. Nenhuma é apresentada como equivalente à Ember.

## Dados, custos e compatibilidade

O áudio é sintético e gerado online pela OpenAI. A captura e a prévia são locais; o envio começa somente ao clicar em Ler. A extensão solicita apenas a API da OpenAI, sem servidor intermediário ou telemetria.

A fila mantém no máximo o áudio atual e o próximo. A antecipação considera o tempo observado de geração e o ritmo escolhido. Não é necessário clicar de novo para continuar o texto. Uma chamada em andamento pode terminar durante uma pausa. Parar aborta chamadas em andamento, mas não desfaz processamento ou cobrança já ocorridos.

Áudios completos são guardados em IndexedDB neste computador, com limite de 64 MB e 200 itens. Eles podem ser reutilizados por 7 dias; itens vencidos são removidos ao usar a extensão. Repetir o mesmo texto, chave e voz reaproveita o áudio sem nova chamada à API, enquanto ele permanecer no cache. A chave e o texto original não são gravados no banco: o índice é um hash, e o arquivo de áudio é armazenado localmente. A própria fala contém o conteúdo lido. Trocar a velocidade não exige nova geração.

Use **Configurações → Limpar áudios salvos** para apagar o cache. **Esquecer** também limpa esses áudios. Apagar a extensão remove seu armazenamento. O cache de áudio permanece ao fechar o painel ou reiniciar o Chrome; a chave continua sendo guardada apenas na sessão. Não há estimativa fictícia de tokens: o painel mostra áudios novos e reutilizados. O primeiro áudio de um conteúdo novo ainda tem o custo normal da API.

A leitura da página inclui texto renderizado abaixo da área visível, em ordem visual aproximada de cima para baixo e da esquerda para a direita. Colunas e layouts complexos podem exigir seleção manual. Conteúdo ainda não carregado por rolagem infinita não é incluído.

Não lê outros aplicativos, imagens/OCR, PDFs no visualizador do Chrome, páginas internas ou protegidas do navegador, campos de formulário ou shadow DOM. O menu de contexto pode fornecer texto de alguns quadros incorporados; o destaque só funciona se o Chrome permitir acesso ao quadro. Em páginas que bloqueiam a captura de posições, a leitura continua com acompanhamento apenas no painel, e essa limitação é informada.

Se a página navegar, alterar o texto ou perder o acesso temporário, carregue a seleção novamente. Fechar o painel encerra o áudio.

## Identidade visual e codificação

A interface usa os tokens e componentes do **Sistema Modular Vivo v1.0** fornecido pelo usuário, com **acento Floresta**. A **densidade média** foi aplicada à composição geométrica na abertura, preservando o espaço de leitura. A densidade do design system descreve os elementos gráficos, não apenas o espaçamento dos controles.

O ícone pessoal combina páginas/folhas, uma linha de leitura e um ponto laranja. O arquivo vetorial editável fica em `icons/mark.svg`; versões PNG de 16, 32, 48, 128 e 256 pixels acompanham o pacote.

Manifesto, HTML, CSS e JavaScript estão em UTF-8. Os textos do cartão de extensão e do painel foram corrigidos. A extensão continua sendo instalada localmente; não foi publicada na Chrome Web Store.

## Verificação da versão 1.4.1

- Orientação visual: configurações piscando antes da chave, pausa durante a leitura e parar quando a leitura está pausada. A pulsação é animada e mantém os botões dentro da largura do painel.
- Testes do cache: repetição e reabertura sem novas chamadas, mudança de voz, expiração, limite, remoção, cancelamento e deduplicação.
- Testes da fila: agrupamento sem perda de texto; limite de preparação; agendamento contínuo; pausa/retomada; mudança de velocidade; cancelamento; leitura até o fim.
- Testes de página no Chrome: frases com elementos inline, seleção, recuperação pelo texto do menu, destaque de intervalos, rolagem e descarte de posições antigas.
- Testes da interface no Chrome: reprodução Web Audio com áudio de teste, conclusão em 100%, configurações, pausa e layout estreito.
- Validação da sintaxe, codificação UTF-8, ícones e arquivos referenciados no manifesto.

Esses testes usam áudio local e respostas simuladas. Não houve chamada paga nem uso de chave pessoal durante o desenvolvimento desta versão. A qualidade da voz e a latência real dependem da API e da conexão.

## Referências

- https://developers.openai.com/api/docs/guides/text-to-speech
- https://developers.openai.com/api/docs/models/gpt-4o-mini-tts
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
