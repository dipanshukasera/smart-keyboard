package com.yourco.keyboard;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactHost;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultReactHost;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.soloader.SoLoader;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {

    private final ReactNativeHost reactNativeHost = new DefaultReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
            return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
            List<ReactPackage> packages = new PackageList(this).getPackages();
            // Native modules that aren't auto-linked (our own bridge surface).
            packages.add(new KeyboardBridgePackage());
            return packages;
        }

        @Override
        protected String getJSMainModuleName() {
            return "index";
        }

        // An IME is a Service, not an Activity - onHostResume/onHostPause
        // (see KeyboardReactView/ImeService) always pass null for the
        // activity, which is normal here, not a bug. The default true
        // makes ReactInstanceManager.onHostPause() assert
        // mCurrentActivity != null and crash the moment the keyboard
        // window is ever hidden after having been shown once - this is
        // the documented override point for exactly that case.
        @Override
        public boolean getShouldRequireActivity() {
            return false;
        }
    };

    @Override
    public ReactNativeHost getReactNativeHost() {
        return reactNativeHost;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        SoLoader.init(this, /* native exopackage */ false);
    }
}
