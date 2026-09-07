# Voz — pronto para Railway

Site com tema vermelho e preto, animações, canais, chamadas de voz para até 10 participantes e compartilhamento de tela.

## Pacote com build incluído

Esta versão inclui a interface compilada em dist/ e o servidor compilado em server/room.mjs. O Dockerfile usa esses arquivos diretamente, sem instalar dependências no Railway. Envie também essas pastas ao GitHub. Ao editar o código da interface ou server/room.ts, execute pnpm build e envie os arquivos compilados atualizados.

## Publicar pelo GitHub

1. Extraia o ZIP e envie **o conteúdo da pasta** para um repositório seu no GitHub. O `Dockerfile`, `railway.json` e `package.json` devem ficar na raiz do repositório.
2. No Railway, crie um projeto e escolha a opção de publicar a partir de um repositório GitHub. Selecione esse repositório.
3. Adicione um volume ao serviço e configure o caminho de montagem como **`/data`**.
4. Mantenha **uma única réplica** do serviço. O banco SQLite é local ao volume.
5. Aguarde a publicação. O Railway detecta o Dockerfile automaticamente. Não precisa cadastrar comando de build ou start.
6. Em Settings → Networking, gere um domínio público. Use a porta **8080** se a interface pedir uma porta de destino. O servidor também respeita a variável `PORT` fornecida pelo Railway.
7. Abra o endereço HTTPS, permita o microfone, entre em um canal e clique em **Convidar**. Seus amigos devem abrir o link completo, incluindo a parte depois de `#`, e selecionar o mesmo canal.

O endereço do Railway será diferente do site original. Esta versão não tem o login privado do ChatGPT: qualquer pessoa com o endereço pode abrir o site, e quem recebe o link completo de uma sala pode entrar nela.

## Configuração

- `DATA_DIR=/data`: já definido no Dockerfile; deve coincidir com o volume.
- `PORT`: o servidor usa a variável do ambiente ou 8080.
- `PUBLIC_ORIGIN`: opcional; se necessário, defina a URL pública exata, como `https://seu-site.up.railway.app`, sem barra no final. Normalmente a identificação automática funciona.
- Verificação de saúde: `/health`, já configurada.

O volume guarda os dados temporários de presença e conexão, que são apagados quando expiram. Áudio e tela não são gravados. Chamadas em andamento podem precisar de reconexão após uma nova publicação.

## Rodar localmente

Instale Node.js 24 e pnpm 11.19.0. Na pasta do projeto:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm start
```

Abra `http://localhost:8080`. Para executar os testes, após o build: `pnpm test`.

## O que foi verificado

- Compilação da interface e do servidor.
- Página inicial e endpoint de saúde.
- Entrada simultânea de 10 participantes, bloqueio da 11ª entrada e reutilização de vaga.
- Troca de sinalização, proteção do token de participante e saída da sala.

A imagem Docker e uma publicação real no Railway ainda precisam ser executadas na sua conta. A chamada com 10 dispositivos reais não foi testada.

## Limitações da chamada

As conexões de voz e tela são diretas entre participantes (WebRTC), com servidores STUN públicos. Não há servidor TURN incluído; algumas redes corporativas, móveis ou restritivas podem bloquear a conexão. Para confiabilidade nessas redes, é necessário contratar ou configurar TURN. Dez pessoas e transmissões simultâneas exigem mais upload e processamento do dispositivo. Compartilhar tela requer navegador compatível no computador; o áudio do sistema não é transmitido, apenas microfone e imagem da tela.

## Documentação oficial

- Dockerfile: https://docs.railway.com/builds/dockerfiles
- Publicar serviço: https://docs.railway.com/services
- Volume persistente: https://docs.railway.com/volumes

Não há credenciais ou dados do site original neste pacote.

