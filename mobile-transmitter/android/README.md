# Android

Use uma Activity nativa para obter `MediaProjectionManager.createScreenCaptureIntent()`. Após o consentimento do usuário, iniciar um serviço em primeiro plano declarado com o tipo `mediaProjection`, seguindo os requisitos da versão do Android alvo. Registrar `MediaProjection.Callback` e liberar todas as superfícies/tracks quando o usuário parar a captura.

**Não inicie captura escondida nem tente contornar o diálogo de consentimento do sistema.** A API nativa exige confirmação do usuário. Para transmissão real, integrar uma implementação de libwebrtc que transforme a projeção em `VideoTrack` e ligar esse track à sinalização documentada em `../docs/PROTOCOL.md`.
