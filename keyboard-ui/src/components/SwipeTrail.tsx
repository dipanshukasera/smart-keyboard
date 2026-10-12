import React, {forwardRef, useImperativeHandle, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {Point} from '../services/swipeDecoder';

// How much of the path stays drawn - the tail fades out behind the finger
// like Gboard's, rather than the whole swipe staying on screen.
const MAX_POINTS = 28;
const THICKNESS = 6;

export interface SwipeTrailHandle {
  start: (point: Point) => void;
  add: (point: Point) => void;
  clear: () => void;
}

/**
 * The line drawn under the finger while swipe typing. Keeps its own points
 * and is driven imperatively (start/add/clear via a ref), so a move event
 * re-renders only this trail - not the whole keyboard - many times a
 * second.
 *
 * There's no SVG library in the app, so the line is built from short
 * rotated Views, one per segment between consecutive points.
 */
export const SwipeTrail = forwardRef<SwipeTrailHandle, {color: string}>(({color}, ref) => {
  const [points, setPoints] = useState<Point[]>([]);

  useImperativeHandle(ref, () => ({
    start: point => setPoints([point]),
    add: point => setPoints(prev => [...prev.slice(-(MAX_POINTS - 1)), point]),
    clear: () => setPoints([]),
  }));

  if (points.length < 2) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {points.slice(1).map((point, index) => {
        const prev = points[index];
        const dx = point.x - prev.x;
        const dy = point.y - prev.y;
        const length = Math.hypot(dx, dy);
        // Older segments are fainter and thinner, so the trail tapers.
        const age = (index + 1) / (points.length - 1);
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: (prev.x + point.x) / 2 - length / 2,
              top: (prev.y + point.y) / 2 - THICKNESS / 2,
              width: length + THICKNESS * 0.6,
              height: THICKNESS * (0.4 + 0.6 * age),
              borderRadius: THICKNESS,
              backgroundColor: color,
              opacity: 0.15 + 0.7 * age,
              transform: [{rotate: `${Math.atan2(dy, dx)}rad`}],
            }}
          />
        );
      })}
    </View>
  );
});
