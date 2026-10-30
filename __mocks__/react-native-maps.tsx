// The map is native; in Jest its layers are plain views whose props the tests read (used automatically: a mock of a node
// module next to node_modules).
import { useImperativeHandle, type ReactNode, type Ref } from 'react';
import { View } from 'react-native';

export const animateCamera = jest.fn();

interface LayerProps {
  children?: ReactNode;
  accessibilityLabel?: string;
}

export default function MapView({ ref, children, ...props }: LayerProps & { ref?: Ref<{ animateCamera: typeof animateCamera }> }) {
  useImperativeHandle(ref, () => ({ animateCamera }));
  return (
    <View testID="map" accessible {...props}>
      {children}
    </View>
  );
}

export function Marker({ children, ...props }: LayerProps) {
  return (
    <View testID="map-marker" accessible {...props}>
      {children}
    </View>
  );
}

export const Polyline = (props: object) => <View testID="map-polyline" {...props} />;
export const Circle = (props: object) => <View testID="map-circle" {...props} />;
