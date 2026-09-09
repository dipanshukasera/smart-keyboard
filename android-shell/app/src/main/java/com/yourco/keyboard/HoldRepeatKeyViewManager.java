package com.yourco.keyboard;

import androidx.annotation.NonNull;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewGroupManager;
import com.facebook.react.uimanager.annotations.ReactProp;
import java.util.Map;

/**
 * Registers HoldRepeatKeyView as a native UI component RN can render like
 * any other <View> (it extends FrameLayout and accepts the same JS
 * children - the key's icon/text overlay renders exactly as before), with
 * the addition of reliable native press/long-press/repeat/drag events. See
 * HoldRepeatKeyView for why this needed to be native at all.
 */
public class HoldRepeatKeyViewManager extends ViewGroupManager<HoldRepeatKeyView> {

    public static final String REACT_CLASS = "HoldRepeatKeyView";

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected HoldRepeatKeyView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new HoldRepeatKeyView(reactContext);
    }

    @ReactProp(name = "mode")
    public void setMode(HoldRepeatKeyView view, String mode) {
        view.setMode(mode == null ? "tap" : mode);
    }

    @ReactProp(name = "longPressDelayMs", defaultInt = 350)
    public void setLongPressDelayMs(HoldRepeatKeyView view, int ms) {
        view.setLongPressDelayMs(ms);
    }

    @ReactProp(name = "repeatIntervalMs", defaultInt = 60)
    public void setRepeatIntervalMs(HoldRepeatKeyView view, int ms) {
        view.setRepeatIntervalMs(ms);
    }

    @ReactProp(name = "dragThresholdDp", defaultFloat = 30f)
    public void setDragThresholdDp(HoldRepeatKeyView view, float dp) {
        view.setDragThresholdDp(dp);
    }

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put("topPressStart", MapBuilder.of("registrationName", "onPressStart"))
                .put("topPressEnd", MapBuilder.of("registrationName", "onPressEnd"))
                .put("topLongPress", MapBuilder.of("registrationName", "onLongPress"))
                .put("topRepeatTick", MapBuilder.of("registrationName", "onRepeatTick"))
                .put("topDragMove", MapBuilder.of("registrationName", "onDragMove"))
                .build();
    }
}
