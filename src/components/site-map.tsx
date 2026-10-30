import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';

import { t } from '@/i18n';
import { regionAround, type Coordinate } from '@/location/coordinate';
import { mapsConfigured } from '@/location/maps';
import { mapStyleOf } from '@/theme/map-style';
import { useTheme } from '@/theme/theme-provider';

import { IconButton } from './icon-button';

export type SiteMapPointState = 'scanned' | 'manual' | 'pending';

export interface SiteMapPoint {
  id: string;
  /** The number in the marker. */
  number: number;
  name: string;
  state: SiteMapPointState;
  coordinate: Coordinate;
  /** The GPS accuracy radius in metres, drawn around a manual point. */
  accuracy_m: number | null;
}

export interface SiteMapProps {
  points: SiteMapPoint[];
  /** The positions of the scans in time order. */
  walked: Coordinate[];
  /** "Megtett út · 22:03–22:11"; null before the first scan. */
  walkedLabel: string | null;
  /** The phone's position; null if it is not known. */
  position: Coordinate | null;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

/** How long a marker's view is redrawn: the native map keeps a picture of it, which needs the laid out view. */
const MARKER_SETTLE_MS = 500;

/** Map of the site (DESIGN_HANDOFF 5.18): the points, the way walked between the scans, and the phone. Without map tiles (offline) the same layers show on an empty background. */
export function SiteMap({ points, walked, walkedLabel, position, accessibilityLabel, style }: SiteMapProps) {
  const { name: themeName, color, typography, radius, size, space, border } = useTheme();
  const map = useRef<MapView>(null);
  // The map's logo has to stay visible, above the legend.
  const [legendHeight, setLegendHeight] = useState(0);
  const coordinates = points.map((point) => point.coordinate);
  const [first, ...rest] = coordinates;

  const frame = [styles.frame, { borderRadius: radius.card, borderWidth: border.thin, borderColor: color.cardBorder, backgroundColor: color.mapBg }, style];
  if (!mapsConfigured() || first === undefined) {
    return (
      <View style={[frame, styles.empty, { padding: space.xl }]}>
        <Text style={[typography.bodyRegular, styles.emptyText, { color: color.text2 }]}>{t(first === undefined ? 'round.mapNoLocations' : 'round.mapUnavailable')}</Text>
      </View>
    );
  }

  const last = walked.at(-1);
  const overlay = { backgroundColor: color.surface, borderColor: color.cardBorder, borderWidth: border.thin };
  return (
    <View style={frame}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={regionAround([first, ...rest])}
        customMapStyle={mapStyleOf(color)}
        userInterfaceStyle={themeName}
        mapPadding={{ top: 0, right: 0, bottom: legendHeight + space.m, left: 0 }}
        accessibilityLabel={accessibilityLabel}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {walked.length > 1 && <Polyline coordinates={walked} strokeColor={color.accent} strokeWidth={size.mapRoute} lineCap="round" lineJoin="round" />}
        {last !== undefined && position !== null && <Polyline coordinates={[last, position]} strokeColor={color.accent} strokeWidth={size.mapRouteAhead} lineDashPattern={[...size.mapRouteAheadDash]} lineCap="round" />}
        {points.map((point) =>
          point.state === 'manual' && point.accuracy_m !== null ? (
            <Circle key={`${point.id}:accuracy`} center={point.coordinate} radius={point.accuracy_m} strokeColor={color.manual} strokeWidth={border.thick} lineDashPattern={[...size.mapAccuracyDash]} fillColor="transparent" />
          ) : null,
        )}
        {points.map((point) => (
          // A new state or theme is a new picture of the marker.
          <PointMarker key={`${point.id}:${point.state}:${themeName}`} point={point} />
        ))}
        {position !== null && <PositionMarker key={themeName} coordinate={position} />}
      </MapView>

      {walkedLabel !== null && (
        <View style={[styles.walked, overlay, { top: space.m, left: space.m, gap: space.s, height: size.mapCapsule, paddingHorizontal: space.l - 2, borderRadius: radius.pill }]}>
          <View style={{ width: size.mapRouteSwatch, height: size.mapRoute - 1, borderRadius: radius.swatch, backgroundColor: color.accent }} />
          <Text style={[typography.mapCapsule, styles.tabular, { color: color.text }]} numberOfLines={1}>
            {walkedLabel}
          </Text>
        </View>
      )}

      <View onLayout={(event) => setLegendHeight(event.nativeEvent.layout.height)} style={[styles.legend, overlay, { left: space.m, bottom: space.m, gap: space.s - 2, paddingVertical: space.m - 2, paddingHorizontal: space.l - 2, borderRadius: radius.item }]}>
        <LegendRow state="scanned" label={t('components.scanned')} />
        <LegendRow state="manual" label={t('round.manualNotVerified')} />
        <LegendRow state="pending" label={t('status.pending')} />
      </View>

      <IconButton
        size="map"
        icon="navigation"
        accessibilityLabel={t('round.centerMe')}
        disabled={position === null}
        onPress={() => {
          if (position !== null) map.current?.animateCamera({ center: position }, { duration: 300 });
        }}
        style={[styles.center, { right: space.m, bottom: space.m }]}
      />
    </View>
  );
}

function useMarkerSettling(): boolean {
  const [settling, setSettling] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setSettling(false), MARKER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  return settling;
}

function PointMarker({ point }: { point: SiteMapPoint }) {
  const { color, typography, size, border, radius } = useTheme();
  const settling = useMarkerSettling();

  const pending = point.state === 'pending';
  const fill = point.state === 'manual' ? color.manual : color.ok;
  const stateLabel = pending ? t('status.pending') : point.state === 'manual' ? t('round.manualNotVerified') : t('components.scanned');
  return (
    <Marker coordinate={point.coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={settling} title={point.name} description={stateLabel} accessibilityLabel={`${point.name}, ${stateLabel}`}>
      <View
        style={[
          styles.marker,
          { width: size.mapMarker, height: size.mapMarker, borderRadius: radius.round },
          pending ? { backgroundColor: color.surface, borderColor: color.pending, borderWidth: border.ring, borderStyle: 'dashed' } : { backgroundColor: fill, borderColor: color.mapBg, borderWidth: size.mapMarkerRing },
        ]}
      >
        <Text style={[typography.mapMarker, styles.tabular, { color: pending ? color.text2 : color.mapMarkerText }]} maxFontSizeMultiplier={1}>
          {point.number}
        </Text>
      </View>
    </Marker>
  );
}

function PositionMarker({ coordinate }: { coordinate: Coordinate }) {
  const { color, size, radius } = useTheme();
  const settling = useMarkerSettling();
  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={settling} tappable={false} accessibilityLabel={t('round.youAreHere')}>
      <View style={[styles.marker, { width: size.mapHalo, height: size.mapHalo, borderRadius: radius.round, backgroundColor: color.mapMeHalo }]}>
        <View style={{ width: size.mapMe, height: size.mapMe, borderRadius: radius.round, backgroundColor: color.mapMe, borderColor: color.mapBg, borderWidth: size.mapMarkerRing }} />
      </View>
    </Marker>
  );
}

function LegendRow({ state, label }: { state: SiteMapPointState; label: string }) {
  const { color, typography, size, radius, border, space } = useTheme();
  const swatch =
    state === 'pending'
      ? { borderColor: color.pending, borderWidth: border.thick, borderStyle: 'dashed' as const }
      : { backgroundColor: state === 'manual' ? color.manual : color.ok };
  return (
    <View style={[styles.legendRow, { gap: space.s }]}>
      <View style={[{ width: size.legendDot, height: size.legendDot, borderRadius: radius.round }, swatch]} />
      <Text style={[typography.small, { color: color.text2 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center' },
  marker: { alignItems: 'center', justifyContent: 'center' },
  walked: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  legend: { position: 'absolute' },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  center: { position: 'absolute' },
  tabular: { fontVariant: ['tabular-nums'] },
});
