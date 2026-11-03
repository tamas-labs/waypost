// The draggable list without gestures (they need the native gesture handler): every item rendered in order, with a drag
// that does nothing. A test drags by calling the onDragEnd of the last render's props (`renderedList`; with
// jest.mock('react-native-draggable-flatlist') in the test, so that its jest.requireMock gives the same instance).
import type { ReactElement, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

interface Props<T> {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (params: { item: T; getIndex: () => number | undefined; drag: () => void; isActive: boolean }) => ReactNode;
  onDragEnd?: (params: { data: T[]; from: number; to: number }) => void;
  ListHeaderComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
  contentContainerStyle?: object;
  containerStyle?: object;
}

export const renderedList = jest.fn<void, [Props<unknown>]>();

export default function DraggableFlatList<T>(props: Props<T>) {
  renderedList(props as Props<unknown>);
  return (
    <View style={props.containerStyle}>
      <ScrollView contentContainerStyle={props.contentContainerStyle}>
        {props.ListHeaderComponent}
        {props.data.map((item, index) => (
          <View key={props.keyExtractor(item, index)}>
            {props.renderItem({ item, getIndex: () => index, drag: () => undefined, isActive: false })}
          </View>
        ))}
        {props.ListFooterComponent}
      </ScrollView>
    </View>
  );
}

export const ScaleDecorator = ({ children }: { children: ReactNode }) => children;
export const OpacityDecorator = ScaleDecorator;
export const ShadowDecorator = ScaleDecorator;
