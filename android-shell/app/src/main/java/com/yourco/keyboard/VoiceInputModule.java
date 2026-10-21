package com.yourco.keyboard;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.inputmethod.InputConnection;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.util.ArrayList;

/**
 * Voice typing: Android's on-device/Google speech recognizer, driven from
 * JS (VoicePanel). Emits "onVoiceEvent" with a `type` of:
 *   ready      - listening, the user can speak
 *   level      - input loudness 0..1 (for the mic animation), ~10/second
 *   partial    - the words so far, `text` (shown live, not yet typed)
 *   result     - final words, `text` - already typed into the field
 *   end        - stopped (after a result, an error, or stop())
 *   error      - `code` (see errorName) and stops
 *   permission - `granted` after the first-time microphone prompt
 */
public class VoiceInputModule extends ReactContextBaseJavaModule {

    private static VoiceInputModule instance;

    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private long lastLevelAt;

    VoiceInputModule(ReactApplicationContext reactContext) {
        super(reactContext);
        instance = this;
    }

    @Override
    public String getName() {
        return "VoiceInput";
    }

    // Required by RN for modules that emit events.
    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(double count) {}

    static void onPermissionResult(boolean granted) {
        if (instance == null) return;
        WritableMap event = Arguments.createMap();
        event.putString("type", "permission");
        event.putBoolean("granted", granted);
        instance.emit(event);
    }

    @ReactMethod
    public void isAvailable(Promise promise) {
        promise.resolve(SpeechRecognizer.isRecognitionAvailable(getReactApplicationContext()));
    }

    @ReactMethod
    public void hasPermission(Promise promise) {
        promise.resolve(micAllowed());
    }

    // Shows the microphone prompt (MicPermissionActivity); the answer
    // arrives as a "permission" event.
    @ReactMethod
    public void requestPermission() {
        Intent intent = new Intent(getReactApplicationContext(), MicPermissionActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(intent);
    }

    // `locale` is a BCP-47 tag like "en-GB" or "hi-IN".
    @ReactMethod
    public void start(String locale) {
        main.post(() -> {
            if (!micAllowed()) {
                emitError(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS);
                return;
            }
            destroyRecognizer();
            recognizer = SpeechRecognizer.createSpeechRecognizer(getReactApplicationContext());
            recognizer.setRecognitionListener(listener);
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getReactApplicationContext().getPackageName());
            recognizer.startListening(intent);
        });
    }

    // Stop listening and finish recognising what was said so far.
    @ReactMethod
    public void stop() {
        main.post(() -> {
            if (recognizer != null) recognizer.stopListening();
        });
    }

    // Stop and discard (closing the panel, leaving the field).
    @ReactMethod
    public void cancel() {
        main.post(this::destroyRecognizer);
    }

    private boolean micAllowed() {
        return getReactApplicationContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            recognizer.cancel();
            recognizer.destroy();
            recognizer = null;
        }
    }

    private static String firstResult(Bundle results) {
        ArrayList<String> matches = results != null
                ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                : null;
        return matches != null && !matches.isEmpty() ? matches.get(0) : "";
    }

    // Types the recognised words: a space before them if they follow a word,
    // and a capital first letter at the start of the field or a sentence.
    private void commitDictation(String text) {
        InputConnection ic = InputConnectionHolder.get();
        if (ic == null || text.isEmpty()) return;
        CharSequence before = ic.getTextBeforeCursor(2, 0);
        String prev = before == null ? "" : before.toString();
        boolean sentenceStart = prev.trim().isEmpty() || prev.trim().matches(".*[.!?]$");
        if (sentenceStart) text = Character.toUpperCase(text.charAt(0)) + text.substring(1);
        if (!prev.isEmpty() && !Character.isWhitespace(prev.charAt(prev.length() - 1))) text = " " + text;
        ic.commitText(text, 1);
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) {
            emitType("ready");
        }

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {
            long now = System.currentTimeMillis();
            if (now - lastLevelAt < 100) return;
            lastLevelAt = now;
            WritableMap event = Arguments.createMap();
            event.putString("type", "level");
            // Roughly -2dB (silence) .. 10dB (loud speech).
            event.putDouble("level", Math.max(0, Math.min(1, (rmsdB + 2) / 12.0)));
            emit(event);
        }

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onError(int error) {
            emitError(error);
            destroyRecognizer();
        }

        @Override
        public void onResults(Bundle results) {
            String text = firstResult(results);
            commitDictation(text);
            WritableMap event = Arguments.createMap();
            event.putString("type", "result");
            event.putString("text", text);
            emit(event);
            emitType("end");
            destroyRecognizer();
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            WritableMap event = Arguments.createMap();
            event.putString("type", "partial");
            event.putString("text", firstResult(partialResults));
            emit(event);
        }

        @Override
        public void onEvent(int eventType, Bundle params) {}
    };

    private void emitType(String type) {
        WritableMap event = Arguments.createMap();
        event.putString("type", type);
        emit(event);
    }

    private void emitError(int code) {
        WritableMap event = Arguments.createMap();
        event.putString("type", "error");
        event.putString("code", errorName(code));
        emit(event);
        emitType("end");
    }

    private static String errorName(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "no_speech";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "permission";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
                return "network";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "busy";
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
                return "language";
            default:
                return "other";
        }
    }

    private void emit(WritableMap event) {
        if (!getReactApplicationContext().hasActiveReactInstance()) return;
        getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onVoiceEvent", event);
    }
}
