package com.yourco.keyboard;

import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;

/**
 * Process-wide holder for the InputConnection of whichever text field is
 * currently focused. There is exactly one active IME session at a time, so a
 * simple static holder (rather than passing the connection through the RN
 * bridge call graph) is enough and keeps InputConnectionBridge stateless.
 */
final class InputConnectionHolder {

    private static volatile InputConnection currentConnection;
    private static volatile EditorInfo currentEditorInfo;
    private static volatile Runnable onFieldChanged;
    private static volatile Runnable onInputFinished;

    private InputConnectionHolder() {}

    static void set(InputConnection connection, EditorInfo info) {
        currentConnection = connection;
        currentEditorInfo = info;
        if (onFieldChanged != null) {
            onFieldChanged.run();
        }
    }

    // KeyboardReactView registers this once, when the RN surface is first
    // created, to forward field-focus changes to JS (e.g. so the keyboard
    // can auto-protect password fields) - every subsequent onStartInputView
    // fires it again, unlike a one-shot bridge call made at RN mount time.
    static void setOnFieldChanged(Runnable listener) {
        onFieldChanged = listener;
    }

    // Fired from clear() - i.e. onFinishInputView, when the keyboard's
    // *view* actually goes away (leaving the app/chat), not merely moving
    // between fields within it - see ImeService and KeyboardReactView.
    static void setOnInputFinished(Runnable listener) {
        onInputFinished = listener;
    }

    static void clear() {
        currentConnection = null;
        currentEditorInfo = null;
        if (onInputFinished != null) {
            onInputFinished.run();
        }
    }

    static InputConnection get() {
        return currentConnection;
    }

    static EditorInfo editorInfo() {
        return currentEditorInfo;
    }
}
