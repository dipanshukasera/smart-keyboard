package com.yourco.keyboard;

import android.content.ClipDescription;
import android.net.Uri;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import androidx.core.content.FileProvider;
import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Sends a GIF directly into the focused field via InputConnection.commitContent
 * (InputConnectionCompat so it degrades gracefully on older API levels)
 * instead of just copying its URL to the clipboard. This is exactly how
 * Gboard/SwiftKey send GIFs into apps like Instagram DMs, WhatsApp, or
 * Telegram - the *target* field has to opt in by declaring an accepted
 * content MIME type in its EditorInfo, which is why isRichContentSupported
 * exists: not every text field does, and GifStickerPanel falls back to the
 * clipboard when it doesn't.
 */
public class GifCommitModule extends ReactContextBaseJavaModule {

    GifCommitModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "GifCommitModule";
    }

    @ReactMethod
    public void isRichContentSupported(Promise promise) {
        promise.resolve(currentFieldAcceptsGif());
    }

    // Downloads (or reuses an already-cached copy of) any GIF/thumbnail URL
    // so it can be shown/re-sent later with zero network - this is what
    // backs the "Recently Used" section, which stays populated and usable
    // offline once a GIF has been viewed at least once.
    @ReactMethod
    public void cacheGif(String remoteUrl, Promise promise) {
        new Thread(() -> {
            try {
                File localFile = downloadToCache(remoteUrl);
                promise.resolve(Uri.fromFile(localFile).toString());
            } catch (Exception e) {
                promise.reject("GIF_CACHE_FAILED", e.getMessage(), e);
            }
        }).start();
    }

    @ReactMethod
    public void commitGif(String remoteUrl, Promise promise) {
        new Thread(() -> {
            try {
                InputConnection ic = InputConnectionHolder.get();
                EditorInfo info = InputConnectionHolder.editorInfo();
                if (ic == null || info == null) {
                    promise.resolve(false);
                    return;
                }
                // Derived from the URL rather than passed in from JS: the
                // adult provider's results are mp4 (Redgifs serves no GIF
                // - see mapRedgifsItem), everything else is an image, and
                // the extension already tells us which without changing
                // the bridge signature.
                String mimeType = mimeTypeFor(remoteUrl);
                if (!accepts(info, mimeType)) {
                    promise.resolve(false);
                    return;
                }

                // Recently Used entries pass back a local "file://" URI
                // (already cached from an earlier view) instead of a
                // remote URL - skip the redundant download in that case.
                File localFile = remoteUrl.startsWith("file://")
                        ? new File(Uri.parse(remoteUrl).getPath())
                        : downloadToCache(remoteUrl);
                Uri contentUri = FileProvider.getUriForFile(
                        getReactApplicationContext(),
                        getReactApplicationContext().getPackageName() + ".fileprovider",
                        localFile);

                // Offering both the exact type and the wildcard maximizes
                // compatibility with receivers that match strictly against
                // whichever one they declared in EditorInfo.contentMimeTypes.
                InputContentInfoCompat contentInfo = new InputContentInfoCompat(
                        contentUri,
                        new ClipDescription(
                                mimeType.startsWith("video/") ? "Video" : "GIF",
                                new String[]{mimeType, wildcardFor(mimeType)}),
                        null);

                boolean sent = InputConnectionCompat.commitContent(
                        ic,
                        info,
                        contentInfo,
                        InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION,
                        null);

                promise.resolve(sent);
            } catch (Exception e) {
                promise.reject("GIF_COMMIT_FAILED", e.getMessage(), e);
            }
        }).start();
    }

    private boolean currentFieldAcceptsGif() {
        EditorInfo info = InputConnectionHolder.editorInfo();
        return info != null && accepts(info, "image/gif");
    }

    /**
     * Whether the focused field declared it accepts `mimeType`, counting
     * its family wildcard - a field advertising "image/*" takes a GIF, and
     * one advertising "video/*" takes an mp4.
     *
     * Video acceptance is much rarer than image acceptance, which is why
     * GifStickerPanel tries the video first and retries with the still
     * frame if this returns false, rather than assuming either works.
     */
    private boolean accepts(EditorInfo info, String mimeType) {
        String wildcard = wildcardFor(mimeType);
        String[] mimeTypes = EditorInfoCompat.getContentMimeTypes(info);
        for (String type : mimeTypes) {
            if (mimeType.equalsIgnoreCase(type) || wildcard.equalsIgnoreCase(type)) {
                return true;
            }
        }
        return false;
    }

    private String mimeTypeFor(String url) {
        String path = url.toLowerCase();
        // Query strings would otherwise defeat the endsWith checks.
        int queryStart = path.indexOf('?');
        if (queryStart != -1) {
            path = path.substring(0, queryStart);
        }
        if (path.endsWith(".mp4") || path.endsWith(".m4v")) {
            return "video/mp4";
        }
        if (path.endsWith(".webm")) {
            return "video/webm";
        }
        if (path.endsWith(".webp")) {
            return "image/webp";
        }
        if (path.endsWith(".png")) {
            return "image/png";
        }
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        return "image/gif";
    }

    private String wildcardFor(String mimeType) {
        return mimeType.startsWith("video/") ? "video/*" : "image/*";
    }

    // The receiving app generally infers the format from the file
    // extension of the content URI, so a downloaded mp4 saved as ".gif"
    // arrives as a corrupt GIF rather than a video.
    private String cacheExtensionFor(String url) {
        String mimeType = mimeTypeFor(url);
        switch (mimeType) {
            case "video/mp4":
                return ".mp4";
            case "video/webm":
                return ".webm";
            case "image/webp":
                return ".webp";
            case "image/png":
                return ".png";
            case "image/jpeg":
                return ".jpg";
            default:
                return ".gif";
        }
    }

    private File downloadToCache(String remoteUrl) throws Exception {
        File cacheDir = new File(getReactApplicationContext().getCacheDir(), "gifs");
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }
        File outFile = new File(cacheDir, sha1(remoteUrl) + cacheExtensionFor(remoteUrl));
        if (outFile.exists()) {
            return outFile;
        }

        HttpURLConnection connection = (HttpURLConnection) new URL(remoteUrl).openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(15000);
        try (InputStream in = connection.getInputStream();
             FileOutputStream out = new FileOutputStream(outFile)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
        } finally {
            connection.disconnect();
        }
        return outFile;
    }

    private String sha1(String input) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-1").digest(input.getBytes("UTF-8"));
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }
}
