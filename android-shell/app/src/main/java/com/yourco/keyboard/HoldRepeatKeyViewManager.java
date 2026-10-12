package com.yourco.keyboard;

import androidx.annotation.NonNull;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.PixelUtil;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewGroupManager;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.annotations.ReactPropGroup;
import com.facebook.react.views.view.ReactViewManager;
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

    // Border props aren't on ViewGroupManager either - like borderRadius
    // they live in ReactViewManager's own handlers, so on this view they
    // were silently dropped (the key style's outline and 3D bottom edge
    // never showed on the top letter row or the delete key). Delegating to
    // a ReactViewManager gets RN's exact conversion and drawing, since
    // HoldRepeatKeyView is a ReactViewGroup underneath.
    private static final ReactViewManager VIEW_PROPS = new ReactViewManager();

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

    // Not handled for free by ViewGroupManager (unlike backgroundColor) -
    // see the comment on HoldRepeatKeyView's cornerRadiusPx field for why.
    // This view only ever gets one flat radius from JS (styles.key), never
    // per-corner values, so a single "borderRadius" prop is sufficient.
    @ReactProp(name = "borderRadius", defaultFloat = 0f)
    public void setBorderRadius(HoldRepeatKeyView view, float radius) {
        view.setKeyCornerRadiusDp(radius);
        // Also round RN's own border drawing, so an outline follows the
        // corners instead of being cut off where the outline clip rounds
        // them.
        // (ReactViewGroup's own setter, in px: ReactViewManager's float
        // overload wraps the value as a Float that its LengthPercentage
        // parsing then fails to cast to Double, crashing the keyboard.)
        view.setBorderRadius(PixelUtil.toPixelFromDIP(radius));
    }

    // Same names and order as ReactViewManager's groups, so `index` means
    // the same side (0 = all, 1 left, 2 right, 3 top, 4 bottom).
    @ReactPropGroup(
            names = {"borderWidth", "borderLeftWidth", "borderRightWidth", "borderTopWidth", "borderBottomWidth"},
            defaultFloat = Float.NaN)
    public void setBorderWidth(HoldRepeatKeyView view, int index, float width) {
        VIEW_PROPS.setBorderWidth(view, index, width);
    }

    @ReactPropGroup(
            names = {"borderColor", "borderLeftColor", "borderRightColor", "borderTopColor", "borderBottomColor"},
            customType = "Color")
    public void setBorderColor(HoldRepeatKeyView view, int index, Integer color) {
        VIEW_PROPS.setBorderColor(view, index, color);
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
