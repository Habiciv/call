# VYRO Cast — Transmissões

Plataforma leve de transmissão de tela com tema violeta e azul-noite. Interface para computador e celular. Sem calls, câmera ou captura de microfone: o único áudio compartilhado é o da transmissão, quando o navegador oferece essa opção.

## O que mudou

- Interface VYRO Cast refeita, com navegação mobile entre Assistir, Chat e Estúdio.
- Entrada na sala sem permissão de microfone; captura de microfone também bloqueada pela política HTTP.
- Player com tela cheia nativa, saída por Esc e modo ampliado quando a Fullscreen API não está disponível.
- Modo cinema, seleção de uma transmissão e mini-player (Picture-in-Picture quando suportado).
- Áudio da transmissão com botão para ativar e controle de volume. Prévia local sempre silenciosa para evitar retorno.
- Chat sincronizado entre participantes, reações rápidas, limite de 500 caracteres e proteção contra envio em sequência.
- Histórico do chat: até 200 mensagens por sala armazenadas, 100 exibidas, retenção máxima de 24 horas. Não é um arquivo permanente.
- Salas criadas por link, nome local da sala e favoritos salvos neste navegador (até 20). O nome local não renomeia a sala nos dispositivos de outras pessoas.
- Lista de pessoas presentes e convites por link.
- Qualidade de envio salva neste navegador, ajuste durante a transmissão e painel com resolução, fps, bitrate e tempo de ida e volta medidos pelo WebRTC, quando disponíveis.
- Reconexão manual/automática e transmissão para quem entra ou retorna à sala durante uma sessão.

## Qualidade

| Perfil | Limite desejado | Bitrate máximo por espectador |
| --- | --- | --- |
| Econômica | 480p / 30 fps | 1 Mb/s |
| Equilibrada | 720p / 30 fps | 2,5 Mb/s |
| Full HD | 1080p / 30 fps | 5 Mb/s |
| Fluida | 1080p / 60 fps | 8 Mb/s |

Esses valores são limites de captura/envio, não garantia de resolução ou fps. A fonte, o navegador, a CPU e a rede podem reduzir a qualidade real. O painel de diagnóstico mostra os dados efetivos disponíveis. A resolução indicada no player é a do vídeo recebido/capturado.

A arquitetura continua WebRTC entre participantes (mesh), com até 10 pessoas por sala. Cada espectador consome uma cópia do upload de quem transmite. O orçamento de vídeo somado é limitado a aproximadamente 12 Mb/s por transmissor, sem contar áudio e overhead. O navegador adapta a entrega às condições de rede. Para grandes públicos seria necessário adicionar um servidor de distribuição de mídia (SFU), que não faz parte desta versão.

## Publicar no Render

1. Extraia o ZIP e substitua o conteúdo do repositório conectado ao seu serviço. Mantenha `Dockerfile`, `package.json`, `pnpm-lock.yaml`, `server/` e `app/` na raiz.
2. Use um **Web Service** com runtime **Docker**. O caminho do Dockerfile é `./Dockerfile`.
3. Deixe o Docker Command vazio: o Dockerfile já compila o site e inicia o servidor.
4. Configure o Health Check Path como `/health`.
5. Preserve suas variáveis TURN e demais variáveis existentes. Faça o deploy da nova versão.
6. Atualize as abas abertas para usar o novo cliente. Esta versão usa uma sala de transmissão `Principal`, sem os antigos canais de call.

O servidor escuta em `0.0.0.0` e usa a variável `PORT` do ambiente. O Docker utiliza Node 24, necessário para o SQLite nativo. Não precisa enviar `node_modules` ou `dist`: o build é feito no Render.

Use uma única instância, pois a sinalização e o chat estão em SQLite local. Sem disco persistente, os dados locais podem desaparecer em reinícios ou deploys. Se seu serviço tiver disco persistente, mantenha-o em `/data` (a variável `DATA_DIR` do Docker já aponta para esse caminho). O plano gratuito do Render não oferece disco persistente e pode suspender serviços ociosos; a primeira abertura pode demorar enquanto ele inicia.

O arquivo `railway.json` foi preservado da origem, mas não é necessário para usar o Render.

Documentação: https://render.com/docs/docker e https://render.com/docs/disks

## TURN e redes diferentes

Para maior compatibilidade entre redes, configure no Render as credenciais reais do seu provedor TURN:

```
TURN_URL=turn:seu-servidor:3478
TURN_USERNAME=seu-usuario
TURN_CREDENTIAL=sua-credencial
```

`TURN_URLS` também aceita várias URLs separadas por vírgula. A integração anterior com Metered foi preservada. Não coloque credenciais reais no repositório. Sem TURN, algumas combinações de redes podem impedir o vídeo, mesmo com o site e o chat funcionando.

## Uso no celular

- Assistir, conversar, abrir convites, favoritos, lista de pessoas, volume e visualização ampliada usam a interface mobile.
- Compartilhar a própria tela exige `getDisplayMedia`. Navegadores móveis que não oferecem essa API não conseguem iniciar a transmissão. Neles, o botão é desativado e uma explicação aparece no palco vazio.
- O mini-player só aparece se a API de Picture-in-Picture estiver disponível.
- Para ouvir, toque em **Ouvir**: navegadores podem bloquear reprodução automática com áudio.
- Em navegadores sem tela cheia nativa, o player ocupa a janela do site e mantém o botão **Sair da tela cheia**; a barra do navegador pode continuar aparecendo.

Compatibilidade: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

## Desenvolvimento e verificações

```
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm start
```

`pnpm dev` inicia o Vite com proxy de `/api` para `http://localhost:8080`. Inicie o servidor separadamente para desenvolver com a API.

Validações executadas: build de produção, checagem TypeScript, testes de API (incluindo autenticação/isolamento/rate limit do chat) e testes em Chromium/Edge headless com WebRTC real entre sessões separadas. O vídeo de teste foi gerado por canvas; o seletor de captura do sistema e aparelhos móveis físicos não foram automatizados. Foram testados entrada tardia, saída/retorno, chat, encerramento da captura, tela cheia, fallback e larguras de 320, 390 e 768 px.


## Limite importante em celulares
A interface é responsiva e permite assistir/conversar pelo celular. Transmitir a tela inteira do próprio celular depende do suporte do navegador/sistema à API `getDisplayMedia`; iOS Safari e muitos navegadores Android não expõem essa API para páginas web. Não existe uma alteração apenas no layout que consiga contornar essa limitação do sistema. Em aparelhos compatíveis, o botão de transmissão é habilitado automaticamente.
