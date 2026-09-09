package com.yourco.keyboard;

/**
 * Bridges the RN-measured content height (reported by App.tsx's onLayout,
 * via KeyboardSizeModule) into KeyboardReactView's onMeasure override.
 * Different panels (main keys, symbols, GIF search-typing) all have
 * genuinely different natural heights, so a single hardcoded fraction of
 * the screen is wrong for most of them - this lets the window resize to
 * whatever's actually on screen.
 */
final class KeyboardHeightHolder {

    private static volatile float contentHeightDp = -1f;
    private static volatile Runnable onHeightChanged;

    private KeyboardHeightHolder() {}

    static void setContentHeightDp(float heightDp) {
        contentHeightDp = heightDp;
        Runnable callback = onHeightChanged;
        if (callback != null) {
            callback.run();
        }
    }

    static float getContentHeightDp() {
        return contentHeightDp;
    }

    static void setOnHeightChanged(Runnable callback) {
        onHeightChanged = callback;
    }
}
