package com.yourco.keyboard;

import android.graphics.Color;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Floating keyboard mode (the "Floating" tool): the keyboard becomes a card
 * that can be dragged anywhere on the screen (see ImeService and the handle
 * in KeyboardReactView). JS toggles it and learns of changes through the
 * "onFloatingChanged" event.
 */
public class FloatingKeyboardModule extends ReactContextBaseJavaModule {

    FloatingKeyboardModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "FloatingKeyboard";
    }

    // Required by RN for modules that emit events.
    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(double count) {}

    @ReactMethod
    public void isFloating(Promise promise) {
        ImeService service = ImeService.instance;
        promise.resolve(service != null && service.isFloating());
    }

    @ReactMethod
    public void setFloating(boolean floating) {
        ImeService service = ImeService.instance;
        if (service != null) {
            service.runOnMain(() -> service.setFloating(floating));
        }
    }

    // The theme's panel colour (#RRGGBB) and a grip colour, so the drag handle
    // below the keys matches whatever theme is on.
    @ReactMethod
    public void setHandleColors(String surfaceHex, String gripHex) {
        ImeService service = ImeService.instance;
        if (service == null) return;
        try {
            int surface = Color.parseColor(surfaceHex);
            int grip = Color.parseColor(gripHex);
            service.runOnMain(() -> service.setHandleColors(surface, grip));
        } catch (IllegalArgumentException ignored) {
        }
    }
}
