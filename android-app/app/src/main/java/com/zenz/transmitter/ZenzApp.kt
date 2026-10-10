package com.zenz.transmitter

import android.app.Application

class ZenzApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ZenzEngine.init(this)
    }
}
