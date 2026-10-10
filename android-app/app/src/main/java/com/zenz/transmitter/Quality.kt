package com.zenz.transmitter

/** Mesmos perfis do site (app/use-broadcast.ts). width/height são o limite "paisagem". */
enum class Quality(
    val label: String,
    val maxLong: Int,
    val maxShort: Int,
    val fps: Int,
    val bitrate: Int,
) {
    STABLE("Econômica · 480p · 30 fps", 854, 480, 30, 1_000_000),
    BALANCED("Equilibrada · 720p · 30 fps", 1280, 720, 30, 2_500_000),
    HIGH("Full HD · 1080p · 30 fps", 1920, 1080, 30, 5_000_000),
    ULTRA("Fluida · 1080p · 60 fps", 1920, 1080, 60, 8_000_000);

    companion object {
        fun from(name: String?): Quality = entries.firstOrNull { it.name == name } ?: BALANCED
    }
}
