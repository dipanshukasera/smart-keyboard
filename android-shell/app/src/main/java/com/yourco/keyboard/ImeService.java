package com.yourco.keyboard;

import android.inputmethodservice.InputMethodService;
import android.view.View;
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

    @Override
    public View onCreateInputView() {
        if (keyboardReactView == null) {
            keyboardReactView = new KeyboardReactView(this);
        }
        return keyboardReactView.getView();
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

    @Override
    public void onFinishInputView(boolean finishingInput) {
        super.onFinishInputView(finishingInput);
        InputConnectionHolder.clear();
    }

    @Override
    public void onDestroy() {
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
