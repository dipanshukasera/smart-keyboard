package com.yourco.keyboard;

import android.content.Context;
import android.graphics.Outline;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
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

    // What's handed to the IME window: frame > card > (keys, drag handle). When
    // docked the frame and card are plain pass-throughs around the keys. When
    // floating, the frame gives the card room for its shadow, the card is
    // rounded, and the handle under the keys shows - drag it to move the
    // keyboard, or tap the corner button to dock it again.
    private final FrameLayout frame;
    private final LinearLayout card;
    private final FrameLayout handleBar;
    private final GradientDrawable gripShape;
    private final ImageView dockButton;
    private final float density;
    private int surfaceColor = 0xFFF3F5F8;
    private boolean floatingDecor;
    private float dragDownX, dragDownY;
    private int dragStartX, dragStartY;

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
        density = initialMetrics.density;
        card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.addView(reactRootView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, fallbackHeightPx));

        handleBar = new FrameLayout(context);
        View grip = new View(context);
        gripShape = new GradientDrawable();
        gripShape.setCornerRadius(dp(2));
        gripShape.setColor(0x66808080);
        grip.setBackground(gripShape);
        handleBar.addView(grip, new FrameLayout.LayoutParams(dp(44), dp(4), Gravity.CENTER));
        dockButton = new ImageView(context);
        dockButton.setImageResource(R.drawable.ic_dock);
        dockButton.setColorFilter(0x99808080);
        dockButton.setPadding(dp(5), dp(5), dp(5), dp(5));
        dockButton.setContentDescription("Dock keyboard");
        dockButton.setOnClickListener(v -> {
            ImeService service = ImeService.instance;
            if (service != null) service.setFloating(false);
        });
        handleBar.addView(dockButton, new FrameLayout.LayoutParams(dp(28), dp(28), Gravity.END | Gravity.CENTER_VERTICAL));
        handleBar.setOnTouchListener((v, event) -> {
            ImeService service = ImeService.instance;
            if (service == null) return false;
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    dragDownX = event.getRawX();
                    dragDownY = event.getRawY();
                    dragStartX = service.floatX();
                    dragStartY = service.floatY();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    service.moveFloatingTo(
                            dragStartX + Math.round(event.getRawX() - dragDownX),
                            dragStartY + Math.round(event.getRawY() - dragDownY));
                    return true;
                case MotionEvent.ACTION_UP:
                    // The lift carries the final position: land exactly where
                    // the finger let go, even if the last move was skipped.
                    service.moveFloatingTo(
                            dragStartX + Math.round(event.getRawX() - dragDownX),
                            dragStartY + Math.round(event.getRawY() - dragDownY));
                    service.saveFloatingPosition();
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    service.saveFloatingPosition();
                    return true;
                default:
                    return false;
            }
        });
        handleBar.setVisibility(View.GONE);
        card.addView(handleBar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(28)));

        frame = new FrameLayout(context);
        frame.addView(card, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

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
        return frame;
    }

    private int dp(float value) {
        return Math.round(value * density);
    }

    // Switches the card between docked (plain) and floating (rounded, shadowed,
    // with the drag handle showing).
    void setFloatingDecor(boolean floating) {
        floatingDecor = floating;
        int pad = floating ? dp(10) : 0;
        frame.setPadding(pad, pad, pad, pad);
        handleBar.setVisibility(floating ? View.VISIBLE : View.GONE);
        if (floating) {
            card.setBackgroundColor(surfaceColor);
            card.setClipToOutline(true);
            card.setOutlineProvider(new ViewOutlineProvider() {
                @Override
                public void getOutline(View view, Outline outline) {
                    outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp(22));
                }
            });
            card.setElevation(dp(10));
        } else {
            card.setBackground(null);
            card.setClipToOutline(false);
            card.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
            card.setElevation(0);
        }
        frame.requestLayout();
    }

    // The theme's colours for the strip under the keys.
    void setHandleColors(int surface, int grip) {
        surfaceColor = surface;
        handleBar.setBackgroundColor(surface);
        gripShape.setColor((grip & 0x00FFFFFF) | 0x66000000);
        dockButton.setColorFilter((grip & 0x00FFFFFF) | 0xAA000000);
        if (floatingDecor) card.setBackgroundColor(surface);
    }

    // The window's width and height as laid out right now, in px.
    int frameWidth() { return frame.getWidth(); }
    int frameHeight() { return frame.getHeight(); }

    void emitFloatingChanged(boolean floating) {
        ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
        if (reactContext == null) {
            return;
        }
        WritableMap params = Arguments.createMap();
        params.putBoolean("floating", floating);
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onFloatingChanged", params);
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
    /**
     * Tells JS the cursor is at the very start of the field - every way a
     * field ends up empty (backspacing it all, select-all + delete, the app
     * clearing it after sending) - so the next letter is capitalised.
     */
    void emitCursorAtStart() {
        ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
        if (reactContext == null) {
            return;
        }
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onCursorAtStart", null);
    }

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
