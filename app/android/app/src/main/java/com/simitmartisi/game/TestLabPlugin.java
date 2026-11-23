package com.simitmartisi.game;

import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Google Play'in yayın öncesi raporu oyunu Firebase Test Lab cihazlarında robotla oynatır; bu cihazlarda
// "firebase.test.lab" ayarı "true" olur. Oyun bunu sorar ve o cihazda sıralama sunucusuna hiç bağlanmaz.
@CapacitorPlugin(name = "TestLab")
public class TestLabPlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        boolean lab = false;
        try {
            lab = "true".equals(Settings.System.getString(getContext().getContentResolver(), "firebase.test.lab"));
        } catch (Exception e) {}
        JSObject r = new JSObject();
        r.put("lab", lab);
        call.resolve(r);
    }
}
