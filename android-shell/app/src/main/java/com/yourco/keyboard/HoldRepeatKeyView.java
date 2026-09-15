package com.yourco.keyboard;

import android.content.Context;
import android.graphics.Outline;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewOutlineProvider;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import com.facebook.react.views.view.ReactViewGroup;

/**
 * Reliable press/long-press/hold-to-repeat/drag detection, modeled directly
 * on fcitx5-android's CustomGestureView (see
 * https://github.com/fcitx5-android/fcitx5-android - app/.../input/keyboard/
 * CustomGestureView.kt): a raw View.onTouchEvent() override with an Android
 * Handler-driven timer, not React Native's TouchableOpacity/PanResponder.
 *
 * This exists because both of those JS-level approaches turned out to be
 * unreliable for this exact use case, for two different reasons:
 *
 *  - TouchableOpacity's onPressIn + a JS setTimeout: Touchable has its own
 *    internal "did the touch move far enough to cancel" heuristic, tuned
 *    for taps, and a genuinely-held finger's natural micro-tremor can trip
 *    it well before a long-press delay elapses.
 *  - PanResponder + a JS setInterval (the delete key's previous
 *    implementation): once a key is a PanResponder, holding it produces a
 *    continuous high-frequency stream of onPanResponderMove calls for the
 *    duration of the hold, and that turned out to starve the JS timer
 *    queue - the setInterval driving repeat-delete never actually fired
 *    past the first tick.
 *
 * A native Handler timer has neither problem: it isn't tied to any JS
 * event stream, and "did this leave the key" is judged against the key's
 * own bounds (like fcitx5's pointInView/touchSlop), not a small fixed
 * pixel delta from the touch-down point - so ordinary hold tremor over a
 * key that's tens of dp wide never even comes close to canceling it.
 *
 * Deliberately reports *only* gesture timing to JS (press start/end, long
 * press fired, each repeat tick, drag distance) rather than performing the
 * InputConnection action itself - the actual commitText/deleteBackward/
 * business logic (typedWord tracking, shift state, suggestion learning)
 * stays in KeyboardLayout.tsx exactly as before. Only *when* to act moved
 * here, not *what* to do.
 */
// Extends ReactViewGroup, not plain FrameLayout: FrameLayout runs its own
// onLayout() pass that repositions children per default Gravity/
// LayoutParams, which stomps on the exact pixel frames RN's Yoga layout
// computes for this view's JS children (the numberHint superscript and
// numberPreviewPopup overlay both use position:'absolute' - a plain
// FrameLayout was rendering them at its own default top-left position
// instead). ReactViewGroup is RN's own base for native views that host
// arbitrary RN children (like <View>) - its onLayout is a deliberate
// no-op so only RN's UIManager ever positions the children, and it also
// implements the standard borderRadius/background-color drawing RN
// <View> gets for free (a plain FrameLayout ignores borderRadius
// entirely), which is why the press-highlight looked wrong too.
public class HoldRepeatKeyView extends ReactViewGroup {

    private static final long DEFAULT_LONG_PRESS_DELAY_MS = 350;
    private static final long DEFAULT_REPEAT_INTERVAL_MS = 60;
    private static final float DEFAULT_DRAG_THRESHOLD_DP = 30f;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final float touchSlop;

    private String mode = "tap"; // "tap" | "repeat" | "longPressOnce"
    private long longPressDelayMs = DEFAULT_LONG_PRESS_DELAY_MS;
    private long repeatIntervalMs = DEFAULT_REPEAT_INTERVAL_MS;
    private float dragThresholdPx;

    private float startX;
    private float startY;
    private boolean movedOutside = false;
    private boolean dragMode = false;
    private boolean longPressFired = false;
    private boolean repeatStarted = false;

    private final Runnable longPressRunnable = () -> {
        longPressFired = true;
        emitEvent("topLongPress", Arguments.createMap());
    };

    private final Runnable repeatRunnable = new Runnable() {
        @Override
        public void run() {
            repeatStarted = true;
            emitEvent("topRepeatTick", Arguments.createMap());
            handler.postDelayed(this, repeatIntervalMs);
        }
    };

    // ReactViewGroup extends RN's own background/color drawing, but
    // borderRadius specifically is wired up in ReactViewManager's own
    // @ReactProp handlers, not in the generic ViewGroupManager base class
    // this view's manager (HoldRepeatKeyViewManager) extends - so setting
    // borderRadius from JS on this view type is silently a no-op with no
    // explicit prop of our own. backgroundColor already worked (that one
    // *is* on the generic base class), which is why the flat fill looked
    // right while the corners stayed square. Clipping the view's own
    // outline to a rounded rect gets the same visual result regardless of
    // how the background itself was painted.
    private float cornerRadiusPx = 0f;

