package com.yourco.keyboard;

import android.content.Context;
import android.content.SharedPreferences;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Persists the active theme (and active language subtype) outside of RN's
 * JS bundle storage, so a chosen theme survives a JS bundle reload and is
 * readable before the RN instance has fully booted.
 */
public class ThemeStorageModule extends ReactContextBaseJavaModule {

    private static final String PREFS_NAME = "smart_keyboard_prefs";
    private static final String KEY_THEME_JSON = "active_theme_json";
    private static final String KEY_ACTIVE_LOCALE = "active_locale";

    ThemeStorageModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "ThemeStorageModule";
    }

    private SharedPreferences prefs() {
        return getReactApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @ReactMethod
    public void saveTheme(String themeJson) {
        prefs().edit().putString(KEY_THEME_JSON, themeJson).apply();
    }

    @ReactMethod
    public void loadTheme(Promise promise) {
        promise.resolve(prefs().getString(KEY_THEME_JSON, null));
    }

    @ReactMethod
    public void saveActiveLocale(String locale) {
        prefs().edit().putString(KEY_ACTIVE_LOCALE, locale).apply();
    }

    @ReactMethod
    public void loadActiveLocale(Promise promise) {
        promise.resolve(prefs().getString(KEY_ACTIVE_LOCALE, "en-US"));
    }

    // Generic string storage (JSON-serialize on the JS side) so each new
    // small preference - learned words, clipboard history, one-handed mode,
    // incognito - doesn't need its own dedicated native method pair.
    @ReactMethod
    public void saveString(String key, String value) {
        prefs().edit().putString(key, value).apply();
    }

    @ReactMethod
    public void loadString(String key, Promise promise) {
        promise.resolve(prefs().getString(key, null));
    }
}
