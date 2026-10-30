import type { MapStyleElement } from 'react-native-maps';

import type { ColorTokens } from './tokens';

/** Google Maps in the app's colours (DESIGN_HANDOFF 5.18): the ground, roads and buildings, without businesses and transit. */
export function mapStyleOf(color: ColorTokens): MapStyleElement[] {
  return [
    { elementType: 'geometry', stylers: [{ color: color.mapBg }] },
    { elementType: 'labels.text.fill', stylers: [{ color: color.mapLabel }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: color.mapBg }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: color.mapRoad }] },
    { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: color.mapBuild }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: color.mapFence }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ];
}