    private final ViewOutlineProvider roundedOutlineProvider = new ViewOutlineProvider() {
        @Override
        public void getOutline(View view, Outline outline) {
            outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), cornerRadiusPx);
        }
    };

    public HoldRepeatKeyView(Context context) {
        super(context);
        touchSlop = ViewConfiguration.get(context).getScaledTouchSlop();
        dragThresholdPx = DEFAULT_DRAG_THRESHOLD_DP * getResources().getDisplayMetrics().density;
        setClickable(true);
        setOutlineProvider(roundedOutlineProvider);
    }

    void setKeyCornerRadiusDp(float dp) {
        cornerRadiusPx = dp * getResources().getDisplayMetrics().density;
        setClipToOutline(cornerRadiusPx > 0f);
        invalidateOutline();
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        // The outline's getOutline() above reads the view's current
        // width/height, but a size change (keyboard-size setting,
        // orientation, one-handed mode) doesn't re-invoke it on its own -
        // without this, a resized key keeps clipping to its old bounds
        // until something else happens to invalidate it.
        if (cornerRadiusPx > 0f) {
            invalidateOutline();
        }
    }

    void setMode(String mode) {
        this.mode = mode;
    }

    void setLongPressDelayMs(int ms) {
        this.longPressDelayMs = ms;
    }

    void setRepeatIntervalMs(int ms) {
        this.repeatIntervalMs = ms;
    }

    void setDragThresholdDp(float dp) {
        this.dragThresholdPx = dp * getResources().getDisplayMetrics().density;
    }

    private boolean pointInBounds(float x, float y) {
        return -touchSlop <= x && -touchSlop <= y
                && x < (getWidth() + touchSlop) && y < (getHeight() + touchSlop);
    }

    // Named distinctly from View's own public cancelLongPress() - a private
    // method with that exact signature is an (accidental, weaker-access)
    // override of it, which javac rejects.
    private void cancelLongPressTimer() {
        handler.removeCallbacks(longPressRunnable);
    }

    private void cancelRepeatTimer() {
        handler.removeCallbacks(repeatRunnable);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX();
        float y = event.getY();
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                startX = x;
                startY = y;
                movedOutside = false;
                dragMode = false;
                longPressFired = false;
                repeatStarted = false;
                emitEvent("topPressStart", Arguments.createMap());
                if ("repeat".equals(mode)) {
                    // Matches useHoldToRepeat's old behavior: an immediate
                    // first tick, then the repeat interval kicks in after
                    // the initial delay.
                    emitEvent("topRepeatTick", Arguments.createMap());
                    handler.postDelayed(repeatRunnable, longPressDelayMs);
                } else if ("longPressOnce".equals(mode)) {
                    handler.postDelayed(longPressRunnable, longPressDelayMs);
                }
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                float dx = x - startX;
                float dy = y - startY;
                if (!movedOutside && !pointInBounds(x, y)) {
                    movedOutside = true;
                    cancelLongPressTimer();
                    cancelRepeatTimer();
                }
                if (!dragMode && Math.abs(dx) > dragThresholdPx) {
                    dragMode = true;
                    cancelLongPressTimer();
                    cancelRepeatTimer();
                }
                if (dragMode) {
                    WritableMap params = Arguments.createMap();
                    params.putDouble("dx", dx);
                    params.putDouble("dy", dy);
                    emitEvent("topDragMove", params);
                }
                return true;
            }
            case MotionEvent.ACTION_UP: {
                cancelLongPressTimer();
                cancelRepeatTimer();
                WritableMap params = Arguments.createMap();
                params.putBoolean("dragMode", dragMode);
                params.putBoolean("longPressFired", longPressFired);
                params.putBoolean("repeatStarted", repeatStarted);
                params.putBoolean("movedOutside", movedOutside);
                emitEvent("topPressEnd", params);
                return true;
            }
            case MotionEvent.ACTION_CANCEL: {
                cancelLongPressTimer();
                cancelRepeatTimer();
                WritableMap params = Arguments.createMap();
                params.putBoolean("dragMode", false);
                params.putBoolean("longPressFired", false);
                params.putBoolean("repeatStarted", false);
                params.putBoolean("movedOutside", true);
                emitEvent("topPressEnd", params);
                return true;
            }
            default:
                return super.onTouchEvent(event);
        }
    }

    private void emitEvent(String name, WritableMap params) {
        ReactContext reactContext = (ReactContext) getContext();
        reactContext.getJSModule(RCTEventEmitter.class).receiveEvent(getId(), name, params);
    }
}
