# Vértice — comunidades, texto e voz

## Versão atual: 0.4.0

Interface profissional responsiva, modo TV/controle, busca no histórico, menções,
novas mensagens, controles de voz acessíveis e transmissão adaptativa.
Leia [RELEASE-0.4.0.md](./RELEASE-0.4.0.md) para instalação, atualização, atalhos,
resultados dos 12 testes e limitações de dispositivos e WebRTC.
Logout, anexos e administração da 0.3.0 foram preservados. Não há nova migração de banco.

As seções abaixo registram o histórico e a configuração da arquitetura existente;
as informações da release 0.4.0 prevalecem sobre descrições antigas de layout e validação.

Aplicação de comunidades com identidade visual própria vermelho/preto, baseada na versão `voz-railway-grupos-bope.zip`. A organização da interface é inspirada em plataformas de comunidades, sem logos, brasões ou assets oficiais. Não é uma reprodução completa do Discord.

## Atualização 0.3.0 — administração, layout e desempenho

- Novo painel de servidor com **Visão geral, Membros, Cargos, Banimentos e Registro de auditoria**.
- Hierarquia real de **Dono → Administrador → Moderador → Membro**, validada no servidor. Um cargo não pode moderar alguém do mesmo nível ou acima.
- O Dono pode transferir a propriedade e gerenciar todos os cargos abaixo dele. Administradores podem gerenciar cargos abaixo de Admin; Moderadores podem aplicar timeout e expulsar membros abaixo do próprio nível.
- **Expulsar, banir/desbanir e timeout** de 1 minuto até 28 dias. Timeout bloqueia mensagens e entrada em voz dentro do servidor, mas não bloqueia DMs.
- Canais agora têm **tópico/descrição e modo lento**. Moderadores, Administradores e o Dono ignoram o limite de modo lento.
- O servidor ganhou descrição e um painel de convite com renovação do link. A migração `4` adiciona os novos campos, banimentos e auditoria sem apagar o histórico existente.
- Layout renovado com painéis mais claros, microanimação de clique, destaque de seleção, fundo animado leve e suporte a `prefers-reduced-motion`.
- Menos carga em segundo plano: polling de comunidades fica em ~2,6 s com a aba ativa e ~12 s oculta; presença fica em ~3,5 s ativa e ~10 s oculta. Reações/respostas de mensagens também são carregadas em lote para reduzir consultas repetidas ao SQLite.

## Atualização 0.2.1 — áudio e transmissão ampliada

- Corrigida a associação do microfone de quem responde à chamada: agora são usadas as faixas oferecidas pelo outro participante, evitando faixas locais sem negociação e áudio em apenas um sentido.
- Voz, vídeo da tela e áudio da tela são identificados pelos receptores/MIDs negociados. A renegociação da tela preserva a faixa do microfone.
- Ao tentar recuperar uma conexão que falhou, o iniciador prioriza relay se houver TURN configurado. Isso não substitui credenciais TURN válidas e um serviço TURN acessível.
- Reprodução de áudio é retomada ao chegar/desbloquear uma faixa, ao interagir com teclado/mouse e ao retornar à janela. Uma saída removida tenta o dispositivo padrão e mostra um aviso.
- O painel de transmissão agora tem **Ampliar/Reduzir** e **Tela cheia**. Ampliar conserva os elementos de vídeo/áudio montados. Escape reduz a visualização ampliada; em tela cheia, Escape sai da tela cheia. Se o navegador recusar tela cheia, usa a ampliação dentro da página.

**Atualizar:** substitua o código pelo novo ZIP e faça redeploy. Depois, todos devem sair da chamada, atualizar com Ctrl + F5 e entrar novamente. Não misture abas com a versão antiga e a nova. Não apague o volume nem altere as variáveis TURN já válidas. Não há mudança de esquema do banco nesta atualização.

**Verificação:** nove testes automatizados passaram, além da checagem TypeScript e build Vite. Os novos testes de mídia usam objetos simulados para conferir negociação, três participantes, separação de voz/tela e saída de áudio; não são chamadas reais de navegador. Não houve validação de áudio em redes externas nem teste visual interativo da tela cheia.

