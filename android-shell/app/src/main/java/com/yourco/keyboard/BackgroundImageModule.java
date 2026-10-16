package com.yourco.keyboard;

import android.content.Intent;
import android.net.Uri;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import java.io.File;

/**
 * Keyboard background photos (Themes > "Photo"): pick() opens
 * PickBackgroundActivity and resolves with the saved copy's file:// uri
 * plus its colours, or null if the user backed out.
 */
public class BackgroundImageModule extends ReactContextBaseJavaModule {

    static final String DIR = "keyboard_backgrounds";

    // One pick at a time - a second tap while the picker is up replaces
    // the first (which then resolves null).
    private static Promise pending;

    BackgroundImageModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "BackgroundImage";
    }

    static synchronized void deliver(WritableMap result, String error) {
        Promise promise = pending;
        pending = null;
        if (promise == null) return;
        if (error != null) promise.reject("pick_failed", error);
        else promise.resolve(result);
    }

    @ReactMethod
    public void pick(Promise promise) {
        synchronized (BackgroundImageModule.class) {
            if (pending != null) pending.resolve(null);
            pending = promise;
        }
        Intent intent = new Intent(getReactApplicationContext(), PickBackgroundActivity.class);
        // Started from the IME's service context, which has no task of its own.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(intent);
    }

    // Removes a saved background once its theme is deleted. Only touches
    // files in our own backgrounds folder.
    @ReactMethod
    public void remove(String uri) {
        try {
            File file = new File(Uri.parse(uri).getPath());
            File dir = new File(getReactApplicationContext().getFilesDir(), DIR);
            if (dir.getCanonicalPath().equals(file.getParentFile().getCanonicalPath())) {
                file.delete();
            }
        } catch (Exception ignored) {
        }
    }
}
