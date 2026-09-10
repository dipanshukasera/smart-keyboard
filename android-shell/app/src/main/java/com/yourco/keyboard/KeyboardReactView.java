package com.yourco.keyboard;

import android.content.Context;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactRootView;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.common.LifecycleState;
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * Wraps the ReactRootView that gets embedded inside the IME window. An IME
 * is not an Activity, so it can't use the usual ReactActivityDelegate - the
 * ReactInstanceManager lifecycle has to be driven manually here instead.
 */
public class KeyboardReactView {

    private static final String COMPONENT_NAME = "SmartKeyboard";

    // Used only until the first real measurement arrives from JS (see
    // KeyboardHeightHolder) and as safety clamps afterward - different
    // panels (main keys, symbols, GIF search-typing) have genuinely
    // different natural heights, so this is a starting point, not a fixed
    // keyboard height.
    private static final float FALLBACK_HEIGHT_FRACTION = 0.38f;
    private static final float MIN_HEIGHT_FRACTION = 0.20f;
    private static final float MAX_HEIGHT_FRACTION = 0.55f;

    private final ReactRootView reactRootView;
    private final ReactInstanceManager reactInstanceManager;

    KeyboardReactView(Context context) {
        // Re-read on every onMeasure() below rather than captured once
        // here: this object is created lazily the first time the keyboard
        // is shown (see ImeService.onCreateInputView) and reused for the
        // service's entire lifetime, including across rotation. Metrics
        // captured only at construction time would stay pinned to
        // whatever orientation was active the first time the keyboard
        // ever appeared, clamping against the wrong (e.g. portrait)
        // screen height forever after even once actually in landscape.
        DisplayMetrics initialMetrics = context.getResources().getDisplayMetrics();
        final int fallbackHeightPx = Math.round(initialMetrics.heightPixels * FALLBACK_HEIGHT_FRACTION);

        // Plain setLayoutParams() isn't enough: whatever container
        // InputMethodService attaches this view to re-measures it with its
        // own LayoutParams, discarding ours. Overriding onMeasure forces
        // the final size irrespective of what MeasureSpec the parent hands
        // down, which is the only thing that actually took effect.
        reactRootView = new ReactRootView(context) {
            @Override
            protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
                DisplayMetrics metrics = getResources().getDisplayMetrics();
                float density = metrics.density;
                int minHeightPx = Math.round(metrics.heightPixels * MIN_HEIGHT_FRACTION);
                int maxHeightPx = Math.round(metrics.heightPixels * MAX_HEIGHT_FRACTION);

                float reportedDp = KeyboardHeightHolder.getContentHeightDp();
                int targetHeightPx;
                if (reportedDp > 0) {
                    int reportedPx = Math.round(reportedDp * density);
                    targetHeightPx = Math.max(minHeightPx, Math.min(maxHeightPx, reportedPx));
                } else {
                    int fallback = Math.round(metrics.heightPixels * FALLBACK_HEIGHT_FRACTION);
                    targetHeightPx = fallback;
                }
                int exactHeightSpec = View.MeasureSpec.makeMeasureSpec(targetHeightPx, View.MeasureSpec.EXACTLY);
                super.onMeasure(widthMeasureSpec, exactHeightSpec);
            }
        };
        reactRootView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, fallbackHeightPx));

        // App.tsx measures its own real content (see the inner wrapper's
        // onLayout) and reports it here via KeyboardSizeModule - whenever
        // that changes (switching panels, opening the suggestion bar,
        // GIF search's typing-mode toggle, ...) re-measure so the window
        // actually resizes instead of sitting at whatever the fallback was.
        KeyboardHeightHolder.setOnHeightChanged(() -> reactRootView.post(reactRootView::requestLayout));

        reactInstanceManager = ((com.facebook.react.ReactApplication) context.getApplicationContext())
                .getReactNativeHost()
                .getReactInstanceManager();

        // Registered once here (not per-input-session) so every future
        // onStartInputView - i.e. every time focus moves to a different
        // field, not just the first one - tells JS whether the new field is
        // a password field, letting the keyboard auto-protect it (hide
        // suggestions, skip learning/clipboard capture).
        InputConnectionHolder.setOnFieldChanged(() -> {
            ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
            if (reactContext == null) {
                return;
            }
            WritableMap params = Arguments.createMap();
            params.putBoolean("isPasswordField", InputConnectionBridge.currentFieldIsPassword());
            params.putBoolean("isNumericField", InputConnectionBridge.currentFieldIsNumeric());
            params.putBoolean("allowDecimal", InputConnectionBridge.currentNumericFieldAllowsDecimal());
            params.putBoolean("allowSign", InputConnectionBridge.currentNumericFieldAllowsSign());
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onInputFieldChanged", params);
        });

        // Fires when the keyboard's view actually goes away (switching
        // apps, dismissing the keyboard, leaving the chat) rather than just
        // moving between fields within the same screen - lets JS reset
        // whatever panel was open (GIF, emoji, settings...) back to the
        // plain keyboard for next time, instead of reopening wherever it
        // was left.
        InputConnectionHolder.setOnInputFinished(() -> {
            ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
            if (reactContext == null) {
                return;
            }
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onKeyboardClosed", null);
        });

        reactRootView.startReactApplication(reactInstanceManager, COMPONENT_NAME, new Bundle());
    }

    View getView() {
        return reactRootView;
    }

    // Without these, ReactInstanceManager's lifecycle state never leaves
    // BEFORE_RESUME (nothing else ever calls onHostResume for an IME -
    // there's no Activity#onResume to hook), and JS's setInterval/
    // setTimeout stop repeating after their very first tick: RN's Timing
    // module drives *repeat* scheduling off a Choreographer frame-callback
    // loop that only runs once the instance is actually RESUMED - the
    // first callback still fires (it's a plain postDelayed under the
    // hood), but nothing ever reschedules the next one. A real Activity
    // gets this for free from ReactActivityDelegate; an IME has to call it
    // itself, tied to the window's own visibility instead (see
    // ImeService's onWindowShown/onWindowHidden).
    void onResume() {
        reactInstanceManager.onHostResume(null);
    }

    void onPause() {
        reactInstanceManager.onHostPause(null);
    }

    void destroy() {
        if (reactRootView != null) {
            reactRootView.unmountReactApplication();
        }
    }
}