Referência técnica: [negociação WebRTC](https://www.w3.org/TR/webrtc/).


## Atualização — envio de imagem e vídeo

- O botão de clipe no compositor envia imagens JPG, PNG, WEBP e GIF e vídeos MP4/WEBM de até 10 MB.
- Anexos funcionam em canais e mensagens diretas, com texto opcional.
- Imagens aparecem no próprio chat e vídeos usam player com carregamento por partes (HTTP Range).
- A atualização cria a migração `3` do banco para guardar os metadados dos anexos; os arquivos ficam no diretório persistente `DATA_DIR/uploads`.

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
- Cargos fixos: dono, administrador, moderador e membro, com hierarquia e verificação no servidor; transferência de propriedade e gerenciamento de cargos abaixo do nível do administrador.
- Canais de texto e de voz: criação, renomeação e exclusão, tópico/descrição e modo lento. Máximo de 50 canais por servidor.
- Chat persistente por canal (inclusive uma conversa associada aos canais de voz), mensagens de até 2.000 caracteres e histórico paginado em blocos de 80.
- Respostas no mesmo canal, edição das próprias mensagens, exclusão, cinco reações alternáveis e mensagens fixadas.
- Indicador de digitando com expiração; atualização periódica das conversas.
- Presença online/ausente/ocupado escolhida pelo usuário e offline após aproximadamente 35 segundos sem atualização.
- DMs básicas com histórico persistente entre dois membros que compartilham ao menos um servidor. Terceiros não acessam essas mensagens pela API.
- Perfil persistente com avatar reduzido no navegador, nome e status personalizado.
- Seleção de microfone e saída quando o navegador permite; mute/deafen com restauração do mute anterior; cancelamento de eco/redução de ruído e detecção de fala.
- WebRTC mesh com os mecanismos anteriores de TURN, negociação de tela, recuperação de áudio, reconexão, identificação de abas e indicação de fala.
- Presets de compartilhamento 540p, 720p, 1080p, 1440p e 2160p/4K; áudio de compartilhamento quando oferecido pelo navegador; ajuste de bitrate/resolução/FPS conforme número de participantes.
- Painel administrativo com expulsão, banimento/desbanimento, timeout, auditoria e descrição do servidor.
- Tema tático vermelho, grafite e preto renovado, layout adaptado a telas pequenas, animações leves de fundo/clique, diálogos com gerenciamento de foco e controles por teclado.

## Permissões

| Ação | Membro | Moderador | Administrador | Dono |
| --- | --- | --- | --- | --- |
| Ler/enviar mensagens, responder, reagir e usar voz | Sim | Sim | Sim | Sim |
| Editar/excluir mensagens próprias | Sim | Sim | Sim | Sim |
| Excluir mensagens de outros e fixar/desafixar | Não | Sim | Sim | Sim |
| Timeout e expulsar cargos abaixo | Não | Sim | Sim | Sim |
| Banir/desbanir cargos abaixo | Não | Não | Sim | Sim |
| Gerenciar canais, servidor, convite e auditoria | Não | Não | Sim | Sim |
| Alterar cargos | Não | Não | Abaixo de Admin | Todos abaixo do Dono |
| Transferir propriedade / excluir servidor | Não | Não | Não | Sim |

O Dono pode transferir a propriedade antes de sair. Administradores e Moderadores só podem agir em cargos abaixo do próprio nível. Todos os canais continuam visíveis aos membros: ainda não há permissões individuais por canal nem cargos personalizados.

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

1. Ao detectar um banco existente que ainda precisa da migração comunitária ou da nova migração de administração, a inicialização cria um backup SQLite consistente, incluindo WAL, em `before-community-<timestamp>.sqlite` dentro de `DATA_DIR` antes de alterar o esquema.
2. As migrações usam transações e registram a versão em `app_migrations`. A versão `4` adiciona descrição do servidor, tópico/modo lento, timeout, banimentos e auditoria. Em falha, a migração desfaz suas alterações em vez de registrar sucesso.
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

- **Não há equivalência total com Discord.** Não inclui bots, videochamada por câmera, busca global, threads, categorias editáveis, eventos, notificações push, contagem de não lidas, bloqueio de DMs, cargos personalizados ou permissões individuais por canal.
- Cargos são quatro níveis fixos. DMs têm envio/leitura e paginação; edição, reações e fixação são funcionalidades dos canais, não das DMs.
- O modelo de conta é uma **chave privada do navegador**, não login com e-mail/senha, 2FA ou recuperação por e-mail. Perder a chave e limpar o navegador pode tornar a identidade inacessível. Guarde a chave com cuidado.
- DMs só são acessíveis enquanto há um servidor em comum. Os registros continuam no banco ao deixar/excluir servidores, mas deixam de ser expostos quando não existe associação em comum. O administrador da hospedagem tem acesso ao banco; não há criptografia ponta a ponta para o chat.
- Chat/presença usam polling, não WebSockets. Comunidades atualizam em ~2,6 s com a aba ativa e ~12 s oculta; presença em ~3,5 s ativa e ~10 s oculta; voz mantém seu ciclo de sinalização próprio. Digitação expira em 5 s e abas suspensas ainda podem parecer offline.
- Histórico: 80 mensagens por página; painel de fixadas mostra as 100 fixadas mais recentes. Mensagens sem formatação Markdown ou previews externos; texto é renderizado escapado pelo React.
- WebRTC é **mesh**, até 10 participantes por sala. Cada transmissor envia uma cópia a cada destinatário. 4K não é garantido e nem todos os presets mantêm 30 FPS com muitos participantes; a adaptação considera quantidade de peers e a adaptação interna do navegador, sem controlador próprio baseado em telemetria de rede.
- A conexão deve ser testada com navegadores e redes reais. Compartilhar áudio do sistema/aba e escolher a saída variam por navegador/SO. Em celulares, compartilhamento de tela e seleção de saída podem não estar disponíveis.
- Reconexão de sinalização tem tentativas limitadas; após falha prolongada/expiração, é preciso entrar novamente. Reiniciar o servidor pode interromper chamadas em andamento.
- SQLite e sinalização pressupõem **uma instância/réplica**. Não escale horizontalmente este pacote nem compartilhe o arquivo entre vários serviços. Para comunidades grandes, é necessária outra arquitetura, especialmente um SFU para mídia.
- Há validação de origem, autenticação, autorização, hierarquia de moderação, registro de auditoria e limite básico de ações por identidade. Ainda não há proteção completa contra abuso automatizado nem quotas globais de cadastro. O cadastro por dispositivo é aberto. A variável `ALLOW_LEGACY_ROOMS=1` é usada exclusivamente pelo teste de protocolo antigo; **não a configure em produção**, pois permite salas avulsas sem controle de membros.

## Validação desta entrega

Neste ambiente foi usado Node.js 22.16.0. Os testes de integração de servidor, comunidade, migração e o novo cenário administrativo passaram, incluindo hierarquia de cargos, timeout, modo lento, ban/desban, auditoria e transferência de propriedade.

O teste `server/rtc-media.test.mjs` não roda em Node 22 porque importa TypeScript diretamente; o projeto declara **Node 24+**, onde esse teste usa o suporte esperado. Como as dependências não estão instaladas neste ZIP de trabalho, o build Vite e o typecheck completo não foram executados aqui. Foi feita checagem de sintaxe dos arquivos JS e uma verificação de parsing TSX sem erros de sintaxe.

Antes de publicar, rode em Node 24+: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck` e `pnpm build`. Depois teste em dois navegadores: cargos, timeout, expulsão/banimento, transferência de dono, modo lento, envio de mídia, DM e voz.

## Estrutura

- `app/page.tsx`: superfície da comunidade e integração de voz.
- `app/use-community.ts`: navegação, polling e proteção contra respostas antigas.
- `app/community-settings.tsx`: perfil, áudio e restauração de acesso.
- `app/server-settings.tsx`: painel de administração, cargos, banimentos e auditoria.
- `app/channel-settings.tsx`: nome, tópico, modo lento e exclusão de canal.
- `app/use-call.ts` e `app/media.tsx`: WebRTC, mídia e detecção de fala.
- `server/community.mjs`: API de comunidades e permissões.
- `server/access.mjs` e `server/room.mjs`: acesso às salas e sinalização.
- `server/db.mjs`, `server/migrate.mjs`, `server/backup.mjs`: SQLite, migração e backup.
- `Dockerfile`, `render.yaml`, `railway.json`: deploy.

O ZIP não contém banco real, credenciais, dependências instaladas, diretórios de build ou cópias aninhadas do projeto. As dependências e o lockfile originais foram preservados. Nenhum serviço foi publicado automaticamente.
