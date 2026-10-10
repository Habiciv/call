# Contrato de integração com o ZENZ atual

O site atual usa um protocolo próprio de sinalização via POST JSON same-origin:

- `GET /api/config` retorna `iceServers` e `turnConfigured`.
- `POST /api/room` com `action: "join"` cria a presença e devolve sessão; o cliente web usa `room`, `id`, `token`, `clientKey`, `name` e `after`.
- `action: "poll"` recebe sinais e participantes; `action: "signal"` encaminha mensagens WebRTC com `target` e `data`; `action: "leave"` encerra a presença.
- Mensagens de sinalização carregam `{description}`, `{candidate}`, `{media:{sharing:true,shareAudio:false}}` e controles de reparo.
- O cliente web reserva transceptores de vídeo e áudio em cada conexão, usa `RTCPeerConnection`, negociação SDP e ICE trickle.

Referência de implementação: `app/use-broadcast.ts` e `server/room.mjs`. O app nativo precisa respeitar a mesma forma e os limites do servidor (IDs UUID, sala, token e payloads de sinalização). Não basta enviar o vídeo para uma URL: é preciso negociar uma conexão WebRTC com cada espectador.

## Segurança

Use HTTPS, não inclua credenciais TURN no binário, não registre tokens em logs, trate revogação/saída e limpe conexões ao terminar a captura. O endpoint atual é otimizado para clientes do mesmo site; antes de aceitar clientes nativos, valide autenticação, origem e rate limits em aparelhos reais.
