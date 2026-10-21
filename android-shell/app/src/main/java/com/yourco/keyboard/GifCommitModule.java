package com.yourco.keyboard;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import androidx.core.content.FileProvider;
import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;
import com.facebook.binaryresource.BinaryResource;
import com.facebook.cache.common.CacheKey;
import com.facebook.imagepipeline.cache.DefaultCacheKeyFactory;
import com.facebook.imagepipeline.core.ImagePipelineFactory;
import com.facebook.imagepipeline.request.ImageRequest;
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
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

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

    // Package of the app whose field is focused, or null - lets JS route
    // sends for apps that need special handling (see shareVideoToInstagram).
    @ReactMethod
    public void focusedPackage(Promise promise) {
        EditorInfo info = InputConnectionHolder.editorInfo();
        promise.resolve(info != null ? info.packageName : null);
    }

    // Sends a GIF's mp4 as a video to whichever app is being typed into:
    //  - "committed": straight into the open chat's message box, if the app
    //    takes the video there (commitContent, like a GIF - offered even
    //    when the field doesn't list video, see below);
    //  - "shared": otherwise through that app's own share screen (ACTION_SEND
    //    video/mp4, limited to the focused app) - the user picks the chat and
    //    taps send there. Instagram plays nothing a keyboard puts in its box,
    //    so it always goes this way, to its "share to chats" screen;
    //  - "none": the app takes video neither way (the caller falls back).
    // Read access to the one file is granted on the intent, so the receiving
    // app needs no storage permission.
    @ReactMethod
    public void sendVideo(String videoUrl, Promise promise) {
        new Thread(() -> {
            try {
                EditorInfo info = InputConnectionHolder.editorInfo();
                InputConnection ic = InputConnectionHolder.get();
                String pkg = info != null ? info.packageName : null;
                if (pkg == null) {
                    promise.resolve("none");
                    return;
                }
                File video = downloadToCache(videoUrl);
                Uri uri = FileProvider.getUriForFile(
                        getReactApplicationContext(),
                        getReactApplicationContext().getPackageName() + ".fileprovider",
                        video);

                if (ic != null && !INSTAGRAM.equals(pkg)) {
                    // The mp4 goes into the open chat's message box. Which
                    // type it's labelled with matters: WhatsApp doesn't list
                    // "video/mp4" but does list "video/x.looping_mp4" - an
                    // mp4 it plays as a looping, GIF-style clip - which is
                    // how it takes GIFs from keyboards as video.
                    String type = null;
                    if (accepts(info, "video/mp4")) {
                        type = "video/mp4";
                    } else if (accepts(info, LOOPING_MP4)) {
                        type = LOOPING_MP4;
                    }
                    boolean committed;
                    if (type != null) {
                        committed = InputConnectionCompat.commitContent(
                                ic, info,
                                new InputContentInfoCompat(uri, new ClipDescription("Video", new String[]{type}), null),
                                InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION, null);
                    } else if (EditorInfoCompat.getContentMimeTypes(info).length > 0) {
                        // The field takes some media but lists no video:
                        // offer it anyway, directly on the InputConnection
                        // (the androidx helper drops unlisted types before
                        // asking). The app may still accept it.
                        committed = ic.commitContent(
                                new android.view.inputmethod.InputContentInfo(
                                        uri, new ClipDescription("Video", new String[]{"video/mp4", "video/*"}), null),
                                InputConnection.INPUT_CONTENT_GRANT_READ_URI_PERMISSION, null);
                    } else {
                        committed = false;
                    }
                    if (committed) {
                        promise.resolve("committed");
                        return;
                    }
                }

                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("video/mp4");
                share.putExtra(Intent.EXTRA_STREAM, uri);
                share.setClipData(ClipData.newRawUri("", uri));
                share.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (INSTAGRAM.equals(pkg)) {
                    share.setComponent(new ComponentName(
                            INSTAGRAM, "com.instagram.direct.share.handler.DirectExternalMediaShareActivityVideo"));
                } else {
                    share.setPackage(pkg);
                    PackageManager pm = getReactApplicationContext().getPackageManager();
                    List<ResolveInfo> targets = pm.queryIntentActivities(share, 0);
                    if (targets.isEmpty()) {
                        promise.resolve("none");
                        return;
                    }
                    // An app can have several share targets (e.g. a chat
                    // and a status/story one) - the first is its main one.
                    ActivityInfo target = targets.get(0).activityInfo;
                    share.setComponent(new ComponentName(target.packageName, target.name));
                }
                getReactApplicationContext().startActivity(share);
                promise.resolve("shared");
            } catch (Exception e) {
                // Download failed, or the app's share screen couldn't open.
                promise.resolve("none");
            }
        }).start();
    }

    // For apps that take no media from a keyboard at all (e.g. a website's
    // message box in Chrome, like Telegram Web): puts the GIF file itself on
    // the clipboard, so long-press > Paste in the box attaches it like any
    // copied picture. A file:// link on the clipboard (the old fallback)
    // pasted as useless text. The clipboard grants the pasting app read
    // access to our FileProvider URI.
    @ReactMethod
    public void copyGifToClipboard(String remoteUrl, Promise promise) {
        new Thread(() -> {
            try {
                File localFile = remoteUrl.startsWith("file://")
                        ? new File(Uri.parse(remoteUrl).getPath())
                        : downloadToCache(remoteUrl);
                Uri uri = FileProvider.getUriForFile(
                        getReactApplicationContext(),
                        getReactApplicationContext().getPackageName() + ".fileprovider",
                        localFile);
                ClipData clip = ClipData.newUri(getReactApplicationContext().getContentResolver(), "GIF", uri);
                android.content.ClipboardManager clipboard = (android.content.ClipboardManager)
                        getReactApplicationContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE);
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    clipboard.setPrimaryClip(clip);
                    promise.resolve(true);
                });
            } catch (Exception e) {
                promise.resolve(false);
            }
        }).start();
    }

    // Whether the focused field takes an animated GIF from a keyboard - false
    // for apps that refuse them (Instagram), where a GIF is better sent as
    // video (sendVideo) than frozen as a still image.
    @ReactMethod
    public void acceptsAnimatedGif(Promise promise) {
        EditorInfo info = InputConnectionHolder.editorInfo();
        promise.resolve(info != null && accepts(info, "image/gif") && !GIF_REFUSING_APPS.contains(info.packageName));
    }

    // Whether the focused field would accept this URL's content type (video
    // for an mp4, an image otherwise) - lets JS work out ahead of time which
    // file a send will use, so it can start fetching it before Send is tapped.
    @ReactMethod
    public void acceptsUrl(String remoteUrl, Promise promise) {
        EditorInfo info = InputConnectionHolder.editorInfo();
        promise.resolve(info != null && accepts(info, mimeTypeFor(remoteUrl)));
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

                // Instagram's DM box declares image/gif but rejects any GIF a
                // keyboard commits ("Tap the sticker icon to find and send
                // GIFs" - it only takes GIFs from its own GIPHY picker), while
                // still taking PNG/JPEG. Labelled as an image it goes through,
                // arriving as a still picture (Instagram keeps the first
                // frame; a sticker keeps its transparency) - better than
                // nothing being sent. Every other app still gets the GIF.
                if ("image/gif".equals(mimeType) && GIF_REFUSING_APPS.contains(info.packageName)) {
                    File stillCopy = new File(localFile.getPath() + ".png");
                    if (!stillCopy.exists()) {
                        copyFile(localFile, stillCopy);
                    }
                    contentUri = FileProvider.getUriForFile(
                            getReactApplicationContext(),
                            getReactApplicationContext().getPackageName() + ".fileprovider",
                            stillCopy);
                    mimeType = "image/png";
                }
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

    // Apps whose message box refuses GIFs from keyboards but accepts still
    // images - see commitGif.
    private static final String INSTAGRAM = "com.instagram.android";
    // WhatsApp's name for an mp4 it shows as a looping, GIF-style clip.
    private static final String LOOPING_MP4 = "video/x.looping_mp4";
    private static final java.util.Set<String> GIF_REFUSING_APPS = java.util.Collections.singleton(INSTAGRAM);

    private static void copyFile(File from, File to) throws Exception {
        File partFile = new File(to.getPath() + ".part");
        try (InputStream in = new java.io.FileInputStream(from);
             FileOutputStream out = new FileOutputStream(partFile)) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
        }
        if (!partFile.renameTo(to)) {
            partFile.delete();
            throw new Exception("Couldn't write " + to.getName());
        }
    }

    // One lock per URL. A file can be requested twice at once - fetched ahead
    // while an 18+ preview is open, then requested again by Send before that
    // finished - and both writing the same .part file corrupted it. The
    // second caller now waits for the first and gets its finished file.
    private static final ConcurrentHashMap<String, Object> DOWNLOAD_LOCKS = new ConcurrentHashMap<>();

    private File downloadToCache(String remoteUrl) throws Exception {
        Object lock = DOWNLOAD_LOCKS.computeIfAbsent(remoteUrl, key -> new Object());
        synchronized (lock) {
            return downloadToCacheLocked(remoteUrl);
        }
    }

    private File downloadToCacheLocked(String remoteUrl) throws Exception {
        File cacheDir = new File(getReactApplicationContext().getCacheDir(), "gifs");
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }
        File outFile = new File(cacheDir, sha1(remoteUrl) + cacheExtensionFor(remoteUrl));
        if (outFile.exists()) {
            return outFile;
        }
        // The GIF grid shows each result through React Native's <Image>
        // (Fresco), which has usually already downloaded this exact URL to
        // its own disk cache. Copying those bytes locally takes a few ms;
        // fetching them again was the whole of the delay between tapping a
        // GIF and it arriving in the chat.
        if (copyFromImageCache(remoteUrl, outFile)) {
            return outFile;
        }

        HttpURLConnection connection = (HttpURLConnection) new URL(remoteUrl).openConnection();
        connection.setConnectTimeout(10000);
        // 45s, not 15s: an 18+ clip converted to GIF on the backend
        // (/api/gif/adult/convert.gif) sends nothing until ffmpeg finishes,
        // which takes ~8-12s on Render's free tier - more if the service
        // is also waking from idle. Ordinary downloads are unaffected;
        // this only bounds a stalled connection.
        connection.setReadTimeout(45000);
        // Written to a temp file and renamed only once complete: the cache
        // check above treats any existing file as a finished download, so
        // a timeout partway through used to leave a truncated file that
        // was then re-sent on every later tap.
        File partFile = new File(cacheDir, outFile.getName() + ".part");
        try (InputStream in = connection.getInputStream();
             FileOutputStream out = new FileOutputStream(partFile)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
        } catch (Exception e) {
            partFile.delete();
            throw e;
        } finally {
            connection.disconnect();
        }
        if (!partFile.renameTo(outFile)) {
            partFile.delete();
            throw new Exception("Couldn't move downloaded file into the cache");
        }
        return outFile;
    }

    /**
     * Copies `remoteUrl`'s bytes out of Fresco's disk cache into `outFile`, if
     * Fresco has them. Best-effort: any miss or failure returns false and
     * the caller downloads as usual.
     */
    private boolean copyFromImageCache(String remoteUrl, File outFile) {
        File partFile = new File(outFile.getPath() + ".part");
        try {
            if (!ImagePipelineFactory.hasBeenInitialized()) {
                return false;
            }
            CacheKey key = DefaultCacheKeyFactory.getInstance()
                    .getEncodedCacheKey(ImageRequest.fromUri(remoteUrl), null);
            ImagePipelineFactory pipeline = ImagePipelineFactory.getInstance();
            BinaryResource resource = pipeline.getMainFileCache().getResource(key);
            if (resource == null) {
                resource = pipeline.getSmallImageFileCache().getResource(key);
            }
            if (resource == null) {
                return false;
            }
            try (InputStream in = resource.openStream();
                 FileOutputStream out = new FileOutputStream(partFile)) {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
            }
            if (partFile.renameTo(outFile)) {
                return true;
            }
        } catch (Exception e) {
            // Fall through to a normal download.
        }
        partFile.delete();
        return false;
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
