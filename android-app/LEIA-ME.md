# ZENZ Transmissões — app Android

App nativo que **transmite a tela do celular** para a sala do site e também **assiste** quem está transmitindo
(inclusive transmissões feitas pelo site, no PC). Fala exatamente o mesmo protocolo WebRTC do site
(`app/use-broadcast.ts` + `server/room.mjs`): nenhuma mudança no servidor é necessária.

## Como usar

1. Instale o APK (veja "Gerar o APK" abaixo) e abra o app.
2. No campo **Link da sala**, cole o link que o site mostra (`https://seusite.onrender.com/#código`).
   - Se colocar só o endereço do site, o app cria uma sala nova; use **Copiar link** para abrir a mesma sala no PC.
3. Toque em **Entrar na sala**.
4. **Transmitir minha tela** → o Android pede permissão → a transmissão continua em segundo plano
   (notificação fixa com botão **Parar**). Quem estiver no site ou em outro celular vê a tela.
5. Quando outra pessoa transmite, o vídeo aparece no palco do app. Toque no vídeo para tela cheia.

## Gerar o APK sem Android Studio

1. Suba esta pasta junto com `.github/workflows/build-android.yml` no repositório do GitHub.
2. Aba **Actions → Gerar APK Android → Run workflow** (também roda sozinho ao subir mudanças em `android-app/`).
3. Quando terminar, baixe o artefato **zenz-transmissoes-apk** (é um .zip com o `app-debug.apk`).
4. Passe o APK para o celular e instale (permita "instalar apps desconhecidos").

Ou, com Android Studio: abra a pasta `android-app` e rode **Build → Build APK(s)**.

## O que foi implementado

- Sala `<código>-Principal`, mesma do site; entrada por link; presença e lista de pessoas.
- Malha WebRTC com os mesmos transceivers (vídeo + áudio, sendrecv), iniciador = menor id, negociação com
  tratamento de colisão, reconexão com ICE restart, avisos `media.sharing` e pedidos `repair` / `share-repair`.
- Captura de tela com `MediaProjection` + serviço em primeiro plano (`mediaProjection`), acompanha rotação.
- Mesmos perfis de qualidade e a mesma conta de bitrate por espectador do site.
- Usa o TURN do servidor (`/api/config`), então funciona entre redes diferentes quando o TURN está configurado.
- Sai da sala sozinho depois de 1 minuto com o app fora da tela e sem transmitir.

## Limites desta versão

- **Sem áudio do celular**: só vídeo. O áudio de quem transmite pelo site toca normalmente no app.
- **Sem chat** e sem foto de perfil no app (o site continua com tudo isso).
- Só Android (7.0+). iPhone exige Mac/Xcode, conta Apple e uma extensão ReplayKit — fica para outra etapa.
- Vários espectadores: a arquitetura do site é malha (cada espectador recebe uma cópia do upload do celular,
  máximo 10 pessoas). Para muita gente seria preciso um servidor SFU.
- O APK gerado é de **debug** (assinado com chave de teste): serve para instalar direto, não para a Play Store.
- Foi escrito sem poder rodar num aparelho aqui: teste em um celular real antes de depender dele.
  Se o build falhar no GitHub, o log do job aponta a linha exata.

## Estrutura

```
android-app/app/src/main/java/com/zenz/transmitter/
  ZenzEngine.kt     sinalização + WebRTC + captura (o "cérebro")
  RoomApi.kt        HTTP para /api/config e /api/room (envia o cabeçalho Origin que o servidor exige)
  CaptureService.kt serviço em primeiro plano da captura de tela
  MainActivity.kt   telas (entrar / sala / palco de vídeo)
  Quality.kt        perfis de qualidade
```
