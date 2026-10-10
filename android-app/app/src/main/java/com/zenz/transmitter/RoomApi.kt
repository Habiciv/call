package com.zenz.transmitter

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String) : Exception(message)

/**
 * Cliente HTTP da sinalização do site (server/room.mjs).
 *
 * O servidor só aceita POST /api/room quando o cabeçalho Origin é igual à origem
 * do próprio site, então o app envia exatamente essa origem.
 */
class RoomApi(val base: HttpUrl) {
    /** Mesma regra de `URL.origin` do navegador: porta omitida quando é a padrão. */
    val origin: String = buildString {
        append(base.scheme).append("://").append(base.host)
        if (base.port != HttpUrl.defaultPort(base.scheme)) append(':').append(base.port)
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val json = "application/json; charset=utf-8".toMediaType()

    fun config(): JSONObject {
        val req = Request.Builder().url("$origin/api/config").get().build()
        return client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, "Não foi possível ler a configuração do servidor.")
            JSONObject(res.body?.string() ?: "{}")
        }
    }

    /** POST /api/room. Lança [ApiException] com a mensagem do servidor quando há erro. */
    fun room(payload: JSONObject): JSONObject {
        val req = Request.Builder()
            .url("$origin/api/room")
            .header("Origin", origin)
            .post(payload.toString().toRequestBody(json))
            .build()
        return client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val obj = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
            if (!res.isSuccessful) {
                throw ApiException(res.code, obj.optString("error").ifBlank { "Falha na conexão (${res.code})." })
            }
            obj
        }
    }

    companion object {
        /** Aceita "site.com", "https://site.com" ou o link completo com "#código". */
        fun parse(raw: String): HttpUrl? {
            var text = raw.trim()
            if (text.isEmpty()) return null
            if (!text.contains("://")) text = "https://$text"
            return text.toHttpUrlOrNull()
        }
    }
}
