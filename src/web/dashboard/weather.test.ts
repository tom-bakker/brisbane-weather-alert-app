import {describe, expect, it} from 'vitest';
import {conditionFromMetar, conditionFromSymbol, isNightAest} from './weather';

describe('isNightAest', () => {
  it.each([
    ['2026-11-09T19:59:00Z', true], // 05:59 AEST
    ['2026-11-09T20:00:00Z', false], // 06:00 AEST
    ['2026-11-10T07:59:00Z', false], // 17:59 AEST
    ['2026-11-10T08:00:00Z', true], // 18:00 AEST
    ['2026-11-09T14:00:00Z', true], // 00:00 AEST
  ])('%s is night: %s', (iso, night) => {
    expect(isNightAest(iso)).toBe(night);
  });
});

describe('conditionFromSymbol', () => {
  it.each([
    ['clearsky_day', 'clear', false, 'Clear (day)'],
    ['clearsky_night', 'clear', true, 'Clear (night)'],
    ['fair_day', 'partly_cloudy', false, 'Fair (day)'],
    ['partlycloudy_night', 'partly_cloudy', true, 'Partly cloudy (night)'],
    ['cloudy', 'cloudy', false, 'Cloudy'],
    ['fog', 'fog', false, 'Fog'],
    ['lightrain', 'drizzle', false, 'Light rain'],
    ['rain', 'rain', false, 'Rain'],
    ['heavyrain', 'heavy_rain', false, 'Heavy rain'],
    ['rainshowers_day', 'showers', false, 'Showers (day)'],
    ['lightrainshowers_night', 'showers', true, 'Light showers (night)'],
    [
      'rainshowersandthunder_night',
      'thunder',
      true,
      'Showers and thunder (night)',
    ],
    ['heavyrainandthunder', 'thunder', false, 'Heavy rain and thunder'],
    ['sleet', 'sleet', false, 'Sleet'],
    ['snowshowers_day', 'snow', false, 'snowshowers (day)'],
    ['light_rain', 'drizzle', false, 'Light rain'],
    ['fair_polartwilight', 'partly_cloudy', false, 'Fair (polartwilight)'],
  ])('%s is %s', (symbol, kind, night, label) => {
    expect(conditionFromSymbol(symbol)).toEqual({kind, night, label});
  });

  it('handles an empty or unknown code', () => {
    expect(conditionFromSymbol('')).toEqual({
      kind: 'unknown',
      night: false,
      label: 'Unknown',
    });
    expect(conditionFromSymbol('mystery_day').kind).toBe('unknown');
  });
});

describe('conditionFromMetar', () => {
  it.each([
    ['TSRA', 'BKN030', 'thunder', 'Thunderstorm'],
    ['-SN', '', 'snow', 'Snow'],
    ['-SHRA', 'SCT025', 'showers', 'Showers'],
    ['+RA', 'OVC010', 'heavy_rain', 'Heavy rain'],
    ['-RA', 'OVC010', 'drizzle', 'Drizzle'],
    ['DZ', '', 'drizzle', 'Drizzle'],
    ['RA', 'OVC010', 'rain', 'Rain'],
    ['BR', 'FEW005', 'fog', 'Fog or mist'],
    ['FG', '', 'fog', 'Fog or mist'],
    ['HZ', '', 'fog', 'Fog or mist'],
    ['', 'BKN040', 'cloudy', 'Cloudy'],
    ['', 'OVC040', 'cloudy', 'Cloudy'],
    ['', 'FEW030', 'partly_cloudy', 'Partly cloudy'],
    ['', 'SCT030', 'partly_cloudy', 'Partly cloudy'],
    ['', '', 'clear', 'Clear'],
  ])('%s / %s is %s', (codes, cloud, kind, label) => {
    expect(conditionFromMetar(codes, cloud, true)).toEqual({
      kind,
      night: true,
      label,
    });
  });
});
