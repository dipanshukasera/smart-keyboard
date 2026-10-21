import {NativeModules} from 'react-native';

interface GifCommitNative {
  isRichContentSupported(): Promise<boolean>;
  acceptsUrl(remoteUrl: string): Promise<boolean>;
  focusedPackage(): Promise<string | null>;
  sendVideo(videoUrl: string): Promise<VideoSendResult>;
  acceptsAnimatedGif(): Promise<boolean>;
  copyGifToClipboard(url: string): Promise<boolean>;
  commitGif(remoteUrl: string): Promise<boolean>;
  cacheGif(remoteUrl: string): Promise<string>;
}

// committed: typed into the message box; gif: the app takes GIFs but no
// video, so nothing was sent - send the GIF instead; shared: the app's own
// share screen opened with it; none: no way to deliver it.
export type VideoSendResult = 'committed' | 'gif' | 'shared' | 'none';

const native = NativeModules.GifCommitModule as GifCommitNative | undefined;

export const GifCommit = {
  // Whether the currently focused field accepts rich content (e.g.
  // Instagram's DM box, WhatsApp) - if false, the caller should fall back
  // to something else (we use the clipboard) since commitGif will just
  // resolve false without sending anything.
  async isRichContentSupported(): Promise<boolean> {
    if (!native) return false;
    return native.isRichContentSupported();
  },

  // Package name of the app being typed into, or null.
  async focusedPackage(): Promise<string | null> {
    if (!native) return null;
    try {
      return await native.focusedPackage();
    } catch {
      return null;
    }
  },

  // Sends an mp4 as a video to the app being typed into - into its message
  // box if it takes video there, else through its own share screen (see
  // GifCommitModule.sendVideo).
  async sendVideo(videoUrl: string): Promise<VideoSendResult> {
    if (!native) return 'none';
    try {
      return await native.sendVideo(videoUrl);
    } catch {
      return 'none';
    }
  },

  // Puts the GIF file itself on the clipboard (for apps that take no media
  // from a keyboard - the user pastes it). False if it couldn't be fetched.
  async copyGifToClipboard(url: string): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.copyGifToClipboard(url);
    } catch {
      return false;
    }
  },

  // Whether an animated GIF can go straight into the focused field (false
  // for apps like Instagram that refuse keyboard GIFs).
  async acceptsAnimatedGif(): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.acceptsAnimatedGif();
    } catch {
      return false;
    }
  },

  // Whether the focused field would accept this URL's content (an mp4 needs
  // a field that takes video). False when there's no field or no native side.
  async acceptsUrl(remoteUrl: string): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.acceptsUrl(remoteUrl);
    } catch {
      return false;
    }
  },

  // Downloads the GIF and hands it to the focused field via
  // InputConnection.commitContent. Resolves false (not rejects) when the
  // field doesn't accept rich content, so callers can fall back cleanly.
  async commitGif(remoteUrl: string): Promise<boolean> {
    if (!native) return false;
    try {
      return await native.commitGif(remoteUrl);
    } catch {
      return false;
    }
  },

  // Downloads a GIF/thumbnail to local storage so it can be displayed and
  // re-sent later with no network - resolves null on failure (e.g. no
  // connectivity right now) rather than throwing, since callers treat
  // caching as best-effort.
  async cacheGif(remoteUrl: string): Promise<string | null> {
    if (!native) return null;
    try {
      return await native.cacheGif(remoteUrl);
    } catch {
      return null;
    }
  },
};
