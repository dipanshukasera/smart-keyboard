package com.yourco.keyboard;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/**
 * Invisible activity behind Themes > "Photo": an IME can't start an
 * activity for a result itself, so this one opens the system photo picker,
 * saves a resized copy of the chosen image in the app's own storage (the
 * picker's grant on the original doesn't outlive this activity), works out
 * its colours, and hands the result back to BackgroundImageModule.
 */
public class PickBackgroundActivity extends Activity {

    private static final int REQUEST_PICK = 1;
    // Longest side of the saved copy - plenty for a keyboard-sized area,
    // and keeps a 12MP photo from costing ~50MB of memory every time the
    // keyboard opens.
    private static final int MAX_SIDE = 1440;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) return;
        Intent pick;
        if (Build.VERSION.SDK_INT >= 33) {
            pick = new Intent(MediaStore.ACTION_PICK_IMAGES);
        } else {
            pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.setType("image/*");
            pick.addCategory(Intent.CATEGORY_OPENABLE);
        }
        try {
            startActivityForResult(pick, REQUEST_PICK);
        } catch (Exception e) {
            BackgroundImageModule.deliver(null, "No photo picker available");
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = data != null ? data.getData() : null;
        if (requestCode != REQUEST_PICK || resultCode != RESULT_OK || uri == null) {
            BackgroundImageModule.deliver(null, null);
            finish();
            return;
        }
        new Thread(() -> {
            try {
                BackgroundImageModule.deliver(process(uri), null);
            } catch (Exception e) {
                BackgroundImageModule.deliver(null, "Couldn't read that image");
            }
            runOnUiThread(this::finish);
        }).start();
    }

    private WritableMap process(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bitmap;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            bitmap = BitmapFactory.decodeStream(in, null, opts);
        }
        if (bitmap == null) throw new IllegalStateException("decode failed");

        // Camera photos are often stored sideways with an EXIF rotation tag.
        int rotation = 0;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            int orientation = new ExifInterface(in)
                    .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) rotation = 90;
            else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) rotation = 180;
            else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) rotation = 270;
        } catch (Exception ignored) {
        }
        float scale = Math.min(1f, MAX_SIDE / (float) Math.max(bitmap.getWidth(), bitmap.getHeight()));
        if (rotation != 0 || scale < 1f) {
            Matrix matrix = new Matrix();
            matrix.postScale(scale, scale);
            matrix.postRotate(rotation);
            bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        }

        File dir = new File(getFilesDir(), BackgroundImageModule.DIR);
        if (!dir.exists()) dir.mkdirs();
        // A new name per pick, so the image cache never shows an old one.
        File out = new File(dir, "bg_" + System.currentTimeMillis() + ".jpg");
        try (FileOutputStream fos = new FileOutputStream(out)) {
            bitmap.compress(Bitmap.CompressFormat.JPEG, 88, fos);
        }

        WritableMap result = Arguments.createMap();
        result.putString("uri", Uri.fromFile(out).toString());
        putColours(bitmap, result);
        return result;
    }

    // The image's main colour (most common, after grouping similar
    // shades), its most vivid colour that covers a meaningful part of it,
    // and its overall brightness - enough for JS to derive key, text and
    // accent colours that sit well on top of it.
    static void putColours(Bitmap source, WritableMap result) {
        Bitmap small = Bitmap.createScaledBitmap(source, 48, 48, true);
        int total = 48 * 48;
        // 5 bits per channel: 32768 buckets of similar colours.
        int[] counts = new int[1 << 15];
        long[] sumR = new long[1 << 15];
        long[] sumG = new long[1 << 15];
        long[] sumB = new long[1 << 15];
        double luminance = 0;
        for (int y = 0; y < 48; y++) {
            for (int x = 0; x < 48; x++) {
                int c = small.getPixel(x, y);
                int r = Color.red(c), g = Color.green(c), b = Color.blue(c);
                int bucket = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
                counts[bucket]++;
                sumR[bucket] += r;
                sumG[bucket] += g;
                sumB[bucket] += b;
                luminance += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;
            }
        }
        int dominant = -1;
        for (int i = 0; i < counts.length; i++) {
            if (counts[i] > 0 && (dominant < 0 || counts[i] > counts[dominant])) dominant = i;
        }
        float[] dominantHsv = new float[3];
        Color.colorToHSV(averageOf(dominant, counts, sumR, sumG, sumB), dominantHsv);
        // The accent should stand out from the main colour, not be a shade
        // of it - so among colours covering at least 1% of the image, pick
        // the most saturated, brightest one whose hue is clearly different
        // (area counts only a little: a small bright patch beats a big
        // dull one). Falls back to the same hue if that's all there is.
        int vibrant = -1;
        int sameHue = -1;
        double bestVibrance = 0;
        double bestSameHue = 0;
        float[] hsv = new float[3];
        for (int i = 0; i < counts.length; i++) {
            if (counts[i] * 100 < total) continue;
            Color.colorToHSV(averageOf(i, counts, sumR, sumG, sumB), hsv);
            if (hsv[1] < 0.3 || hsv[2] < 0.35) continue;
            double vibrance = hsv[1] * hsv[2] * Math.pow(counts[i], 0.3);
            float hueGap = Math.abs(hsv[0] - dominantHsv[0]);
            hueGap = Math.min(hueGap, 360 - hueGap);
            boolean distinct = dominantHsv[1] < 0.2 || hueGap > 30;
            if (distinct && vibrance > bestVibrance) {
                bestVibrance = vibrance;
                vibrant = i;
            } else if (!distinct && vibrance > bestSameHue) {
                bestSameHue = vibrance;
                sameHue = i;
            }
        }
        if (vibrant < 0) vibrant = sameHue;
        result.putString("dominant", hex(dominant, counts, sumR, sumG, sumB));
        if (vibrant >= 0) result.putString("vibrant", hex(vibrant, counts, sumR, sumG, sumB));
        result.putDouble("luminance", luminance / total);
    }

    private static int averageOf(int bucket, int[] counts, long[] r, long[] g, long[] b) {
        int n = counts[bucket];
        return Color.rgb((int) (r[bucket] / n), (int) (g[bucket] / n), (int) (b[bucket] / n));
    }

    private static String hex(int bucket, int[] counts, long[] r, long[] g, long[] b) {
        int n = counts[bucket];
        return String.format("#%02X%02X%02X", (int) (r[bucket] / n), (int) (g[bucket] / n), (int) (b[bucket] / n));
    }
}
