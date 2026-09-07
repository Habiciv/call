# Voz — versão perfil + estabilidade

Projeto pronto para publicar no Railway, com chamadas WebRTC, indicador de fala, controles de volume, foto de perfil e compartilhamento de tela.

## Publicar no Railway

1. Extraia o ZIP.
2. Envie **o conteúdo de `voz-railway-perfil-fix/`** para a raiz do seu repositório GitHub. Não crie outra pasta por fora no repositório.
3. No Railway, publique esse repositório. O `Dockerfile` faz o build automaticamente; não é necessário enviar `dist/`.
4. Adicione um Volume no serviço montado em **`/data`**.
5. Mantenha **1 réplica** do serviço, porque a presença/sinalização usa SQLite no volume.
6. Em Networking, gere um domínio público. O servidor usa `PORT` do Railway e tem `/health` configurado.

## TURN — importante para áudio entre redes diferentes

STUN está configurado por padrão, mas algumas redes móveis, escolares, empresariais ou com CGNAT bloqueiam WebRTC direto. Para a call funcionar com muito mais confiabilidade entre qualquer rede, configure no Railway:

- `TURN_URL`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

`TURN_URL` pode conter mais de uma URL separada por vírgula, por exemplo UDP e TCP. Use credenciais do seu provedor TURN e nunca coloque a senha no GitHub.

## O que foi melhorado nesta versão

- Foto de perfil JPG/PNG/WebP com corte quadrado e compressão automática no navegador.
- A própria foto fica salva localmente no navegador; durante a call ela é compartilhada com os participantes da sala.
- Fotos não vão junto em todo `poll`: os clientes baixam a imagem somente quando o perfil muda, evitando gastar banda da chamada.
- Atualização de foto em tempo real quando você troca a imagem durante a call.
- Migração automática do banco SQLite existente no Railway para as novas colunas de perfil, sem precisar apagar o volume.
- Áudio de voz e áudio da transmissão agora ficam em streams separados. Isso impede o som da tela de marcar a pessoa como “Falando”.
- Transmissões remotas aparecem em uma área própria, em vez de ficarem misturadas dentro do card de voz.
- O estado da transmissão é avisado explicitamente aos outros participantes; a tela não some só porque uma trilha ficou `mute` por um instante.
- Ao iniciar/parar a tela, o WebRTC faz uma renegociação curta de compatibilidade depois do `replaceTrack`, corrigindo casos em que a transmissão local aparecia mas os outros não recebiam o vídeo.
- Quem entra depois de a transmissão já ter começado também recebe o estado atual da tela.
- Volume individual por participante, volume geral das vozes e volume separado para áudio das transmissões.
- Compartilhamento de tela adapta bitrate, resolução e FPS conforme o número de participantes para proteger o áudio.
- Reconexão de ICE e tentativas de recuperar pequenos cortes temporários do Railway antes de derrubar a call.
- Validação mais forte de ações, IDs, nomes e fotos no servidor.
- Foto é limitada e aceita somente JPEG/PNG/WebP convertido para JPEG no cliente; SVG não é aceito como avatar.

## Compartilhar tela com áudio

Ao escolher uma aba/tela no Chrome ou Edge, marque **Compartilhar áudio** quando a opção estiver disponível. Nem todo tipo de captura ou sistema operacional oferece áudio do sistema.

Os presets são:

- **Estável:** 540p / 15 FPS
- **Equilibrada:** 720p / 20 FPS
- **Nítida:** até 1080p / 30 FPS

Como a chamada atual é do tipo **mesh**, quem transmite envia uma cópia para cada participante. Com muita gente, a aplicação reduz automaticamente a carga de vídeo. Para salas grandes com vídeo pesado, a arquitetura ideal no futuro é usar um SFU (por exemplo LiveKit/mediasoup), em vez de mesh.

## Rodar localmente

Requer Node.js 24 e pnpm:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Depois abra `http://localhost:8080`.

Testes do servidor:

```sh
pnpm test
```

## Verificações feitas

- Sintaxe/transpilação dos arquivos TypeScript/TSX alterados.
- Inicialização do servidor e endpoint `/health`.
- Entrada de participantes e limite de 10 pessoas.
- Proteção por token.
- Sinalização entre participantes, incluindo estado de compartilhamento de tela.
- Envio, leitura, atualização e remoção de foto de perfil.
- Migração de schema preservando bancos existentes.

A qualidade real de WebRTC ainda depende de navegador, upload de cada usuário e da presença de TURN nas redes que exigem relay.
