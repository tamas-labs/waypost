import { StyleSheet, Text, View } from 'react-native';

// Placeholder until the prototype screens (M1-02 onwards) bring the theme tokens and texts.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text>Waypost</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
