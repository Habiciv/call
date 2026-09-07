# Vértice — comunidades, texto e voz

Aplicação de comunidades com identidade visual própria vermelho/preto, baseada na versão `voz-railway-grupos-bope.zip`. A organização da interface é inspirada em plataformas de comunidades, sem logos, brasões ou assets oficiais. Não é uma reprodução completa do Discord.

## Atualização 0.2.1 — áudio e transmissão ampliada

- Corrigida a associação do microfone de quem responde à chamada: agora são usadas as faixas oferecidas pelo outro participante, evitando faixas locais sem negociação e áudio em apenas um sentido.
- Voz, vídeo da tela e áudio da tela são identificados pelos receptores/MIDs negociados. A renegociação da tela preserva a faixa do microfone.
- Ao tentar recuperar uma conexão que falhou, o iniciador prioriza relay se houver TURN configurado. Isso não substitui credenciais TURN válidas e um serviço TURN acessível.
- Reprodução de áudio é retomada ao chegar/desbloquear uma faixa, ao interagir com teclado/mouse e ao retornar à janela. Uma saída removida tenta o dispositivo padrão e mostra um aviso.
- O painel de transmissão agora tem **Ampliar/Reduzir** e **Tela cheia**. Ampliar conserva os elementos de vídeo/áudio montados. Escape reduz a visualização ampliada; em tela cheia, Escape sai da tela cheia. Se o navegador recusar tela cheia, usa a ampliação dentro da página.

**Atualizar:** substitua o código pelo novo ZIP e faça redeploy. Depois, todos devem sair da chamada, atualizar com Ctrl + F5 e entrar novamente. Não misture abas com a versão antiga e a nova. Não apague o volume nem altere as variáveis TURN já válidas. Não há mudança de esquema do banco nesta atualização.

**Verificação:** nove testes automatizados passaram, além da checagem TypeScript e build Vite. Os novos testes de mídia usam objetos simulados para conferir negociação, três participantes, separação de voz/tela e saída de áudio; não são chamadas reais de navegador. Não houve validação de áudio em redes externas nem teste visual interativo da tela cheia.

