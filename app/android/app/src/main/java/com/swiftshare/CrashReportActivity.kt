package com.swiftshare

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.widget.Button
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * Runs in a separate process (":crash") so it stays alive when the main
 * process dies. Shows the captured crash trace full-screen so the user can
 * screenshot or copy it back to the developer.
 */
class CrashReportActivity : android.app.Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val trace = intent?.getStringExtra("trace")
            ?: filesDir?.resolve("swiftshare_crash.txt")?.let { f ->
                runCatching { f.readText() }.getOrNull()
            }
            ?: "（未捕获到崩溃信息）"

        val pad = (24 * resources.displayMetrics.density).toInt()
        val scroll = ScrollView(this)
        val box = android.widget.LinearLayout(this)
        box.orientation = android.widget.LinearLayout.VERTICAL
        box.setPadding(pad, pad, pad, pad)

        val title = TextView(this).apply {
            text = "SwiftShare 崩溃报告\n请截图或点下方复制发给开发者"
            textSize = 16f
            setPadding(0, 0, 0, pad / 2)
        }
        val body = TextView(this).apply {
            text = trace
            textSize = 12f
            setTextColor(0xFF444444.toInt())
            setTextIsSelectable(true)
        }
        val copyBtn = Button(this).apply {
            text = "复制错误信息"
            setOnClickListener {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("swiftshare_crash", trace))
                Toast.makeText(applicationContext, "已复制，可粘贴发送", Toast.LENGTH_LONG).show()
            }
        }

        box.addView(title)
        box.addView(body)
        box.addView(copyBtn)
        scroll.addView(box)
        setContentView(scroll)
    }
}
