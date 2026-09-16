package com.yourco.keyboard;

import android.content.Context;
import android.view.inputmethod.InputMethodManager;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Opens Android's own system keyboard-switcher dialog (the same one a
 * long-press on Gboard's spacebar shows) - lets the user jump to any other
 * installed IME without leaving the field they're typing in. This is a
 * global system dialog, not something scoped to a particular Activity, so
 * any live Context works here, including this bridge module's own
 * ReactApplicationContext.
 */
public class ImeSwitcherModule extends ReactContextBaseJavaModule {

    ImeSwitcherModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "ImeSwitcherModule";
    }

    @ReactMethod
    public void showPicker() {
        InputMethodManager imm =
                (InputMethodManager) getReactApplicationContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) {
            imm.showInputMethodPicker();
        }
    }
}
