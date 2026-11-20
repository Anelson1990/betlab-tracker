package ai.june.spiderfoot

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

/**
 * A thin WebView wrapper around the sf-bridge mobile UI. The bridge URL (the sf-bridge
 * address, reachable over your private tunnel) is stored on first run and editable
 * from the menu. The web page itself handles the token login (it keeps the token in
 * localStorage, which domStorage enables). The app holds no secrets.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences("sf", Context.MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        web = findViewById(R.id.web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true      // the UI stores the bridge token here
        web.settings.useWideViewPort = true
        web.settings.loadWithOverviewMode = true
        web.webViewClient = WebViewClient()         // keep navigation inside the app

        val url = prefs.getString("url", null)
        if (url.isNullOrBlank()) promptUrl() else web.loadUrl(url)
    }

    private fun promptUrl() {
        val input = EditText(this).apply {
            hint = "http://<box-tailscale-ip>:8600"
            setText(prefs.getString("url", "http://"))
        }
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.bridge_url))
            .setMessage(getString(R.string.bridge_url_help))
            .setView(input)
            .setPositiveButton(getString(R.string.load)) { _, _ ->
                val u = input.text.toString().trim()
                if (u.isNotEmpty()) {
                    prefs.edit().putString("url", u).apply()
                    web.loadUrl(u)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.set_url -> { promptUrl(); true }
        R.id.reload -> { web.reload(); true }
        else -> super.onOptionsItemSelected(item)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
