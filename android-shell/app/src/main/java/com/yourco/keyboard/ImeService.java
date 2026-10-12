package com.yourco.keyboard;

import android.inputmethodservice.InputMethodService;
import android.view.View;
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

    @Override
    public View onCreateInputView() {
        if (keyboardReactView == null) {
            keyboardReactView = new KeyboardReactView(this);
        }
        View view = keyboardReactView.getView();
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
