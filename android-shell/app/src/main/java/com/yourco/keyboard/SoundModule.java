package com.yourco.keyboard;

import android.content.Context;
import android.media.AudioManager;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Plays Android's own built-in keypress click sound (AudioManager.FX_KEYPRESS_STANDARD)
 * for the "Key sound" toggle - deliberately not a bundled sound file or a
 * new audio library, since the system already ships this sound and every
 * device already has its own key-click volume/mute state wired to it.
 */
public class SoundModule extends ReactContextBaseJavaModule {

    SoundModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "SoundModule";
    }

    @ReactMethod
    public void playKeyClick() {
        AudioManager audioManager = (AudioManager) getReactApplicationContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            audioManager.playSoundEffect(AudioManager.FX_KEYPRESS_STANDARD);
        }
    }
}
