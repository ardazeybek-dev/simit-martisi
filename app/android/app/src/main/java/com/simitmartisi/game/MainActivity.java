package com.simitmartisi.game;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// Oyun tam ekran: durum ve gezinme çubukları gizli, kenardan kaydırınca kısa süre görünür.
// Çentik payını sayfa env(safe-area-inset-*) ile kendisi bırakır (viewport-fit=cover).
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TestLabPlugin.class); // yerel eklenti: super.onCreate'ten önce kaydedilmeli
        super.onCreate(savedInstanceState);
        immersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive(); // bildirim/klavye sonrası çubuklar geri gelirse yeniden gizle
    }

    private void immersive() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