Referência técnica: [negociação WebRTC](https://www.w3.org/TR/webrtc/).

## Começar

1. Abra o site e clique em **Criar servidor** ou **Tenho um convite**.
2. Edite nome, avatar, status e presença na engrenagem do perfil.
3. Use o menu ao lado do nome do servidor para copiar o link/código de convite.
4. Use `+` junto de canais de texto/voz para criar canais; o lápis no cabeçalho renomeia ou exclui o canal selecionado.
5. Clique em um membro na lateral ou em Mensagens diretas para abrir uma DM.
6. Clique em um canal de voz e autorize o microfone. A voz continua enquanto você navega pelo texto e pelas DMs do mesmo servidor.
7. Em **Configurações → Acesso**, copie sua chave privada e guarde-a em local seguro. Ela restaura sua identidade em outro navegador.

## Implementado

- Criar, renomear, excluir e alternar servidores; entrar e sair; lista de membros.
- Um código e link de convite por servidor, com revogação/renovação por administradores.
- Cargos fixos: dono, administrador, moderador e membro; atribuição pelo dono, com verificação no servidor.
- Canais de texto e de voz: criação, renomeação e exclusão. Máximo de 50 canais por servidor.
- Chat persistente por canal (inclusive uma conversa associada aos canais de voz), mensagens de até 2.000 caracteres e histórico paginado em blocos de 80.
- Respostas no mesmo canal, edição das próprias mensagens, exclusão, cinco reações alternáveis e mensagens fixadas.
- Indicador de digitando com expiração; atualização periódica das conversas.
- Presença online/ausente/ocupado escolhida pelo usuário e offline após aproximadamente 35 segundos sem atualização.
- DMs básicas com histórico persistente entre dois membros que compartilham ao menos um servidor. Terceiros não acessam essas mensagens pela API.
- Perfil persistente com avatar reduzido no navegador, nome e status personalizado.
- Seleção de microfone e saída quando o navegador permite; mute/deafen com restauração do mute anterior; cancelamento de eco/redução de ruído e detecção de fala.
- WebRTC mesh com os mecanismos anteriores de TURN, negociação de tela, recuperação de áudio, reconexão, identificação de abas e indicação de fala.
- Presets de compartilhamento 540p, 720p, 1080p, 1440p e 2160p/4K; áudio de compartilhamento quando oferecido pelo navegador; ajuste de bitrate/resolução/FPS conforme número de participantes.
- Tema tático vermelho, grafite e preto, layout adaptado a telas pequenas, diálogos com gerenciamento de foco e controles por teclado.

## Permissões

| Ação | Membro | Moderador | Administrador | Dono |
| --- | --- | --- | --- | --- |
| Ler/enviar mensagens, responder, reagir e usar voz | Sim | Sim | Sim | Sim |
| Editar/excluir mensagens próprias | Sim | Sim | Sim | Sim |
| Excluir mensagens de outros e fixar/desafixar | Não | Sim | Sim | Sim |
| Gerenciar canais, renomear servidor e renovar convite | Não | Não | Sim | Sim |
| Atribuir cargos e excluir servidor | Não | Não | Não | Sim |

O cargo do dono é fixo. O dono não pode sair sem excluir o servidor. Qualquer membro pode compartilhar o convite vigente. Todos os canais do servidor são visíveis aos membros: não há permissões individuais por canal.

## Deploy no Render

Use **Web Service**, não Static Site.

1. Extraia o ZIP. Envie o conteúdo diretamente para a raiz do repositório no GitHub: `Dockerfile`, `package.json`, `app/` e `server/` devem estar no mesmo nível.
2. No Render: **New → Web Service**, conecte o repositório e selecione **Docker**. Dockerfile: `./Dockerfile`; contexto: raiz do repositório. Não é necessário sobrescrever o comando de inicialização.
3. Escolha um plano compatível com **Persistent Disk**. O SQLite exige armazenamento persistente; o disco do Render está disponível para serviços pagos.
4. Adicione um disco montado em `/data` e configure `DATA_DIR=/data`.
5. Configure as variáveis TURN reais abaixo. Use `/health` como health check.
6. Faça o deploy e use a URL HTTPS gerada. O servidor escuta em `0.0.0.0` e respeita `PORT`; o Render normalmente fornece `10000`.

Também existe `render.yaml` para Blueprint, com plano `starter` e disco de 1 GB. Confira os custos apresentados pelo Render antes de criar o serviço.

Fontes: [Docker no Render](https://render.com/docs/docker), [discos persistentes](https://render.com/docs/disks), [porta do Web Service](https://render.com/docs/web-services#port-binding).

## Deploy no Railway

1. Conecte o repositório ao projeto/serviço. O Railway detecta o `Dockerfile` da raiz.
2. Mantenha ou adicione **Volume** montado em `/data`. Configure `DATA_DIR=/data`.
3. Preserve `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL` reais da versão anterior.
4. Gere um domínio HTTPS e faça redeploy. O `railway.json` mantém uma réplica e health check `/health`.
5. Ao atualizar um serviço existente, **não apague nem substitua o volume**.

Fontes: [Dockerfiles no Railway](https://docs.railway.com/builds/dockerfiles), [volumes](https://docs.railway.com/volumes).

## Variáveis

| Variável | Uso |
| --- | --- |
| `DATA_DIR` | Diretório do banco. `/data` no Render/Railway; `./data` em execução local. |
| `PORT` | Porta HTTP fornecida pela hospedagem; fallback local `8080`. |
| `PUBLIC_ORIGIN` | Opcional: origem pública exata, ex. `https://seu-servico.onrender.com`, sem barra final. Se ausente, usa Host e protocolo do proxy. |
| `TURN_URL` ou `TURN_URLS` | URLs TURN separadas por vírgula; use as fornecidas pelo seu provedor. |
| `TURN_USERNAME` | Usuário real do TURN. |
| `TURN_CREDENTIAL` | Credencial real do TURN. Não publique no GitHub. |

O arquivo `.env.example` não tem segredos. O servidor de produção usa as variáveis do ambiente; não carrega `.env` automaticamente. Para execução local com arquivo: `node --env-file=.env server/index.mjs`.

O TURN não é hospedado pelo app. As credenciais configuradas são entregues ao cliente como exige a conexão; o projeto ainda usa credenciais TURN estáticas, sem emissão temporária. Configure limites no provedor e renove credenciais quando necessário.

## Executar localmente

Requisitos: Node.js 24 ou superior, Corepack e pnpm. O Dockerfile fixa pnpm 10.17.1 para o build.

```sh
corepack enable
corepack prepare pnpm@10.17.1 --activate
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

Abra `http://localhost:8080`. Para editar com atualização automática, mantenha o servidor acima e rode `pnpm dev` em outro terminal; abra a URL que o Vite mostrar. O proxy `/api` aponta para `localhost:8080`.

Docker local:

```sh
docker build -t vertice .
docker run --rm -p 8080:8080 -v vertice-data:/data --env-file .env vertice
```

Para este comando Docker, use `DATA_DIR=/data` e `PORT=8080` no `.env`. Microfone/tela exigem HTTPS fora de localhost.

## Migração e backup

O arquivo continua sendo `DATA_DIR/voz.sqlite`. Antes da atualização, faça um backup e mantenha a versão antiga do código para eventual retorno.

1. Ao detectar um banco existente ainda não migrado, a inicialização cria um backup SQLite consistente, incluindo WAL, em `before-community-<timestamp>.sqlite` dentro de `DATA_DIR`, antes das alterações legadas.
2. A migração nova usa uma transação e registra a versão em `app_migrations`. Em falha, ela desfaz suas alterações e o serviço não inicia silenciosamente com um esquema incompleto. O backup permite recuperar o estado anterior.
3. Cada grupo antigo recebe um canal `geral` com seu histórico de `group_messages` e canais de voz Lounge, Jogatina e Foco. O chat antigo dessas salas é copiado para suas conversas associadas. Salas avulsas sem grupo permanecem nas tabelas antigas, sem interface de importação.
4. IDs de grupo, códigos de convite, membros e nomes são preservados. O dono recupera o cargo correto mesmo se o endpoint antigo de convite o tiver rebaixado por engano.
5. As tabelas antigas `groups`, `group_members`, `group_messages` e `messages` não são apagadas durante a migração. Rodar a inicialização novamente não recopia o histórico.
6. O primeiro acesso usando o mesmo navegador e domínio anterior utiliza `voz-user-key` para reivindicar a identidade legada e criar uma credencial privada. Nome e avatar antigos locais podem ser salvos pelo painel de perfil. A identificação antiga não possuía segredo separado; a reivindicação inicial tem esse limite de confiança. Depois disso a API exige a credencial e não divulga a chave legada aos membros.
7. Ao mudar de domínio (por exemplo Railway para Render), o armazenamento do navegador não acompanha a mudança. Atualize primeiro no domínio antigo e copie sua chave em Configurações → Acesso; depois restaure-a no domínio novo, usando a mesma cópia migrada do banco.

Backup adicional com o serviço em execução:

```sh
node server/backup.mjs
```

Esse comando usa `DATA_DIR` do ambiente e cria `backup-<timestamp>.sqlite` por `VACUUM INTO`. Faça uma cópia externa: backups no mesmo disco não protegem contra perda do próprio volume. Verifique espaço livre suficiente para uma cópia completa antes do deploy.

**Rollback:** pare o serviço; preserve separadamente o banco atual e seus arquivos `-wal`/`-shm`; restaure o backup como `voz.sqlite` em um diretório limpo do volume; redeploy da versão correspondente ao backup. Não sobreponha um banco ativo. Mensagens criadas depois do backup não estarão nele. O histórico novo não é espelhado para as tabelas antigas, portanto apenas voltar o código não converte os dados novos.

## Limites concretos

- **Não há equivalência total com Discord.** Não inclui bots, videochamada por câmera, anexos de chat, busca global, threads, categorias editáveis, eventos, notificações push, contagem de não lidas, banimentos, bloqueio de DMs, cargos personalizados, permissões por canal ou transferência de propriedade.
- Cargos são quatro níveis fixos. DMs têm envio/leitura e paginação; edição, reações e fixação são funcionalidades dos canais, não das DMs.
- O modelo de conta é uma **chave privada do navegador**, não login com e-mail/senha, 2FA ou recuperação por e-mail. Perder a chave e limpar o navegador pode tornar a identidade inacessível. Guarde a chave com cuidado.
- DMs só são acessíveis enquanto há um servidor em comum. Os registros continuam no banco ao deixar/excluir servidores, mas deixam de ser expostos quando não existe associação em comum. O administrador da hospedagem tem acesso ao banco; não há criptografia ponta a ponta para o chat.
- Chat/presença usam polling (~1,8 s; voz ~450 ms), não WebSockets. Digitação expira em 5 s; presença depende do heartbeat do navegador e pode parecer offline em abas suspensas.
- Histórico: 80 mensagens por página; painel de fixadas mostra as 100 fixadas mais recentes. Mensagens sem formatação Markdown ou previews externos; texto é renderizado escapado pelo React.
- WebRTC é **mesh**, até 10 participantes por sala. Cada transmissor envia uma cópia a cada destinatário. 4K não é garantido e nem todos os presets mantêm 30 FPS com muitos participantes; a adaptação considera quantidade de peers e a adaptação interna do navegador, sem controlador próprio baseado em telemetria de rede.
- A conexão deve ser testada com navegadores e redes reais. Compartilhar áudio do sistema/aba e escolher a saída variam por navegador/SO. Em celulares, compartilhamento de tela e seleção de saída podem não estar disponíveis.
- Reconexão de sinalização tem tentativas limitadas; após falha prolongada/expiração, é preciso entrar novamente. Reiniciar o servidor pode interromper chamadas em andamento.
- SQLite e sinalização pressupõem **uma instância/réplica**. Não escale horizontalmente este pacote nem compartilhe o arquivo entre vários serviços. Para comunidades grandes, é necessária outra arquitetura, especialmente um SFU para mídia.
- Há validação de origem, autenticação, autorização e limite básico de ações por identidade. Não há proteção completa contra abuso automatizado, auditoria de moderação ou quotas globais de cadastro. O cadastro por dispositivo é aberto. A variável `ALLOW_LEGACY_ROOMS=1` é usada exclusivamente pelo teste de protocolo antigo; **não a configure em produção**, pois permite salas avulsas sem controle de membros.

## Validação desta entrega

Executados com Node.js 24.19.0:

- `node --test server/test.mjs server/community.test.mjs server/migration.test.mjs server/rtc-media.test.mjs`: 9 testes de integração/migração passaram, com múltiplas verificações em cada cenário.
- `pnpm typecheck` (TypeScript sem emissão): aprovado.
- `pnpm build`: build Vite de produção aprovado.
- Endpoint local e compilação para prévia: respondendo.

Cobertura: limite de participantes, sinalização, token de peer, avatar, sessões/abas distintas no protocolo, chat, convites, cargos, isolamento de canais e DMs, respostas cruzadas bloqueadas, edição/exclusão, reações, fixação, digitação, presença, acesso à voz, reinício com persistência, migração idempotente, backup consistente e rollback de falha.

**Não executados:** build da imagem Docker (Docker indisponível neste ambiente), deploy real no Render/Railway, interação ponta a ponta de UI em navegador, chamada real entre dispositivos, qualidade da transmissão/4K em rede externa. O teste de sinalização não substitui um teste real de mídia.

Antes de disponibilizar para sua equipe, teste com duas contas/navegadores: convite, cargos, mensagens entre canais, DM, mute/deafen, troca de microfone, transmissão, saída/retorno à call durante transmissão e reinício do serviço. Use também uma rede móvel para verificar TURN.

## Estrutura

- `app/page.tsx`: superfície da comunidade e integração de voz.
- `app/use-community.ts`: navegação, polling e proteção contra respostas antigas.
- `app/community-settings.tsx`: perfil, áudio e restauração de acesso.
- `app/use-call.ts` e `app/media.tsx`: WebRTC, mídia e detecção de fala.
- `server/community.mjs`: API de comunidades e permissões.
- `server/access.mjs` e `server/room.mjs`: acesso às salas e sinalização.
- `server/db.mjs`, `server/migrate.mjs`, `server/backup.mjs`: SQLite, migração e backup.
- `Dockerfile`, `render.yaml`, `railway.json`: deploy.

O ZIP não contém banco real, credenciais, dependências instaladas, diretórios de build ou cópias aninhadas do projeto. As dependências e o lockfile originais foram preservados. Nenhum serviço foi publicado automaticamente.

