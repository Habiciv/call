# ZENZ Mobile Transmitter — base nativa Android + iOS

Este diretório inicia a implementação nativa da captura de tela. **Não é ainda um app instalável nem uma integração de transmissão concluída**: a captura nativa é específica de cada sistema, e o envio precisa ser conectado ao protocolo WebRTC/sinalização do ZENZ antes de publicar.

## Arquitetura escolhida

- O site ZENZ continua sendo o visualizador e mantém o backend atual (`/api/config`, `/api/room`, `/api/presence`).
- O aplicativo móvel será o transmissor nativo. Ele precisa implementar a sessão da sala e o protocolo WebRTC compatível com `app/use-broadcast.ts` (SDP, ICE, anúncios `media.sharing` e `media.shareAudio`).
- Android: `MediaProjection` com consentimento do sistema e serviço em primeiro plano.
- iOS: ReplayKit Broadcast Upload Extension; a extensão captura os buffers e os entrega ao pipeline de vídeo WebRTC nativo. Não basta um WebView ou `getDisplayMedia` no Safari.
- TURN deve ser configurado no servidor para redes móveis e Wi‑Fi restritas.

## Etapas para transformar em aplicativo funcional

1. Criar os projetos nativos com Android Studio e Xcode (incluindo assinatura e identificadores de pacote).
2. Adicionar libwebrtc/react-native-webrtc ou uma camada nativa equivalente, com suporte a uma fonte de vídeo de tela.
3. Implementar login/entrada em sala e a mesma máquina de estados de sinalização do cliente web. Ver `docs/PROTOCOL.md`.
4. No iOS, configurar App Group compartilhado entre app e extensão e alimentar a fonte de vídeo WebRTC a partir do ReplayKit. O exemplo em `ios/` é apenas o ponto de partida para o ciclo de captura.
5. Testar em aparelhos reais, incluindo bloqueio de tela, troca de app, interrupção de captura, redes 4G/5G e Wi‑Fi, e áudio do sistema quando permitido.

## Qualidade e limites

Começar em 720p/30 fps e ajustar com estatísticas WebRTC; subir para 1080p/30 quando upload/CPU suportarem. 1080p/60 exige mais bateria, CPU e upload. Nenhuma implementação consegue garantir zero lag: a qualidade depende da rede, aparelho, TURN e topologia de distribuição.

## Estado desta entrega

O repositório inclui os pontos de partida e a documentação do protocolo, mas **não afirma que o app nativo já transmite para salas reais**. Não publique como pronto para usuários até concluir a ponte de mídia e testar Android e iOS em aparelhos físicos.
