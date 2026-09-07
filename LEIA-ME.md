# Voz — áudio e transmissão corrigidos

Versão preparada para Railway com chamada WebRTC em malha, TURN, foto de perfil, indicador de fala, volumes e compartilhamento de tela.

## O que mudou nesta versão

- Conexão de áudio entre cada par de participantes agora tem estado próprio e recuperação automática.
- Se uma oferta WebRTC ou a resposta se perder, o cliente reenvia a negociação em vez de ficar preso para sempre em `have-local-offer`.
- ICE é reiniciado automaticamente quando uma conexão fica presa, desconecta ou falha.
- O participante que não é o iniciador pode pedir ao outro lado para refazer a conexão.
- O microfone tenta se recuperar se o dispositivo for desconectado/trocado durante a call.
- A captura de microfone tem fallback para dispositivos que rejeitam constraints avançadas.
- Opus é priorizado para voz.
- Áudio recebe prioridade maior que compartilhamento de tela para evitar voz cortando durante uma transmissão.
- O compartilhamento de tela usa transceivers pré-negociados e `replaceTrack`, evitando renegociações de SDP que podiam quebrar o áudio ou impedir a tela de aparecer.
- A transmissão reduz FPS/resolução/bitrate conforme entra mais gente para preservar a subida de internet.
- Cada pessoa mostra `Áudio conectado`, `Conectando áudio` ou `Reconectando áudio`.
- Há um botão **Reconectar áudio** nas configurações para forçar uma recuperação sem sair da sala.
- O navegador tenta liberar o áudio remoto no clique de entrada e novamente em qualquer interação caso autoplay tenha sido bloqueado.

## TURN no Railway

Use estas variáveis no serviço:

```text
TURN_URL=turn:global.relay.metered.ca:80
TURN_USERNAME=SEU_USERNAME
TURN_CREDENTIAL=SUA_CREDENTIAL
```

Se `TURN_URL` for a rota global da Metered em `:80`, o servidor desta versão adiciona automaticamente as rotas de fallback:

```text
turn:global.relay.metered.ca:80
turn:global.relay.metered.ca:80?transport=tcp
turn:global.relay.metered.ca:443
turns:global.relay.metered.ca:443?transport=tcp
```

Também é possível definir `TURN_URLS` com várias URLs separadas por vírgula ou linha. Não coloque usuário/senha TURN no GitHub; mantenha somente nas Variables do Railway.

Depois de alterar Variables, faça um **Redeploy**.

## Publicar

1. Extraia o ZIP.
2. Envie **o conteúdo da pasta** para a raiz do repositório GitHub.
3. Não envie outra cópia do projeto dentro de uma subpasta.
4. No Railway, mantenha `Dockerfile` como builder.
5. Monte um Volume em `/data`.
6. Mantenha 1 réplica, pois a presença/sinalização usa SQLite local.
7. Gere um domínio público HTTPS.

O Dockerfile faz o build do `dist` automaticamente; não é preciso enviar a pasta `dist`.

## Compartilhamento de tela

Presets:

- **Estável:** 540p / 12 FPS
- **Equilibrada:** 720p / 15 FPS
- **Nítida:** até 1080p / 24 FPS

Para transmitir o som de uma aba no Chrome/Edge, marque **Compartilhar áudio** na janela de seleção.

Como a sala é mesh, quem compartilha tela envia uma cópia para cada pessoa. Com várias pessoas, a aplicação diminui automaticamente a carga do vídeo para proteger a voz. Para salas grandes com vídeo constante, a evolução ideal é um SFU.

## Testes

```sh
pnpm test
```

O teste do servidor cobre health check, capacidade da sala, autenticação por token, sinalização, avatar/perfil e expansão das rotas TURN da Metered.
