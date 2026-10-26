package com.yourco.keyboard;

import android.content.Intent;
import android.net.Uri;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import com.facebook.react.bridge.Arguments;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Keyboard background photos (Themes > "Photo"): pick() opens
 * PickBackgroundActivity and resolves with the saved copy's file:// uri
 * plus its colours, or null if the user backed out.
 */
public class BackgroundImageModule extends ReactContextBaseJavaModule {

    static final String DIR = "keyboard_backgrounds";

    // One pick at a time - a second tap while the picker is up replaces
    // the first (which then resolves null).
    private static Promise pending;

    BackgroundImageModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "BackgroundImage";
    }

    static synchronized void deliver(WritableMap result, String error) {
        Promise promise = pending;
        pending = null;
        if (promise == null) return;
        if (error != null) promise.reject("pick_failed", error);
        else promise.resolve(result);
    }

    @ReactMethod
    public void pick(Promise promise) {
        synchronized (BackgroundImageModule.class) {
            if (pending != null) pending.resolve(null);
            pending = promise;
        }
        Intent intent = new Intent(getReactApplicationContext(), PickBackgroundActivity.class);
        // Started from the IME's service context, which has no task of its own.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(intent);
    }

    // Removes a saved background once its theme is deleted. Only touches
    // files in our own backgrounds folder.
    @ReactMethod
    public void remove(String uri) {
        try {
            File file = new File(Uri.parse(uri).getPath());
            File dir = new File(getReactApplicationContext().getFilesDir(), DIR);
            if (dir.getCanonicalPath().equals(file.getParentFile().getCanonicalPath())) {
                file.delete();
            }
        } catch (Exception ignored) {
        }
    }

    // Theme gallery: downloads one of the gallery's pictures, saves it as the
    // app's own copy (same folder and format as a picked photo) and resolves
    // with its colours and shape, so JS can build the theme exactly as for a
    // photo from the gallery picker.
    @ReactMethod
    public void download(final String url, final Promise promise) {
        new Thread(() -> {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                byte[] bytes;
                try (InputStream in = connection.getInputStream(); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                    byte[] chunk = new byte[16384];
                    int read;
                    while ((read = in.read(chunk)) > 0) buffer.write(chunk, 0, read);
                    bytes = buffer.toByteArray();
                } finally {
                    connection.disconnect();
                }
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) throw new IllegalStateException("decode failed");
                File dir = new File(getReactApplicationContext().getFilesDir(), DIR);
                if (!dir.exists()) dir.mkdirs();
                File out = new File(dir, "bg_" + System.currentTimeMillis() + ".jpg");
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 90, fos);
                }
                WritableMap result = Arguments.createMap();
                result.putString("uri", Uri.fromFile(out).toString());
                result.putDouble("aspect", bitmap.getWidth() / (double) bitmap.getHeight());
                PickBackgroundActivity.putColours(bitmap, result);
                promise.resolve(result);
            } catch (Exception e) {
                promise.reject("download_failed", e.getMessage());
            }
        }).start();
    }

    // The phone's own accent colour (Android 12+ "Material You"), as #RRGGBB,
    // or null on older versions.
    @ReactMethod
    public void systemAccent(Promise promise) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                int color = getReactApplicationContext().getColor(android.R.color.system_accent1_600);
                promise.resolve(String.format("#%06X", color & 0xFFFFFF));
                return;
            }
        } catch (Exception ignored) {
        }
        promise.resolve(null);
    }
}
