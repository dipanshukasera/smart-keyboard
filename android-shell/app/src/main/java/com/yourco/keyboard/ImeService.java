package com.yourco.keyboard;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.inputmethodservice.InputMethodService;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;

/**
 * Core IME lifecycle. Boots a single ReactRootView the first time the
 * keyboard is shown and reuses it for every subsequent input session -
 * recreating the RN surface on every keystroke session would be far too slow.
 *
 * The active InputConnection changes per input session (i.e. per focused
 * text field), so it's published to InputConnectionHolder on every
 * onStartInput/onFinishInput so the RN-facing native module always talks to
 * whichever field currently has focus.
 */
public class ImeService extends InputMethodService {

    private KeyboardReactView keyboardReactView;

    // The running service, for the native modules (FloatingKeyboardModule) and
    // the drag handle to reach.
    static volatile ImeService instance;

    private static final String PREFS = "smart_keyboard_prefs";
    private final Handler main = new Handler(Looper.getMainLooper());
    // Floating mode: the keyboard is a card placed anywhere on screen instead
    // of docked at the bottom. floatX/floatY are the window's offset from the
    // screen's top-left, -1 until it's been placed (then it starts bottom
    // centre).
    private boolean floating;
    // The window's own background when docked, kept while floating swaps it for
    // a transparent one (so nothing shows around the rounded card).
    private Drawable dockedBackground;
    private boolean dockedBackgroundSaved;
    private int floatX = -1;
    private int floatY = -1;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        floating = prefs.getBoolean("floating_mode", false);
        floatX = prefs.getInt("float_x", -1);
        floatY = prefs.getInt("float_y", -1);
    }

    void runOnMain(Runnable action) {
        main.post(action);
    }

    boolean isFloating() { return floating; }
    int floatX() { return Math.max(floatX, 0); }
    int floatY() { return Math.max(floatY, 0); }

    void setFloating(boolean on) {
        floating = on;
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("floating_mode", on).apply();
        applyWindowMode();
        if (keyboardReactView != null) keyboardReactView.emitFloatingChanged(on);
    }

    void setHandleColors(int surface, int grip) {
        if (keyboardReactView != null) keyboardReactView.setHandleColors(surface, grip);
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    // Width of the floating window: most of the screen, but no wider than a
    // comfortable phone keyboard; plus the room the card's shadow needs.
    private int floatWindowWidth() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        return Math.min(Math.round(metrics.widthPixels * 0.88f), dp(420)) + 2 * dp(10);
    }

    // Puts the IME window where the current mode wants it: docked (full width,
    // bottom) or floating (card-sized, at floatX/floatY).
    private void applyWindowMode() {
        if (getWindow() == null) return;
        Window window = getWindow().getWindow();
        if (window == null) return;
        WindowManager.LayoutParams lp = window.getAttributes();
        if (floating) {
            lp.gravity = Gravity.TOP | Gravity.START;
            lp.width = floatWindowWidth();
            lp.height = WindowManager.LayoutParams.WRAP_CONTENT;
            lp.x = Math.max(floatX, 0);
            lp.y = Math.max(floatY, 0);
        } else {
            lp.gravity = Gravity.BOTTOM;
            lp.width = WindowManager.LayoutParams.MATCH_PARENT;
            lp.height = WindowManager.LayoutParams.WRAP_CONTENT;
            lp.x = 0;
            lp.y = 0;
        }
        window.setAttributes(lp);
        if (!dockedBackgroundSaved) {
            dockedBackground = window.getDecorView().getBackground();
            dockedBackgroundSaved = true;
        }
        window.setBackgroundDrawable(floating ? new ColorDrawable(Color.TRANSPARENT) : dockedBackground);
        if (keyboardReactView != null) {
            keyboardReactView.setFloatingDecor(floating);
            if (floating) placeIfNew();
        }
    }

    // First time floating: start bottom centre, once the card's size is known.
    private void placeIfNew() {
        if (floatX >= 0 && floatY >= 0) return;
        View view = keyboardReactView.getView();
        view.post(() -> {
            if (!floating || (floatX >= 0 && floatY >= 0) || view.getHeight() == 0) return;
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            floatX = Math.max(0, (metrics.widthPixels - floatWindowWidth()) / 2);
            floatY = Math.max(0, metrics.heightPixels - view.getHeight() - dp(96));
            applyWindowMode();
            saveFloatingPosition();
        });
    }

    // Moves the floating window, kept on screen.
    void moveFloatingTo(int x, int y) {
        if (!floating || getWindow() == null || keyboardReactView == null) return;
        Window window = getWindow().getWindow();
        if (window == null) return;
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int width = Math.max(keyboardReactView.frameWidth(), floatWindowWidth());
        int height = keyboardReactView.frameHeight();
        floatX = Math.max(0, Math.min(x, metrics.widthPixels - width));
        floatY = Math.max(0, Math.min(y, metrics.heightPixels - height));
        WindowManager.LayoutParams lp = window.getAttributes();
        lp.x = floatX;
        lp.y = floatY;
        window.setAttributes(lp);
    }

    void saveFloatingPosition() {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("float_x", floatX).putInt("float_y", floatY).apply();
    }

    // A floating keyboard takes no room from the app behind it: report that
    // the whole window is "above" the content, so the app isn't pushed up or
    // squashed, and touches around the card go straight to it.
    @Override
    public void onComputeInsets(Insets outInsets) {
        super.onComputeInsets(outInsets);
        if (floating && getWindow() != null && getWindow().getWindow() != null) {
            int height = getWindow().getWindow().getDecorView().getHeight();
            outInsets.contentTopInsets = height;
            outInsets.visibleTopInsets = height;
            // With the whole window "above" the content, the default rule
            // (touchable = the visible part) leaves nothing to touch: say the
            // card's own frame is touchable.
            outInsets.touchableInsets = Insets.TOUCHABLE_INSETS_FRAME;
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // A rotation changes the screen size the card is placed in.
        if (floating) {
            floatX = -1;
            floatY = -1;
            applyWindowMode();
        }
    }

    @Override
    public View onCreateInputView() {
        if (keyboardReactView == null) {
            keyboardReactView = new KeyboardReactView(this);
        }
        View view = keyboardReactView.getView();
        applyWindowMode();
        // onCreateInputView() can fire more than once across the IME's
        // lifetime (e.g. on a configuration change), but this always
        // returns the same cached view rather than building a new one -
        // if it's still attached to whatever window last held it, the
        // framework's setInputView() throws "already has a parent" trying
        // to attach it to the new one. Detach it from its old parent
        // first so the same instance can be reattached cleanly.
        ViewParent parent = view.getParent();
        if (parent instanceof ViewGroup) {
            ((ViewGroup) parent).removeView(view);
        }
        return view;
    }

    @Override
    public void onWindowShown() {
        super.onWindowShown();
        // Re-apply: showing the window can reset its position.
        applyWindowMode();
        if (keyboardReactView != null) {
            keyboardReactView.onResume();
        }
    }

    @Override
    public void onWindowHidden() {
        super.onWindowHidden();
        if (keyboardReactView != null) {
            keyboardReactView.onPause();
        }
    }

    @Override
    public void onStartInput(EditorInfo info, boolean restarting) {
        super.onStartInput(info, restarting);
        // onStartInput fires for every field-focus change, including
        // tapping between fields on the same screen while the keyboard
        // stays continuously visible - onStartInputView only fires when
        // the IME's *view* needs to (re)appear, which doesn't happen in
        // that case. Password-field and numeric-field auto-detection both
        // depend on this firing on every field change, not just the first
        // one per keyboard show/hide cycle.
        InputConnectionHolder.set(getCurrentInputConnection(), info);
    }

    @Override
    public void onStartInputView(EditorInfo info, boolean restarting) {
        super.onStartInputView(info, restarting);
        InputConnectionHolder.set(getCurrentInputConnection(), info);
    }

    // Fires whenever the cursor or selection moves in the focused field -
    // including after the keyboard's own edits. Only the "cursor now at the
    // very start" case matters here (see KeyboardReactView.emitCursorAtStart).
    @Override
    public void onUpdateSelection(int oldSelStart, int oldSelEnd, int newSelStart, int newSelEnd,
                                  int candidatesStart, int candidatesEnd) {
        super.onUpdateSelection(oldSelStart, oldSelEnd, newSelStart, newSelEnd, candidatesStart, candidatesEnd);
        boolean nowAtStart = newSelStart == 0 && newSelEnd == 0;
        boolean wasAtStart = oldSelStart == 0 && oldSelEnd == 0;
        if (nowAtStart && !wasAtStart && keyboardReactView != null) {
            keyboardReactView.emitCursorAtStart();
        }
    }

    @Override
    public void onFinishInputView(boolean finishingInput) {
        super.onFinishInputView(finishingInput);
        InputConnectionHolder.clear();
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        if (keyboardReactView != null) {
            keyboardReactView.destroy();
            keyboardReactView = null;
        }
        super.onDestroy();
    }

    /** Exposed so InputConnectionBridge can fall back to the service directly if needed. */
    InputConnection currentInputConnection() {
        return getCurrentInputConnection();
    }
}
