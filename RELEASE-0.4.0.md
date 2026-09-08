# Vértice 0.4.0 — interface, navegação e comunicação

Entrega baseada no ZIP `vertice-0.3.0-admin-layout-performance.zip`. A arquitetura continua React + Vite, Node 24+ e SQLite. Não foi feita publicação em um serviço externo.

## O que mudou

- Interface grafite com ações em coral, hierarquia visual consistente, contraste de foco, área de composição maior e painéis reorganizados. Fundo contínuo animado removido; efeitos de clique curtos respeitam redução de movimento.
- Até 760 px, servidores/canais viram um menu recolhível com fundo de fechamento e área principal inativa enquanto aberto. A lista de membros passa a abrir por cima da conversa em telas menores; corrigido o comportamento anterior que simplesmente a escondia.
- Modo TV disponível no botão `?`: controles maiores, setas para navegação espacial, Tab/Shift+Tab, foco destacado. A preferência fica neste navegador. Controle com mapeamento padrão: direcional/analógico navega, A ativa e B envia Escape. O loop só roda com controle conectado e pausa o processamento com aba oculta.
- Busca no histórico do canal ou DM atual, com atraso de 350 ms para evitar consulta por tecla, pesquisa literal por texto/nome de anexo, até 50 resultados recentes e validação de acesso no servidor. É possível responder a um resultado de canal.
- `@` abre sugestões de membros. As menções usam identificadores públicos estáveis, são renderizadas como texto seguro e destacam mensagens dirigidas a você. Respostas, reações, edição, exclusão e fixação existentes permanecem.
- Contador de novas mensagens enquanto você está lendo acima, botão para voltar ao final, aviso de menção e avisos de operação. Perfil, presença e status existentes permanecem.
- Controles de entrar/sair, mute/deafen e reconectar disponíveis também no palco de voz. Estados de conexão por participante ficam mais claros; a barra da sala mostra reconexão de peers. Mantido indicador de quem fala.
- Transmissão bloqueia cliques concorrentes enquanto o seletor está aberto, mostra estado de preparação e cancelamento, cancela captura que termina depois de sair da chamada e preserva a separação entre microfone e tela.
- Qualidade selecionada define o teto. A cada quatro segundos, estatísticas WebRTC ajustam o bitrate por participante, reduzindo-o com pouco orçamento de rede e recuperando gradualmente. Limites existentes por quantidade de participantes continuam aplicados. Resolução de envio reduzida em orçamentos baixos.
- Painel de transmissões pode ser recolhido sem desmontar áudio/vídeo, ampliado ou colocado em fullscreen. Recolher mantém a transmissão ativa; use Parar transmissão para encerrar a captura.
- Consulta de comunidade evita sobreposição ao retornar à aba. Requisições de comunidade têm tempo limite de 15 segundos. Nenhuma dependência nova de produção.

## Atalhos

| Ação | Atalho |
| --- | --- |
| Busca da conversa | Ctrl/Cmd+K |
| Mute do microfone | Ctrl/Cmd+Shift+M |
| Deafen | Ctrl/Cmd+Shift+D |
| Enviar / quebrar linha | Enter / Shift+Enter |
| Fechar / cancelar resposta | Escape |
| Foco seguinte / anterior | Tab / Shift+Tab |

Atalhos podem ser interceptados pelo navegador ou sistema. Setas conservam a função nativa dentro de campos e seletores.

## Atualizar e executar

1. Faça backup do diretório persistente configurado em `DATA_DIR`, incluindo SQLite e uploads.
2. Substitua somente o código. Preserve volume, variáveis de ambiente e credenciais TURN. Não substitua seus dados pelo diretório vazio de outro ambiente.
3. Com Node 24 ou superior: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm start`.
4. Desenvolvimento: execute `pnpm start` para a API na porta 8080 e `pnpm dev` para a interface com proxy para essa API.
5. Todos devem sair das chamadas antigas e recarregar o site após a atualização.

Não há nova migração de banco na 0.4.0. As migrações e o backup automático anteriores permanecem. O ZIP não contém `node_modules`, `dist`, bancos, uploads de teste ou credenciais.

## Validação realizada

- Node 24.19.0; checagem TypeScript sem erros.
- Build Vite concluído. Bundle principal aproximadamente 374 KB (118 KB gzip); CSS 188 KB (33 KB gzip).
- 12 testes passaram: servidor/sinalização, comunidades, uploads e acesso aos anexos, DMs, respostas/reações/fixação, hierarquia administrativa, migração/rollback, associação de faixas de áudio/tela, fallback de saída, privacidade da busca e orçamento adaptativo.
- Os testes WebRTC usam objetos simulados. Não equivalem a chamada real em duas redes.
- Não foram feitos testes visuais interativos, com controle físico, em celulares/consoles/TVs reais ou testes de carga. A compilação não certifica compatibilidade nesses dispositivos.

## Limitações e comportamento esperado

- Console/TV tem suporte de interface e navegação quando o navegador expõe teclado/Gamepad API. Não é aplicativo nativo de console. O controle deve ter mapeamento `standard`; texto depende do teclado do dispositivo. A ativação programática de A pode não satisfazer a exigência de gesto confiável para fullscreen/captura em certos navegadores.
- Captura de tela precisa de contexto seguro e autorização no seletor nativo. Disponibilidade e áudio de sistema variam por navegador/dispositivo. Há mensagens de indisponibilidade; não se promete captura em todos os celulares/consoles. Referência: [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).
- Referência de controles: [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API). Não há teclado virtual próprio nem remapeamento de controles não padrão.
- A sala ainda exige acesso ao microfone para entrar, inclusive para assistir à transmissão. Não foi criado modo de espectador sem microfone, câmera independente, SFU, gravação ou transmissão pública.
- A rede continua mesh: cada par mantém conexão própria. Mais participantes consomem mais upload. TURN corretamente configurado continua necessário em redes restritas. O indicador de Mbps mostra teto de envio, não velocidade medida nem garantia de resolução/FPS. Estatísticas indisponíveis usam recuperação gradual e limites por tamanho da sala.
- Reconexão de peers e tentativas de consulta existentes permanecem. Depois de expirar a sessão ou esgotar tentativas, é necessário entrar novamente. Mute/deafen permanece local; não foi criada moderação remota do microfone.
- Avisos e contagem cobrem a conversa atualmente carregada, com a página aberta. Não há push de sistema, caixa global de notificações, contador persistente por canal ou sincronização entre dispositivos. Só menções inseridas com o seletor `@` possuem identidade estável; texto antigo `@nome` não é convertido.
- Busca é limitada à conversa atual e aos 50 resultados mais recentes; refine o termo para reduzir resultados. SQLite `lower()` não oferece normalização completa de acentos/maiúsculas Unicode; não há busca aproximada. Resposta e fixação continuam restritas a canais, conforme a versão anterior.
- Uma falha de rede após envio pode deixar o resultado da operação incerto: consulte o histórico antes de reenviar. Não foi alterado o sistema de identidade por chave nem a semântica de logout.
