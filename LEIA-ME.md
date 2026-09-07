# Voz — interface estilo app de comunidades + call WebRTC

Esta versão mantém as correções de áudio/TURN da versão anterior e troca a interface por um layout inspirado em apps como Discord, sem copiar logo ou identidade visual.

## O que tem nesta versão

### Interface

- Barra lateral de espaços.
- Lista de canais de voz.
- Participantes dentro do canal selecionado.
- Painel lateral com membros online.
- Destaque verde para quem está falando.
- Painel inferior de **Voz conectada**.
- Controles de call centralizados.
- Modo compacto.
- Foto e nome de perfil.
- Busca de canais.

### Call

- Silenciar/ativar microfone.
- **Ensurdecer**: silencia as vozes recebidas e também desliga seu microfone enquanto estiver ativo.
- Volume geral das vozes.
- Volume individual por participante.
- Escolha de microfone.
- Escolha da saída de áudio em navegadores que suportam `setSinkId` (Chrome/Edge normalmente suportam).
- Cancelamento de eco, redução de ruído e ganho automático ativáveis/desativáveis.
- Sensibilidade de detecção de fala.
- Reconexão manual de áudio.
- Reconexão WebRTC/ICE automática quando uma conexão falha.
- Opus priorizado para voz.

### Transmissão de tela

- Tela compartilhada aparece em destaque na call.
- Recebe transmissões de participantes que já estavam na sala e de quem começa a transmitir depois.
- Áudio da transmissão separado do volume das vozes.
- Presets:
  - **Estável:** 540p / 12 FPS
  - **Equilibrada:** 720p / 15 FPS
  - **Nítida:** até 1080p / 24 FPS
- Bitrate/FPS reduzidos automaticamente quando entram mais pessoas, para preservar a voz.

Para compartilhar som no Chrome/Edge, marque **Compartilhar áudio** quando o navegador mostrar essa opção.

## TURN no Railway

Use as credenciais reais do seu servidor TURN nas Variables do Railway:

```text
TURN_URL=turn:global.relay.metered.ca:80
TURN_USERNAME=SEU_USERNAME_REAL
TURN_CREDENTIAL=SUA_CREDENTIAL_REAL
```

Se estiver usando Metered com a rota global em `:80`, o servidor também cria rotas de fallback TCP/TLS/443 automaticamente.

Não coloque `TURN_USERNAME` ou `TURN_CREDENTIAL` no GitHub.

Depois de alterar Variables, faça um **Redeploy**.

## Publicar

1. Extraia o ZIP.
2. Abra a pasta `voz-railway-discord-ui`.
3. Envie **o conteúdo de dentro dela** para a raiz do repositório.
4. `Dockerfile`, `server`, `app`, `package.json` e `railway.json` precisam ficar na raiz.
5. No Railway, use o Dockerfile do projeto.
6. Se estiver usando o SQLite persistente, mantenha o Volume em `/data` e uma única réplica.

O Dockerfile faz o build do frontend automaticamente; não é necessário enviar `dist` manualmente.

## Teste do servidor

```sh
pnpm test
```

O teste cobre health check, capacidade da sala, autenticação por token, sinalização, perfil/avatar e configuração TURN.
