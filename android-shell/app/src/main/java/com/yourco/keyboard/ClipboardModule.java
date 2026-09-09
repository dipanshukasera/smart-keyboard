package com.yourco.keyboard;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.VibrationEffect;
import android.os.Vibrator;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/** Clipboard access and key-press haptics, both unavailable to a pure RN app. */
public class ClipboardModule extends ReactContextBaseJavaModule {

    ClipboardModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "ClipboardModule";
    }

    @ReactMethod
    public void getClipboardText(Promise promise) {
        ClipboardManager clipboard =
                (ClipboardManager) getReactApplicationContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null || !clipboard.hasPrimaryClip()) {
            promise.resolve("");
            return;
        }
        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) {
            promise.resolve("");
            return;
        }
        CharSequence text = clip.getItemAt(0).coerceToText(getReactApplicationContext());
        promise.resolve(text == null ? "" : text.toString());
    }

    @ReactMethod
    public void setClipboardText(String text) {
        ClipboardManager clipboard =
                (ClipboardManager) getReactApplicationContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("smart-keyboard", text));
        }
    }

    @ReactMethod
    public void keyPressHaptic() {
        Vibrator vibrator =
                (Vibrator) getReactApplicationContext().getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) {
            return;
        }
        vibrator.vibrate(VibrationEffect.createOneShot(12, VibrationEffect.DEFAULT_AMPLITUDE));
    }
}
