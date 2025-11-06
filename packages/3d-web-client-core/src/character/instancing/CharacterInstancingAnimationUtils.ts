import {
  AnimationClip,
  NumberKeyframeTrack,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";

export type SegmentTime = {
  startTime: number;
  endTime: number;
  duration: number;
};

export function createSingleTimeline(
  individualClips: Map<string, AnimationClip>,
): [Map<string, SegmentTime>, AnimationClip] {
  const segments = new Map<
    string,
    { clip: AnimationClip; startTime: number; endTime: number; duration: number }
  >();
  let currentTime = 0;

  // increased gap between animations to prevent interpolation leaking
  const gap = 1.0;

  // segments for each animation
  for (const [name, clip] of individualClips.entries()) {
    const startTime = currentTime;
    const duration = clip.duration;
    const endTime = startTime + duration;

    segments.set(name, { clip, startTime, endTime, duration });

    currentTime = endTime + gap;
  }

  // create the tracks
  const allTracks: Array<VectorKeyframeTrack | QuaternionKeyframeTrack | NumberKeyframeTrack> = [];
  const totalDuration = currentTime - gap;

  // name them from the respective clips
  const allTrackNames = new Set<string>();
  for (const [, segment] of segments) {
    for (const track of segment.clip.tracks) {
      allTrackNames.add(track.name);
    }
  }

  const lastKnownValues = new Map<string, number[]>();

  // create a merged track for each
  for (const trackName of allTrackNames) {
    const mergedTimes: number[] = [];
    const mergedValues: number[] = [];
    let valueSize = 0;

    for (const [, segment] of segments) {
      // find the track in this segment's clip
      const track = segment.clip.tracks.find((t) => t.name === trackName);

      if (track) {
        valueSize = track.getValueSize();

        // add track's keyframes, offset by the segment's start time
        const trackValueSize = track.getValueSize();
        valueSize = trackValueSize;

        const segmentOffsetTimes: number[] = [];
        const segmentOffsetValues: number[][] = [];

        for (let i = 0; i < track.times.length; i++) {
          const offsetTime = track.times[i] + segment.startTime;
          const value: number[] = [];

          for (let j = 0; j < trackValueSize; j++) {
            value.push(track.values[i * trackValueSize + j]);
          }

          segmentOffsetTimes.push(offsetTime);
          segmentOffsetValues.push(value);
        }

        // append all times/values to merged track
        for (let i = 0; i < segmentOffsetTimes.length; i++) {
          mergedTimes.push(segmentOffsetTimes[i]);
          mergedValues.push(...segmentOffsetValues[i]);
        }

        // we must enforce pose at segment.endTime if last keyframe is before it
        const lastTime = segmentOffsetTimes[segmentOffsetTimes.length - 1];
        const lastValue = segmentOffsetValues[segmentOffsetValues.length - 1];

        if (lastTime < segment.endTime - 1e-5) {
          mergedTimes.push(segment.endTime);
          mergedValues.push(...lastValue);
        }

        // add boundary keyframes in the gap to prevent interpolation leaking
        // and hold last pose throughout the entire gap period
        if (gap > 0 && segment.endTime < totalDuration - 1e-5) {
          const gapStart = segment.endTime + 1e-6; // Just after segment ends
          const gapEnd = Math.min(segment.endTime + gap - 1e-6, totalDuration - 1e-5); // Just before next starts

          // Add multiple keyframes throughout the gap to ensure no interpolation
          mergedTimes.push(gapStart);
          mergedValues.push(...lastValue);

          if (gapEnd > gapStart) {
            mergedTimes.push(gapEnd);
            mergedValues.push(...lastValue);
          }
        }

        // cache last known value for fallback
        lastKnownValues.set(trackName, lastValue);
      } else {
        // track is missing in this segment, reuse last known value if available
        let fallbackValues = lastKnownValues.get(trackName);

        if (!fallbackValues) {
          // fallback to identity/default if never seen before
          valueSize = valueSize || 3;
          fallbackValues = getDefaultTrackValues(trackName, valueSize);
        }

        // push hold keyframes at start and end of segment
        mergedTimes.push(segment.startTime);
        mergedValues.push(...fallbackValues);

        mergedTimes.push(segment.endTime);
        mergedValues.push(...fallbackValues);

        // add gap keyframes for missing tracks to maintain consistency
        if (gap > 0 && segment.endTime < totalDuration - 1e-5) {
          const gapStart = segment.endTime + 1e-6;
          const gapEnd = Math.min(segment.endTime + gap - 1e-6, totalDuration - 1e-5);

          mergedTimes.push(gapStart);
          mergedValues.push(...fallbackValues);

          if (gapEnd > gapStart) {
            mergedTimes.push(gapEnd);
            mergedValues.push(...fallbackValues);
          }
        }
      }
    }

    if (mergedTimes.length > 0 && valueSize > 0) {
      const TrackType = getTrackTypeFromName(trackName);
      const mergedTrack = new TrackType(trackName, mergedTimes, mergedValues);
      allTracks.push(mergedTrack);
    }
  }

  return [segments, new AnimationClip("SingleInstanceTimeline", totalDuration, allTracks)];
}

function getDefaultTrackValues(trackName: string, valueSize: number): number[] {
  const [, property] = trackName.split(".");
  if (property === "position") {
    return [0, 0, 0];
  } else if (property === "quaternion") {
    return [0, 0, 0, 1];
  } else if (property === "scale") {
    return [1, 1, 1];
  }
  return new Array(valueSize).fill(0);
}

function getTrackTypeFromName(
  trackName: string,
): typeof VectorKeyframeTrack | typeof QuaternionKeyframeTrack | typeof NumberKeyframeTrack {
  const [, property] = trackName.split(".");
  if (property === "position") {
    return VectorKeyframeTrack;
  } else if (property === "quaternion") {
    return QuaternionKeyframeTrack;
  } else if (property === "scale") {
    return VectorKeyframeTrack;
  }
  return NumberKeyframeTrack;
}
