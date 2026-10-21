package com.yourco.keyboard;

import android.graphics.Paint;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;

/**
 * Which emojis this phone can actually draw. The keyboard lists every
 * emoji Unicode has defined, but an older Android's emoji font stops at
 * whatever version shipped with it: a newer emoji it doesn't know would
 * show as an empty box (or as its separate parts), here and in the chat
 * it's sent to. Paint.hasGlyph asks the same font the text is drawn with.
 */
public class EmojiSupportModule extends ReactContextBaseJavaModule {

    EmojiSupportModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "EmojiSupport";
    }

    // Resolves a boolean per emoji, in the same order: true if drawable.
    @ReactMethod
    public void filterSupported(ReadableArray emojis, Promise promise) {
        new Thread(() -> {
            Paint paint = new Paint();
            WritableArray supported = Arguments.createArray();
            for (int i = 0; i < emojis.size(); i++) {
                supported.pushBoolean(paint.hasGlyph(emojis.getString(i)));
            }
            promise.resolve(supported);
        }).start();
    }
}
