# iOS / iPhone

A captura da tela inteira deve ser iniciada pelo usuário por meio de ReplayKit e de uma Broadcast Upload Extension registrada no projeto Xcode. Configure um App Group comum ao app e à extensão se ele for usado para compartilhar metadados/estado. O código em `ZenZBroadcastUploadExtension/SampleHandler.swift` é apenas um esqueleto do ciclo ReplayKit; ele ainda não transporta frames para WebRTC.

Para concluir, integrar uma fonte de vídeo compatível com a biblioteca WebRTC escolhida, um canal de baixa latência entre a extensão e o pipeline de mídia, o ciclo de vida/interrupções do iOS e a sinalização ZENZ. A captura de tela não pode ser habilitada silenciosamente; o usuário sempre inicia a transmissão no sistema.
