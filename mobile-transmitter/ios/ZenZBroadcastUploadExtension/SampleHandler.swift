import ReplayKit
import os.log

/// Ponto de partida para uma ReplayKit Broadcast Upload Extension.
/// Ainda não encaminha frames ao WebRTC: falta implementar um transporte seguro
/// para a fonte de vídeo nativa compartilhada com o app/pipeline WebRTC.
final class SampleHandler: RPBroadcastSampleHandler {
    private let logger = Logger(subsystem: "com.zenz.transmitter", category: "ReplayKit")

    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        logger.info("ZENZ screen broadcast started")
        // TODO: inicializar o canal do App Group e a fonte de vídeo WebRTC.
    }

    override func broadcastPaused() {
        logger.info("ZENZ screen broadcast paused")
    }

    override func broadcastResumed() {
        logger.info("ZENZ screen broadcast resumed")
    }

    override func broadcastFinished() {
        logger.info("ZENZ screen broadcast finished")
        // TODO: fechar transporte, tracks e recursos.
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer,
                                      with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else {
            // Áudio de app/microfone é separado e sujeito a limitações do iOS.
            return
        }
        // TODO: converter CMSampleBuffer/CVPixelBuffer em frames aceitos pela
        // implementação WebRTC e enviá-los à PeerConnection do transmissor.
        // Não manter buffers indefinidamente: isso aumenta latência e memória.
    }
}
