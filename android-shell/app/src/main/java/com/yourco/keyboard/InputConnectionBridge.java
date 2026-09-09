package com.yourco.keyboard;

import android.text.InputType;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * JS-facing surface for editing the currently focused text field. Every
 * method reads InputConnectionHolder rather than caching a connection,
 * because the active connection changes whenever focus moves between
 * fields and a stale one would silently no-op.
 *
 * Mirrors the contract documented in docs/IME_BRIDGE_PROTOCOL.md - keep
 * both in sync when adding methods here.
 */
public class InputConnectionBridge extends ReactContextBaseJavaModule {

    InputConnectionBridge(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "InputConnectionBridge";
    }

    @ReactMethod
    public void commitText(String text) {
        InputConnection ic = InputConnectionHolder.get();
        if (ic != null) {
            ic.commitText(text, 1);
        }
    }

    @ReactMethod
    public void deleteBackward(int count) {
        InputConnection ic = InputConnectionHolder.get();
        if (ic != null) {
            ic.deleteSurroundingText(count, 0);
        }
    }

    @ReactMethod
    public void sendEnter() {
        InputConnection ic = InputConnectionHolder.get();
        if (ic == null) {
            return;
        }
        // A field that declares a specific action (search/send/done/...)
        // wants that action invoked, not a literal newline character
        // inserted - sending a raw ENTER keycode to e.g. a single-line
        // search box either does nothing or is simply wrong. Only fields
        // with IME_FLAG_NO_ENTER_ACTION (or no action at all, e.g. a plain
        // multi-line text area) actually want the literal key event.
        EditorInfo info = InputConnectionHolder.editorInfo();
        int action = info != null ? (info.imeOptions & EditorInfo.IME_MASK_ACTION) : EditorInfo.IME_ACTION_UNSPECIFIED;
        boolean forceLiteralEnter = info != null && (info.imeOptions & EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0;

        if (!forceLiteralEnter && action != EditorInfo.IME_ACTION_UNSPECIFIED && action != EditorInfo.IME_ACTION_NONE) {
            ic.performEditorAction(action);
        } else {
            ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER));
            ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER));
        }
    }

    @ReactMethod
    public void getImeAction(Promise promise) {
        EditorInfo info = InputConnectionHolder.editorInfo();
        if (info == null) {
            promise.resolve("unspecified");
            return;
        }
        int action = info.imeOptions & EditorInfo.IME_MASK_ACTION;
        switch (action) {
            case EditorInfo.IME_ACTION_SEARCH:
                promise.resolve("search");
                return;
            case EditorInfo.IME_ACTION_SEND:
                promise.resolve("send");
                return;
            case EditorInfo.IME_ACTION_GO:
                promise.resolve("go");
                return;
            case EditorInfo.IME_ACTION_DONE:
                promise.resolve("done");
                return;
            case EditorInfo.IME_ACTION_NEXT:
                promise.resolve("next");
                return;
            default:
                promise.resolve("unspecified");
        }
    }

    @ReactMethod
    public void getTextBeforeCursor(int length, Promise promise) {
        InputConnection ic = InputConnectionHolder.get();
        if (ic == null) {
            promise.resolve("");
            return;
        }
        CharSequence text = ic.getTextBeforeCursor(length, 0);
        promise.resolve(text == null ? "" : text.toString());
    }

    @ReactMethod
    public void setSelection(int start, int end) {
        InputConnection ic = InputConnectionHolder.get();
        if (ic != null) {
            ic.setSelection(start, end);
        }
    }

    // Backs "hold backspace + drag to select-and-delete": the JS side needs
    // to know where the cursor currently is before it can express a
    // selection as an absolute [start, end) range via setSelection. Capped
    // at 1000 chars back - a real drag gesture never spans further than
    // that, and it keeps this cheap on huge documents.
    @ReactMethod
    public void getCursorPosition(Promise promise) {
        InputConnection ic = InputConnectionHolder.get();
        if (ic == null) {
            promise.resolve(0);
            return;
        }
        CharSequence before = ic.getTextBeforeCursor(1000, 0);
        promise.resolve(before == null ? 0 : before.length());
    }

    // Deletes whatever is currently selected (from a prior setSelection
    // call) - this is the standard InputConnection idiom for "replace the
    // active selection with nothing" and works the same way a hardware
    // Delete key would against any selected text.
    @ReactMethod
    public void deleteSelection() {
        InputConnection ic = InputConnectionHolder.get();
        if (ic != null) {
            ic.commitText("", 1);
        }
    }

    // Backs spacebar-drag cursor movement: sends real DPAD key events
    // rather than computing setSelection offsets ourselves, so the target
    // app's own bounds-checking (start/end of text) is what applies, not
    // ours.
    @ReactMethod
    public void moveCursor(int direction) {
        InputConnection ic = InputConnectionHolder.get();
        if (ic == null) {
            return;
        }
        int keyCode = direction < 0 ? KeyEvent.KEYCODE_DPAD_LEFT : KeyEvent.KEYCODE_DPAD_RIGHT;
        ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, keyCode));
        ic.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, keyCode));
    }

    @ReactMethod
    public void isPasswordField(Promise promise) {
        promise.resolve(currentFieldIsPassword());
    }

    // Package-visible so KeyboardReactView's field-change listener can
    // include this in the event it emits to JS without going through a
    // second async bridge round-trip.
    static boolean currentFieldIsPassword() {
        EditorInfo info = InputConnectionHolder.editorInfo();
        if (info == null) {
            return false;
        }
        int variation = info.inputType & InputType.TYPE_MASK_VARIATION;
        int fieldClass = info.inputType & InputType.TYPE_MASK_CLASS;
        if (fieldClass == InputType.TYPE_CLASS_TEXT) {
            return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                    || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
                    || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD;
        }
        if (fieldClass == InputType.TYPE_CLASS_NUMBER) {
            return variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD;
        }
        return false;
    }

    // A payment/amount field declares TYPE_CLASS_NUMBER (or CLASS_PHONE for
    // a phone number field) rather than CLASS_TEXT - apps never expect
    // letters there, so the keyboard should show a number pad instead of
    // QWERTY without the user having to manually switch via the 123 key.
    static boolean currentFieldIsNumeric() {
        EditorInfo info = InputConnectionHolder.editorInfo();
        if (info == null) {
            return false;
        }
        int fieldClass = info.inputType & InputType.TYPE_MASK_CLASS;
        return fieldClass == InputType.TYPE_CLASS_NUMBER
                || fieldClass == InputType.TYPE_CLASS_PHONE
                || fieldClass == InputType.TYPE_CLASS_DATETIME;
    }

    // Whether a "." key makes sense on the number pad - e.g. a currency
    // amount (numberDecimal) wants one, a PIN field (plain number) doesn't.
    static boolean currentNumericFieldAllowsDecimal() {
        EditorInfo info = InputConnectionHolder.editorInfo();
        if (info == null) {
            return false;
        }
        int fieldClass = info.inputType & InputType.TYPE_MASK_CLASS;
        return fieldClass == InputType.TYPE_CLASS_NUMBER
                && (info.inputType & InputType.TYPE_NUMBER_FLAG_DECIMAL) != 0;
    }

    // Whether a "-" key makes sense - e.g. a signed quantity field.
    static boolean currentNumericFieldAllowsSign() {
        EditorInfo info = InputConnectionHolder.editorInfo();
        if (info == null) {
            return false;
        }
        int fieldClass = info.inputType & InputType.TYPE_MASK_CLASS;
        return fieldClass == InputType.TYPE_CLASS_NUMBER
                && (info.inputType & InputType.TYPE_NUMBER_FLAG_SIGNED) != 0;
    }
}
