package com.yourco.keyboard;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.List;

/**
 * Registers the native modules the RN keyboard UI depends on. Kept separate
 * from any auto-linked packages so our bridge surface is easy to find.
 */
public class KeyboardBridgePackage implements ReactPackage {

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new ClipboardModule(reactContext));
        modules.add(new ThemeStorageModule(reactContext));
        modules.add(new InputConnectionBridge(reactContext));
        modules.add(new KeyboardSizeModule(reactContext));
        modules.add(new GifCommitModule(reactContext));
        modules.add(new SoundModule(reactContext));
        modules.add(new ImeSwitcherModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        List<ViewManager> viewManagers = new ArrayList<>();
        viewManagers.add(new HoldRepeatKeyViewManager());
        return viewManagers;
    }
}
