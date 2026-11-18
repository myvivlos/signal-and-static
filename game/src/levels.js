export const TRANSMISSIONS_PER_STATION = 4;

export const STATIONS = [
  {
    id: 1,
    code: 'STN-01',
    name: 'VALE RELAY',
    subtitle: 'LOWLAND WEATHER BAND',
    noiseCharacter: 'broadband',
    noiseParams: {
      roughness: 0.72,
      crackleRate: 0.04,
      humCycles: 0,
      filterType: 'lowpass',
      filterFreq: 1950,
      filterQ: 0.9,
    },
    tonePalette: [220, 261.63, 293.66, 329.63],
    harmonicMix: 0.12,
    baseBandwidth: 9.5,
    baseStrength: 0.96,
    baseDecaySeconds: 18.0,
    stationTicks: [12.0, 34.0, 58.0, 81.0],
    callsigns: ['VLE-ALPHA', 'VLE-BRAVO', 'VLE-CHARLIE', 'VLE-DELTA'],
  },
  {
    id: 2,
    code: 'STN-02',
    name: 'IRON RIDGE',
    subtitle: 'HIGH-PASS IONOSPHERE',
    noiseCharacter: 'crackle',
    noiseParams: {
      roughness: 0.95,
      crackleRate: 0.14,
      humCycles: 3.0,
      filterType: 'bandpass',
      filterFreq: 1450,
      filterQ: 1.8,
    },
    tonePalette: [329.63, 392.0, 440.0, 523.25],
    harmonicMix: 0.24,
    baseBandwidth: 7.4,
    baseStrength: 0.80,
    baseDecaySeconds: 14.5,
    stationTicks: [16.5, 42.0, 67.5, 88.0],
    callsigns: ['IRN-05', 'IRN-06', 'IRN-07', 'IRN-08'],
  },
  {
    id: 3,
    code: 'STN-03',
    name: 'DEADSECTOR-9',
    subtitle: 'SOLAR STORM HORIZON',
    noiseCharacter: 'storm',
    noiseParams: {
      roughness: 1.18,
      crackleRate: 0.24,
      humCycles: 7.0,
      filterType: 'bandpass',
      filterFreq: 2150,
      filterQ: 2.8,
    },
    tonePalette: [440.0, 523.25, 659.25, 783.99],
    harmonicMix: 0.34,
    baseBandwidth: 5.8,
    baseStrength: 0.66,
    baseDecaySeconds: 11.5,
    stationTicks: [9.0, 29.5, 54.0, 76.5, 93.0],
    callsigns: ['DS9-ECHO', 'DS9-PULSE', 'DS9-ZERO', 'DS9-FINAL'],
  },
];

export const TOTAL_TRANSMISSIONS = STATIONS.length * TRANSMISSIONS_PER_STATION;

export function getStationForIndex(stationIndex) {
  return STATIONS[Math.max(0, Math.min(STATIONS.length - 1, stationIndex))];
}

/**
 * Computes per-transmission tuning parameters.
 * Each decoded transmission makes the next signal fainter, narrower, and faster to decay.
 */
export function computeTransmissionTuning(stationIndex, slotInStation, decodedCount) {
  const station = getStationForIndex(stationIndex);
  const progressTightening = decodedCount * 0.055;

  const strength = Math.max(0.36, station.baseStrength - decodedCount * 0.032);
  const bandwidth = Math.max(3.1, station.baseBandwidth - decodedCount * 0.34);
  const decaySeconds = Math.max(6.2, station.baseDecaySeconds - decodedCount * 0.55 - progressTightening);
  const carrierHz = station.tonePalette[slotInStation % station.tonePalette.length];
  const callsign = station.callsigns[slotInStation % station.callsigns.length];

  return {
    station,
    strength,
    bandwidth,
    decaySeconds,
    carrierHz,
    callsign,
  };
}
