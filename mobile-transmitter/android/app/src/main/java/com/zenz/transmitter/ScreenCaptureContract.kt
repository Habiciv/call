package com.zenz.transmitter

/**
 * Contrato mínimo do fluxo Android. A Activity deve chamar
 * MediaProjectionManager.createScreenCaptureIntent() e pedir consentimento
 * explícito ao usuário. Só após RESULT_OK o app deve iniciar um foreground
 * service do tipo mediaProjection.
 *
 * TODO de integração: criar Surface/VideoCapturer do libwebrtc com a
 * MediaProjection e conectar o VideoTrack à PeerConnection do protocolo ZENZ.
 * Esta classe deliberadamente não finge produzir um MediaStream WebRTC.
 */
object ScreenCaptureContract {
    const val CONSENT_REQUIRED = "CONSENT_REQUIRED"
    const val USER_CANCELLED = "USER_CANCELLED"
    const val WEBRTC_BRIDGE_PENDING = "WEBRTC_BRIDGE_PENDING"
}
