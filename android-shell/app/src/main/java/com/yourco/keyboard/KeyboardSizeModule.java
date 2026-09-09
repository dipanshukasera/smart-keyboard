package com.yourco.keyboard;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/** Lets the RN side report its actual rendered height so the IME window can match it exactly. */
public class KeyboardSizeModule extends ReactContextBaseJavaModule {

    KeyboardSizeModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "KeyboardSizeModule";
    }

    @ReactMethod
    public void reportContentHeight(double heightDp) {
        KeyboardHeightHolder.setContentHeightDp((float) heightDp);
    }
}
