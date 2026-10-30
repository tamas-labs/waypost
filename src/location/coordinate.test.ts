import { coordinateOfE7, regionAround } from './coordinate';

describe('coordinateOfE7', () => {
  it('converts to degrees', () => {
    expect(coordinateOfE7(474979000, 190402000)).toEqual({ latitude: 47.4979, longitude: 19.0402 });
  });

  it('is null when either value is missing', () => {
    expect(coordinateOfE7(null, 190402000)).toBeNull();
    expect(coordinateOfE7(474979000, null)).toBeNull();
  });
});

describe('regionAround', () => {
  it('centres on the points, with air around them', () => {
    const region = regionAround([
      { latitude: 47.5, longitude: 19 },
      { latitude: 47.51, longitude: 19.04 },
    ]);
    expect(region.latitude).toBeCloseTo(47.505);
    expect(region.longitude).toBeCloseTo(19.02);
    expect(region.latitudeDelta).toBeCloseTo(0.015);
    expect(region.longitudeDelta).toBeCloseTo(0.06);
  });

  it('does not zoom in further than a site on one point', () => {
    expect(regionAround([{ latitude: 47.5, longitude: 19 }])).toEqual({ latitude: 47.5, longitude: 19, latitudeDelta: 0.002, longitudeDelta: 0.002 });
  });
});
