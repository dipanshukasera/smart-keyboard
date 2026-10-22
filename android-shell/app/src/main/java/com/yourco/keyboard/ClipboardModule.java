package com.yourco.keyboard;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

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

    // The latest thing copied, for the suggestion tray's "paste" chip: its
    // text and when it was copied (so copying the same words again counts as
    // new). Resolves null for anything that shouldn't be offered back: no
    // clip, a non-text clip (a picture, a link we put there for a GIF), a clip
    // the keyboard itself set, or one the copying app marked sensitive (a
    // password manager's copy).
    @ReactMethod
    public void getClipboardInfo(Promise promise) {
        ClipboardManager clipboard =
                (ClipboardManager) getReactApplicationContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null || !clipboard.hasPrimaryClip()) {
            promise.resolve(null);
            return;
        }
        ClipDescription description = clipboard.getPrimaryClipDescription();
        ClipData clip = clipboard.getPrimaryClip();
        if (description == null || clip == null || clip.getItemCount() == 0) {
            promise.resolve(null);
            return;
        }
        boolean isText = description.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN)
                || description.hasMimeType(ClipDescription.MIMETYPE_TEXT_HTML);
        CharSequence label = description.getLabel();
        boolean ours = label != null && ("smart-keyboard".contentEquals(label) || "GIF".contentEquals(label));
        boolean sensitive = description.getExtras() != null
                && description.getExtras().getBoolean("android.content.extra.IS_SENSITIVE", false);
        if (!isText || ours || sensitive) {
            promise.resolve(null);
            return;
        }
        CharSequence text = clip.getItemAt(0).coerceToText(getReactApplicationContext());
        if (text == null || text.toString().trim().isEmpty()) {
            promise.resolve(null);
            return;
        }
        WritableMap info = Arguments.createMap();
        info.putString("text", text.toString());
        // ClipDescription.getTimestamp needs Android 8; older phones just
        // fall back to the text itself as the identity.
        info.putDouble("timestamp", Build.VERSION.SDK_INT >= 26 ? (double) description.getTimestamp() : 0);
        promise.resolve(info);
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
